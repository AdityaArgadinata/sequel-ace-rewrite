package workspace

import (
	"encoding/json"
	"os"
	"sequel-rewrite/internal/authproviders"
	"sequel-rewrite/internal/database"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestMissingTabAndLimit(t *testing.T) {
	var m Manager
	if _, err := m.Open(nil); err == nil {
		t.Fatal("opened without connection")
	}
	if _, err := m.Session("missing"); err == nil {
		t.Fatal("missing tab returned")
	}
	m.tabs = map[string]*database.Session{}
	for i := 0; i < 16; i++ {
		m.tabs[strconv.Itoa(i)] = &database.Session{}
	}
	if _, err := m.Open(&database.Connection{}); err == nil {
		t.Fatal("tab limit ignored")
	}
	m.Shutdown()
}
func TestIndependentSessionsIntegration(t *testing.T) {
	portText := os.Getenv("SEQUEL_TEST_PORT")
	if portText == "" {
		t.Skip("disposable database not configured")
	}
	port, _ := strconv.Atoi(portText)
	c := database.Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD")}
	var m Manager
	defer m.Shutdown()
	first, err := m.Open(&c)
	if err != nil {
		t.Fatal(err)
	}
	second, err := m.Open(nil)
	if err != nil {
		t.Fatal(err)
	}
	a, _ := m.Session(first)
	b, _ := m.Session(second)
	qa := func(q string) database.Result {
		t.Helper()
		r, err := a.Query(q)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	qb := func(q string) database.Result {
		t.Helper()
		r, err := b.Query(q)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	if qa("SELECT CONNECTION_ID()").Rows[0][0].Value == qb("SELECT CONNECTION_ID()").Rows[0][0].Value {
		t.Fatal("tabs share physical connection")
	}
	qa("SET @tab_value=42")
	if !qb("SELECT @tab_value").Rows[0][0].Null {
		t.Fatal("session variable leaked")
	}
	name := "sequel_rewrite_test_tabs_" + strconv.FormatInt(time.Now().UnixNano(), 10)
	qa("CREATE DATABASE `" + name + "`")
	defer func() {
		var cleanup database.Session
		if err := cleanup.Connect(c); err != nil {
			t.Error(err)
			return
		}
		defer cleanup.Shutdown()
		if _, err := cleanup.Query("DROP DATABASE `" + name + "`"); err != nil {
			t.Error(err)
		}
	}()

	if err = a.UseDatabase(name); err != nil {
		t.Fatal(err)
	}
	if !qb("SELECT DATABASE()").Rows[0][0].Null {
		t.Fatal("database selection leaked")
	}
	qa("CREATE TEMPORARY TABLE private_rows (id INT)")
	if _, err = b.Query("SELECT * FROM `" + name + "`.private_rows"); err == nil {
		t.Fatal("temporary table leaked")
	}
	qa("CREATE TABLE durable_rows (id INT) ENGINE=InnoDB")
	qa("START TRANSACTION")
	qa("INSERT INTO durable_rows VALUES (1)")
	if err = m.Close(first); err != nil {
		t.Fatal(err)
	}
	if qb("SELECT COUNT(*) FROM `" + name + "`.durable_rows").Rows[0][0].Value != "0" {
		t.Fatal("uncommitted transaction survived tab close")
	}
	third, err := m.Open(nil)
	if err != nil {
		t.Fatal(err)
	}
	s, _ := m.Session(third)
	done := make(chan error, 1)
	go func() { _, err := s.Query("SELECT SLEEP(20)"); done <- err }()
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()
	timeout := time.NewTimer(5 * time.Second)
	defer timeout.Stop()
	cancelled := false
	for !cancelled {
		select {
		case err := <-done:
			if err == nil {
				t.Fatal("query was not cancelled")
			}
			cancelled = true
		case <-ticker.C:
			s.Cancel()
		case <-timeout.C:
			t.Fatal("cancel did not complete")
		}
	}

	if s.Connected() {
		t.Fatal("cancelled session still live")
	}
	if qb("SELECT 1").Rows[0][0].Value != "1" {
		t.Fatal("cancel affected another tab")
	}
	m.Shutdown()
	if m.connection != nil || len(m.tabs) != 0 {
		t.Fatal("workspace retained connection settings")
	}
}

func TestProfileExportExcludesCredentials(t *testing.T) {
	m := Manager{connection: &database.Connection{Host: "fixture.invalid", User: "fixture", Port: 3306, Password: "secret-db-password", Auth: &authproviders.SAOptions{Settings: authproviders.SASettings{Provider: "vault", VaultAddress: "https://vault.example", VaultMount: "database", VaultRole: "reader"}, VaultToken: "secret-vault-token"}}}
	p, err := m.Profile()
	if err != nil || p.Host != "fixture.invalid" {
		t.Fatal(p, err)
	}
	// Profile is a separate credential-free type; this also pins the new API boundary.
	encoded, err := json.Marshal(p)
	if err != nil || strings.Contains(string(encoded), "secret-db-password") || strings.Contains(string(encoded), "password") || strings.Contains(string(encoded), "secret-vault-token") {
		t.Fatal("password escaped", err)
	}
}
