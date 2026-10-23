package database

import (
	"crypto/tls"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

func TestConfig(t *testing.T) {
	c := Connection{Host: "::1", Port: 3306, User: "alice", Password: "@:/secret", TLS: true}
	cfg, err := config(c)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Addr != "[::1]:3306" || cfg.Passwd != c.Password {
		t.Fatal("connection fields changed")
	}
	if cfg.TLS == nil || cfg.TLS.InsecureSkipVerify || cfg.TLS.MinVersion < tls.VersionTLS12 {
		t.Fatal("TLS must verify the server")
	}
	if cfg.MultiStatements || cfg.AllowAllFiles || cfg.AllowFallbackToPlaintext || cfg.ParseTime {
		t.Fatal("unsafe or lossy driver configuration")
	}
	for _, change := range []func(*Connection){
		func(c *Connection) { c.Port = 0 },
		func(c *Connection) { c.Port = 65536 },
		func(c *Connection) { c.Host = " " },
		func(c *Connection) { c.User = "" },
		func(c *Connection) { c.CAPEM = "not a certificate" },
		func(c *Connection) { c.TLS = false; c.CAPEM = "certificate" },
	} {
		bad := c
		change(&bad)
		if _, err := config(bad); err == nil {
			t.Fatal("invalid connection accepted")
		}
	}
}

func TestCellPreservesValues(t *testing.T) {
	for _, test := range []struct {
		raw  []byte
		kind string
		want Cell
	}{
		{nil, "VARCHAR", Cell{Null: true}},
		{[]byte{}, "VARCHAR", Cell{Value: ""}},
		{[]byte("18446744073709551615"), "UNSIGNED BIGINT", Cell{Value: "18446744073709551615"}},
		{[]byte("12345678901234567890.1234567890"), "DECIMAL", Cell{Value: "12345678901234567890.1234567890"}},
		{[]byte("0000-00-00"), "DATE", Cell{Value: "0000-00-00"}},
		{[]byte{0, 255}, "BLOB", Cell{Value: "0x00ff", Binary: true}},
		{[]byte("hello"), "VARBINARY", Cell{Value: "0x68656c6c6f", Binary: true}},
		{[]byte{255}, "VARCHAR", Cell{Value: "0xff", Binary: true}},
	} {
		if got := cell(test.raw, test.kind); got != test.want {
			t.Errorf("%s: got %#v, want %#v", test.kind, got, test.want)
		}
	}
}

func TestIdentifierAndOperationOwnership(t *testing.T) {
	if got := quoteIdentifier("db`name"); got != "`db``name`" {
		t.Fatal(got)
	}
	var s Session
	ctx, done, err := s.begin()
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.begin(); err == nil {
		t.Fatal("concurrent operation accepted")
	}
	if err := s.Disconnect(); err == nil {
		t.Fatal("concurrent disconnect accepted")
	}
	s.Cancel()
	if ctx.Err() == nil {
		t.Fatal("operation was not cancelled")
	}
	done()
	if s.Connected() {
		t.Fatal("cancelled session still connected")
	}
	if _, err := s.Query("SELECT 1"); err == nil {
		t.Fatal("query without a session accepted")
	}
}

func TestMissingMetadataPreservesConnectionState(t *testing.T) {
	var s Session
	if err := s.queryError(sql.ErrNoRows); err != sql.ErrNoRows || s.failed {
		t.Fatal(err, s.failed)
	}
}

func TestSocketAndExternalAuthConfig(t *testing.T) {
	c := Connection{Socket: filepath.Join(os.TempDir(), "mysql.sock"), User: "root", TimeZone: "+07:00"}
	cfg, err := config(c)
	if err != nil || cfg.Net != "unix" || cfg.Addr != c.Socket {
		t.Fatal(cfg, err)
	}
	c.TLS = true
	if _, err = config(c); err == nil {
		t.Fatal("TLS on UNIX accepted")
	}
}
