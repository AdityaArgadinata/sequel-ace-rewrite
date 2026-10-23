package database

import (
	"fmt"
	"os"
	"reflect"
	"strconv"
	"testing"
	"time"
)

// Only run against an explicitly supplied disposable test server. Every fixture
// lives in a uniquely named database; no existing schema is modified.
func TestIntegration(t *testing.T) {
	portText := os.Getenv("SEQUEL_TEST_PORT")
	if portText == "" {
		t.Skip("SEQUEL_TEST_PORT not set: integration server unavailable")
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		t.Fatal(err)
	}
	c := Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD")}
	bad := c
	bad.Password = "deliberately-wrong-fixture-password"
	var rejected Session
	if err := rejected.Connect(bad); err == nil {
		rejected.Shutdown()
		t.Fatal("wrong password accepted")
	}
	var s Session
	t.Cleanup(s.Shutdown)
	connect := func() {
		t.Helper()
		if err := s.Connect(c); err != nil {
			t.Fatal(err)
		}
	}
	query := func(sql string) Result {
		t.Helper()
		r, err := s.Query(sql)
		if err != nil {
			t.Fatalf("query failed: %v", err)
		}
		return r
	}
	connect()
	name := fmt.Sprintf("sequel_rewrite_test_%d", time.Now().UnixNano())
	query("CREATE DATABASE " + quoteIdentifier(name))
	t.Cleanup(func() {
		if !s.Connected() {
			connect()
		}
		query("DROP DATABASE " + quoteIdentifier(name))
	})
	if err := s.UseDatabase(name); err != nil {
		t.Fatal(err)
	}
	query("CREATE TABLE sample (id BIGINT UNSIGNED PRIMARY KEY, amount DECIMAL(30,10), value VARBINARY(8), day DATE)")
	query("INSERT INTO sample VALUES (18446744073709551615, 12345678901234567890.1234567890, X'00FF', '2026-10-21')")
	row := query("SELECT id, amount, value, day, NULL, '' FROM sample").Rows[0]
	if row[0].Value != "18446744073709551615" || row[1].Value != "12345678901234567890.1234567890" || row[2].Value != "0x00ff" || row[3].Value != "2026-10-21" || !row[4].Null || row[5].Null || row[5].Value != "" {
		t.Fatalf("lossy result: %#v", row)
	}
	query("SET @rewrite_session = 42")
	if query("SELECT @rewrite_session, DATABASE()").Rows[0][0].Value != "42" {
		t.Fatal("session was replaced")
	}
	if _, err := s.Query("SELECT * FROM table_that_does_not_exist"); err == nil || !s.Connected() {
		t.Fatal("SQL error should preserve the session")
	}
	if _, err := s.Query("SELECT 1; SELECT 2"); err == nil {
		t.Fatal("multiple statements accepted")
	}
	if tables, err := s.Tables(name); err != nil || len(tables.Rows) != 1 {
		t.Fatalf("tables: %#v %v", tables, err)
	}
	query("START TRANSACTION")
	query("DELETE FROM sample")
	query("ROLLBACK")
	if len(query("SELECT * FROM sample").Rows) != 1 {
		t.Fatal("rollback did not preserve data")
	}
	query("CREATE TEMPORARY TABLE session_temp (n INT)")
	query("INSERT INTO session_temp VALUES (7)")
	if query("SELECT n FROM session_temp").Rows[0][0].Value != "7" {
		t.Fatal("temporary table session lost")
	}
	query("CREATE TABLE many_rows (n INT)")
	query("INSERT INTO many_rows VALUES (1)")
	for i := 0; i < 9; i++ {
		query("INSERT INTO many_rows SELECT n FROM many_rows")
	}
	var streamed [][]Cell
	var batches int
	stream, err := s.Stream("SELECT n FROM many_rows LIMIT 128", func(batch Batch) {
		if batch.Offset != len(streamed) || len(batch.Rows) == 0 || len(batch.Rows) > 50 {
			t.Errorf("invalid stream batch: offset=%d rows=%d", batch.Offset, len(batch.Rows))
		}
		if len(batch.Columns) != 1 || batch.Columns[0].Name != "n" {
			t.Error("missing stream metadata")
		}
		if batches == 0 && len(batch.Rows) != 1 {
			t.Error("first row was not sent promptly")
		}
		if _, err := s.Query("SELECT 1"); err == nil {
			t.Error("stream callback must run before the query operation finishes")
		}
		streamed = append(streamed, batch.Rows...)
		batches++
	})
	if err != nil || batches < 2 || len(stream.Rows) != 128 || !reflect.DeepEqual(streamed, stream.Rows) || !s.Connected() {
		t.Fatalf("stream does not match final result: batches=%d rows=%d err=%v", batches, len(stream.Rows), err)
	}
	if _, err := s.Stream("SELECT n FROM many_rows", func(Batch) { s.Cancel() }); err == nil || s.Connected() {
		t.Fatal("cancel during streaming must fail and discard the session")
	}
	connect()
	if err := s.UseDatabase(name); err != nil {
		t.Fatal(err)
	}
	streamed = nil
	r, err := s.Stream("SELECT n FROM many_rows", func(batch Batch) { streamed = append(streamed, batch.Rows...) })
	if err != nil || !reflect.DeepEqual(streamed, r.Rows) {
		t.Fatalf("truncated stream differs from final result: %v", err)
	}
	if !r.Truncated || len(r.Rows) != MaxRows || s.Connected() {
		t.Fatalf("row limit did not discard session: %d, %v", len(r.Rows), r.Truncated)
	}
	connect()
	if err := s.UseDatabase(name); err != nil {
		t.Fatal(err)
	}
	query("CREATE PROCEDURE two_results() BEGIN SELECT 1; SELECT 2; END")
	r = query("CALL two_results()")
	if !r.Truncated || s.Connected() {
		t.Fatal("additional result set was not bounded")
	}
	connect()
	r, err = s.Stream("SELECT REPEAT('x', 5000000)", func(Batch) { t.Error("oversized row was emitted") })
	if err != nil {
		t.Fatal(err)
	}
	if !r.Truncated || len(r.Rows) != 0 || s.Connected() {
		t.Fatal("byte limit did not discard session")
	}
	connect()
	if err := s.UseDatabase(name); err != nil {
		t.Fatal(err)
	}
	// Observe the statement on a second connection before cancelling; avoid a
	// timing-only test that could cancel before the operation even starts.
	var observer Session
	if err := observer.Connect(c); err != nil {
		t.Fatal(err)
	}
	defer observer.Shutdown()
	done := make(chan error, 1)
	go func() { _, err := s.Query("SELECT /* sequel_rewrite_cancel */ SLEEP(20)"); done <- err }()
	deadline := time.Now().Add(5 * time.Second)
	seen := false
	for time.Now().Before(deadline) {
		r, err := observer.Query("SHOW FULL PROCESSLIST")
		if err != nil {
			t.Fatal(err)
		}
		for _, row := range r.Rows {
			if len(row) > 7 && row[7].Value == "SELECT /* sequel_rewrite_cancel */ SLEEP(20)" {
				seen = true
			}
		}
		if seen {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	s.Cancel()
	select {
	case err := <-done:
		if !seen || err == nil || s.Connected() {
			t.Fatalf("cancel did not invalidate running session: observed=%v err=%v", seen, err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("cancel did not finish promptly")
	}
}

func TestIntegrationTLS(t *testing.T) {
	path := os.Getenv("SEQUEL_TEST_CA_FILE")
	if path == "" {
		t.Skip("SEQUEL_TEST_CA_FILE not set: verified TLS fixture unavailable")
	}
	port, err := strconv.Atoi(os.Getenv("SEQUEL_TEST_PORT"))
	if err != nil {
		t.Fatal(err)
	}
	pem, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	c := Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD"), TLS: true}
	var s Session
	defer s.Shutdown()
	if err := s.Connect(c); err == nil {
		t.Fatal("untrusted test certificate accepted")
	}
	c.CAPEM = string(pem)
	if err := s.Connect(c); err != nil {
		t.Fatal(err)
	}
	r, err := s.Query("SHOW SESSION STATUS LIKE 'Ssl_cipher'")
	if err != nil || len(r.Rows) != 1 || r.Rows[0][1].Value == "" {
		t.Fatalf("TLS not negotiated: %#v %v", r, err)
	}
}

func TestCatalogWith509TablesKeepsSession(t *testing.T) {
	portText := os.Getenv("SEQUEL_TEST_PORT")
	if portText == "" {
		t.Skip("disposable database not configured")
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		t.Fatal(err)
	}
	var s Session
	if err := s.Connect(Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD")}); err != nil {
		t.Fatal(err)
	}
	defer s.Shutdown()
	name := fmt.Sprintf("sequel_rewrite_test_catalog_%d", time.Now().UnixNano())
	run := func(q string) Result {
		t.Helper()
		r, err := s.Query(q)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	run("CREATE DATABASE " + quoteIdentifier(name))
	defer func() {
		if !s.Connected() {
			if err := s.Connect(Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD")}); err != nil {
				t.Fatal(err)
			}
		}
		run("DROP DATABASE " + quoteIdentifier(name))
	}()
	for i := 0; i < 509; i++ {
		run(fmt.Sprintf("CREATE TABLE %s.`table_%03d` (id INT PRIMARY KEY) ENGINE=MyISAM", quoteIdentifier(name), i))
	}
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	if err := s.UseDatabase(name); err != nil {
		t.Fatal(err)
	}
	if err := s.Transaction("begin"); err != nil {
		t.Fatal(err)
	}
	list, err := s.Tables(name)
	if err != nil || list.Truncated || len(list.Rows) != 509 || !s.Connected() {
		t.Fatal("catalog closed session", len(list.Rows), err)
	}
	if s.TransactionStatus() != "active" {
		t.Fatal("catalog changed transaction state")
	}
	if list.Rows[508][0].Value != "table_508" {
		t.Fatal("last table missing", list.Rows[508])
	}
	info, err := s.WorkspaceInfo()
	if err != nil || info.Rows[0][1].Value != name {
		t.Fatal("active database/session lost", info, err)
	}
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Mutate(Mutation{Database: name, Table: "table_508", Action: "insert", Values: map[string]Cell{"id": {Value: "1"}}}); err != nil {
		t.Fatal(err)
	}
	result, err := s.Browse(BrowseRequest{Database: name, Table: "table_508", Limit: 50})
	if err != nil || len(result.Rows) != 1 || result.Rows[0][0].Value != "1" {
		t.Fatal("last table not usable", result, err)
	}
}
