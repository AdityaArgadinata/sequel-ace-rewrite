// Package tunnel opens verified SSH connections without exposing a local port.
package tunnel

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

// Settings contains no secrets and may be stored in a connection profile.
type Settings struct {
	Host       string `json:"host"`
	Port       int    `json:"port"`
	User       string `json:"user"`
	KeyFile    string `json:"keyFile"`
	KnownHosts string `json:"knownHosts"`
}
type Options struct {
	Settings      Settings `json:"settings"`
	Password      string   `json:"password"`
	KeyPassphrase string   `json:"keyPassphrase"`
}

func Validate(s Settings) error {
	if s.Host == "" || s.User == "" || s.Port < 1 || s.Port > 65535 {
		return errors.New("SSH requires host, user and port (1–65535)")
	}
	return nil
}

func Open(ctx context.Context, options Options) (*ssh.Client, error) {
	s := options.Settings
	if err := Validate(s); err != nil {
		return nil, err
	}
	path := s.KnownHosts
	if path == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, err
		}
		path = filepath.Join(home, ".ssh", "known_hosts")
	}
	verify, err := knownhosts.New(path)
	if err != nil {
		return nil, fmt.Errorf("read SSH known_hosts: %w", err)
	}
	auth := []ssh.AuthMethod{}
	if options.Password != "" {
		auth = append(auth, ssh.Password(options.Password))
	}
	if s.KeyFile != "" {
		file, err := os.Open(s.KeyFile)
		if err != nil {
			return nil, errors.New("cannot open SSH private key")
		}
		defer file.Close()
		data, err := io.ReadAll(io.LimitReader(file, 1024*1024+1))
		if err != nil || len(data) > 1024*1024 {
			return nil, errors.New("SSH key exceeds 1 MiB or cannot be read")
		}
		var signer ssh.Signer
		if options.KeyPassphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(data, []byte(options.KeyPassphrase))
		} else {
			signer, err = ssh.ParsePrivateKey(data)
		}
		if err != nil {
			return nil, errors.New("cannot decode SSH key; check its format and passphrase")
		}
		auth = append(auth, ssh.PublicKeys(signer))
	}
	if len(auth) == 0 {
		return nil, errors.New("provide SSH password or private key")
	}
	config := &ssh.ClientConfig{User: s.User, Auth: auth, HostKeyCallback: func(host string, remote net.Addr, key ssh.PublicKey) error {
		if err := verify(host, remote, key); err != nil {
			return fmt.Errorf("SSH host key rejected (%s). Verify host identity and update known_hosts outside the app: %w", ssh.FingerprintSHA256(key), err)
		}
		return nil
	}}
	address := net.JoinHostPort(s.Host, strconv.Itoa(s.Port))
	conn, err := (&net.Dialer{Timeout: 10 * time.Second}).DialContext(ctx, "tcp", address)
	if err != nil {
		return nil, err
	}
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	defer stop()
	c, channels, requests, err := ssh.NewClientConn(conn, address, config)
	if err != nil {
		conn.Close()
		return nil, err
	}
	if ctx.Err() != nil {
		c.Close()
		return nil, ctx.Err()
	}
	_ = conn.SetDeadline(time.Time{})
	return ssh.NewClient(c, channels, requests), nil
}

// ssh channels do not support deadlines. net.Pipe provides deadlines to MySQL
// while bounded io.Copy buffers bridge the channel; closing either end stops both.
func Dial(ctx context.Context, client *ssh.Client, address string) (net.Conn, error) {
	remote, err := client.DialContext(ctx, "tcp", address)
	if err != nil {
		return nil, err
	}
	local, bridge := net.Pipe()
	var once sync.Once
	closeBoth := func() { once.Do(func() { local.Close(); bridge.Close(); remote.Close() }) }
	go func() { _, _ = io.Copy(remote, bridge); closeBoth() }()
	go func() { _, _ = io.Copy(bridge, remote); closeBoth() }()
	return local, nil
}
