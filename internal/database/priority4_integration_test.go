package database

import (
	"bytes"
	"encoding/hex"
	"fmt"
	"os"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestPriority4Integration(t *testing.T) {
	portText := os.Getenv("SEQUEL_TEST_PORT")
	if portText == "" {
		t.Skip("disposable database not configured")
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		t.Fatal(err)
	}
	c := Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD")}
	var s, other Session
	for _, session := range []*Session{&s, &other} {
		if err := session.Connect(c); err != nil {
			t.Fatal(err)
		}
		defer session.Shutdown()
	}
	root := fmt.Sprintf("sequel_rewrite_test_exchange_%d", time.Now().UnixNano())
	db := root
	copied := root + "_copy"
	moved := root + "_moved"
	run := func(sql string) Result {
		t.Helper()
		r, err := other.Query(sql)
		if err != nil {
			t.Fatal(sql, err)
		}
		return r
	}
	run("CREATE DATABASE " + quoteIdentifier(db) + " CHARACTER SET utf8mb4")
	defer func() {
		for _, name := range []string{db, copied, moved} {
			run("DROP DATABASE IF EXISTS " + quoteIdentifier(name))
		}
	}()
	apply := func(r SAObjectRequest) SABatchOutcome {
		t.Helper()
		plan, err := s.PrepareObjectChange(r)
		if err != nil {
			t.Fatal(r, err)
		}
		out := s.ApplyObjectChange(plan.Token)
		if out.Error != "" || out.Completed != len(plan.SQL) {
			t.Fatal(plan, out)
		}
		if again := s.ApplyObjectChange(plan.Token); again.Error == "" {
			t.Fatal("object plan replayed")
		}
		return out
	}
	request := func(action, table, name string) SAObjectRequest {
		return SAObjectRequest{Kind: "table", Action: action, Database: db, Table: table, Destination: db, Name: name, IncludeData: true}
	}
	r := request("create", "parent", "")
	r.Definition = "(id INT PRIMARY KEY) ENGINE=InnoDB"
	apply(r)
	run("INSERT INTO " + qualified(db, "parent") + " VALUES(1)")
	r = request("create", "child", "")
	r.Definition = "(id INT PRIMARY KEY, parent_id INT, txt TEXT, bytes BLOB, computed INT GENERATED ALWAYS AS (id+1) STORED, CONSTRAINT parent_fk FOREIGN KEY(parent_id) REFERENCES " + qualified(db, "parent") + "(id)) ENGINE=InnoDB"
	apply(r)
	run("INSERT INTO " + qualified(db, "child") + "(id,parent_id,txt,bytes) VALUES(1,1,'é;😀',X'00ff')")
	apply(request("copy", "child", "duplicate"))
	row := run("SELECT id,parent_id,txt,HEX(bytes),computed FROM " + qualified(db, "duplicate")).Rows[0]
	if row[2].Value != "é;😀" || row[3].Value != "00FF" || row[4].Value != "2" {
		t.Fatal(row)
	}
	apply(request("rename", "duplicate", "renamed"))
	apply(request("truncate", "renamed", ""))
	if run("SELECT COUNT(*) FROM " + qualified(db, "renamed")).Rows[0][0].Value != "0" {
		t.Fatal("truncate failed")
	}
	apply(request("drop", "renamed", ""))
	r = SAObjectRequest{Kind: "database", Action: "copy", Database: db, Name: copied, IncludeData: true}
	apply(r)
	schema, err := s.Structure(copied, "child")
	if err != nil || len(schema.ForeignKeys.Rows) != 1 || schema.ForeignKeys.Rows[0][3].Value != copied {
		t.Fatal(schema.ForeignKeys, err)
	}
	apply(SAObjectRequest{Kind: "database", Action: "rename", Database: copied, Name: moved})
	if run("SELECT COUNT(*) FROM " + qualified(moved, "child")).Rows[0][0].Value != "1" {
		t.Fatal("database move lost rows")
	}
	// A late FK failure leaves the acknowledged table/data steps visible.
	run("SET FOREIGN_KEY_CHECKS=0")
	run("INSERT INTO " + qualified(db, "child") + "(id,parent_id,txt) VALUES(2,999,'orphan')")
	run("SET FOREIGN_KEY_CHECKS=1")
	plan, err := s.PrepareObjectChange(request("copy", "child", "partial"))
	if err != nil {
		t.Fatal(err)
	}
	partial := s.ApplyObjectChange(plan.Token)
	if partial.Completed != 2 || partial.Total != 3 || partial.Error == "" {
		t.Fatal(partial)
	}
	if run("SELECT COUNT(*) FROM " + qualified(db, "partial")).Rows[0][0].Value != "2" {
		t.Fatal("partial result hidden")
	}
	apply(request("drop", "partial", ""))
	run("DELETE FROM " + qualified(db, "child") + " WHERE id=2")
	// Schema changes between preview/apply must not execute a stale plan.
	plan, err = s.PrepareObjectChange(request("truncate", "child", ""))
	if err != nil {
		t.Fatal(err)
	}
	run("ALTER TABLE " + qualified(db, "child") + " ADD COLUMN extra INT")
	if out := s.ApplyObjectChange(plan.Token); out.Completed != 0 || !strings.Contains(out.Error, "changed") {
		t.Fatal(out)
	}
	disappearing := request("create", "vanishing", "")
	disappearing.Definition = "(id INT)"
	apply(disappearing)
	vanishedPlan, err := s.PrepareObjectChange(request("drop", "vanishing", ""))
	if err != nil {
		t.Fatal(err)
	}
	run("DROP TABLE " + qualified(db, "vanishing"))
	vanished := s.ApplyObjectChange(vanishedPlan.Token)
	if vanished.Error == "" || vanished.Completed != 0 || !s.Connected() {
		t.Fatal("missing metadata discarded live session", vanished)
	}
	// Unsupported objects are rejected before creating a partial database.
	run("CREATE TRIGGER " + qualified(db, "mark") + " BEFORE INSERT ON " + qualified(db, "child") + " FOR EACH ROW SET NEW.extra=1")
	if _, err := s.PrepareObjectChange(request("copy", "child", "blocked")); err == nil {
		t.Fatal("trigger omitted silently")
	}
	run("DROP TRIGGER " + qualified(db, "mark"))
	run("CREATE VIEW " + qualified(db, "v") + " AS SELECT id FROM " + qualified(db, "child"))
	if _, err := s.PrepareObjectChange(SAObjectRequest{Kind: "database", Action: "copy", Database: db, Name: copied}); err == nil {
		t.Fatal("view omitted silently")
	}
	run("DROP VIEW " + qualified(db, "v"))
	// CSV maps omit generated/default columns and stop at the first duplicate PK.
	csvData := []byte("id,parent_id,txt,bytes\n2,1,\\N,\\B00ff\n2,1,duplicate,\\B\n3,1,must-not-run,\\B\n")
	preview, err := s.PreviewCSV(db, "child", "fixture.csv", csvData, ",", true)
	if err != nil {
		t.Fatal(err)
	}
	mapping := []SACSVMapping{{0, "id"}, {1, "parent_id"}, {2, "txt"}, {3, "bytes"}}
	csvPlan, err := s.PrepareCSVImport(preview.Token, mapping, "sequel-v1")
	if err != nil {
		t.Fatal(err)
	}
	lastProgress, totalProgress := -1, 0
	out := s.ApplyCSVImportProgress(csvPlan.Token, func(completed, total int) {
		if completed < lastProgress {
			t.Fatal("CSV progress moved backwards")
		}
		lastProgress, totalProgress = completed, total
	})
	if lastProgress != out.Completed || totalProgress != out.Total {
		t.Fatal("CSV final progress differs from outcome", lastProgress, totalProgress, out)
	}
	if out.Completed != 1 || !strings.Contains(out.Error, "record 2") {
		t.Fatal(out)
	}
	got := run("SELECT txt, HEX(bytes),computed FROM " + qualified(db, "child") + " WHERE id=2").Rows[0]
	if !got[0].Null || got[1].Value != "00FF" || got[2].Value != "3" {
		t.Fatal(got)
	}
	if out := s.ApplyCSVImport(csvPlan.Token); out.Error == "" {
		t.Fatal("CSV replayed")
	}
	preview, err = s.PreviewCSV(db, "child", "bad.csv", []byte("id,bytes\n4,\\B00\n5,\\Bwrong\n"), ",", true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.PrepareCSVImport(preview.Token, []SACSVMapping{{0, "id"}, {1, "bytes"}}, "sequel-v1"); err == nil {
		t.Fatal("bad later row accepted")
	}
	if run("SELECT COUNT(*) FROM " + qualified(db, "child") + " WHERE id=4").Rows[0][0].Value != "0" {
		t.Fatal("prepare wrote a CSV record")
	}
	run("CREATE TABLE " + qualified(db, "no_key") + "(value TEXT) ENGINE=InnoDB")
	preview, err = s.PreviewCSV(db, "no_key", "plain.csv", []byte("value\n\\N\n"), ",", true)
	if err != nil {
		t.Fatal(err)
	}
	csvPlan, err = s.PrepareCSVImport(preview.Token, []SACSVMapping{{0, "value"}}, "plain")
	if err != nil {
		t.Fatal(err)
	}
	if out := s.ApplyCSVImport(csvPlan.Token); out.Error != "" {
		t.Fatal(out)
	}
	if run("SELECT value FROM " + qualified(db, "no_key")).Rows[0][0].Value != `\N` {
		t.Fatal("plain CSV changed literal NULL marker")
	}
	for _, format := range []string{"csv", "sql", "xml"} {
		var b bytes.Buffer
		spec := SAExportSpec{Format: format, Scope: "filtered", Browse: BrowseRequest{Database: db, Table: "child", Limit: 50, Filters: []SAFilterRule{{Column: "id", Operator: "=", Value: "1"}}}}
		n, err := s.ExportData(&b, spec)
		if err != nil || n != 1 {
			t.Fatal(format, n, err)
		}
		if format == "sql" && strings.Contains(b.String(), "`computed`") {
			t.Fatal("generated column inserted", b.String())
		}
	}
	// A dump importer accepts more statements than the interactive editor.
	var script strings.Builder
	script.WriteString("CREATE TABLE " + qualified(db, "dump_rows") + "(id INT PRIMARY KEY);\n")
	for i := 1; i <= 1100; i++ {
		fmt.Fprintf(&script, "INSERT INTO %s VALUES(%d);\n", qualified(db, "dump_rows"), i)
	}
	dump, err := s.PreviewSQLImport("dump.sql", script.String())
	if err != nil || dump.Statements != 1101 {
		t.Fatal(dump, err)
	}
	out = s.ApplySQLImport(dump.Token)
	if out.Error != "" || out.Completed != 1101 || s.TransactionStatus() != "unverified" {
		t.Fatal(out, s.TransactionStatus())
	}
	if run("SELECT COUNT(*) FROM " + qualified(db, "dump_rows")).Rows[0][0].Value != "1100" {
		t.Fatal("dump data missing")
	}
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	dump, err = s.PreviewSQLImport("partial.sql", "INSERT INTO "+qualified(db, "dump_rows")+" VALUES(1101); INSERT INTO "+qualified(db, "dump_rows")+" VALUES(1); INSERT INTO "+qualified(db, "dump_rows")+" VALUES(1102);")
	if err != nil {
		t.Fatal(err)
	}
	out = s.ApplySQLImport(dump.Token)
	if out.Completed != 1 || out.Error == "" {
		t.Fatal(out)
	}
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	dump, err = s.PreviewSQLImport("notes.sql", "DROP TABLE IF EXISTS "+qualified(db, "absent")+"; INSERT INTO "+qualified(db, "dump_rows")+" VALUES(1102);")
	if err != nil {
		t.Fatal(err)
	}
	out = s.ApplySQLImport(dump.Token)
	if out.Error != "" || out.Completed != 2 {
		t.Fatal("note stopped dump", out)
	}
}

func TestPriority4SQLExportImportRoundTrip(t *testing.T) {
	text := os.Getenv("SEQUEL_TEST_PORT")
	if text == "" {
		t.Skip("disposable database not configured")
	}
	port, err := strconv.Atoi(text)
	if err != nil {
		t.Fatal(err)
	}
	var s Session
	if err := s.Connect(Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD")}); err != nil {
		t.Fatal(err)
	}
	defer s.Shutdown()
	run := func(sql string) Result {
		t.Helper()
		r, err := s.Query(sql)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	db := fmt.Sprintf("sequel_rewrite_test_roundtrip_%d", time.Now().UnixNano())
	run("CREATE DATABASE " + quoteIdentifier(db) + " CHARACTER SET utf8mb4")
	defer run("DROP DATABASE " + quoteIdentifier(db))
	run("CREATE TABLE " + qualified(db, "source") + "(id INT PRIMARY KEY,n BIGINT UNSIGNED,amount DECIMAL(30,10),txt TEXT,bytes BLOB,nullable TEXT,computed INT GENERATED ALWAYS AS(id+1) STORED) ENGINE=InnoDB")
	textHex := hex.EncodeToString([]byte("é😀\x00\n"))
	run("INSERT INTO " + qualified(db, "source") + "(id,n,amount,txt,bytes,nullable) VALUES(1,18446744073709551615,12345678901234567890.1234567890,CONVERT(0x" + textHex + " USING utf8mb4),X'00ff',NULL),(2,2,0,'',X'',CONVERT(0x5c4e USING utf8mb4))")
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	var dump bytes.Buffer
	n, err := s.ExportData(&dump, SAExportSpec{Format: "sql", Scope: "table", IncludeDDL: true, Browse: BrowseRequest{Database: db, Table: "source", Limit: 50}})
	if err != nil || n != 2 || !strings.Contains(dump.String(), "-- Source SQL_MODE:") {
		t.Fatal(n, err)
	}
	source := strings.ReplaceAll(dump.String(), qualified(db, "source"), qualified(db, "restored"))
	plan, err := s.PreviewSQLImport("own-export.sql", source)
	if err != nil {
		t.Fatal(err)
	}
	out := s.ApplySQLImport(plan.Token)
	if out.Error != "" || out.Completed != 3 {
		t.Fatal(out)
	}
	old := run("SELECT * FROM " + qualified(db, "source") + " ORDER BY id")
	restored := run("SELECT * FROM " + qualified(db, "restored") + " ORDER BY id")
	if !reflect.DeepEqual(old.Rows, restored.Rows) {
		t.Fatal("SQL export/import changed values", old.Rows, restored.Rows)
	}
}
