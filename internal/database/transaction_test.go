package database

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/go-sql-driver/mysql"
)

// A connector fake exercises database/sql error paths without network access.
type writeConnector struct {
	execs         []string
	affected      int64
	execErr       error
	autocommit    int64
	failWriteOnly bool
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
	case strings.Contains(q, "@@session.autocommit"):
		return &writeRows{[]string{"autocommit"}, [][]driver.Value{{c.c.autocommit}}}, nil
	case strings.Contains(q, "information_schema.TABLES"):
		return &writeRows{[]string{"engine", "kind"}, [][]driver.Value{{"InnoDB", "BASE TABLE"}}}, nil
	case strings.Contains(q, "information_schema.COLUMNS"):
		return &writeRows{[]string{"name", "type", "key", "extra", "nullable"}, [][]driver.Value{{"id", "int", "PRI", "", "NO"}, {"text", "varchar(20)", "", "", "YES"}}}, nil
	default:
		return &writeRows{[]string{"value"}, [][]driver.Value{{"1"}}}, nil
	}
}
func fakeSession(t *testing.T, c *writeConnector) *Session {
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
