package main

import (
	"fmt"
	"os"
	"sequel-rewrite/internal/database"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestPreparedSQLAgainstMySQL(t *testing.T) {
	text := os.Getenv("SEQUEL_TEST_PORT")
	if text == "" {
		t.Skip("disposable database not configured")
	}
	port, err := strconv.Atoi(text)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp()
	tab, err := app.Connect(database.Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD")})
	if err != nil {
		t.Fatal(err)
	}
	defer app.Disconnect()
	name := fmt.Sprintf("sequel_rewrite_test_script_%d", time.Now().UnixNano())
	run := func(sql string) database.Result {
		t.Helper()
		r, err := app.Query(tab, sql)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	run("CREATE DATABASE `" + name + "` CHARACTER SET utf8mb4")
	defer run("DROP DATABASE `" + name + "`")
	if err := app.UseDatabase(tab, name); err != nil {
		t.Fatal(err)
	}
	script := "CREATE TABLE sample(id INT PRIMARY KEY,value VARCHAR(100));\nDELIMITER $$\nCREATE TRIGGER mark_insert BEFORE INSERT ON sample FOR EACH ROW BEGIN SET NEW.value=CONCAT(NEW.value,';seen'); END$$\nDELIMITER ;\nINSERT INTO sample VALUES(1,'é;😀');\nSELECT value FROM sample;"
	plan, err := app.PrepareSQL(tab, script, "all", 0, 0, 0)
	if err != nil || len(plan.Statements) != 4 {
		t.Fatal(plan, err)
	}
	for _, statement := range plan.Statements {
		run(statement.SQL)
	}
	if got := run("SELECT value FROM sample").Rows[0][0].Value; got != "é;😀;seen" {
		t.Fatal(got)
	}
	if _, err := app.PrepareSQL(tab, "INSERT INTO sample VALUES(2,'no'); SELECT 'open", "all", 0, 0, 0); err == nil {
		t.Fatal("malformed script was prepared")
	}
	if got := run("SELECT COUNT(*) FROM sample").Rows[0][0].Value; got != "1" {
		t.Fatal("prepare executed SQL", got)
	}
	schema, err := app.CompletionSchema(tab, name)
	if err != nil || len(schema.Rows) != 2 || !app.Connected(tab) {
		t.Fatal(schema, err)
	}
	modePlan, err := app.PrepareSQL(tab, "SET SESSION sql_mode='NO_BACKSLASH_ESCAPES'; SELECT 2;", "all", 0, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	// Choose a mode different from the prepared mode and prove no next statement runs.
	if modePlan.SQLMode == "NO_BACKSLASH_ESCAPES" {
		run("SET SESSION sql_mode=''")
	} else {
		run(modePlan.Statements[0].SQL)
	}
	if _, err := app.StreamPreparedQuery(tab, "test-id", "INSERT INTO sample VALUES(3,'blocked')", "off", modePlan.SQLMode); err == nil || !strings.Contains(err.Error(), "SQL mode changed") {
		t.Fatal(err)
	}
	if got := run("SELECT COUNT(*) FROM sample").Rows[0][0].Value; got != "1" {
		t.Fatal("mode guard executed SQL", got)
	}
	run("SET SESSION sql_mode=DEFAULT")
}
