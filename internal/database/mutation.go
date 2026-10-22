package database

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
)

type EditableColumn struct {
	Name      string `json:"name"`
	Type      string `json:"type"`
	Primary   bool   `json:"primary"`
	Generated bool   `json:"generated"`
	Nullable  bool   `json:"nullable"`
}
type TableDetails struct {
	Columns  []EditableColumn `json:"columns"`
	Editable bool             `json:"editable"`
	Reason   string           `json:"reason"`
}
type Mutation struct {
	Database string          `json:"database"`
	Table    string          `json:"table"`
	Action   string          `json:"action"`
	Columns  []string        `json:"columns"`
	Original []Cell          `json:"original"`
	Values   map[string]Cell `json:"values"`
}

func validName(name string) bool { return name != "" && !strings.ContainsRune(name, 0) }

// Metadata is fetched again before every write; the UI's editable flag is advisory.
func (s *Session) tableDetails(ctx context.Context, db, table string) (TableDetails, error) {
	d := TableDetails{Columns: []EditableColumn{}}
	if !validName(db) || !validName(table) {
		return d, errors.New("select a valid database and table")
	}
	var engine, kind string
	err := s.conn.QueryRowContext(ctx, "SELECT COALESCE(ENGINE,''), TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?", db, table).Scan(&engine, &kind)
	if err != nil {
		return d, s.queryError(err)
	}
	rows, err := s.conn.QueryContext(ctx, "SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_KEY, EXTRA, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION", db, table)
	if err != nil {
		return d, s.queryError(err)
	}
	defer rows.Close()
	hasKey := false
	for rows.Next() {
		var c EditableColumn
		var key, extra, nullable string
		if err := rows.Scan(&c.Name, &c.Type, &key, &extra, &nullable); err != nil {
			return d, s.queryError(err)
		}
		c.Primary, c.Generated, c.Nullable = key == "PRI", strings.Contains(extra, "VIRTUAL GENERATED") || strings.Contains(extra, "STORED GENERATED") || strings.Contains(extra, "PERSISTENT GENERATED"), nullable == "YES"
		// Invisible columns are absent from SELECT *: its snapshot cannot protect the whole row.
		if strings.Contains(strings.ToUpper(extra), "INVISIBLE") {
			d.Reason = "Tables with invisible columns are read-only."
		}
		hasKey = hasKey || c.Primary
		d.Columns = append(d.Columns, c)
	}
	if err := rows.Err(); err != nil {
		return d, s.queryError(err)
	}
	if kind != "BASE TABLE" || !strings.EqualFold(engine, "InnoDB") {
		d.Reason = "Only InnoDB base tables can be edited."
	}
	if !hasKey {
		d.Reason = "A primary key is required to identify rows safely."
	}
	d.Editable = d.Reason == "" && len(d.Columns) > 0
	return d, nil
}
func (s *Session) TableDetails(db, table string) (TableDetails, error) {
	ctx, done, err := s.begin()
	if err != nil {
		return TableDetails{}, err
	}
	defer done()
	if s.conn == nil {
		return TableDetails{}, errors.New("connect first")
	}
	return s.tableDetails(ctx, db, table)
}
func cellArgument(c Cell) (any, error) {
	if c.Null {
		return nil, nil
	}
	if len(c.Value) > MaxResultBytes {
		return nil, errors.New("cell exceeds 4 MiB")
	}
	if c.Binary {
		if !strings.HasPrefix(c.Value, "0x") {
			return nil, errors.New("binary values must use 0x followed by hex digits")
		}
		b, err := hex.DecodeString(c.Value[2:])
		if err != nil {
			return nil, errors.New("invalid binary hex value")
		}
		return b, nil
	}
	return c.Value, nil
}
func mutationSQL(r Mutation, d TableDetails) (string, []any, error) {
	if !validName(r.Database) || !validName(r.Table) || !d.Editable {
		return "", nil, errors.New("table is read-only; reload its metadata")
	}
	if r.Action != "insert" && r.Action != "update" && r.Action != "delete" {
		return "", nil, errors.New("unsupported row operation")
	}
	args := []any{}
	names, marks, assignments := []string{}, []string{}, []string{}
	for name := range r.Values {
		found := false
		for _, c := range d.Columns {
			if c.Name == name && !c.Generated {
				found = true
				break
			}
		}
		if !found {
			return "", nil, errors.New("unknown or generated column")
		}
	}
	for _, c := range d.Columns {
		v, ok := r.Values[c.Name]
		if !ok {
			continue
		}
		if v.Null && !c.Nullable {
			return "", nil, fmt.Errorf("%s cannot be NULL", c.Name)
		}
		arg, err := cellArgument(v)
		if err != nil {
			return "", nil, err
		}
		args = append(args, arg)
		names = append(names, quoteIdentifier(c.Name))
		marks = append(marks, "?")
		assignments = append(assignments, quoteIdentifier(c.Name)+"=?")
	}
	target := quoteIdentifier(r.Database) + "." + quoteIdentifier(r.Table)
	if r.Action == "insert" {
		return "INSERT INTO " + target + " (" + strings.Join(names, ",") + ") VALUES (" + strings.Join(marks, ",") + ")", args, nil
	}
	if len(r.Columns) != len(d.Columns) || len(r.Original) != len(d.Columns) {
		return "", nil, errors.New("row schema changed; reload before editing")
	}
	predicates := []string{}
	// Exact byte comparisons avoid case-insensitive/trailing-space collation matches.
	// The primary-key predicates keep the lookup bounded; the full snapshot detects conflicts.
	for i, c := range d.Columns {
		if r.Columns[i] != c.Name {
			return "", nil, errors.New("row schema changed; reload before editing")
		}
		if c.Primary {
			if r.Original[i].Null {
				return "", nil, errors.New("primary key cannot be NULL")
			}
			arg, err := cellArgument(r.Original[i])
			if err != nil {
				return "", nil, err
			}
			predicates = append(predicates, quoteIdentifier(c.Name)+" <=> ?")
			args = append(args, arg)
		}
	}
	for i, c := range d.Columns {
		arg, err := cellArgument(r.Original[i])
		if err != nil {
			return "", nil, err
		}
		predicates = append(predicates, "CAST("+quoteIdentifier(c.Name)+" AS BINARY) <=> CAST(? AS BINARY)")
		args = append(args, arg)
	}
	where := " WHERE " + strings.Join(predicates, " AND ") + " LIMIT 1"
	if r.Action == "delete" {
		if len(r.Values) != 0 {
			return "", nil, errors.New("delete must not include replacement values")
		}
		return "DELETE FROM " + target + where, args, nil
	}
	if len(assignments) == 0 {
		return "", nil, errors.New("select at least one column to update")
	}
	return "UPDATE " + target + " SET " + strings.Join(assignments, ",") + where, args, nil
}
func (s *Session) Mutate(r Mutation) (int64, error) {
	ctx, done, err := s.begin()
	if err != nil {
		return 0, err
	}
	defer done()
	if s.conn == nil {
		return 0, errors.New("connect first")
	}
	if s.txUnverified {
		return 0, errors.New("transaction state is uncertain; use ROLLBACK before writing")
	}
	if !validName(r.Database) || !validName(r.Table) {
		return 0, errors.New("invalid database or table")
	}
	// Hold the table's metadata lock across validation and the write. Without
	// this, concurrent DDL could remove the primary key after validation.
	localTransaction := !s.transaction
	committed := false
	if localTransaction {
		if _, err := s.conn.ExecContext(ctx, "START TRANSACTION"); err != nil {
			return 0, s.queryError(err)
		}
		defer func() {
			if !committed {
				if _, err := s.conn.ExecContext(ctx, "ROLLBACK"); err != nil {
					s.failed = true
				}
			}
		}()
	}
	lock, err := s.conn.QueryContext(ctx, "SELECT * FROM "+quoteIdentifier(r.Database)+"."+quoteIdentifier(r.Table)+" LIMIT 0")
	if err != nil {
		return 0, s.queryError(err)
	}
	if err := lock.Close(); err != nil {
		return 0, s.queryError(err)
	}
	d, err := s.tableDetails(ctx, r.Database, r.Table)
	if err != nil {
		return 0, err
	}
	q, args, err := mutationSQL(r, d)
	if err != nil {
		return 0, err
	}
	result, err := s.conn.ExecContext(ctx, q, args...)
	if err != nil {
		return 0, fmt.Errorf("write failed; verify the server outcome before retrying: %w", s.queryError(err))
	}
	n, err := result.RowsAffected()
	if err != nil {
		return 0, s.queryError(err)
	}
	if err := ctx.Err(); err != nil {
		return 0, fmt.Errorf("write outcome unknown; verify before retrying: %w", s.queryError(err))
	}
	if r.Action != "insert" && n == 0 {
		return 0, errors.New("row changed, was deleted, or values were unchanged; reload before retrying")
	}
	if localTransaction {
		if _, err := s.conn.ExecContext(ctx, "COMMIT"); err != nil {
			s.failed = true
			return 0, errors.New("write commit outcome unknown; verify on the server before retrying")
		}
		committed = true
		if err := ctx.Err(); err != nil {
			return 0, fmt.Errorf("write commit outcome unknown; verify before retrying: %w", s.queryError(err))
		}
	}
	return n, nil
}
