package database

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"unicode/utf8"
)

type SADumpObject struct {
	Kind         string   `json:"kind"`
	Name         string   `json:"name"`
	Dependencies []string `json:"dependencies"`
	Definition   string   `json:"-"`
	Mode         string   `json:"-"`
	Collation    string   `json:"-"`
	TimeZone     string   `json:"-"`
}
type SADatabaseInventory struct {
	Database    string         `json:"database"`
	Fingerprint string         `json:"fingerprint"`
	Objects     []SADumpObject `json:"objects"`
	Notice      string         `json:"notice"`
	Charset     string         `json:"-"`
	Collation   string         `json:"-"`
	Mode        string         `json:"-"`
	TimeZone    string         `json:"-"`
}

// Each selected object carries the same Structure/Content/Drop switches as the export sheet.
type SADumpSelection struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Structure bool   `json:"structure"`
	Content   bool   `json:"content"`
	Drop      bool   `json:"drop"`
}
type SADatabaseExportOptions struct {
	Objects        []SADumpSelection `json:"objects"`
	CreateDatabase bool              `json:"createDatabase"`
}

func selectedDumpObjects(inventory SADatabaseInventory, options SADatabaseExportOptions) (SADatabaseInventory, map[string]SADumpSelection, error) {
	selected := map[string]SADumpSelection{}
	available := map[string]SADumpObject{}
	for _, o := range inventory.Objects {
		available[o.Kind+"\x00"+o.Name] = o
	}
	if len(options.Objects) == 0 || len(options.Objects) > 1000 {
		return inventory, nil, errors.New("select 1–1,000 objects to export")
	}
	for _, o := range options.Objects {
		key := o.Kind + "\x00" + o.Name
		if _, ok := available[key]; !ok {
			return inventory, nil, errors.New("selected export object no longer exists")
		}
		if _, ok := selected[key]; ok {
			return inventory, nil, errors.New("duplicate export object")
		}
		if !o.Structure && !o.Content {
			return inventory, nil, errors.New("select Structure or Content for each export object")
		}
		if o.Content && o.Kind != "TABLE" {
			return inventory, nil, errors.New("content export is supported for tables only")
		}
		if o.Drop && !o.Structure {
			return inventory, nil, errors.New("DROP requires Structure for the same object")
		}
		selected[key] = o
	}
	objects := []SADumpObject{}
	for _, o := range inventory.Objects {
		if _, ok := selected[o.Kind+"\x00"+o.Name]; ok {
			objects = append(objects, o)
		}
	}
	inventory.Objects = objects
	return inventory, selected, nil
}

const dumpNotice = "Inventory includes objects visible to this account only. Use an account with full metadata privileges. Export preserves database names, DEFINER accounts and external references; it does not copy grants or rewrite SQL. Pause schema/data changes for a consistent backup. Events are restored disabled; review before enabling them."

