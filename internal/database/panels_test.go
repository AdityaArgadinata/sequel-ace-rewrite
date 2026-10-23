package database

import (
	"bytes"
	"fmt"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestAdminSQLAndPrintEscaping(t *testing.T) {
	for _, mode := range []string{"", "NO_BACKSLASH_ESCAPES", "ANSI_QUOTES"} {
		query, preview, err := adminSQL(SAAdminRequest{Kind: "user", Action: "create", User: "a'\\b", Host: "localhost", Password: "secret'\\value"}, mode)
		if err != nil || strings.Contains(preview, "secret") || !strings.Contains(query, "IDENTIFIED BY") {
			t.Fatal(query, preview, err)
		}
		_, _, err = adminSQL(SAAdminRequest{Kind: "trigger", Action: "create", Database: "db", Table: "t", Name: "tr", Timing: "BEFORE", Event: "INSERT", Body: "BEGIN SET NEW.x = 1; SET NEW.y = 2; END"}, mode)
		if err != nil {
			t.Fatal(err)
		}
	}
	for _, r := range []SAAdminRequest{{Kind: "user", Action: "grant", User: "u", Host: "h", Database: "d", Privileges: []string{"ALL; DROP USER x"}}, {Kind: "trigger", Action: "create", Database: "db", Table: "t", Name: "tr", Timing: "WRONG", Event: "INSERT", Body: "SET NEW.x=1"}, {Kind: "info", Action: "edit", Database: "d", Table: "t", Comment: "\x00"}} {
		if _, _, err := adminSQL(r, ""); err == nil {
			t.Fatal("invalid request accepted", r)
		}
	}
	var out bytes.Buffer
	err := WritePrintView(&out, Result{Columns: []Column{{Name: "<script>"}}, Rows: [][]Cell{{{Value: "</td><img src=x onerror=alert(1)>"}}}, Truncated: true})
	if err != nil || strings.Contains(out.String(), "<img") || !strings.Contains(out.String(), "incomplete") {
		t.Fatal(out.String(), err)
	}
	if WritePrintView(&out, Result{Columns: []Column{{Name: "x"}}, Rows: [][]Cell{{}}}) == nil {
		t.Fatal("bad row accepted")
	}
}
func TestPriority5Integration(t *testing.T) {
	portText := os.Getenv("SEQUEL_TEST_PORT")
	if portText == "" {
		t.Skip("disposable server not configured")
	}
	port, _ := strconv.Atoi(portText)
	config := Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD"), TimeZone: "+07:00"}
	var s, other Session
	for _, session := range []*Session{&s, &other} {
		if err := session.Connect(config); err != nil {
			t.Fatal(err)
		}
		defer session.Shutdown()
	}
	db := fmt.Sprintf("sequel_rewrite_test_panels_%d", time.Now().UnixNano())
	user := fmt.Sprintf("sa_p5_%d", time.Now().UnixNano())
	run := func(q string) Result {
		t.Helper()
		r, err := other.Query(q)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	// Container servers see the bridge address, not the client's loopback address.
	accountHost := run("SELECT SUBSTRING_INDEX(USER(), '@', -1)").Rows[0][0].Value
	run("CREATE DATABASE " + quoteIdentifier(db))
	defer run("DROP DATABASE " + quoteIdentifier(db))
	defer run("DROP USER IF EXISTS " + adminString(user, "") + "@" + adminString(accountHost, ""))
	run("CREATE TABLE " + qualified(db, "t") + " (id INT PRIMARY KEY, value INT)")
	apply := func(r SAAdminRequest) {
		t.Helper()
		p, err := s.PrepareAdmin(r)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = s.ApplyAdmin(p.Token); err != nil {
			t.Fatal(err)
		}
		if _, err = s.ApplyAdmin(p.Token); err == nil {
			t.Fatal("replayed token")
		}
	}
	trigger := SAAdminRequest{Kind: "trigger", Action: "create", Database: db, Table: "t", Name: "tr", Timing: "BEFORE", Event: "INSERT", Body: "BEGIN SET NEW.value = NEW.value+1; END"}
	apply(trigger)
	r, err := s.Panel("triggers", db, "t", "", "")
	if err != nil || len(r.Rows) != 1 {
		t.Fatal(r, err)
	}
	run("INSERT INTO " + qualified(db, "t") + " VALUES(1,5)")
	if run("SELECT value FROM " + qualified(db, "t")).Rows[0][0].Value != "6" {
		t.Fatal("trigger not applied")
	}
	wrong := trigger
	wrong.Action = "drop"
	wrong.Table = "other_table"
	if _, err := s.PrepareAdmin(wrong); err == nil {
		t.Fatal("trigger drop accepted a different table")
	}
	trigger.Action = "drop"
	p, err := s.PrepareAdmin(trigger)
	if err != nil {
		t.Fatal(err)
	}
	run("ALTER TABLE " + qualified(db, "t") + " COMMENT='concurrent'")
	if _, err = s.ApplyAdmin(p.Token); err == nil {
		t.Fatal("stale plan accepted")
	}
	apply(trigger)
	apply(SAAdminRequest{Kind: "info", Action: "edit", Database: db, Table: "t", Engine: "InnoDB", Collation: "utf8mb4_unicode_ci", Comment: "quote ' and \\ preserved"})
	r, err = s.Panel("info", db, "t", "", "")
	if err != nil || len(r.Rows) != 1 {
		t.Fatal(r, err)
	}
	account := SAAdminRequest{Kind: "user", Action: "create", User: user, Host: accountHost, Password: "p'a\\ss"}
	apply(account)
	account.Action = "grant"
	account.Database = db
	account.Privileges = []string{"SELECT", "INSERT"}
	apply(account)
	r, err = s.Panel("grants", "", "", user, accountHost)
	if err != nil || len(r.Rows) == 0 {
		t.Fatal(r, err)
	}
	var login Session
	if err := login.Connect(Connection{Host: "127.0.0.1", Port: port, User: user, Password: account.Password}); err != nil {
		t.Fatal(err)
	}
	login.Shutdown()
	account.Action = "revoke"
	account.Privileges = []string{"INSERT"}
	apply(account)
	account.Action = "password"
	account.Password = "new-secret"
	apply(account)
	account.Action = "drop"
	apply(account)
	r, err = s.execute("SELECT @@session.time_zone", nil, nil, true)
	if err != nil || r.Rows[0][0].Value != "+07:00" {
		t.Fatal(r, err)
	}
	if err = s.Transaction("begin"); err != nil {
		t.Fatal(err)
	}
	if _, err = s.PrepareAdmin(trigger); err == nil {
		t.Fatal("transaction allowed DDL")
	}
	if err = s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	if len(s.Activity(false)) == 0 {
		t.Fatal("console empty")
	}
	if len(s.Activity(true)) != 0 {
		t.Fatal("console not cleared")
	}
	if path := os.Getenv("SEQUEL_TEST_SOCKET"); path != "" {
		var socket Session
		config.Socket = path
		if err = socket.Connect(config); err != nil {
			t.Fatal(err)
		}
		socket.Shutdown()
	}
}

func TestConsoleMetadataDoesNotContainSQLValues(t *testing.T) {
	var s Session
	for i := 0; i < 505; i++ {
		s.recordActivity(activityVerb("SELECT 'credential-value'"), time.Now(), true)
	}
	entries := s.Activity(false)
	if len(entries) != 500 {
		t.Fatal(len(entries))
	}
	for _, entry := range entries {
		if entry.Operation != "SQL SELECT" {
			t.Fatal(entry)
		}
	}
	for _, statement := range []string{"/* secret */ SELECT 1", "secret-value", ""} {
		if activityVerb(statement) != "SQL statement" {
			t.Fatal("unrecognized SQL exposed", statement)
		}
	}
}
