package database

import (
	"context"
	"database/sql/driver"
	"errors"
	"io"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/go-sql-driver/mysql"
)

type limitedConnector struct {
	writeConnector
	count   int
	value   []byte
	blockAt int
	errAt   int
	entered chan struct{}
	read    int
}

func (c *limitedConnector) Connect(context.Context) (driver.Conn, error) {
	return &limitedConn{writeConn: &writeConn{&c.writeConnector}, owner: c}, nil
}

type limitedConn struct {
	*writeConn
	owner *limitedConnector
}

func (c *limitedConn) QueryContext(ctx context.Context, q string, args []driver.NamedValue) (driver.Rows, error) {
	if q == "SELECT limited" {
		return &limitedRows{ctx: ctx, c: c.owner}, nil
	}
	return c.writeConn.QueryContext(ctx, q, args)
}

type limitedRows struct {
	ctx context.Context
	c   *limitedConnector
	i   int
}

func (r *limitedRows) Columns() []string { return []string{"value"} }
func (r *limitedRows) Close() error      { return nil }
func (r *limitedRows) Next(dest []driver.Value) error {
	if r.c.blockAt > 0 && r.i == r.c.blockAt {
		if r.c.entered != nil {
			close(r.c.entered)
		}
		<-r.ctx.Done()
		return r.ctx.Err()
	}
	if r.c.errAt > 0 && r.i == r.c.errAt {
		return &mysql.MySQLError{Number: 1644, Message: "late server error"}
	}
	if r.i == r.c.count {
		return io.EOF
	}
	r.i++
	r.c.read++
	dest[0] = r.c.value
	return nil
}
func limitedFixture(t *testing.T, c *limitedConnector) *Session {
	t.Helper()
	c.autocommit = 1
	if c.value == nil {
		c.value = []byte("value")
	}
	return fakeSession(t, c)
}

func TestLimitedResultDrainBudgets(t *testing.T) {
	for _, tc := range []struct {
		name            string
		count, size     int
		partial, closed bool
	}{
		{"exact", MaxRows, 1, false, false},
		{"one extra", MaxRows + 1, 1, true, false},
		{"drain row boundary", MaxRows + maxDiscardRows, 1, true, false},
		{"drain row overflow", MaxRows + maxDiscardRows + 1, 1, true, true},
		{"display bytes", 1, MaxResultBytes + 1, true, false},
		{"discard bytes", 1, maxDiscardBytes + 1, true, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c := &limitedConnector{count: tc.count, value: []byte(strings.Repeat("x", tc.size))}
			s := limitedFixture(t, c)
			var streamed [][]Cell
			out, err := s.Stream("SELECT limited", func(b Batch) { streamed = append(streamed, b.Rows...) })
			if err != nil || out.Truncated != tc.partial || out.SessionClosed != tc.closed || s.Connected() == tc.closed {
				t.Fatal(out.Truncated, out.SessionClosed, s.Connected(), err)
			}
			if len(out.Rows) > MaxRows || c.read > MaxRows+maxDiscardRows+1 {
				t.Fatal("unbounded result", len(out.Rows), c.read)
			}
			if len(out.Rows) > 0 && !reflect.DeepEqual(streamed, out.Rows) {
				t.Fatal("stream/final mismatch")
			}
			if tc.partial && out.Notice == "" {
				t.Fatal("missing limit explanation")
			}
			if !tc.closed {
				if _, err = s.Query("SELECT 1"); err != nil {
					t.Fatal("connection unusable", err)
				}
			}
		})
	}
}
func TestLimitedResultLateErrorIsNotHidden(t *testing.T) {
	s := limitedFixture(t, &limitedConnector{count: MaxRows + 10, errAt: MaxRows + 1})
	if err := s.Transaction("begin"); err != nil {
		t.Fatal(err)
	}
	out, err := s.Query("SELECT limited")
	var server *mysql.MySQLError
	if !errors.As(err, &server) || len(out.Rows) != 0 || !s.Connected() || s.TransactionStatus() != "unverified" {
		t.Fatal(out, err, s.TransactionStatus())
	}
	if err = s.Transaction("commit"); err == nil {
		t.Fatal("uncertain transaction committed")
	}
	if err = s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
}
func TestLimitedResultDrainDeadline(t *testing.T) {
	s := limitedFixture(t, &limitedConnector{count: MaxRows + 10, blockAt: MaxRows + 1})
	start := time.Now()
	out, err := s.Query("SELECT limited")
	if err != nil || !out.Truncated || !out.SessionClosed || s.Connected() {
		t.Fatal(out.Truncated, out.SessionClosed, err)
	}
	if time.Since(start) > resultDrainTimeout+time.Second {
		t.Fatal("drain deadline did not interrupt read")
	}
}
func TestUserCancelDuringResultDrainRemainsAnError(t *testing.T) {
	entered := make(chan struct{})
	s := limitedFixture(t, &limitedConnector{count: MaxRows + 10, blockAt: MaxRows + 1, entered: entered})
	done := make(chan error, 1)
	go func() { _, err := s.Query("SELECT limited"); done <- err }()
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("drain never started")
	}
	s.Cancel()
	select {
	case err := <-done:
		if err == nil || s.Connected() {
			t.Fatal("cancel retained a session", err)
		}
	case <-time.After(time.Second):
		t.Fatal("cancel did not interrupt drain")
	}
}
