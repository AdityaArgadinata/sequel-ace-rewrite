package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sequel-rewrite/internal/cellfiles"
	"sequel-rewrite/internal/database"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestCellEditorFilesAndConflictIntegration(t *testing.T) {
	portText := os.Getenv("SEQUEL_TEST_PORT")
	if portText == "" {
		t.Skip("disposable server not configured")
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		t.Fatal(err)
	}
	config := database.Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD")}
	var s, other database.Session
	if err = s.Connect(config); err != nil {
		t.Fatal(err)
	}
	defer s.Shutdown()
	if err = other.Connect(config); err != nil {
		t.Fatal(err)
	}
	defer other.Shutdown()
	run := func(q string) database.Result {
		t.Helper()
		r, e := s.Query(q)
		if e != nil {
			t.Fatal(q, e)
		}
		return r
	}
	name := fmt.Sprintf("sequel_rewrite_test_cell_%d", time.Now().UnixNano())
	target := "`" + name + "`.`items`"
	run("CREATE DATABASE `" + name + "` CHARACTER SET utf8mb4")
	defer run("DROP DATABASE `" + name + "`")
	run("CREATE TABLE " + target + " (id INT PRIMARY KEY,body LONGTEXT NULL,payload LONGBLOB NULL,doc JSON NULL) ENGINE=InnoDB")
	run("INSERT INTO " + target + " VALUES(1,'old',0x00ff,NULL)")
	if err = s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	request := database.BrowseRequest{Database: name, Table: "items", Limit: 25}
	before, err := s.Browse(request)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	textPath := filepath.Join(dir, "text")
	blobPath := filepath.Join(dir, "blob")
	text := "\ufeffé😀\r\n\x00tail"
	raw := []byte{0, 255, 13, 10, 65}
	if err = os.WriteFile(textPath, []byte(text), 0600); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(blobPath, raw, 0600); err != nil {
		t.Fatal(err)
	}
	textCell, err := cellfiles.Read(textPath, false)
	if err != nil {
		t.Fatal(err)
	}
	blobCell, err := cellfiles.Read(blobPath, true)
	if err != nil {
		t.Fatal(err)
	}
	cols := []string{}
	for _, c := range before.Columns {
		cols = append(cols, c.Name)
	}
	mutation := database.Mutation{Database: name, Table: "items", Action: "update", Columns: cols, Original: before.Rows[0], Values: map[string]database.Cell{"body": textCell, "payload": blobCell, "doc": {Value: `{"n":18446744073709551615}`}}}
	if n, e := s.Mutate(mutation); e != nil || n != 1 {
		t.Fatal(n, e)
	}
	after, err := s.Browse(request)
	if err != nil {
		t.Fatal(err)
	}
	if after.Rows[0][1].Value != text || after.Rows[0][2] != blobCell || !strings.Contains(after.Rows[0][3].Value, "18446744073709551615") {
		t.Fatal("cell contents changed", after.Rows[0])
	}
	output := filepath.Join(dir, "export")
	if err = cellfiles.Write(output, after.Rows[0][2]); err != nil {
		t.Fatal(err)
	}
	exported, err := os.ReadFile(output)
	if err != nil || string(exported) != string(raw) {
		t.Fatal(exported, err)
	}
	if _, err = other.Query("UPDATE " + target + " SET body='external' WHERE id=1"); err != nil {
		t.Fatal(err)
	}
	mutation.Original = after.Rows[0]
	mutation.Values = map[string]database.Cell{"body": {Value: "must not overwrite"}}
	if _, err = s.Mutate(mutation); err == nil {
		t.Fatal("stale editor overwrote external change")
	}
	fresh, err := s.Browse(request)
	if err != nil || fresh.Rows[0][1].Value != "external" {
		t.Fatal(fresh.Rows, err)
	}
	mutation.Original = fresh.Rows[0]
	mutation.Values = map[string]database.Cell{"body": {Null: true}, "payload": {Value: "0x", Binary: true}, "doc": {Null: true}}
	if _, err = s.Mutate(mutation); err != nil {
		t.Fatal(err)
	}
	fresh, err = s.Browse(request)
	if err != nil || !fresh.Rows[0][1].Null || fresh.Rows[0][2].Null || fresh.Rows[0][2].Value != "0x" || !fresh.Rows[0][3].Null {
		t.Fatal(fresh.Rows, err)
	}
}
func TestCellFileAPIsRequireDesktop(t *testing.T) {
	app := NewApp()
	if _, err := app.OpenCellFile(false); err == nil {
		t.Fatal("headless import accepted")
	}
	if _, err := app.SaveCellFile(database.Cell{Value: "text"}); err == nil {
		t.Fatal("headless export accepted")
	}
}
