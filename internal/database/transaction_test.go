package database

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"

	"github.com/go-sql-driver/mysql"
)

// A connector fake exercises database/sql error paths without network access.
type writeConnector struct {
	warningsReadErr error
	schemaSource    string
	defaultLiteral  string
	catalogCount    int
	noPrimary       bool
	nonNullText     bool
	indexes         [][]driver.Value
	engine          string
	unlockErr       error
	lockErr         error
	execs           []string
	affected        int64
	execErr         error
	autocommit      int64
	failWriteOnly   bool
}

func (c *writeConnector) Connect(context.Context) (driver.Conn, error) { return &writeConn{c}, nil }
func (c *writeConnector) Driver() driver.Driver                        { return unusedDriver{} }

type unusedDriver struct{}

func (unusedDriver) Open(string) (driver.Conn, error) { return nil, errors.New("connector required") }

type writeConn struct{ c *writeConnector }

func (c *writeConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("not used") }
func (c *writeConn) Begin() (driver.Tx, error)           { return nil, errors.New("not used") }
func (c *writeConn) Close() error                        { return nil }
func (c *writeConn) ExecContext(_ context.Context, q string, _ []driver.NamedValue) (driver.Result, error) {
	c.c.execs = append(c.c.execs, q)
	err := c.c.execErr
	if strings.HasPrefix(q, "LOCK TABLES ") {
		err = c.c.lockErr
	}
	if q == "UNLOCK TABLES" {
		err = c.c.unlockErr
	}
	if c.c.failWriteOnly && (q == "START TRANSACTION" || q == "COMMIT" || q == "ROLLBACK") {
		err = nil
	}
	return driver.RowsAffected(c.c.affected), err
}

type writeRows struct {
	names  []string
	values [][]driver.Value
}