func (s *Session) InspectDatabase(db string) (SADatabaseInventory, error) {
	ctx, done, err := s.begin()
	if err != nil {
		return SADatabaseInventory{}, err
	}
	defer done()
	return s.databaseInventory(ctx, db)
}
func (s *Session) databaseInventory(ctx context.Context, db string) (SADatabaseInventory, error) {
	out := SADatabaseInventory{Database: db, Objects: []SADumpObject{}, Notice: dumpNotice}
	if !objectName(db) {
		return out, errors.New("enter a database name of 1–64 characters")
	}
	mode, err := s.writeReady(ctx)
	if err != nil {
		return out, err
	}
	out.Mode = mode
	if err := s.conn.QueryRowContext(ctx, "SELECT @@session.time_zone").Scan(&out.TimeZone); err != nil {
		return out, s.queryError(err)
	}
	if err := s.conn.QueryRowContext(ctx, "SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?", db).Scan(&out.Charset, &out.Collation); err != nil {
		return out, s.queryError(err)
	}
	// ACTION_ORDER is available on the supported MySQL 5.7+ / MariaDB versions.
	queries := []struct {
		sql  string
		kind string
	}{
		{"SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME", ""},
		{"SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=? ORDER BY ROUTINE_TYPE, ROUTINE_NAME", ""},
		{"SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=? ORDER BY EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION, ACTION_ORDER", "TRIGGER"},
		{"SELECT EVENT_NAME FROM information_schema.EVENTS WHERE EVENT_SCHEMA=? ORDER BY EVENT_NAME", "EVENT"},
	}
	for _, q := range queries {
		rows, err := s.queryContext(ctx, q.sql, db)
		if err != nil {
			return out, s.queryError(err)
		}
		for rows.Next() {
			name, kind := "", q.kind
			var scan error
			if q.kind == "" {
				scan = rows.Scan(&name, &kind)
			} else {
				scan = rows.Scan(&name)
			}
			if scan != nil {
				rows.Close()
				return out, s.queryError(scan)
			}
			if kind == "BASE TABLE" {
				kind = "TABLE"
			}
			switch kind {
			case "TABLE", "VIEW", "FUNCTION", "PROCEDURE", "TRIGGER", "EVENT":
			default:
				rows.Close()
				return out, fmt.Errorf("unsupported database object %s %s", kind, name)
			}
			if len(out.Objects) >= 1000 {
				rows.Close()
				return out, errors.New("database export supports up to 1,000 objects")
			}
			out.Objects = append(out.Objects, SADumpObject{Kind: kind, Name: name, Dependencies: []string{}, Mode: mode})
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return out, s.queryError(err)
		}
	}
	var quoted int
	if err := s.conn.QueryRowContext(ctx, "SELECT @@session.sql_quote_show_create").Scan(&quoted); err != nil {
		return out, s.queryError(err)
	}
	if quoted != 1 {
		return out, errors.New("enable sql_quote_show_create before inspecting a database")
	}
	size := 0
	for i := range out.Objects {
		o := &out.Objects[i]
		fields, err := s.dumpDefinition(ctx, db, *o)
		if err != nil {
			return out, err
		}
		key := map[string]string{"TABLE": "create table", "VIEW": "create view", "TRIGGER": "sql original statement", "FUNCTION": "create function", "PROCEDURE": "create procedure", "EVENT": "create event"}[o.Kind]
		o.Definition = fields[key]
		if o.Definition == "" {
			return out, fmt.Errorf("%s %s has no visible CREATE definition; check privileges", o.Kind, o.Name)
		}
		if len(o.Definition) > 4*1024*1024 || !utf8.ValidString(o.Definition) {
			return out, errors.New("CREATE definition exceeds 4 MiB or is not UTF-8")
		}
		if v, ok := fields["sql_mode"]; ok {
			o.Mode = v
		}
		o.Collation = fields["collation_connection"]
		o.TimeZone = fields["time_zone"]
		if saved := fields["database collation"]; saved != "" && saved != out.Collation {
			return out, fmt.Errorf("%s %s was created under database collation %s; restore that context before exporting", o.Kind, o.Name, saved)
		}
		if o.Mode != mode && o.Kind == "TABLE" {
			return out, errors.New("table SQL mode changed during inventory")
		}
		size += len(o.Definition)
		if size > 8*1024*1024 {
			return out, errors.New("database definitions exceed 8 MiB")
		}
	}
	if err := orderDumpObjects(&out); err != nil {
		return out, err
	}
	// Hidden fields participate: changing a body or creation context invalidates preview.
	evidence := []string{db, out.Charset, out.Collation, mode, out.TimeZone}
	for _, o := range out.Objects {
		evidence = append(evidence, o.Kind, o.Name, o.Definition, o.Mode, o.Collation, o.TimeZone)
	}
	b, _ := json.Marshal(evidence)
	hash := sha256.Sum256(b)
	out.Fingerprint = hex.EncodeToString(hash[:])
	return out, nil
}
func (s *Session) dumpDefinition(ctx context.Context, db string, o SADumpObject) (map[string]string, error) {
	rows, err := s.queryContext(ctx, "SHOW CREATE "+o.Kind+" "+qualified(db, o.Name))
	if err != nil {
		return nil, s.queryError(err)
	}
	defer rows.Close()
	names, err := rows.Columns()
	if err != nil {
		return nil, s.queryError(err)
	}
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, s.queryError(err)
		}
		return nil, errors.New("object disappeared during inventory")
	}
	raw := make([][]byte, len(names))
	dest := make([]any, len(raw))
	for i := range raw {
		dest[i] = &raw[i]
	}
	if err := rows.Scan(dest...); err != nil {
		return nil, s.queryError(err)
	}
	result := map[string]string{}
	for i, name := range names {
		result[strings.ToLower(name)] = string(raw[i])
	}
	if rows.Next() {
		return nil, errors.New("unexpected additional CREATE definition")
	}
	if err := rows.Err(); err != nil {
		return nil, s.queryError(err)
	}
	return result, nil
}

