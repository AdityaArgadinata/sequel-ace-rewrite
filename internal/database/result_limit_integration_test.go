package database

import (
	"fmt"
	"os"
	"reflect"
	"strconv"
	"testing"
	"time"
)

func TestLimitedResultPreservesPinnedSessionIntegration(t *testing.T) {
	text := os.Getenv("SEQUEL_TEST_PORT")
	if text == "" {
		t.Skip("disposable server not configured")
	}
	port, err := strconv.Atoi(text)
	if err != nil {
		t.Fatal(err)
	}
	c := Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD")}
	var s Session
	if err = s.Connect(c); err != nil {
		t.Fatal(err)
	}
	defer s.Shutdown()
	run := func(q string) Result {
		t.Helper()
		r, e := s.Query(q)
		if e != nil {
			t.Fatal(q, e)
		}
		return r
	}
	name := fmt.Sprintf("sequel_rewrite_test_limit_%d", time.Now().UnixNano())
	run("CREATE DATABASE " + quoteIdentifier(name))
	defer func() {
		if !s.Connected() {
			if e := s.Connect(c); e != nil {
				t.Error(e)
				return
			}
		}
		_ = s.Transaction("rollback")
		if _, e := s.Query("DROP DATABASE " + quoteIdentifier(name)); e != nil {
			t.Error(e)
		}
	}()
	if err = s.UseDatabase(name); err != nil {
		t.Fatal(err)
	}
	run("CREATE TABLE many_rows(n INT)")
	run("INSERT INTO many_rows VALUES (1)")
	for i := 0; i < 9; i++ {
		run(fmt.Sprintf("INSERT INTO many_rows SELECT n+%d FROM many_rows", 1<<i))
	}
	run("CREATE TABLE sample(id INT PRIMARY KEY,value INT) ENGINE=InnoDB")
	run("INSERT INTO sample VALUES(1,5)")
	run("SET @sequel_limit_marker='preserved'")
	run("CREATE TEMPORARY TABLE limit_temp(n INT)")
	run("INSERT INTO limit_temp VALUES(37)")
	before := run("SELECT CONNECTION_ID(),DATABASE(),@sequel_limit_marker,(SELECT n FROM limit_temp)").Rows
	if err = s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	if err = s.Transaction("begin"); err != nil {
		t.Fatal(err)
	}
	run("UPDATE sample SET value=99 WHERE id=1")
	var streamed [][]Cell
	out, err := s.Stream("SELECT n FROM many_rows ORDER BY n", func(b Batch) { streamed = append(streamed, b.Rows...) })
	if err != nil || !out.Truncated || out.SessionClosed || len(out.Rows) != MaxRows || !reflect.DeepEqual(streamed, out.Rows) || s.TransactionStatus() != "active" {
		t.Fatal(out.Truncated, out.SessionClosed, len(out.Rows), err, s.TransactionStatus())
	}
	after := run("SELECT CONNECTION_ID(),DATABASE(),@sequel_limit_marker,(SELECT n FROM limit_temp)").Rows
	if !reflect.DeepEqual(before, after) {
		t.Fatal("pinned session state changed", before, after)
	}
	out = run("SELECT REPEAT('x',5000000)")
	if !out.Truncated || out.SessionClosed || len(out.Rows) != 0 || s.TransactionStatus() != "active" {
		t.Fatal("byte cap lost transaction", out.SessionClosed, s.TransactionStatus())
	}
	if err = s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	if run("SELECT value FROM sample WHERE id=1").Rows[0][0].Value != "5" {
		t.Fatal("limit committed the transaction")
	}
	// An unbounded response must still abort instead of draining indefinitely.
	out = run("SELECT a.n FROM many_rows a CROSS JOIN many_rows b")
	if !out.Truncated || !out.SessionClosed || s.Connected() {
		t.Fatal("drain budget did not close unread response", out.Truncated, out.SessionClosed)
	}
}
