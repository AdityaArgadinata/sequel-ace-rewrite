package database

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestStructureIntegration(t *testing.T) {
	portText := os.Getenv("SEQUEL_TEST_PORT")
	if portText == "" {
		t.Skip("disposable database not configured")
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		t.Fatal(err)
	}
	c := Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD")}
	var s, cleanup Session
	for _, session := range []*Session{&s, &cleanup} {
		if err := session.Connect(c); err != nil {
			t.Fatal(err)
		}
		defer session.Shutdown()
	}
	run := func(session *Session, q string) Result {
		t.Helper()
		r, err := session.Query(q)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	name := fmt.Sprintf("sequel_rewrite_test_structure_%d", time.Now().UnixNano())
	run(&s, "CREATE DATABASE "+quoteIdentifier(name))
	defer run(&cleanup, "DROP DATABASE "+quoteIdentifier(name))
	parent := quoteIdentifier(name) + ".parent"
	child := quoteIdentifier(name) + "." + quoteIdentifier("child`table")
	run(&s, "CREATE TABLE "+parent+" (a INT,b INT,PRIMARY KEY(a,b)) ENGINE=InnoDB")
	run(&s, "CREATE TABLE "+child+" (id INT PRIMARY KEY,a INT,b INT,label VARCHAR(80) DEFAULT 'quoted value' COMMENT 'fixture comment',computed INT GENERATED ALWAYS AS (id+1) STORED, INDEX label_prefix(label(8)),CONSTRAINT fk_parts FOREIGN KEY(a,b) REFERENCES "+parent+"(a,b) ON UPDATE CASCADE ON DELETE RESTRICT) ENGINE=InnoDB")
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	if err := s.Transaction("begin"); err != nil {
		t.Fatal(err)
	}
	structure, err := s.Structure(name, "child`table")
	if err != nil {
		t.Fatal(err)
	}
	if s.TransactionStatus() != "active" {
		t.Fatal("catalog reads changed transaction state")
	}
	if len(structure.Columns.Rows) != 5 || len(structure.ForeignKeys.Rows) != 2 {
		t.Fatalf("incomplete catalog: %d columns, %d FK parts", len(structure.Columns.Rows), len(structure.ForeignKeys.Rows))
	}
	defaultValue := structure.Columns.Rows[3][3].Value
	if (defaultValue != "quoted value" && defaultValue != "'quoted value'") || structure.Columns.Rows[3][8].Value != "fixture comment" || structure.Columns.Rows[4][9].Value == "" {
		t.Fatal("column default/comment/generated expression lost")
	}
	primary, prefix := false, false
	for _, row := range structure.Indexes.Rows {
		if row[0].Value == "PRIMARY" && row[3].Value == "id" && row[1].Value == "0" {
			primary = true
		}
		if row[0].Value == "label_prefix" && row[5].Value == "8" {
			prefix = true
		}
	}
	if !primary || !prefix {
		t.Fatal("primary or prefix index missing")
	}
	for i, row := range structure.ForeignKeys.Rows {
		if row[1].Value != strconv.Itoa(i+1) || row[4].Value != "parent" || row[6].Value != "CASCADE" || row[7].Value != "RESTRICT" {
			t.Fatal("foreign-key order/rules lost", row)
		}
	}
	if !strings.Contains(structure.Definition.Rows[0][1].Value, "CREATE TABLE") {
		t.Fatal("definition missing")
	}
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Structure(name, "missing"); err == nil {
		t.Fatal("missing table reported as complete catalog")
	}
	if _, err := s.Structure(name, "child`table' OR 1=1 --"); err == nil {
		t.Fatal("catalog identifier accepted another table")
	}
	run(&s, "CREATE VIEW "+quoteIdentifier(name)+".a_view AS SELECT id,label FROM "+child)
	view, err := s.Structure(name, "a_view")
	if err != nil || len(view.Columns.Rows) != 2 || len(view.Indexes.Rows) != 0 || len(view.ForeignKeys.Rows) != 0 || !strings.Contains(view.Definition.Rows[0][1].Value, "VIEW") {
		t.Fatal("view structure", err)
	}
	cols := []string{"id INT PRIMARY KEY"}
	for i := 0; i < MaxRows; i++ {
		cols = append(cols, fmt.Sprintf("c%d INT", i))
	}
	run(&s, "CREATE TABLE "+quoteIdentifier(name)+".wide ("+strings.Join(cols, ",")+") ENGINE=InnoDB")
	if _, err := s.Structure(name, "wide"); err == nil || !s.Connected() {
		t.Fatal("truncated catalog reported complete or session lost")
	}
}

func TestStructureRejectsInvalidNames(t *testing.T) {
	var s Session
	for _, name := range []string{"", "bad\x00name"} {
		if _, err := s.Structure(name, "table"); err == nil {
			t.Fatal("invalid database accepted")
		}
		if _, err := s.Structure("db", name); err == nil {
			t.Fatal("invalid table accepted")
		}
	}
}