// SHOW CREATE VIEW canonicalizes relation names to quoted database.table pairs.
// Scan quoted identifiers while skipping literals/comments; never rewrite SQL bodies.
func dumpReferences(source, mode string) []string {
	refs := []string{}
	noBackslash := strings.Contains(","+mode+",", ",NO_BACKSLASH_ESCAPES,")
	ansi := strings.Contains(","+mode+",", ",ANSI_QUOTES,")
	for i := 0; i < len(source); {
		c := source[i]
		if c == '#' || (c == '-' && i+2 < len(source) && source[i+1] == '-' && source[i+2] <= 32) {
			j := strings.IndexByte(source[i:], '\n')
			if j < 0 {
				break
			}
			i += j + 1
			continue
		}
		if c == '/' && i+1 < len(source) && source[i+1] == '*' {
			j := strings.Index(source[i+2:], "*/")
			if j < 0 {
				break
			}
			i += j + 4
			continue
		}
		if c == '\'' || c == '"' && !ansi {
			q := c
			i++
			for i < len(source) {
				if source[i] == '\\' && !noBackslash {
					i += 2
					continue
				}
				if source[i] == q {
					if i+1 < len(source) && source[i+1] == q {
						i += 2
						continue
					}
					i++
					break
				}
				i++
			}
			continue
		}
		if c == '`' || c == '"' && ansi {
			first, tail, ok := schemaIdentifier(source[i:])
			if !ok {
				break
			}
			consumed := len(source[i:]) - len(tail)
			i += consumed
			if strings.HasPrefix(tail, ".") {
				second, rest, ok := schemaIdentifier(tail[1:])
				if ok {
					refs = append(refs, first+"."+second)
					i += len(tail) - len(rest)
				}
			}
			continue
		}
		i++
	}
	return refs
}
func orderDumpObjects(out *SADatabaseInventory) error {
	views := map[string]SADumpObject{}
	groups := map[string][]SADumpObject{}
	for _, o := range out.Objects {
		if o.Kind == "VIEW" {
			views[out.Database+"."+o.Name] = o
		} else {
			groups[o.Kind] = append(groups[o.Kind], o)
		}
	}
	ordered := []SADumpObject{}
	for _, kind := range []string{"TABLE", "FUNCTION", "PROCEDURE"} {
		ordered = append(ordered, groups[kind]...)
	}
	state := map[string]int{}
	var visit func(string) error
	visit = func(key string) error {
		if state[key] == 2 {
			return nil
		}
		if state[key] == 1 {
			return fmt.Errorf("view dependency cycle or ambiguous reference: %s", key)
		}
		state[key] = 1
		o := views[key]
		seen := map[string]bool{}
		// Skip the CREATE VIEW name itself; references begin after AS.
		body := o.Definition
		if at := strings.Index(strings.ToUpper(body), " AS "); at >= 0 {
			body = body[at+4:]
		} else {
			return errors.New("cannot read canonical CREATE VIEW body")
		}
		for _, ref := range dumpReferences(body, o.Mode) {
			if seen[ref] {
				continue
			}
			seen[ref] = true
			if _, ok := views[ref]; ok {
				o.Dependencies = append(o.Dependencies, ref)
				if err := visit(ref); err != nil {
					return err
				}
			}
		}
		state[key] = 2
		ordered = append(ordered, o)
		return nil
	}
	keys := make([]string, 0, len(views))
	for key := range views {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if err := visit(key); err != nil {
			return err
		}
	}
	for _, kind := range []string{"TRIGGER", "EVENT"} {
		ordered = append(ordered, groups[kind]...)
	}
	out.Objects = ordered
	return nil
}

type saDumpWriter struct {
	w          io.Writer
	bytes      int
	statements int
}

func (w *saDumpWriter) Write(b []byte) (int, error) {
	if w.bytes+len(b) > 64*1024*1024 {
		return 0, errors.New("database SQL export exceeds 64 MiB")
	}
	n, e := w.w.Write(b)
	w.bytes += n
	return n, e
}
func (w *saDumpWriter) statement(sql string) error {
	if len(sql) > 4*1024*1024 {
		return errors.New("dump statement exceeds 4 MiB")
	}
	w.statements++
	if w.statements > 100000 {
		return errors.New("database SQL export exceeds 100,000 statements")
	}
	delimiter := ";"
	if strings.Contains(sql, ";") {
		delimiter = "$$"
		for strings.Contains(sql, delimiter) {
			delimiter += "$"
			if len(delimiter) > 16 {
				return errors.New("cannot choose a safe SQL delimiter")
			}
		}
	}
	_, err := fmt.Fprintf(w, "DELIMITER %s\n%s%s\nDELIMITER ;\n", delimiter, sql, delimiter)
	return err
}
func dumpContext(w *saDumpWriter, mode, collation string) error {
	for _, c := range mode {
		if !(c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == ',') {
			return errors.New("unsupported SQL mode representation")
		}
	}
	if err := w.statement("SET SESSION sql_mode = '" + mode + "'"); err != nil {
		return err
	}
	if err := w.statement("SET character_set_client = utf8mb4"); err != nil {
		return err
	}
	if collation != "" {
		if !objectName(collation) {
			return errors.New("invalid creation collation")
		}
		return w.statement("SET collation_connection = '" + collation + "'")
	}
	return nil
}

