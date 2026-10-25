package database

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

type SAObjectRequest struct {
	Kind        string `json:"kind"`
	Action      string `json:"action"`
	Database    string `json:"database"`
	Table       string `json:"table"`
	Destination string `json:"destination"`
	Name        string `json:"name"`
	Definition  string `json:"definition"`
	IncludeData bool   `json:"includeData"`
}
type SAObjectPlan struct {
	Token string   `json:"token"`
	SQL   []string `json:"sql"`
}
type SABatchOutcome struct {
	Completed int    `json:"completed"`
	Total     int    `json:"total"`
	Error     string `json:"error"`
	Uncertain bool   `json:"uncertain"`
	Warnings  string `json:"warnings"`
	Statement int    `json:"statement"`
	Line      int    `json:"line"`
}
type saObjectPending struct {
	plan        SAObjectPlan
	request     SAObjectRequest
	fingerprint [32]byte
}

func (s *Session) writeReady(ctx context.Context) (string, error) {
	if s.conn == nil {
		return "", errors.New("connect first")
	}
	if s.transaction || s.txUnverified {
		return "", errors.New("finish active or unverified transactions with COMMIT/ROLLBACK first")
	}
	var auto int
	var mode string
	if err := s.conn.QueryRowContext(ctx, "SELECT @@session.autocommit, @@session.sql_mode").Scan(&auto, &mode); err != nil {
		return "", s.queryError(err)
	}
	if auto != 1 {
		s.txUnverified = true
		return "", errors.New("enable autocommit before this operation")
	}
	return mode, nil
}
func newPlanToken() (string, error) {
	b := make([]byte, 24)
	_, err := rand.Read(b)
	return hex.EncodeToString(b), err
}
func qualified(db, table string) string { return quoteIdentifier(db) + "." + quoteIdentifier(table) }
func objectName(name string) bool       { return validName(name) && len([]rune(name)) <= 64 }
func (s *Session) databaseExists(ctx context.Context, name string) (bool, error) {
	var count int
	err := s.conn.QueryRowContext(ctx, "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?", name).Scan(&count)
	if err != nil {
		return false, s.queryError(err)
	}
	return count != 0, nil
}
func (s *Session) tableDefinition(ctx context.Context, db, table string) (string, error) {
	var name, def string
	err := s.conn.QueryRowContext(ctx, "SHOW CREATE TABLE "+qualified(db, table)).Scan(&name, &def)
	if err != nil {
		return "", s.queryError(err)
	}
	if len(def) > 4*1024*1024 {
		return "", errors.New("CREATE definition exceeds 4 MiB")
	}
	return def, nil
}
func (s *Session) tableColumns(ctx context.Context, db, table string) ([]string, error) {
	rows, err := s.queryContext(ctx, "SELECT COLUMN_NAME, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION", db, table)
	if err != nil {
		return nil, s.queryError(err)
	}
	defer rows.Close()
	names := []string{}
	for rows.Next() {
		var name, extra string
		if err := rows.Scan(&name, &extra); err != nil {
			return nil, s.queryError(err)
		}
		u := strings.ToUpper(extra)
		if !strings.Contains(u, "VIRTUAL GENERATED") && !strings.Contains(u, "STORED GENERATED") && !strings.Contains(u, "PERSISTENT GENERATED") {
			names = append(names, name)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, s.queryError(err)
	}
	if len(names) == 0 {
		return nil, errors.New("no writable columns available")
	}
	return names, nil
}
func quotedList(names []string) string {
	out := make([]string, len(names))
	for i, name := range names {
		out[i] = quoteIdentifier(name)
	}
	return strings.Join(out, ", ")
}
func (s *Session) noTriggers(ctx context.Context, db, table string) error {
	var n int
	err := s.conn.QueryRowContext(ctx, "SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=? AND (?='' OR EVENT_OBJECT_TABLE=?)", db, table, table).Scan(&n)
	if err != nil {
		return s.queryError(err)
	}
	if n != 0 {
		return errors.New("copy/move with triggers is not supported; export and review those objects separately")
	}
	return nil
}

// FK clauses are handled separately so cycles can be restored after every table
// and its data exists. Identifiers are read from SHOW CREATE, never regex-replaced in literals.
func cloneCreate(source, mode, sourceDB, sourceTable, destDB, destTable string, wholeDB bool) (string, []string, error) {
	parts, end, err := schemaPartsEnd(source, mode)
	if err != nil {
		return "", nil, err
	}
	kept := []string{}
	foreign := []string{}
	for _, part := range parts {
		if strings.HasPrefix(strings.ToUpper(part), "CONSTRAINT ") {
			name, rest, ok := schemaIdentifier(part[len("CONSTRAINT "):])
			if !ok {
				return "", nil, errors.New("cannot read constraint; quoted SHOW CREATE is required")
			}
			if !wholeDB {
				sum := sha256.Sum256([]byte(destTable + "\x00" + name))
				name = "copy_" + hex.EncodeToString(sum[:12])
			}
			prefix := "CONSTRAINT " + quoteIdentifier(name) + " "
			if strings.HasPrefix(strings.ToUpper(rest), "FOREIGN KEY ") {
				// REFERENCES follows the local parenthesized column list.
				_, at, e := schemaPartsEnd(rest, mode)
				if e != nil {
					return "", nil, e
				}
				tail := strings.TrimSpace(rest[at:])
				if !strings.HasPrefix(strings.ToUpper(tail), "REFERENCES ") {
					return "", nil, errors.New("cannot read foreign key reference")
				}
				ref, remaining, ok := schemaIdentifier(tail[len("REFERENCES "):])
				if !ok {
					return "", nil, errors.New("cannot read referenced table")
				}
				refDB := sourceDB
				if strings.HasPrefix(remaining, ".") {
					refDB = ref
					ref, remaining, ok = schemaIdentifier(remaining[1:])
					if !ok {
						return "", nil, errors.New("cannot read qualified foreign key reference")
					}
				}
				if wholeDB && refDB == sourceDB {
					refDB = destDB
				}
				if !wholeDB && refDB == sourceDB && ref == sourceTable {
					refDB = destDB
					ref = destTable
				}
				local := strings.TrimSpace(rest[:at])
				foreign = append(foreign, "ALTER TABLE "+qualified(destDB, destTable)+" ADD "+prefix+local+" REFERENCES "+qualified(refDB, ref)+" "+remaining)
				continue
			}
			part = prefix + rest
		}
		kept = append(kept, part)
	}
	return "CREATE TABLE " + qualified(destDB, destTable) + " (\n" + strings.Join(kept, ",\n") + "\n)" + source[end:], foreign, nil
}
func (s *Session) objectStatements(ctx context.Context, r SAObjectRequest) ([]string, [32]byte, error) {
	var zero [32]byte
	mode, err := s.writeReady(ctx)
	if err != nil {
		return nil, zero, err
	}
	if !objectName(r.Database) {
		return nil, zero, errors.New("enter a database name of 1–64 characters")
	}
	if r.Kind != "table" && r.Kind != "database" {
		return nil, zero, errors.New("unknown object kind")
	}
	if r.Action != "create" && r.Action != "rename" && r.Action != "copy" && r.Action != "drop" && r.Action != "truncate" {
		return nil, zero, errors.New("unknown object action")
	}
	if r.Destination == "" {
		r.Destination = r.Database
	}
	statements := []string{}
	evidence := []string{mode}
	exists, err := s.databaseExists(ctx, r.Database)
	if err != nil {
		return nil, zero, err
	}
	if r.Kind == "database" && r.Action == "create" {
		if exists {
			return nil, zero, errors.New("database already exists")
		}
		if strings.TrimSpace(r.Definition) != "" {
			return nil, zero, errors.New("database create uses server defaults; custom options are not accepted")
		}
		statements = append(statements, "CREATE DATABASE "+quoteIdentifier(r.Database))
	} else {
		if !exists {
			return nil, zero, errors.New("source database no longer exists")
		}
		if r.Kind == "table" {
			if !objectName(r.Table) || !objectName(r.Destination) {
				return nil, zero, errors.New("enter valid table and destination database names")
			}
			destExists, err := s.databaseExists(ctx, r.Destination)
			if err != nil {
				return nil, zero, err
			}
			if !destExists {
				return nil, zero, errors.New("destination database does not exist")
			}
			target := qualified(r.Database, r.Table)
			if r.Action == "create" {
				if !strings.HasPrefix(strings.TrimSpace(r.Definition), "(") {
					return nil, zero, errors.New("table definition must start with its parenthesized columns")
				}
				if err := validateSchemaFragment(r.Definition, mode); err != nil {
					return nil, zero, err
				}
				statements = append(statements, "CREATE TABLE "+target+" "+r.Definition)
			} else {
				source, _, err := s.schemaSnapshot(ctx, r.Database, r.Table)
				if err != nil {
					return nil, zero, err
				}
				hash := schemaFingerprint(source, mode)
				evidence = append(evidence, hex.EncodeToString(hash[:]))
				switch r.Action {
				case "drop":
					statements = append(statements, "DROP TABLE "+target)
				case "truncate":
					statements = append(statements, "TRUNCATE TABLE "+target)
				case "rename", "copy":
					if !objectName(r.Name) {
						return nil, zero, errors.New("enter a new table name")
					}
					var n int
					if err := s.conn.QueryRowContext(ctx, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?", r.Destination, r.Name).Scan(&n); err != nil {
						return nil, zero, s.queryError(err)
					}
					if n != 0 {
						return nil, zero, errors.New("destination table already exists")
					}
					if r.Action == "rename" {
						if r.Database != r.Destination {
							if err := s.noTriggers(ctx, r.Database, r.Table); err != nil {
								return nil, zero, err
							}
						}
						statements = append(statements, "RENAME TABLE "+target+" TO "+qualified(r.Destination, r.Name))
					} else {
						if err := s.noTriggers(ctx, r.Database, r.Table); err != nil {
							return nil, zero, err
						}
						create, fks, err := cloneCreate(source, mode, r.Database, r.Table, r.Destination, r.Name, false)
						if err != nil {
							return nil, zero, err
						}
						statements = append(statements, create)
						if r.IncludeData {
							cols, err := s.tableColumns(ctx, r.Database, r.Table)
							if err != nil {
								return nil, zero, err
							}
							list := quotedList(cols)
							statements = append(statements, "INSERT INTO "+qualified(r.Destination, r.Name)+" ("+list+") SELECT "+list+" FROM "+target)
						}
						statements = append(statements, fks...)
					}
				}
			}
		} else {
			if r.Action == "truncate" {
				return nil, zero, errors.New("truncate applies to tables only")
			}
			var charset, collation string
			if err := s.conn.QueryRowContext(ctx, "SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?", r.Database).Scan(&charset, &collation); err != nil {
				return nil, zero, s.queryError(err)
			}
			evidence = append(evidence, charset, collation)
			rows, err := s.queryContext(ctx, "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME", r.Database)
			if err != nil {
				return nil, zero, s.queryError(err)
			}
			tables := []string{}
			for rows.Next() {
				var name, kind string
				if err := rows.Scan(&name, &kind); err != nil {
					rows.Close()
					return nil, zero, s.queryError(err)
				}
				if len(tables) >= 1000 {
					rows.Close()
					return nil, zero, errors.New("database operations are limited to 1,000 tables")
				}
				tables = append(tables, name)
				evidence = append(evidence, name, kind)
				if kind != "BASE TABLE" && r.Action != "drop" {
					rows.Close()
					return nil, zero, errors.New("database copy/move supports base tables only; views/sequences require separate migration")
				}
			}
			err = rows.Err()
			rows.Close()
			if err != nil {
				return nil, zero, s.queryError(err)
			}
			if r.Action == "drop" {
				statements = append(statements, "DROP DATABASE "+quoteIdentifier(r.Database))
			} else {
				if !objectName(r.Name) || strings.EqualFold(r.Name, r.Database) {
					return nil, zero, errors.New("enter a new database name")
				}
				already, err := s.databaseExists(ctx, r.Name)
				if err != nil {
					return nil, zero, err
				}
				if already {
					return nil, zero, errors.New("destination database already exists")
				}
				if err := s.noTriggers(ctx, r.Database, ""); err != nil {
					return nil, zero, err
				}
				var special int
				if err := s.conn.QueryRowContext(ctx, "SELECT (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=?)+(SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA=?)", r.Database, r.Database).Scan(&special); err != nil {
					return nil, zero, s.queryError(err)
				}
				if special != 0 {
					return nil, zero, errors.New("database copy/move with routines or events requires separate migration")
				}
				statements = append(statements, "CREATE DATABASE "+quoteIdentifier(r.Name)+" CHARACTER SET "+quoteIdentifier(charset)+" COLLATE "+quoteIdentifier(collation))
				foreign := []string{}
				moves := []string{}
				for _, table := range tables {
					source, err := s.tableDefinition(ctx, r.Database, table)
					if err != nil {
						return nil, zero, err
					}
					hash := schemaFingerprint(source, mode)
					evidence = append(evidence, hex.EncodeToString(hash[:]))
					if r.Action == "rename" {
						moves = append(moves, qualified(r.Database, table)+" TO "+qualified(r.Name, table))
						continue
					}
					create, fks, err := cloneCreate(source, mode, r.Database, table, r.Name, table, true)
					if err != nil {
						return nil, zero, err
					}
					statements = append(statements, create)
					foreign = append(foreign, fks...)
				}
				if r.Action == "rename" {
					if len(moves) > 0 {
						statements = append(statements, "RENAME TABLE "+strings.Join(moves, ", "))
					}
					statements = append(statements, "DROP DATABASE "+quoteIdentifier(r.Database))
				} else {
					if r.IncludeData {
						for _, table := range tables {
							cols, err := s.tableColumns(ctx, r.Database, table)
							if err != nil {
								return nil, zero, err
							}
							list := quotedList(cols)
							statements = append(statements, "INSERT INTO "+qualified(r.Name, table)+" ("+list+") SELECT "+list+" FROM "+qualified(r.Database, table))
						}
					}
					statements = append(statements, foreign...)
				}
			}
		}
	}
	fingerprintSQL := append([]string(nil), statements...)
	for i, statement := range fingerprintSQL {
		if strings.HasPrefix(statement, "CREATE TABLE ") {
			hash := schemaFingerprint(statement, mode)
			fingerprintSQL[i] = hex.EncodeToString(hash[:])
		}
	}
	b, _ := json.Marshal(struct {
		SQL      []string
		Evidence []string
	}{fingerprintSQL, evidence})
	if len(b) > 4*1024*1024 {
		return nil, zero, errors.New("operation preview exceeds 4 MiB")
	}
	return statements, sha256.Sum256(b), nil
}
func (s *Session) PrepareObjectChange(r SAObjectRequest) (SAObjectPlan, error) {
	ctx, done, err := s.begin()
	if err != nil {
		return SAObjectPlan{}, err
	}
	defer done()
	s.objectPending = nil
	sql, fingerprint, err := s.objectStatements(ctx, r)
	if err != nil {
		return SAObjectPlan{}, err
	}
	token, err := newPlanToken()
	if err != nil {
		return SAObjectPlan{}, err
	}
	plan := SAObjectPlan{Token: token, SQL: sql}
	s.objectPending = &saObjectPending{plan, r, fingerprint}
	return plan, nil
}
func (s *Session) ApplyObjectChange(token string) SABatchOutcome {
	ctx, done, err := s.begin()
	if err != nil {
		return SABatchOutcome{Error: err.Error()}
	}
	defer done()
	p := s.objectPending
	if p == nil || p.plan.Token != token {
		return SABatchOutcome{Error: "object preview expired; prepare again"}
	}
	s.objectPending = nil
	out := SABatchOutcome{Total: len(p.plan.SQL)}
	_, hash, err := s.objectStatements(ctx, p.request)
	if err != nil {
		out.Error = err.Error()
		return out
	}
	if hash != p.fingerprint {
		out.Error = "objects changed since preview; refresh and prepare again"
		return out
	}
	for index, statement := range p.plan.SQL {
		if p.request.Kind == "database" && p.request.Action == "rename" && index == len(p.plan.SQL)-1 {
			var remaining int
			if err := s.conn.QueryRowContext(ctx, "SELECT (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=?)+(SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=?)+(SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA=?)", p.request.Database, p.request.Database, p.request.Database).Scan(&remaining); err != nil {
				out.Error = s.queryError(err).Error()
				return out
			}
			if remaining != 0 {
				out.Error = "source database contains new objects after the move; it was retained. Review both databases"
				return out
			}
		}
		if _, err := s.execContext(ctx, statement); err != nil {
			out.Error = s.queryError(err).Error()
			out.Uncertain = s.failed || ctx.Err() != nil
			return out
		}
		out.Completed++
		warnings, err := s.exchangeWarnings(ctx)
		if err != nil {
			out.Error = "statement acknowledged, but warnings could not be read: " + err.Error()
			out.Uncertain = true
			return out
		}
		if warnings != "" {
			out.Warnings = warnings
			out.Error = "stopped after an acknowledged statement with warnings"
			return out
		}
	}
	return out
}

func NewFileToken() (string, error) { return newPlanToken() }

// Notes (for example DROP IF EXISTS on an absent table) are not coercion warnings.
func (s *Session) exchangeWarnings(ctx context.Context) (string, error) {
	rows, err := s.queryContext(ctx, "SHOW WARNINGS")
	if err != nil {
		return "", s.queryError(err)
	}
	defer rows.Close()
	messages := []string{}
	count := 0
	for rows.Next() {
		var level, message string
		var code int
		if err := rows.Scan(&level, &code, &message); err != nil {
			return "", s.queryError(err)
		}
		if !strings.EqualFold(level, "Note") {
			count++
			if len(messages) < 20 {
				messages = append(messages, fmt.Sprintf("%s %d: %s", level, code, message))
			}
		}
	}
	if err := rows.Err(); err != nil {
		return "", s.queryError(err)
	}
	if count == 0 {
		return "", nil
	}
	return fmt.Sprintf("%d server warning(s):\n%s", count, strings.Join(messages, "\n")), nil
}
