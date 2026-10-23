package database

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

// Definitions retain the server's complete attributes instead of reconstructing
// a column from information_schema and silently dropping unfamiliar attributes.
type SASchemaObject struct {
	Kind       string `json:"kind"`
	Name       string `json:"name"`
	IndexKind  string `json:"indexKind"`
	Definition string `json:"definition"`
}
type SASchemaChange struct {
	Database    string            `json:"database"`
	Table       string            `json:"table"`
	Action      string            `json:"action"`
	Kind        string            `json:"kind"`
	Original    string            `json:"original"`
	Name        string            `json:"name"`
	IndexKind   string            `json:"indexKind"`
	Definition  string            `json:"definition"`
	ColumnEdits map[string]string `json:"columnEdits,omitempty"`
}
type SASchemaPlan struct {
	Token string `json:"token"`
	SQL   string `json:"sql"`
}
type saSchemaPending struct {
	plan     SASchemaPlan
	request  SASchemaChange
	snapshot [32]byte
}

// schemaParts splits only the outer CREATE body. Commas in ENUMs, expressions,
// composite indexes and quoted comments remain part of their own definition.
func schemaParts(source, mode string) ([]string, error) {
	parts, _, err := schemaPartsEnd(source, mode)
	return parts, err
}
func schemaPartsEnd(source, mode string) ([]string, int, error) {
	if len(source) > 4*1024*1024 || !utf8.ValidString(source) {
		return nil, 0, errors.New("schema definition exceeds 4 MiB or is not UTF-8")
	}
	var quote byte
	depth, start := 0, -1
	parts := []string{}
	noBackslash := strings.Contains(","+strings.ToUpper(mode)+",", ",NO_BACKSLASH_ESCAPES,")
	ansi := strings.Contains(","+strings.ToUpper(mode)+",", ",ANSI_QUOTES,")
	for i := 0; i < len(source); i++ {
		c := source[i]
		if quote != 0 {
			if c == '\\' && quote != '`' && !noBackslash && !(quote == '"' && ansi) {
				i++
				continue
			}
			if c == quote {
				if i+1 < len(source) && source[i+1] == quote {
					i++
					continue
				}
				quote = 0
			}
			continue
		}
		if c == '\'' || c == '"' || c == '`' {
			quote = c
			continue
		}
		if c == '(' {
			depth++
			if start < 0 {
				start = i + 1
			}
			continue
		}
		if c == ')' {
			depth--
			if depth == 0 && start >= 0 {
				parts = append(parts, strings.TrimSpace(source[start:i]))
				return parts, i + 1, nil
			}
			if depth < 0 {
				break
			}
		}
		if c == ',' && depth == 1 {
			parts = append(parts, strings.TrimSpace(source[start:i]))
			start = i + 1
		}
	}
	return nil, 0, errors.New("cannot read the complete CREATE TABLE definition")
}
func schemaIdentifier(text string) (string, string, bool) {
	text = strings.TrimSpace(text)
	if len(text) == 0 || (text[0] != '`' && text[0] != '"') {
		return "", "", false
	}
	quote := text[0]
	var name strings.Builder
	for i := 1; i < len(text); i++ {
		if text[i] == quote {
			if i+1 < len(text) && text[i+1] == quote {
				name.WriteByte(quote)
				i++
				continue
			}
			return name.String(), strings.TrimSpace(text[i+1:]), true
		}
		name.WriteByte(text[i])
	}
	return "", "", false
}
func schemaObjects(source, mode string) ([]SASchemaObject, error) {
	parts, err := schemaParts(source, mode)
	if err != nil {
		return nil, err
	}
	out := []SASchemaObject{}
	for _, part := range parts {
		if name, rest, ok := schemaIdentifier(part); ok {
			out = append(out, SASchemaObject{Kind: "column", Name: name, Definition: rest})
			continue
		}
		upper := strings.ToUpper(part)
		if strings.HasPrefix(upper, "PRIMARY KEY ") {
			out = append(out, SASchemaObject{Kind: "index", Name: "PRIMARY", IndexKind: "PRIMARY", Definition: strings.TrimSpace(part[len("PRIMARY KEY "):])})
			continue
		}
		for _, prefix := range []string{"UNIQUE KEY ", "FULLTEXT KEY ", "SPATIAL KEY ", "KEY "} {
			if strings.HasPrefix(upper, prefix) {
				name, rest, ok := schemaIdentifier(part[len(prefix):])
				if !ok {
					return nil, errors.New("cannot read index definition")
				}
				kind := strings.TrimSpace(strings.TrimSuffix(prefix, "KEY "))
				if kind == "" {
					kind = "INDEX"
				}
				out = append(out, SASchemaObject{Kind: "index", Name: name, IndexKind: kind, Definition: rest})
				break
			}
		}
		if strings.HasPrefix(upper, "CONSTRAINT ") {
			name, rest, ok := schemaIdentifier(part[len("CONSTRAINT "):])
			if ok && strings.HasPrefix(strings.ToUpper(rest), "FOREIGN KEY ") {
				out = append(out, SASchemaObject{Kind: "foreignKey", Name: name, Definition: strings.TrimSpace(rest[len("FOREIGN KEY "):])})
			}
		}
	}
	return out, nil
}