// Events are created disabled, preventing a restored schedule from running before review.
func disabledDumpEvent(source, mode string) (string, error) {
	// SHOW CREATE EVENT places status between ON COMPLETION and DO. Ignore body text.
	tokens := dumpEventTokens(source, mode)
	for i, t := range tokens {
		if t.word == "DO" {
			return "", errors.New("cannot locate event status before DO")
		}
		if t.word == "ENABLE" || t.word == "DISABLE" {
			end := t.end
			if t.word == "DISABLE" && i+2 < len(tokens) && tokens[i+1].word == "ON" && (tokens[i+2].word == "SLAVE" || tokens[i+2].word == "REPLICA") {
				end = tokens[i+2].end
			}
			return source[:t.start] + "DISABLE" + source[end:], nil
		}
	}
	return "", errors.New("cannot read event status")
}

type saDumpToken struct {
	word       string
	start, end int
}

func dumpEventTokens(source, mode string) []saDumpToken {
	tokens := []saDumpToken{}
	noBackslash := strings.Contains(","+mode+",", ",NO_BACKSLASH_ESCAPES,")
	for i := 0; i < len(source); {
		c := source[i]
		if c == '\'' || c == '"' || c == '`' {
			q := c
			i++
			for i < len(source) {
				if source[i] == '\\' && q != '`' && !noBackslash {
					i += 2
					continue
				}
				if source[i] == q {
					if i+1 < len(source) && source[i+1] == q {
						i += 2
						continue
					}
					i++
					break
				}
				i++
			}
			continue
		}
		if c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' {
			start := i
			for i < len(source) && (source[i] >= 'A' && source[i] <= 'Z' || source[i] >= 'a' && source[i] <= 'z' || source[i] == '_') {
				i++
			}
			tokens = append(tokens, saDumpToken{strings.ToUpper(source[start:i]), start, i})
			continue
		}
		i++
	}
	return tokens
}
func (s *Session) ExportDatabase(w io.Writer, db, fingerprint string, includeData bool) (int64, error) {
	return s.exportDatabase(w, db, fingerprint, includeData, nil)
}
func (s *Session) ExportSelectedDatabase(w io.Writer, db, fingerprint string, options SADatabaseExportOptions) (int64, error) {
	return s.exportDatabase(w, db, fingerprint, true, &options)
}
func (s *Session) exportDatabase(w io.Writer, db, fingerprint string, includeData bool, options *SADatabaseExportOptions) (int64, error) {
	ctx, done, err := s.begin()
	if err != nil {
		return 0, err
	}
	defer done()
	inventory, err := s.databaseInventory(ctx, db)
	if err != nil {
		return 0, err
	}
	if fingerprint == "" || inventory.Fingerprint != fingerprint {
		return 0, errors.New("database objects changed since inventory; inspect again")
	}
	selections := map[string]SADumpSelection{}
	if options != nil {
		inventory, selections, err = selectedDumpObjects(inventory, *options)
		if err != nil {
			return 0, err
		}
	}
	wantStructure := func(o SADumpObject) bool { return options == nil || selections[o.Kind+"\x00"+o.Name].Structure }
	out := &saDumpWriter{w: w}
	if _, err := io.WriteString(out, "-- sequelx database SQL dump v1\n-- "+dumpNotice+"\n"); err != nil {
		return 0, err
	}
	if err := dumpContext(out, inventory.Mode, inventory.Collation); err != nil {
		return 0, err
	}
	if options == nil || options.CreateDatabase {
		if err := out.statement("CREATE DATABASE " + quoteIdentifier(db) + " CHARACTER SET " + quoteIdentifier(inventory.Charset) + " COLLATE " + quoteIdentifier(inventory.Collation)); err != nil {
			return 0, err
		}
	}
	if err := out.statement("USE " + quoteIdentifier(db)); err != nil {
		return 0, err
	}
	if options != nil {
		for i := len(inventory.Objects) - 1; i >= 0; i-- {
			o := inventory.Objects[i]
			if selections[o.Kind+"\x00"+o.Name].Drop {
				if err := out.statement("DROP " + o.Kind + " IF EXISTS " + qualified(db, o.Name)); err != nil {
					return 0, err
				}
			}
		}
	}
	foreign := []string{}
	for _, o := range inventory.Objects {
		if o.Kind != "TABLE" || !wantStructure(o) {
			continue
		}
		create, fks, err := cloneCreate(o.Definition, inventory.Mode, db, o.Name, db, o.Name, true)
		if err != nil {
			return 0, err
		}
		if err := out.statement(create); err != nil {
			return 0, err
		}
		foreign = append(foreign, fks...)
	}
	var count int64
	if includeData {
		if err := out.statement("SET SESSION time_zone = '+00:00'"); err != nil {
			return count, err
		}
		dataInventory := inventory
		if options != nil {
			dataInventory.Objects = nil
			for _, o := range inventory.Objects {
				if selections[o.Kind+"\x00"+o.Name].Content {
					dataInventory.Objects = append(dataInventory.Objects, o)
				}
			}
		}
		count, err = s.exportDumpRows(ctx, out, dataInventory)
		if err != nil {
			return count, err
		}
	}

	for _, sql := range foreign {
		if err := out.statement(sql); err != nil {
			return count, err
		}
	}
	for _, o := range inventory.Objects {
		if o.Kind == "TABLE" || !wantStructure(o) {
			continue
		}
		if err := dumpContext(out, o.Mode, o.Collation); err != nil {
			return count, err
		}
		sql := o.Definition
		if o.Kind == "EVENT" {
			value, err := sqlLiteral(Cell{Value: o.TimeZone})
			if err != nil {
				return count, err
			}
			if err := out.statement("SET SESSION time_zone = " + value); err != nil {
				return count, err
			}
			sql, err = disabledDumpEvent(sql, o.Mode)
			if err != nil {
				return count, err
			}
		}
		if err := out.statement(sql); err != nil {
			return count, err
		}
	}
	value, e := sqlLiteral(Cell{Value: inventory.TimeZone})
	if e != nil {
		return count, e
	}
	if err := out.statement("SET SESSION time_zone = " + value); err != nil {
		return count, err
	}
	if err := dumpContext(out, inventory.Mode, inventory.Collation); err != nil {
		return count, err
	}
	after, err := s.databaseInventory(ctx, db)
	if err != nil {
		return count, err
	}
	if after.Fingerprint != fingerprint {
		return count, errors.New("database definitions changed during export; completed file was not published")
	}
	return count, nil
}