func (r *writeRows) Columns() []string { return r.names }
func (r *writeRows) Close() error      { return nil }
func (r *writeRows) Next(dest []driver.Value) error {
	if len(r.values) == 0 {
		return io.EOF
	}
	copy(dest, r.values[0])
	r.values = r.values[1:]
	return nil
}
func (c *writeConn) QueryContext(_ context.Context, q string, _ []driver.NamedValue) (driver.Rows, error) {
	switch {
	case strings.HasPrefix(q, "SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS "):
		return &writeRows{[]string{"default"}, [][]driver.Value{{c.c.defaultLiteral}}}, nil
	case strings.HasPrefix(q, "SHOW CREATE TABLE "):
		source := c.c.schemaSource
		if source == "" {
			source = "CREATE TABLE `sample` (`id` int NOT NULL, `text` varchar(20))"
		}
		return &writeRows{[]string{"Table", "Create Table"}, [][]driver.Value{{"sample", source}}}, nil
	case c.c.catalogCount > 0 && (q == "SHOW DATABASES" || strings.HasPrefix(q, "SHOW FULL TABLES FROM ")):
		rows := make([][]driver.Value, c.c.catalogCount)
		for i := range rows {
			rows[i] = []driver.Value{fmt.Sprintf("table_%05d", i)}
		}
		return &writeRows{[]string{"name"}, rows}, nil
	case q == "SELECT VERSION(), DATABASE()":
		return &writeRows{[]string{"version", "database"}, [][]driver.Value{{"8.4.0", "test"}}}, nil
	case q == "SHOW WARNINGS LIMIT 20":
		if c.c.warningsReadErr != nil {
			return nil, c.c.warningsReadErr
		}
		return &writeRows{[]string{"Level", "Code", "Message"}, nil}, nil
	case q == "SELECT @@session.autocommit, @@session.sql_mode, @@session.sql_quote_show_create":
		return &writeRows{[]string{"autocommit", "mode", "quoted"}, [][]driver.Value{{c.c.autocommit, "", int64(1)}}}, nil
	case strings.HasPrefix(q, "SELECT TABLE_TYPE FROM information_schema.TABLES"):
		return &writeRows{[]string{"kind"}, [][]driver.Value{{"BASE TABLE"}}}, nil
	case strings.Contains(q, "@@session.autocommit"):
		return &writeRows{[]string{"autocommit"}, [][]driver.Value{{c.c.autocommit}}}, nil
	case strings.Contains(q, "information_schema.TABLES"):
		engine := c.c.engine
		if engine == "" {
			engine = "InnoDB"
		}
		return &writeRows{[]string{"engine", "kind"}, [][]driver.Value{{engine, "BASE TABLE"}}}, nil
	case strings.Contains(q, "information_schema.STATISTICS"):
		indexes := c.c.indexes
		if !c.c.noPrimary && indexes == nil {
			indexes = [][]driver.Value{{"PRIMARY", "id", nil}}
		}
		return &writeRows{[]string{"index", "column", "prefix"}, indexes}, nil
	case strings.Contains(q, "information_schema.COLUMNS"):
		key, nullable := "PRI", "YES"
		if c.c.noPrimary {
			key = ""
		}
		if c.c.nonNullText {
			nullable = "NO"
		}
		return &writeRows{[]string{"name", "type", "key", "extra", "nullable"}, [][]driver.Value{{"id", "int", key, "", "NO"}, {"text", "varchar(20)", "", "", nullable}}}, nil
	default:
		return &writeRows{[]string{"value"}, [][]driver.Value{{"1"}}}, nil
	}
}
func fakeSession(t *testing.T, c driver.Connector) *Session {
	t.Helper()
	db := sql.OpenDB(c)
	conn, err := db.Conn(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	s := &Session{db: db, conn: conn}
	t.Cleanup(s.Shutdown)
	return s
}
func TestManagedTransaction(t *testing.T) {
	c := &writeConnector{autocommit: 1}
	s := fakeSession(t, c)
	if err := s.Transaction("begin"); err != nil || s.TransactionStatus() != "active" {
		t.Fatal(err, s.TransactionStatus())
	}
	if err := s.Transaction("begin"); err == nil {
		t.Fatal("nested begin accepted")
	}
	for _, q := range []string{"COMMIT", "ROLLBACK", "SET autocommit=1", "CREATE TABLE x(id INT)", "CALL test()", "/* comment */ SELECT 1"} {
		if _, err := s.Query(q); err == nil {
			t.Fatal("unsafe managed SQL", q)
		}
	}
	if _, err := s.Query("SELECT 1"); err != nil {
		t.Fatal(err)
	}
	if s.TransactionStatus() != "active" {
		t.Fatal(s.TransactionStatus())
	}
	if err := s.Transaction("commit"); err != nil || s.TransactionStatus() != "idle" {
		t.Fatal(err)
	}
	if _, err := s.Query("SELECT 1"); err != nil {
		t.Fatal(err)
	}
	if s.TransactionStatus() != "unverified" {
		t.Fatal("manual SQL was assumed idle")
	}
	if err := s.Transaction("begin"); err == nil {
		t.Fatal("begin implicitly committed manual SQL")
	}
	if err := s.Transaction("rollback"); err != nil || s.TransactionStatus() != "idle" {
		t.Fatal(err)
	}
	c.autocommit = 0
	if err := s.Transaction("begin"); err == nil {
		t.Fatal("autocommit off accepted")
	}
}
func TestTransactionFailure(t *testing.T) {
	c := &writeConnector{autocommit: 1}
	s := fakeSession(t, c)
	if err := s.Transaction("begin"); err != nil {
		t.Fatal(err)
	}
	s.queryError(&mysql.MySQLError{Number: 1213, Message: "deadlock"})
	if s.TransactionStatus() != "unverified" {
		t.Fatal("deadlock left a confirmed active transaction")
	}
	if _, err := s.Query("UPDATE x SET y=1"); err == nil {
		t.Fatal("write after transaction error")
	}
	if err := s.Transaction("commit"); err == nil {
		t.Fatal("commit after uncertain transaction")
	}
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	if err := s.Transaction("begin"); err != nil {
		t.Fatal(err)
	}
	c.execErr = io.ErrUnexpectedEOF
	if err := s.Transaction("commit"); err == nil {
		t.Fatal("failed commit reported success")
	}
	if s.Connected() || s.TransactionStatus() != "disconnected" {
		t.Fatal("failed commit preserved session")
	}
	if len(c.execs) != 4 {
		t.Fatal("unexpected replay", c.execs)
	}
}
func TestMutationOutcome(t *testing.T) {
	for _, tt := range []struct {
		name          string
		affected      int64
		failure       error
		ok, connected bool
	}{
		{"success", 1, nil, true, true}, {"conflict", 0, nil, false, true}, {"transport", 0, io.ErrUnexpectedEOF, false, false}, {"sql error", 0, &mysql.MySQLError{Number: 1062, Message: "duplicate"}, false, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			c := &writeConnector{affected: tt.affected, execErr: tt.failure, failWriteOnly: true}
			s := fakeSession(t, c)
			r := Mutation{Database: "test", Table: "sample", Action: "update", Columns: []string{"id", "text"}, Original: []Cell{{Value: "1"}, {Null: true}}, Values: map[string]Cell{"text": {Value: "new"}}}
			n, err := s.Mutate(r)
			if (err == nil) != tt.ok || n != tt.affected || s.Connected() != tt.connected || strings.Count(strings.Join(c.execs, ";"), "UPDATE ") != 1 {
				t.Fatal(n, err, c.execs)
			}
		})
	}
}

