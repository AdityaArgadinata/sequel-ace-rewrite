package database

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestAdvancedPrivilegesIntegration(t *testing.T) {
	text := os.Getenv("SEQUEL_TEST_PORT")
	if text == "" {
		t.Skip("disposable server not configured")
	}
	port, err := strconv.Atoi(text)
	if err != nil {
		t.Fatal(err)
	}
	config := Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD")}
	var s, other Session
	for _, session := range []*Session{&s, &other} {
		if err := session.Connect(config); err != nil {
			t.Fatal(err)
		}
		defer session.Shutdown()
	}
	run := func(q string) Result {
		t.Helper()
		r, err := other.Query(q)
		if err != nil {
			t.Fatal(q, err)
		}
		return r
	}
	id := time.Now().UnixNano()
	db := fmt.Sprintf("sa_priv_%d", id)
	otherDB := strings.ReplaceAll(db, "_", "x")
	user := fmt.Sprintf("sa_priv_%d", id)
	renamed := user + "r"
	host := run("SELECT SUBSTRING_INDEX(USER(),'@',-1)").Rows[0][0].Value
	run("CREATE DATABASE " + quoteIdentifier(db))
	run("CREATE DATABASE " + quoteIdentifier(otherDB))
	defer run("DROP DATABASE IF EXISTS " + quoteIdentifier(db))
	defer run("DROP DATABASE IF EXISTS " + quoteIdentifier(otherDB))
	defer run("DROP USER IF EXISTS " + adminString(user, "") + "@" + adminString(host, ""))
	defer run("DROP USER IF EXISTS " + adminString(renamed, "") + "@" + adminString(host, ""))
	run("CREATE TABLE " + qualified(db, "t") + "(id INT,value INT)")
	run("INSERT INTO " + qualified(db, "t") + " VALUES(1,2)")
	run("CREATE TABLE " + qualified(otherDB, "t") + "(id INT)")
	run("CREATE PROCEDURE " + qualified(db, "p") + "() SELECT 1")
	request := SAAdminRequest{Kind: "user", Action: "create", User: user, Host: host, Password: "test-only-password", Database: db, Table: "t", Privileges: []string{"SELECT"}}
	apply := func(r SAAdminRequest) {
		t.Helper()
		plan, err := s.PrepareAdmin(r)
		if err != nil {
			t.Fatal(r.Action, err)
		}
		if _, err := s.ApplyAdmin(plan.Token); err != nil {
			t.Fatal(r.Action, plan.SQL, err)
		}
	}
	apply(request)
	request.Action = "grant"
	request.Scope = "column"
	request.Columns = []string{"id"}
	apply(request)
	login := func() *Session {
		t.Helper()
		var x Session
		if err := x.Connect(Connection{Host: "127.0.0.1", Port: port, User: user, Password: request.Password}); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(x.Shutdown)
		return &x
	}
	reader := login()
	if _, err := reader.Query("SELECT id FROM " + qualified(db, "t")); err != nil {
		t.Fatal(err)
	}
	if _, err := reader.Query("SELECT value FROM " + qualified(db, "t")); err == nil {
		t.Fatal("column grant leaked another column")
	}
	reader.Shutdown()
	request.Action = "revoke"
	apply(request)
	request.Action = "grant"
	request.Scope = "procedure"
	request.Table = "p"
	request.Privileges = []string{"EXECUTE"}
	apply(request)
	request.Action = "grant"
	request.Scope = "database"
	request.Table = ""
	request.Privileges = []string{"SELECT"}
	request.GrantOption = true
	apply(request)
	reader = login()
	if _, err := reader.Query("SELECT * FROM " + qualified(db, "t")); err != nil {
		t.Fatal(err)
	}
	if _, err := reader.Query("SELECT * FROM " + qualified(otherDB, "t")); err == nil {
		t.Fatal("database wildcard escaped scope")
	}
	reader.Shutdown()
	request.Action = "revokeGrantOption"
	apply(request)
	request.Action = "grant"
	request.Scope = "global"
	request.Privileges = []string{"PROCESS"}
	request.GrantOption = false
	apply(request)
	request.Action = "revoke"
	apply(request)
	request.Action = "lock"
	apply(request)
	var blocked Session
	if err := blocked.Connect(Connection{Host: "127.0.0.1", Port: port, User: user, Password: request.Password}); err == nil {
		blocked.Shutdown()
		t.Fatal("locked account could log in")
	}
	request.Action = "unlock"
	apply(request)
	login().Shutdown()
	request.Action = "grant"
	request.Scope = "table"
	request.Table = "t"
	request.Privileges = []string{"UPDATE"}
	plan, err := s.PrepareAdmin(request)
	if err != nil {
		t.Fatal(err)
	}
	run("ALTER USER " + adminString(user, "") + "@" + adminString(host, "") + " ACCOUNT LOCK")
	if _, err := s.ApplyAdmin(plan.Token); err == nil {
		t.Fatal("stale account-lock metadata accepted")
	}
	request.Action = "unlock"
	apply(request)
	request.Action = "rename"
	request.NewUser = renamed
	request.NewHost = host
	apply(request)
	if grants, err := s.Panel("grants", "", "", renamed, host); err != nil || len(grants.Rows) == 0 {
		t.Fatal(grants, err)
	}
}