type saDumpRowWriter struct{ out *saDumpWriter }

func (w *saDumpRowWriter) Write(b []byte) (int, error) {
	// The SQL row writer emits exactly one complete INSERT per Write call.
	if len(b) > 4*1024*1024 {
		return 0, errors.New("dump row exceeds 4 MiB")
	}
	w.out.statements++
	if w.out.statements > 100000 {
		return 0, errors.New("database SQL export exceeds 100,000 statements")
	}
	return w.out.Write(b)
}

// TIMESTAMP values are read and restored in UTC; the user's session setting is
// restored even on file errors. A failed restoration makes that session unusable.
func (s *Session) exportDumpRows(ctx context.Context, out *saDumpWriter, inventory SADatabaseInventory) (count int64, err error) {
	if _, err = s.execContext(ctx, "SET SESSION time_zone = '+00:00'"); err != nil {
		return 0, s.queryError(err)
	}
	defer func() {
		if _, restoreErr := s.execContext(ctx, "SET SESSION time_zone = ?", inventory.TimeZone); restoreErr != nil {
			s.failed = true
			if err == nil {
				err = fmt.Errorf("cannot restore export session time zone: %w", restoreErr)
			}
		}
	}()
	for _, o := range inventory.Objects {
		if o.Kind != "TABLE" {
			continue
		}
		cols, e := s.tableColumns(ctx, inventory.Database, o.Name)
		if e != nil {
			return count, e
		}
		rowWriter := &saDumpRowWriter{out: out}
		n, e := s.exportQuery(ctx, rowWriter, "sql", inventory.Database, o.Name, "SELECT "+quotedList(cols)+" FROM "+qualified(inventory.Database, o.Name), nil)
		count += n
		if e != nil {
			return count, e
		}
	}
	return count, nil
}