// A definition is one ALTER clause, never another command or a second clause.
// SQL attributes/expressions are intentional input and are validated by the server.
func validateSchemaFragment(text, mode string) error {
	if strings.TrimSpace(text) == "" || len(text) > 64*1024 || !utf8.ValidString(text) || strings.ContainsRune(text, 0) {
		return errors.New("enter a UTF-8 definition of at most 64 KiB")
	}
	var quote byte
	depth := 0
	noBackslash := strings.Contains(","+strings.ToUpper(mode)+",", ",NO_BACKSLASH_ESCAPES,")
	ansi := strings.Contains(","+strings.ToUpper(mode)+",", ",ANSI_QUOTES,")
	for i := 0; i < len(text); i++ {
		c := text[i]
		if quote != 0 {
			if c == '\\' && quote != '`' && !noBackslash && !(quote == '"' && ansi) {
				i++
				continue
			}
			if c == quote {
				if i+1 < len(text) && text[i+1] == quote {
					i++
					continue
				}
				quote = 0
			}
			continue
		}
		if c == '\'' || c == '"' || c == '`' {
			quote = c
			continue
		}
		if c == ';' || c == '#' || (strings.HasPrefix(text[i:], "--") && (i+2 == len(text) || text[i+2] <= 32)) || strings.HasPrefix(text[i:], "/*") {
			return errors.New("schema definitions cannot contain SQL comments or statement separators")
		}
		if c == '(' {
			depth++
		}
		if c == ')' {
			depth--
			if depth < 0 {
				return errors.New("unbalanced schema definition")
			}
		}
		if c == ',' && depth == 0 {
			return errors.New("enter only one schema definition")
		}
	}
	if quote != 0 || depth != 0 {
		return errors.New("unbalanced schema definition")
	}
	return nil
}
func schemaSQL(r SASchemaChange, objects []SASchemaObject, mode string) (string, error) {
	valid := func(name string) bool { return validName(name) && utf8.ValidString(name) && len([]rune(name)) <= 64 }
	if !valid(r.Database) || !valid(r.Table) {
		return "", errors.New("select a valid database and table")
	}
	if r.Kind != "column" && r.Kind != "index" && r.Kind != "foreignKey" {
		return "", errors.New("unsupported schema object")
	}
	if r.Action != "add" && r.Action != "edit" && r.Action != "drop" {
		return "", errors.New("unsupported schema action")
	}
	found := false
	for _, object := range objects {
		if object.Kind != r.Kind {
			continue
		}
		if strings.EqualFold(object.Name, r.Original) {
			found = true
			r.Original = object.Name
		}
		if r.Action != "drop" && strings.EqualFold(object.Name, r.Name) && (r.Action == "add" || !strings.EqualFold(object.Name, r.Original)) {
			return "", errors.New("a schema object with this name already exists")
		}
	}
	if r.Action != "add" && (!valid(r.Original) || !found) {
		return "", errors.New("schema object no longer exists; reload structure")
	}
	drop := ""
	if r.Action != "add" {
		switch r.Kind {
		case "column":
			drop = "DROP COLUMN " + quoteIdentifier(r.Original)
		case "index":
			if r.Original == "PRIMARY" {
				drop = "DROP PRIMARY KEY"
			} else {
				drop = "DROP INDEX " + quoteIdentifier(r.Original)
			}
		case "foreignKey":
			drop = "DROP FOREIGN KEY " + quoteIdentifier(r.Original)
		}
	}
	prefix := "ALTER TABLE " + quoteIdentifier(r.Database) + "." + quoteIdentifier(r.Table) + " "
	if r.Action == "drop" {
		return prefix + drop, nil
	}
	if !valid(r.Name) {
		return "", errors.New("schema object name must contain 1–64 characters without NUL")
	}
	definition := strings.TrimSpace(r.Definition)
	if r.ColumnEdits != nil {
		if r.Kind != "column" || r.Action != "edit" {
			return "", errors.New("column attributes require an existing column")
		}
		for _, object := range objects {
			if object.Kind == "column" && object.Name == r.Original {
				var err error
				definition, err = patchColumnAttributes(object.Definition, r.ColumnEdits, mode)
				if err != nil {
					return "", err
				}
				break
			}
		}
	}
	if err := validateSchemaFragment(definition, mode); err != nil {
		return "", err
	}
	add := ""
	switch r.Kind {
	case "column":
		add = "ADD COLUMN " + quoteIdentifier(r.Name) + " " + definition
		if r.Action == "edit" {
			return prefix + "CHANGE COLUMN " + quoteIdentifier(r.Original) + " " + quoteIdentifier(r.Name) + " " + definition, nil
		}
	case "index":
		if !strings.HasPrefix(definition, "(") {
			return "", errors.New("index definition must start with a parenthesized column list")
		}
		switch r.IndexKind {
		case "PRIMARY":
			if r.Name != "PRIMARY" {
				return "", errors.New("primary key name must be PRIMARY")
			}
			add = "ADD PRIMARY KEY " + definition
		case "INDEX", "UNIQUE", "FULLTEXT", "SPATIAL":
			if strings.EqualFold(r.Name, "PRIMARY") {
				return "", errors.New("PRIMARY is reserved for the primary key")
			}
			kind := r.IndexKind + " INDEX"
			if r.IndexKind == "INDEX" {
				kind = "INDEX"
			}
			add = "ADD " + kind + " " + quoteIdentifier(r.Name) + " " + definition
		default:
			return "", errors.New("unsupported index type")
		}
	case "foreignKey":
		// COPY-based ALTER on MySQL 5.7 cannot replace a constraint under its old
		// name. A fresh name keeps the edit in one statement without disabling checks.
		if r.Action == "edit" && strings.EqualFold(r.Name, r.Original) {
			return "", errors.New("use a new constraint name when editing a foreign key; this keeps replacement in one ALTER TABLE without disabling foreign key checks")
		}
		if !strings.HasPrefix(definition, "(") {
			return "", errors.New("foreign key definition must start with a parenthesized column list")
		}
		add = "ADD CONSTRAINT " + quoteIdentifier(r.Name) + " FOREIGN KEY " + definition
	}
	if drop != "" {
		add = drop + ", " + add
	}
	return prefix + add, nil
}