func TestWorkspaceInfoPreservesTransactionState(t *testing.T) {
	for _, state := range []string{"idle", "active", "unverified"} {
		t.Run(state, func(t *testing.T) {
			c := &writeConnector{autocommit: 1, affected: 1}
			s := fakeSession(t, c)
			s.transaction = state == "active"
			s.txUnverified = state == "unverified"
			for range 2 {
				if info, err := s.WorkspaceInfo(); err != nil || len(info.Rows) != 1 || info.Rows[0][0].Value != "8.4.0" || info.Rows[0][1].Value != "test" {
					t.Fatal(info, err)
				}
				if got := s.TransactionStatus(); got != state {
					t.Fatalf("metadata changed %s to %s", state, got)
				}
			}
			r := Mutation{Database: "test", Table: "sample", Action: "update", Columns: []string{"id", "text"}, Original: []Cell{{Value: "1"}, {Null: true}}, Values: map[string]Cell{"text": {Value: "new"}}}
			_, err := s.Mutate(r)
			if (err != nil) != (state == "unverified") {
				t.Fatalf("mutation in %s: %v", state, err)
			}
			if state == "unverified" && len(c.execs) != 0 {
				t.Fatal("uncertain session performed a write", c.execs)
			}
		})
	}
}

func TestMyISAMMutationLockLifecycle(t *testing.T) {
	for _, state := range []string{"success", "conflict", "write error", "lock error", "unlock error", "active", "unverified"} {
		t.Run(state, func(t *testing.T) {
			c := &writeConnector{engine: "MyISAM", affected: 1}
			s := fakeSession(t, c)
			switch state {
			case "conflict":
				c.affected = 0
			case "write error":
				c.execErr = &mysql.MySQLError{Number: 1062, Message: "duplicate"}
			case "lock error":
				c.lockErr = &mysql.MySQLError{Number: 1142, Message: "denied"}
			case "unlock error":
				c.unlockErr = io.ErrUnexpectedEOF
			case "active":
				s.transaction = true
			case "unverified":
				s.txUnverified = true
			}
			r := Mutation{Database: "test", Table: "sample", Action: "update", Columns: []string{"id", "text"}, Original: []Cell{{Value: "1"}, {Null: true}}, Values: map[string]Cell{"text": {Value: "new"}}}
			_, err := s.Mutate(r)
			if (err == nil) != (state == "success") {
				t.Fatal(state, err)
			}
			commands := strings.Join(c.execs, ";")
			if strings.Contains(commands, "START TRANSACTION") || strings.Contains(commands, "COMMIT") || strings.Contains(commands, "ROLLBACK") {
				t.Fatal("MyISAM changed transaction", commands)
			}
			if state == "active" || state == "unverified" {
				if len(c.execs) != 0 {
					t.Fatal(commands)
				}
				return
			}
			if state == "lock error" {
				if len(c.execs) != 1 {
					t.Fatal(commands)
				}
				return
			}
			if c.execs[0] != "LOCK TABLES `test`.`sample` WRITE" || c.execs[len(c.execs)-1] != "UNLOCK TABLES" {
				t.Fatal(commands)
			}
			if state == "unlock error" && s.Connected() {
				t.Fatal("failed unlock preserved session")
			}
		})
	}
}

func TestUniqueIdentityEligibility(t *testing.T) {
	for _, tt := range []struct {
		name                  string
		indexes               [][]driver.Value
		nonNullText, editable bool
	}{
		{"unique id", [][]driver.Value{{"uid", "id", nil}}, false, true},
		{"nullable unique", [][]driver.Value{{"utext", "text", nil}}, false, false},
		{"composite", [][]driver.Value{{"u", "id", nil}, {"u", "text", nil}}, true, true},
		{"prefix", [][]driver.Value{{"u", "id", int64(2)}}, false, false},
		{"expression", [][]driver.Value{{"u", nil, nil}}, false, false},
		{"no key", nil, false, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s := fakeSession(t, &writeConnector{noPrimary: true, indexes: tt.indexes, nonNullText: tt.nonNullText})
			d, err := s.TableDetails("test", "sample")
			if err != nil || d.Editable != tt.editable {
				t.Fatal(d, err)
			}
			if tt.editable && !d.Columns[0].Identity {
				t.Fatal("unique identity not recorded", d)
			}
		})
	}
}

func TestCatalogHasSeparateRowBudget(t *testing.T) {
	for _, kind := range []string{"databases", "tables", "query", "catalog overflow"} {
		t.Run(kind, func(t *testing.T) {
			count := 509
			if kind == "catalog overflow" {
				count = MaxCatalogRows + 1
			}
			s := fakeSession(t, &writeConnector{catalogCount: count, autocommit: 1})
			var result Result
			var err error
			switch kind {
			case "databases":
				result, err = s.Databases()
			case "query":
				result, err = s.Query("SHOW DATABASES")
			default:
				result, err = s.Tables("test")
			}
			if kind == "catalog overflow" {
				if err == nil || len(result.Rows) != 0 || !s.Connected() {
					t.Fatal("partial catalog exposed", len(result.Rows), err)
				}
			} else if kind == "query" {
				if err != nil || len(result.Rows) != MaxRows || !result.Truncated || result.SessionClosed || !s.Connected() {
					t.Fatal("query budget changed", len(result.Rows), err)
				}
			} else if err != nil || len(result.Rows) != 509 || result.Truncated || !s.Connected() || s.TransactionStatus() != "idle" {
				t.Fatal("509-entry catalog closed session", len(result.Rows), err, s.TransactionStatus())
			}
		})
	}
}
