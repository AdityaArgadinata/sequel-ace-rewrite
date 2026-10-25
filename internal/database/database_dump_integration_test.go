package database

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestDatabaseDumpIntegration(t *testing.T) {
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
	db := fmt.Sprintf("sequel_rewrite_test_dump_%d", time.Now().UnixNano())
	run := func(sql string) Result {
		t.Helper()
		r, err := other.Query(sql)
		if err != nil {
			t.Fatal(sql, err)
		}
		return r
	}
	run("CREATE DATABASE " + quoteIdentifier(db) + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
	defer func() { run("DROP DATABASE IF EXISTS " + quoteIdentifier(db)) }()
	run("CREATE TABLE " + qualified(db, "parent") + "(id INT PRIMARY KEY, text_value TEXT, payload BLOB, stamp TIMESTAMP NULL)")
	run("CREATE TABLE " + qualified(db, "child") + "(id INT PRIMARY KEY, parent_id INT, doubled INT GENERATED ALWAYS AS (parent_id*2) STORED, CONSTRAINT child_parent FOREIGN KEY(parent_id) REFERENCES " + qualified(db, "parent") + "(id))")
	run("INSERT INTO " + qualified(db, "parent") + " VALUES(1,CONVERT(0x656d6f6a6920f09f9880205c273b USING utf8mb4),X'00ff5c27',FROM_UNIXTIME(1700000000))")
	run("INSERT INTO " + qualified(db, "child") + "(id,parent_id) VALUES(1,1)")
	run("USE " + quoteIdentifier(db))
	run("CREATE FUNCTION " + qualified(db, "plus_one") + "(n INT) RETURNS INT DETERMINISTIC RETURN n+1")
	run("CREATE PROCEDURE " + qualified(db, "p") + "() BEGIN SELECT 'body; $$', COUNT(*) FROM " + qualified(db, "child") + "; END")
	run("CREATE VIEW " + qualified(db, "z_base") + " AS SELECT id, text_value FROM " + qualified(db, "parent"))
	run("CREATE VIEW " + qualified(db, "a_dependent") + " AS SELECT id, text_value FROM " + qualified(db, "z_base"))
	run("CREATE TRIGGER " + qualified(db, "after_insert") + " AFTER INSERT ON " + qualified(db, "child") + " FOR EACH ROW UPDATE " + qualified(db, "parent") + " SET text_value='trigger fired' WHERE id=NEW.parent_id")
	run("SET SESSION sql_mode='NO_BACKSLASH_ESCAPES'")
	run("CREATE PROCEDURE " + qualified(db, "different_mode") + "() SELECT 'trailing \\'")
	// MariaDB warns even for disabled events when its global scheduler is off.
	// This fixture owns the disposable server and restores its scheduler setting.
	scheduler := run("SELECT @@global.event_scheduler").Rows[0][0].Value
	if strings.EqualFold(scheduler, "OFF") {
		run("SET GLOBAL event_scheduler=ON")
		defer func() { run("SET GLOBAL event_scheduler=OFF") }()
	}
	run("CREATE EVENT " + qualified(db, "scheduled") + " ON SCHEDULE EVERY 1 DAY STARTS CURRENT_TIMESTAMP + INTERVAL 1 DAY ON COMPLETION PRESERVE ENABLE DO INSERT INTO " + qualified(db, "parent") + " VALUES(100,'event fired',NULL,NULL)")
	if _, err := s.Query("SET SESSION time_zone = '+03:00'"); err != nil {
		t.Fatal(err)
	}
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	inv, err := s.InspectDatabase(db)
	if err != nil || len(inv.Objects) != 9 {
		t.Fatal(inv, err)
	}
	var dump bytes.Buffer
	n, err := s.ExportDatabase(&dump, db, inv.Fingerprint, true)
	if err != nil || n != 2 {
		t.Fatal(n, err, dump.String())
	}
	if current, err := s.Query("SELECT @@session.time_zone"); err != nil || current.Rows[0][0].Value != "+03:00" {
		t.Fatal(current, err)
	}
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(dump.String(), "NO_BACKSLASH_ESCAPES") || strings.Contains(dump.String(), "PRESERVE ENABLE DO") {
		t.Fatal(dump.String())
	}
	var changed bytes.Buffer
	hooked := &saDumpTestWriter{w: &changed, change: func() { run("CREATE VIEW " + qualified(db, "new_during_export") + " AS SELECT 1 AS id") }}
	if _, err := s.ExportDatabase(hooked, db, inv.Fingerprint, true); err == nil || !strings.Contains(err.Error(), "during export") {
		t.Fatal("export published despite concurrent DDL", err)
	}
	run("DROP VIEW " + qualified(db, "new_during_export"))
	run("DROP VIEW " + qualified(db, "a_dependent"))
	var discarded bytes.Buffer
	if _, err := s.ExportDatabase(&discarded, db, inv.Fingerprint, true); err == nil {
		t.Fatal("stale inventory exported")
	}
	run("DROP DATABASE " + quoteIdentifier(db))
	preview, err := s.PreviewSQLImport("database.sql", dump.String())
	if err != nil {
		t.Fatal(err, dump.String())
	}
	out := s.ApplySQLImport(preview.Token)
	if out.Error != "" || out.Completed != out.Total {
		t.Fatal(out, dump.String())
	}
	if again := s.ApplySQLImport(preview.Token); again.Error == "" {
		t.Fatal("import replayed")
	}
	check := run("SELECT text_value, HEX(payload), UNIX_TIMESTAMP(stamp) FROM " + qualified(db, "parent") + " WHERE id=1")
	if check.Rows[0][2].Value != "1700000000" || check.Rows[0][1].Value != "00FF5C27" || check.Rows[0][0].Value != "emoji 😀 \\';" {
		t.Fatal(check)
	}
	if r := run("SELECT id FROM " + qualified(db, "a_dependent")); len(r.Rows) != 1 {
		t.Fatal(r)
	}
	run("INSERT INTO " + qualified(db, "child") + "(id,parent_id) VALUES(2,1)")
	if r := run("SELECT text_value FROM " + qualified(db, "parent") + " WHERE id=1"); r.Rows[0][0].Value != "trigger fired" {
		t.Fatal(r)
	}
	if r := run("SELECT " + qualified(db, "plus_one") + "(41)"); r.Rows[0][0].Value != "42" {
		t.Fatal(r)
	}
	if r := run("SELECT SQL_MODE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='" + db + "' AND ROUTINE_NAME='different_mode'"); r.Rows[0][0].Value != "NO_BACKSLASH_ESCAPES" {
		t.Fatal(r)
	}
	if r := run("SELECT STATUS FROM information_schema.EVENTS WHERE EVENT_SCHEMA='" + db + "'"); r.Rows[0][0].Value != "DISABLED" {
		t.Fatal(r)
	}
	// Duplicate restore must stop at CREATE DATABASE, leaving existing data untouched.
	s.Transaction("rollback")
	preview, err = s.PreviewSQLImport("repeat.sql", dump.String())
	if err != nil {
		t.Fatal(err)
	}
	out = s.ApplySQLImport(preview.Token)
	if out.Error == "" || out.Completed != 3 || out.Statement != 4 || out.Line == 0 {
		t.Fatal(out)
	}
}

type saDumpTestWriter struct {
	w      io.Writer
	change func()
}

func (w *saDumpTestWriter) Write(b []byte) (int, error) {
	if w.change != nil && bytes.Contains(b, []byte("INSERT INTO")) {
		change := w.change
		w.change = nil
		change()
	}
	return w.w.Write(b)
}
