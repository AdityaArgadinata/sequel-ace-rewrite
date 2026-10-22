package database

import (
	"errors"
	"net"
	"strings"
	"testing"

	"github.com/go-sql-driver/mysql"
)

func TestConnectReportsClosedHandshake(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	stopped := make(chan struct{})
	go func() {
		defer close(stopped)
		// database/sql may retry a failed dial; accept until test cleanup.
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			conn.Close()
		}
	}()
	defer func() { listener.Close(); <-stopped }()
	var session Session
	defer session.Shutdown()
	err = session.Connect(Connection{Host: "127.0.0.1", Port: listener.Addr().(*net.TCPAddr).Port, User: "fixture", Password: "secret-not-for-errors"})
	if err == nil {
		t.Fatal("closed handshake accepted")
	}
	if !strings.Contains(err.Error(), "handshake/authentication failed") || !strings.Contains(err.Error(), "host/port") {
		t.Fatalf("missing actionable connection context: %v", err)
	}
	if strings.Contains(err.Error(), "secret-not-for-errors") {
		t.Fatal("password exposed")
	}
	if session.Connected() {
		t.Fatal("failed connection left active session")
	}
}

func TestConnectionErrorPreservesCause(t *testing.T) {
	for _, cause := range []error{mysql.ErrInvalidConn, errors.New("access denied")} {
		err := connectionError("handshake/authentication", cause)
		if !errors.Is(err, cause) {
			t.Fatal("cause lost")
		}
	}
}
