package database

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestInlineInsertDefaultsIntegration(t *testing.T) {
	portText := os.Getenv("SEQUEL_TEST_PORT")
	if portText == "" {
		t.Skip("disposable server not configured")
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		t.Fatal(err)
	}
	var session Session
	if err = session.Connect(Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD")}); err != nil {
		t.Fatal(err)
	}
	defer session.Shutdown()
	run := func(sql string) Result {
		t.Helper()
		r, e := session.Query(sql)
		if e != nil {
			t.Fatal(sql, e)
		}
		return r
	}
	name := fmt.Sprintf("sequel_rewrite_test_insert_defaults_%d", time.Now().UnixNano())
	run("CREATE DATABASE " + quoteIdentifier(name) + " CHARACTER SET utf8mb4")
	defer run("DROP DATABASE " + quoteIdentifier(name))
	target := qualified(name, "items")
	run("CREATE TABLE " + target + " (id INT AUTO_INCREMENT PRIMARY KEY, required_id INT NOT NULL, par_id INT NOT NULL DEFAULT 0, title VARCHAR(60) NOT NULL DEFAULT " + adminString("quote' \\ é😀", "") + ", empty_text VARCHAR(20) NOT NULL DEFAULT '', optional_text TEXT NULL, created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, computed INT GENERATED ALWAYS AS (required_id*2) STORED) ENGINE=InnoDB")
	if err = session.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	details, err := session.TableDetails(name, "items")
	if err != nil || !details.Editable {
		t.Fatal(details, err)
	}
	cols := map[string]EditableColumn{}
	for _, c := range details.Columns {
		cols[c.Name] = c
	}
	if cols["id"].DefaultValue != nil || cols["required_id"].DefaultValue != nil || cols["computed"].DefaultValue != nil {
		t.Fatal(cols)
	}
	for field, value := range map[string]string{"par_id": "0", "empty_text": ""} {
		c := cols[field]
		if c.DefaultValue == nil || c.DefaultValue.Value != value || c.DefaultValue.Null {
			t.Fatalf("%s default=%+v wanted=%q", field, c.DefaultValue, value)
		}
	}
	if c := cols["title"]; c.DefaultValue == nil || !strings.HasPrefix(c.DefaultValue.Value, "quote' \\ é") {
		t.Fatalf("quoted default lost: %+v; definition: %+v", c, run("SHOW CREATE TABLE "+target))
	}
	if cols["created"].DefaultExpression == "" {
		t.Fatal("timestamp expression was treated as a literal", cols["created"])
	}
	bad := Mutation{Database: name, Table: "items", Action: "insert", Values: map[string]Cell{"required_id": {Null: true}}}
	if _, err = session.Mutate(bad); err == nil {
		t.Fatal("required NULL accepted")
	}
	if !session.Connected() {
		t.Fatal("validation failure closed session")
	}
	good := bad
	good.Values = map[string]Cell{"required_id": {Value: "21"}}
	if n, err := session.Mutate(good); err != nil || n != 1 {
		t.Fatal(n, err)
	}
	row := run("SELECT id,required_id,par_id,title,empty_text,optional_text,created,computed FROM " + target).Rows[0]
	if row[0].Value != "1" || row[2].Value != "0" || row[3].Value != "quote' \\ é😀" || row[4].Value != "" || !row[5].Null || row[6].Null || strings.Contains(row[6].Value, "CURRENT_TIMESTAMP") || row[7].Value != "42" {
		t.Fatal(row)
	}
}