func (s *Session) schemaSnapshot(ctx context.Context, db, table string) (string, string, error) {
	if !validName(db) || !validName(table) {
		return "", "", errors.New("select a valid database and table")
	}
	if s.conn == nil {
		return "", "", errors.New("connect first")
	}
	if s.transaction || s.txUnverified {
		return "", "", errors.New("finish the active or unverified transaction with COMMIT/ROLLBACK before editing schema")
	}
	var auto, quoted int
	var mode string
	if err := s.conn.QueryRowContext(ctx, "SELECT @@session.autocommit, @@session.sql_mode, @@session.sql_quote_show_create").Scan(&auto, &mode, &quoted); err != nil {
		return "", "", s.queryError(err)
	}
	if auto != 1 {
		s.txUnverified = true
		return "", "", errors.New("enable autocommit before editing schema")
	}
	if quoted != 1 {
		return "", "", errors.New("enable sql_quote_show_create before editing schema")
	}
	var kind string
	if err := s.conn.QueryRowContext(ctx, "SELECT TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?", db, table).Scan(&kind); err != nil {
		return "", "", s.queryError(err)
	}
	if kind != "BASE TABLE" {
		return "", "", errors.New("schema editing supports base tables only")
	}
	var name, definition string
	if err := s.conn.QueryRowContext(ctx, "SHOW CREATE TABLE "+quoteIdentifier(db)+"."+quoteIdentifier(table)).Scan(&name, &definition); err != nil {
		return "", "", s.queryError(err)
	}
	if len(definition) > 4*1024*1024 {
		return "", "", errors.New("schema definition exceeds 4 MiB")
	}
	return definition, mode, nil
}

