package database

import (
	"fmt"
	"os"
	"sequel-rewrite/internal/testssh"
	"strconv"
	"testing"
	"time"
)

func TestDailyIntegration(t *testing.T) {
	portText := os.Getenv("SEQUEL_TEST_PORT")
	if portText == "" {
		t.Skip("disposable database not configured")
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		t.Fatal(err)
	}
	c := Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD")}
	if ca := os.Getenv("SEQUEL_TEST_CA_FILE"); ca != "" {
		data, err := os.ReadFile(ca)
		if err != nil {
			t.Fatal(err)
		}
		c.TLS = true
		c.CAPEM = string(data)
	}
	options := testssh.Start(t)
	c.SSH = &options
	var s Session
	if err = s.Connect(c); err != nil {
		t.Fatal(err)
	}
	defer s.Shutdown()
	name := fmt.Sprintf("sequel_rewrite_test_daily_%d", time.Now().UnixNano())
	run := func(q string) Result {
		t.Helper()
		r, err := s.Query(q)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	run("CREATE DATABASE " + quoteIdentifier(name))
	defer run("DROP DATABASE " + quoteIdentifier(name))
	run("CREATE TABLE " + quoteIdentifier(name) + ".sample (id INT PRIMARY KEY, value VARCHAR(128))")
	run("INSERT INTO " + quoteIdentifier(name) + ".sample VALUES (1,'first'),(2,'50%_!'),(3,NULL),(4,'last')")
	request := BrowseRequest{Database: name, Table: "sample", Sort: "id", Limit: 2}
	r, err := s.Browse(request)
	if err != nil || len(r.Rows) != 2 || r.Rows[0][0].Value != "1" {
		t.Fatalf("page one: %#v %v", r, err)
	}
	request.Offset = 2
	r, err = s.Browse(request)
	if err != nil || len(r.Rows) != 2 || r.Rows[0][0].Value != "3" || !r.Rows[0][1].Null {
		t.Fatalf("page two: %#v %v", r, err)
	}
	request.Offset = 0
	request.Descending = true
	r, err = s.Browse(request)
	if err != nil || r.Rows[0][0].Value != "4" {
		t.Fatal("descending sort failed")
	}
	request.Column = "value"
	request.Operator = "contains"
	request.Value = "50%_!"
	r, err = s.Browse(request)
	if err != nil || len(r.Rows) != 1 || r.Rows[0][0].Value != "2" {
		t.Fatalf("literal wildcard: %#v %v", r, err)
	}
	request.Operator = "="
	request.Value = "' OR 1=1 --"
	r, err = s.Browse(request)
	if err != nil || len(r.Rows) != 0 {
		t.Fatal("filter injection was not treated as data")
	}
	request.Operator = "is null"
	r, err = s.Browse(request)
	if err != nil || len(r.Rows) != 1 || r.Rows[0][0].Value != "3" {
		t.Fatal("null filter failed")
	}
}
