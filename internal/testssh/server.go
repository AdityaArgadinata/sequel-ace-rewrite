// Package testssh supplies a loopback-only SSH forwarding fixture for tests.
package testssh

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"fmt"
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
	"io"
	"net"
	"os"
	"path/filepath"
	"sequel-rewrite/internal/tunnel"
	"strconv"
	"sync"
	"testing"
)

func Start(t *testing.T) tunnel.Options {
	t.Helper()
	_, host, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	hostSigner, err := ssh.NewSignerFromKey(host)
	if err != nil {
		t.Fatal(err)
	}
	pub, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	clientPub, err := ssh.NewPublicKey(pub)
	if err != nil {
		t.Fatal(err)
	}
	config := &ssh.ServerConfig{
		KeyboardInteractiveCallback: func(c ssh.ConnMetadata, challenge ssh.KeyboardInteractiveChallenge) (*ssh.Permissions, error) {
			answers, err := challenge(c.User(), "Fixture OTP", []string{"Code:"}, []bool{false})
			if err == nil && c.User() == "fixture" && len(answers) == 1 && answers[0] == "123456" {
				return nil, nil
			}
			return nil, fmt.Errorf("denied")
		},
		PasswordCallback: func(c ssh.ConnMetadata, p []byte) (*ssh.Permissions, error) {
			if c.User() == "fixture" && string(p) == "fixture-ssh" {
				return nil, nil
			}
			return nil, fmt.Errorf("denied")
		},
		PublicKeyCallback: func(c ssh.ConnMetadata, p ssh.PublicKey) (*ssh.Permissions, error) {
			if c.User() == "fixture" && string(p.Marshal()) == string(clientPub.Marshal()) {
				return nil, nil
			}
			return nil, fmt.Errorf("denied")
		},
	}
	config.AddHostKey(hostSigner)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	connections := map[net.Conn]bool{}
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			mu.Lock()
			connections[conn] = true
			mu.Unlock()
			wg.Add(1)
			go func() {
				defer wg.Done()
				defer conn.Close()
				defer func() { mu.Lock(); delete(connections, conn); mu.Unlock() }()
				server, channels, requests, err := ssh.NewServerConn(conn, config)
				if err != nil {
					return
				}
				defer server.Close()
				go ssh.DiscardRequests(requests)
				for ch := range channels {
					if ch.ChannelType() != "direct-tcpip" {
						ch.Reject(ssh.UnknownChannelType, "only forwarding")
						continue
					}
					var target struct {
						Host       string
						Port       uint32
						Origin     string
						OriginPort uint32
					}
					if ssh.Unmarshal(ch.ExtraData(), &target) != nil || target.Host != "127.0.0.1" {
						ch.Reject(ssh.Prohibited, "only loopback")
						continue
					}
					remote, err := net.Dial("tcp", net.JoinHostPort(target.Host, strconv.Itoa(int(target.Port))))
					if err != nil {
						ch.Reject(ssh.ConnectionFailed, "fixture unavailable")
						continue
					}
					channel, req, err := ch.Accept()
					if err != nil {
						remote.Close()
						continue
					}
					go ssh.DiscardRequests(req)
					wg.Add(2)
					go func() { defer wg.Done(); defer channel.Close(); defer remote.Close(); _, _ = io.Copy(remote, channel) }()
					go func() { defer wg.Done(); defer channel.Close(); defer remote.Close(); _, _ = io.Copy(channel, remote) }()
				}
			}()
		}
	}()
	t.Cleanup(func() {
		listener.Close()
		mu.Lock()
		for conn := range connections {
			conn.Close()
		}
		mu.Unlock()
		wg.Wait()
	})
	dir := t.TempDir()
	known := filepath.Join(dir, "known_hosts")
	if err = os.WriteFile(known, []byte(knownhosts.Line([]string{listener.Addr().String()}, hostSigner.PublicKey())+"\n"), 0600); err != nil {
		t.Fatal(err)
	}
	block, err := ssh.MarshalPrivateKeyWithPassphrase(key, "fixture", []byte("fixture-passphrase"))
	if err != nil {
		t.Fatal(err)
	}
	keyPath := filepath.Join(dir, "id_ed25519")
	if err = os.WriteFile(keyPath, pem.EncodeToMemory(block), 0600); err != nil {
		t.Fatal(err)
	}
	_, portText, _ := net.SplitHostPort(listener.Addr().String())
	port, _ := strconv.Atoi(portText)
	return tunnel.Options{Settings: tunnel.Settings{Host: "127.0.0.1", Port: port, User: "fixture", KnownHosts: known, KeyFile: keyPath}, Password: "fixture-ssh", KeyPassphrase: "fixture-passphrase"}
}