// The next auto-increment value changes with ordinary INSERTs and is not a
// schema change. Ignore that one unquoted table option, retaining all attributes.
func schemaFingerprint(source, mode string) [32]byte {
	noBackslash := strings.Contains(","+strings.ToUpper(mode)+",", ",NO_BACKSLASH_ESCAPES,")
	ansi := strings.Contains(","+strings.ToUpper(mode)+",", ",ANSI_QUOTES,")
	var quote byte
	depth := 0
	bodyClosed := false
	for i := 0; i < len(source); i++ {
		c := source[i]
		if quote != 0 {
			if c == '\\' && quote != '`' && !noBackslash && !(quote == '"' && ansi) {
				i++
				continue
			}
			if c == quote {
				if i+1 < len(source) && source[i+1] == quote {
					i++
					continue
				}
				quote = 0
			}
			continue
		}
		if c == '\'' || c == '"' || c == '`' {
			quote = c
			continue
		}
		if c == '(' {
			depth++
		}
		if c == ')' {
			depth--
			if depth == 0 {
				bodyClosed = true
			}
		}
		const option = " AUTO_INCREMENT="
		if bodyClosed && depth == 0 && len(source)-i >= len(option) && strings.EqualFold(source[i:i+len(option)], option) {
			end := i + len(option)
			for end < len(source) && source[end] >= '0' && source[end] <= '9' {
				end++
			}
			if end > i+len(option) {
				source = source[:i] + source[end:]
			}
			break
		}
	}
	return sha256.Sum256([]byte(source + "\x00" + mode))
}

func (s *Session) PrepareSchemaChange(r SASchemaChange) (SASchemaPlan, error) {
	ctx, done, err := s.begin()
	if err != nil {
		return SASchemaPlan{}, err
	}
	defer done()
	s.schemaPending = nil
	source, mode, err := s.schemaSnapshot(ctx, r.Database, r.Table)
	if err != nil {
		return SASchemaPlan{}, err
	}
	objects, err := schemaObjects(source, mode)
	if err != nil {
		return SASchemaPlan{}, err
	}
	statement, err := schemaSQL(r, objects, mode)
	if err != nil {
		return SASchemaPlan{}, err
	}
	token := make([]byte, 24)
	if _, err = rand.Read(token); err != nil {
		return SASchemaPlan{}, err
	}
	plan := SASchemaPlan{Token: hex.EncodeToString(token), SQL: statement}
	s.schemaPending = &saSchemaPending{plan: plan, request: r, snapshot: schemaFingerprint(source, mode)}
	return plan, nil
}
func (s *Session) ApplySchemaChange(token string) (string, error) {
	ctx, done, err := s.begin()
	if err != nil {
		return "", err
	}
	defer done()
	pending := s.schemaPending
	if pending == nil || pending.plan.Token != token {
		return "", errors.New("schema preview expired; prepare the change again")
	}
	// Consume before any server mutation. A failed or uncertain DDL must never retry.
	s.schemaPending = nil
	source, mode, err := s.schemaSnapshot(ctx, pending.request.Database, pending.request.Table)
	if err != nil {
		return "", err
	}
	if schemaFingerprint(source, mode) != pending.snapshot {
		return "", errors.New("schema changed since preview; reload structure and prepare again")
	}
	if _, err = s.execContext(ctx, pending.plan.SQL); err != nil {
		return "", s.queryError(err)
	}
	if err := ctx.Err(); err != nil {
		return "", s.queryError(err)
	}
	// SHOW WARNINGS immediately: any later query replaces the server warning list.
	rows, err := s.queryContext(ctx, "SHOW WARNINGS LIMIT 20")
	if err != nil {
		return "", fmt.Errorf("schema change was acknowledged, but warnings could not be read: %w", s.queryError(err))
	}
	defer rows.Close()
	warnings := []string{}
	for rows.Next() {
		var level, message string
		var code int
		if err := rows.Scan(&level, &code, &message); err != nil {
			return "", s.queryError(err)
		}
		warnings = append(warnings, fmt.Sprintf("%s %d: %s", level, code, message))
	}
	if err := rows.Err(); err != nil {
		return "", s.queryError(err)
	}
	if len(warnings) > 0 {
		return "Server warnings (first 20):\n" + strings.Join(warnings, "\n"), nil
	}
	return "", nil
}
