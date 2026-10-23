package database

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestSchemaEditingIntegration(t *testing.T) {
	text := os.Getenv("SEQUEL_TEST_PORT")
	if text == "" {
		t.Skip("disposable database not configured")
	}
	port, err := strconv.Atoi(text)
	if err != nil {
		t.Fatal(err)
	}
	connection := Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD")}
	var s, other Session
	for _, session := range []*Session{&s, &other} {
		if err := session.Connect(connection); err != nil {
			t.Fatal(err)
		}
		defer session.Shutdown()
	}
	run := func(session *Session, sql string) Result {
		t.Helper()
		r, err := session.Query(sql)
		if err != nil {
			t.Fatal(sql, err)
		}
		return r
	}
	db := fmt.Sprintf("sequel_rewrite_test_schema_%d", time.Now().UnixNano())
	target := quoteIdentifier(db) + ".`child``table`"
	run(&other, "CREATE DATABASE "+quoteIdentifier(db)+" CHARACTER SET utf8mb4")
	defer run(&other, "DROP DATABASE "+quoteIdentifier(db))
	run(&other, "CREATE TABLE "+quoteIdentifier(db)+".parent(id INT PRIMARY KEY) ENGINE=InnoDB")
	run(&other, "CREATE TABLE "+target+" (id INT NOT NULL, parent_id INT NULL, code VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT 'it''s; a,b' COMMENT 'keep all') ENGINE=InnoDB")
	change := func(action, kind, name, original, definition, indexKind string) SASchemaChange {
		return SASchemaChange{Database: db, Table: "child`table", Action: action, Kind: kind, Name: name, Original: original, Definition: definition, IndexKind: indexKind}
	}
	apply := func(r SASchemaChange) string {
		t.Helper()
		plan, err := s.PrepareSchemaChange(r)
		if err != nil {
			t.Fatal(r, err)
		}
		warning, err := s.ApplySchemaChange(plan.Token)
		if err != nil {
			t.Fatal(plan, err)
		}
		if _, err := s.ApplySchemaChange(plan.Token); err == nil {
			t.Fatal("DDL replay accepted")
		}
		if s.TransactionStatus() != "idle" {
			t.Fatal(s.TransactionStatus())
		}
		return warning
	}
	snapshot := func() Structure {
		t.Helper()
		out, err := s.Structure(db, "child`table")
		if err != nil || !out.Editable {
			t.Fatal(out, err)
		}
		return out
	}
	apply(change("add", "column", "state", "", "ENUM('é,😀','semi;') NULL DEFAULT 'semi;' COMMENT 'x,y'", ""))
	apply(change("edit", "column", "status", "state", "ENUM('é,😀','semi;') NOT NULL DEFAULT 'semi;' COMMENT 'changed' AFTER `id`", ""))
	apply(change("drop", "column", "", "status", "", ""))
	apply(change("add", "column", "computed", "", "INT GENERATED ALWAYS AS ((`id` + 1)) STORED", ""))
	apply(change("edit", "column", "computed", "computed", "INT GENERATED ALWAYS AS ((`id` + 2)) STORED", ""))
	apply(change("drop", "column", "", "computed", "", ""))
	before := snapshot()
	var original string
	for _, object := range before.Objects {
		if object.Kind == "column" && object.Name == "code" {
			original = object.Definition
		}
	}
	if original == "" {
		t.Fatal(before)
	}
	apply(change("edit", "column", "label", "code", original, ""))
	after := snapshot()
	found := false
	for _, object := range after.Objects {
		if object.Kind == "column" && object.Name == "label" {
			found = true
			if object.Definition != original {
				t.Fatal("attributes lost", original, object.Definition)
			}
		}
	}
	if !found {
		t.Fatal(after)
	}

	// Inline dropdowns edit the server definition, retaining defaults and comments.
	attributeChange := change("edit", "column", "label", "label", "ignored client definition", "")
	attributeChange.ColumnEdits = map[string]string{"length": "80", "encoding": "latin1", "collation": "latin1_bin"}
	apply(attributeChange)
	catalog := snapshot()
	if len(catalog.Charsets.Rows) == 0 || len(catalog.Collations.Rows) < 10 {
		t.Fatal("missing server dropdown options")
	}
	for _, object := range catalog.Objects {
		if object.Kind == "column" && object.Name == "label" {
			upper := strings.ToUpper(object.Definition)
			for _, part := range []string{"VARCHAR(80)", "CHARACTER SET LATIN1", "COLLATE LATIN1_BIN", "COMMENT 'KEEP ALL'"} {
				if !strings.Contains(upper, part) {
					t.Fatal("inline edit lost attributes", object.Definition)
				}
			}
			if !strings.Contains(object.Definition, "a,b") {
				t.Fatal("inline edit lost default", object.Definition)
			}
		}
	}
	apply(change("add", "column", "plain", "", "VARCHAR(12) NULL DEFAULT 'keep'", ""))
	inherited := change("edit", "column", "plain", "plain", "", "")
	inherited.ColumnEdits = map[string]string{"encoding": "latin1", "collation": "latin1_bin", "comment": "quotes' and \\ slash"}
	apply(inherited)
	apply(change("drop", "column", "", "plain", "", ""))
	apply(change("add", "column", "derived", "", "INT GENERATED ALWAYS AS ((`id` + 3)) STORED COMMENT 'preserve expression'", ""))
	generatedChange := change("edit", "column", "derived", "derived", "", "")
	generatedChange.ColumnEdits = map[string]string{"type": "BIGINT"}
	apply(generatedChange)
	for _, object := range snapshot().Objects {
		if object.Name == "derived" && (!strings.Contains(object.Definition, "STORED") || !strings.Contains(object.Definition, "`id`") || !strings.Contains(object.Definition, "preserve expression")) {
			t.Fatal("generated expression lost", object)
		}
	}
	apply(change("drop", "column", "", "derived", "", ""))
	apply(change("add", "index", "PRIMARY", "", "(`id`)", "PRIMARY"))
	apply(change("edit", "index", "PRIMARY", "PRIMARY", "(`id`, `parent_id`)", "PRIMARY"))
	apply(change("drop", "index", "", "PRIMARY", "", ""))
	apply(change("edit", "column", "parent_id", "parent_id", "INT NULL", ""))
	apply(change("add", "index", "label_key", "", "(`label`(10), `id`) USING BTREE COMMENT 'prefix'", "INDEX"))
	apply(change("edit", "index", "label_unique", "label_key", "(`label`, `id`) USING BTREE COMMENT 'unique'", "UNIQUE"))
	apply(change("drop", "index", "", "label_unique", "", ""))
	apply(change("add", "foreignKey", "parent_fk", "", "(`parent_id`) REFERENCES "+quoteIdentifier(db)+".`parent` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE", ""))
	apply(change("edit", "foreignKey", "parent_fk_updated", "parent_fk", "(`parent_id`) REFERENCES "+quoteIdentifier(db)+".`parent` (`id`) ON DELETE SET NULL ON UPDATE CASCADE", ""))
	fk := snapshot().ForeignKeys
	if len(fk.Rows) != 1 || fk.Rows[0][7].Value != "SET NULL" {
		t.Fatal(fk)
	}
	apply(change("edit", "foreignKey", "renamed_fk", "parent_fk_updated", "(`parent_id`) REFERENCES "+quoteIdentifier(db)+".`parent` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT", ""))
	apply(change("drop", "foreignKey", "", "renamed_fk", "", ""))
	if len(snapshot().ForeignKeys.Rows) != 0 {
		t.Fatal("FK was not removed")
	}
	run(&other, "ALTER TABLE "+quoteIdentifier(db)+".parent ADD COLUMN scope INT NOT NULL DEFAULT 0, DROP PRIMARY KEY, ADD PRIMARY KEY(id,scope)")
	apply(change("add", "column", "scope", "", "INT NOT NULL DEFAULT 0", ""))
	apply(change("add", "foreignKey", "composite_fk", "", "(`parent_id`, `scope`) REFERENCES "+quoteIdentifier(db)+".`parent` (`id`, `scope`) ON DELETE RESTRICT ON UPDATE CASCADE", ""))
	if len(snapshot().ForeignKeys.Rows) != 2 {
		t.Fatal("composite FK metadata incomplete")
	}
	apply(change("edit", "foreignKey", "composite_fk_updated", "composite_fk", "(`parent_id`, `scope`) REFERENCES "+quoteIdentifier(db)+".`parent` (`id`, `scope`) ON DELETE RESTRICT ON UPDATE RESTRICT", ""))
	apply(change("drop", "foreignKey", "", "composite_fk_updated", "", ""))
	apply(change("add", "index", "fulltext_label", "", "(`label`)", "FULLTEXT"))
	apply(change("drop", "index", "", "fulltext_label", "", ""))
	apply(change("add", "column", "location", "", "POINT NOT NULL", ""))
	apply(change("add", "index", "spatial_location", "", "(`location`)", "SPATIAL"))
	apply(change("drop", "index", "", "spatial_location", "", ""))
	apply(change("drop", "column", "", "location", "", ""))
	// An ordinary INSERT changes SHOW CREATE's next AUTO_INCREMENT value,
	// without changing the reviewed schema.
	autoTarget := quoteIdentifier(db) + ".auto_table"
	run(&other, "CREATE TABLE "+autoTarget+" (id INT AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB")
	autoRequest := change("add", "column", "note", "", "VARCHAR(10) NULL", "")
	autoRequest.Table = "auto_table"
	autoPlan, err := s.PrepareSchemaChange(autoRequest)
	if err != nil {
		t.Fatal(err)
	}
	run(&other, "INSERT INTO "+autoTarget+" VALUES(NULL)")
	if _, err := s.ApplySchemaChange(autoPlan.Token); err != nil {
		t.Fatal("data write invalidated preview", err)
	}
	// A concurrent schema change invalidates the reviewed plan.
	request := change("add", "column", "fresh", "", "INT NULL", "")
	plan, err := s.PrepareSchemaChange(request)
	if err != nil {
		t.Fatal(err)
	}
	run(&other, "ALTER TABLE "+target+" ADD COLUMN changed_elsewhere INT")
	if _, err := s.ApplySchemaChange(plan.Token); err == nil || !strings.Contains(err.Error(), "schema changed") {
		t.Fatal(err)
	}
	if _, err := s.ApplySchemaChange(plan.Token); err == nil {
		t.Fatal("stale token replayed")
	}
	// Preview and apply both guard transactions; neither commits on the user's behalf.
	if err := s.Transaction("begin"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.PrepareSchemaChange(request); err == nil {
		t.Fatal("preview accepted active transaction")
	}
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	plan, err = s.PrepareSchemaChange(request)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Transaction("begin"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApplySchemaChange(plan.Token); err == nil || s.TransactionStatus() != "active" {
		t.Fatal(err)
	}
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	run(&s, "SELECT 1")
	if _, err := s.PrepareSchemaChange(request); err == nil {
		t.Fatal("unverified transaction accepted")
	}
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	// SQL errors preserve the session, but the reviewed token remains consumed.
	bad := change("add", "column", "invalid_type", "", "THIS_TYPE_DOES_NOT_EXIST", "")
	plan, err = s.PrepareSchemaChange(bad)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApplySchemaChange(plan.Token); err == nil || !s.Connected() {
		t.Fatal(err)
	}
	if _, err := s.ApplySchemaChange(plan.Token); err == nil {
		t.Fatal("failed DDL replayed")
	}
	apply(request)
	// Engine warnings are not reported as a clean, warning-free save.
	run(&other, "INSERT INTO "+target+"(id,parent_id,label) VALUES(1,NULL,'long value')")
	run(&s, "SET SESSION sql_mode=''")
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	warning := apply(change("edit", "column", "label", "label", "VARCHAR(1) NULL", ""))
	if warning == "" {
		t.Fatal("truncation warning discarded")
	}
	run(&other, "CREATE VIEW "+quoteIdentifier(db)+".a_view AS SELECT id FROM "+target)
	view := request
	view.Table = "a_view"
	if _, err := s.PrepareSchemaChange(view); err == nil {
		t.Fatal("view schema write accepted")
	}
	run(&s, "SET autocommit=0")
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.PrepareSchemaChange(change("add", "column", "blocked", "", "INT", "")); err == nil {
		t.Fatal("autocommit off accepted")
	}
	run(&s, "SET autocommit=1")
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	run(&s, "SET SESSION sql_mode='ANSI_QUOTES,NO_BACKSLASH_ESCAPES'")
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	ansi := snapshot()
	if len(ansi.Objects) < 4 {
		t.Fatal("ANSI objects lost", ansi)
	}
	apply(change("add", "column", "ansi_text", "", "VARCHAR(20) DEFAULT 'a\\'", ""))
	apply(change("drop", "column", "", "ansi_text", "", ""))
	run(&s, "SET sql_quote_show_create=0")
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.PrepareSchemaChange(change("add", "column", "blocked", "", "INT", "")); err == nil {
		t.Fatal("unquoted metadata accepted")
	}
}
