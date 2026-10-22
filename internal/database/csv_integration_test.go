package database

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

type failingCSVWriter struct{}

func (failingCSVWriter) Write([]byte) (int, error) { return 0, errors.New("fixture disk failure") }

type cancellingCSVWriter struct{ s *Session }

func (w cancellingCSVWriter) Write(b []byte) (int, error) { w.s.Cancel(); return len(b), nil }
func TestCSVIntegration(t *testing.T) {
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
	run := func(q string) {
		t.Helper()
		if _, err := cleanup.Query(q); err != nil {
			t.Fatal(err)
		}
	}
	name := fmt.Sprintf("sequel_rewrite_test_csv_%d", time.Now().UnixNano())
	target := quoteIdentifier(name) + "." + quoteIdentifier("table`csv")
	run("CREATE DATABASE " + quoteIdentifier(name))
	defer run("DROP DATABASE " + quoteIdentifier(name))
	run("CREATE TABLE " + target + " (id BIGINT UNSIGNED PRIMARY KEY,amount DECIMAL(30,10),label TEXT,raw VARBINARY(8)) ENGINE=InnoDB")
	run("INSERT INTO " + target + " VALUES(18446744073709551615,12345678901234567890.1234567890,CONCAT('line',CHAR(13),CHAR(10),'quote,',CHAR(34),CHAR(92),'N'),X'00ff')")
	var output bytes.Buffer
	n, err := s.ExportCSV(name, "table`csv", &output)
	if err != nil || n != 1 {
		t.Fatal(n, err)
	}
	records, err := csv.NewReader(&output).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 2 || records[1][0] != "18446744073709551615" || records[1][1] != "12345678901234567890.1234567890" || records[1][2] != `line\r\nquote,"\\N` || records[1][3] != `\B00ff` {
		t.Fatal(records)
	}
	run("CREATE TABLE " + quoteIdentifier(name) + ".empty_values (value TEXT)")
	run("INSERT INTO " + quoteIdentifier(name) + ".empty_values VALUES(NULL),(''),(CONCAT(CHAR(92),'N'))")
	output.Reset()
	n, err = s.ExportCSV(name, "empty_values", &output)
	if err != nil || n != 3 {
		t.Fatal(n, err)
	}
	records, err = csv.NewReader(&output).ReadAll()
	if err != nil || len(records) != 4 || records[1][0] != `\N` || records[2][0] != `\E` || records[3][0] != `\\N` {
		t.Fatal(records, err)
	}
	run("CREATE TABLE " + quoteIdentifier(name) + ".many (n INT,label VARCHAR(100))")
	run("INSERT INTO " + quoteIdentifier(name) + ".many VALUES (1,REPEAT('x',100))")
	for i := 0; i < 11; i++ {
		run("INSERT INTO " + quoteIdentifier(name) + ".many SELECT n+1,label FROM " + quoteIdentifier(name) + ".many")
	}
	n, err = s.ExportCSV(name, "many", io.Discard)
	if err != nil || n != 2048 || !s.Connected() {
		t.Fatal("UI row limit affected export", n, err)
	}
	if _, err := s.ExportCSV(name, "many", failingCSVWriter{}); err == nil || s.Connected() {
		t.Fatal("writer failure retained unread session")
	}
	if err := s.Connect(c); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ExportCSV(name, "many", cancellingCSVWriter{&s}); err == nil || s.Connected() {
		t.Fatal("cancelled export reported success")
	}
	if err := s.Connect(c); err != nil {
		t.Fatal(err)
	}
	run("CREATE VIEW " + quoteIdentifier(name) + ".oversized AS SELECT REPEAT('x',5000000) AS big")
	if _, err := s.ExportCSV(name, "oversized", io.Discard); err == nil || !strings.Contains(err.Error(), "4 MiB") || s.Connected() {
		t.Fatal("oversized row not aborted", err)
	}
}
