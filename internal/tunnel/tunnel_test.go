package tunnel_test

import (
	"context"
	"io"
	"net"
	"os"
	"sequel-rewrite/internal/testssh"
	"sequel-rewrite/internal/tunnel"
	"testing"
	"time"
)

func TestVerifiedSSHAndForwarding(t *testing.T) {
	options := testssh.Start(t)
	echo, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer echo.Close()
	go func() {
		conn, err := echo.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		_, _ = io.Copy(conn, conn)
	}()
	options.Password = "" // encrypted private key authentication
	client, err := tunnel.Open(context.Background(), options)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	conn, err := tunnel.Dial(context.Background(), client, echo.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if err = conn.SetDeadline(time.Now().Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	if _, err = conn.Write([]byte("hello")); err != nil {
		t.Fatal(err)
	}
	b := make([]byte, 5)
	if _, err = io.ReadFull(conn, b); err != nil || string(b) != "hello" {
		t.Fatalf("forward: %q %v", b, err)
	}
	options.Settings.KeyFile = ""
	options.Password = "wrong"
	if rejected, err := tunnel.Open(context.Background(), options); err == nil {
		rejected.Close()
		t.Fatal("wrong password accepted")
	}
	options.Password = "fixture-ssh"
	passwordClient, err := tunnel.Open(context.Background(), options)
	if err != nil {
		t.Fatal(err)
	}
	passwordClient.Close()
	if err = os.WriteFile(options.Settings.KnownHosts, []byte{}, 0600); err != nil {
		t.Fatal(err)
	}
	if rejected, err := tunnel.Open(context.Background(), options); err == nil {
		rejected.Close()
		t.Fatal("unknown host accepted")
	}
}
func TestCancelledSSHConnect(t *testing.T) {
	options := testssh.Start(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if client, err := tunnel.Open(ctx, options); err == nil {
		client.Close()
		t.Fatal("cancelled dial accepted")
	}
}
