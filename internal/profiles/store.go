// Package profiles persists connection settings, never credentials.
package profiles

import (
	"bytes"
	"crypto/rand"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sequel-rewrite/internal/authproviders"
	"sequel-rewrite/internal/tunnel"
	"sort"
	"strings"
	"sync"
)

// Keep this separate from database.Connection so passwords cannot be serialized.
type Profile struct {
	Auth            *authproviders.SASettings `json:"auth,omitempty"`
	Socket          string                    `json:"socket,omitempty"`
	TimeZone        string                    `json:"timeZone,omitempty"`
	Folder          string                    `json:"folder,omitempty"`
	Color           string                    `json:"color,omitempty"`
	InitialDatabase string                    `json:"initialDatabase,omitempty"`
	ID              string                    `json:"id"`
	Name            string                    `json:"name"`
	Host            string                    `json:"host"`
	Port            int                       `json:"port"`
	User            string                    `json:"user"`
	TLS             bool                      `json:"tls"`
	CAPEM           string                    `json:"caPEM"`
	SSH             *tunnel.Settings          `json:"ssh,omitempty"`
}

type document struct {
	Version int     `json:"version"`
	Profile Profile `json:"profile"`
}

type Store struct {
	dir string
	mu  sync.Mutex
}

// An empty directory uses the OS's user configuration directory lazily, so a
// storage error never prevents the user from opening an unsaved connection.
func NewStore(dir string) *Store { return &Store{dir: dir} }

func (s *Store) directory() (string, error) {
	if s.dir != "" {
		return s.dir, nil
	}
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "SequelRewrite", "profiles"), nil
}

func validID(id string) bool {
	decoded, err := hex.DecodeString(id)
	return err == nil && len(decoded) == 16 && id == strings.ToLower(id)
}

func validate(p Profile) error {
	if p.Auth != nil {
		if err := authproviders.Validate(*p.Auth); err != nil {
			return err
		}
		if !p.TLS || p.Socket != "" {
			return errors.New("external authentication requires verified TLS")
		}
	}
	if p.SSH != nil {
		if err := tunnel.Validate(*p.SSH); err != nil {
			return err
		}
	}
	if len(p.TimeZone) > 64 || strings.ContainsRune(p.TimeZone, 0) || len(p.Folder) > 200 || strings.ContainsRune(p.Folder, 0) {
		return errors.New("invalid time zone or favorites folder")
	}
	switch p.Color {
	case "", "none", "red", "orange", "yellow", "green", "blue", "purple", "gray":
	default:
		return errors.New("invalid favorite color")
	}
	if p.Socket != "" && (!filepath.IsAbs(p.Socket) || len(p.Socket) > 103 || strings.ContainsRune(p.Socket, 0) || p.TLS || p.CAPEM != "" || p.SSH != nil) {
		return errors.New("invalid UNIX socket profile")
	}
	if strings.TrimSpace(p.Name) == "" || len(p.Name) > 100 || strings.TrimSpace(p.Host) == "" || p.User == "" || p.Port < 1 || p.Port > 65535 {
		return errors.New("profile requires a name (up to 100 bytes), host, user, and port (1–65535)")
	}
	if !p.TLS && p.CAPEM != "" {
		return errors.New("enable TLS before supplying a CA certificate")
	}
	// A pasted PEM bundle must not accidentally save a private key alongside a CA.
	rest := bytes.TrimSpace([]byte(p.CAPEM))
	for len(rest) > 0 {
		if !bytes.HasPrefix(rest, []byte("-----BEGIN CERTIFICATE-----")) {
			return errors.New("CA PEM must contain certificates only")
		}
		block, tail := pem.Decode(rest)
		if block == nil || block.Type != "CERTIFICATE" {
			return errors.New("invalid CA PEM")
		}
		if _, err := x509.ParseCertificate(block.Bytes); err != nil {
			return errors.New("invalid CA certificate")
		}
		rest = bytes.TrimSpace(tail)
	}
	return nil
}

func read(path, id string) (Profile, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return Profile{}, err
	}
	if !info.Mode().IsRegular() || info.Size() > 64*1024 {
		return Profile{}, errors.New("profile must be a regular file of at most 64 KiB")
	}
	file, err := os.Open(path)
	if err != nil {
		return Profile{}, err
	}
	defer file.Close()
	decoder := json.NewDecoder(io.LimitReader(file, 64*1024+1))
	decoder.DisallowUnknownFields()
	var doc document
	if err := decoder.Decode(&doc); err != nil {
		return Profile{}, err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return Profile{}, errors.New("unexpected data after profile")
	}
	if doc.Version != 1 || doc.Profile.ID != id {
		return Profile{}, errors.New("unsupported profile version or mismatched ID")
	}
	if err := validate(doc.Profile); err != nil {
		return Profile{}, err
	}
	return doc.Profile, nil
}

func (s *Store) List() ([]Profile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.list()
}
func (s *Store) list() ([]Profile, error) {
	dir, err := s.directory()
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return []Profile{}, nil
	}
	if err != nil {
		return nil, err
	}
	result := []Profile{}
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		id := strings.TrimSuffix(entry.Name(), ".json")
		if !validID(id) {
			return nil, fmt.Errorf("unrecognized profile filename: %s", entry.Name())
		}
		p, err := read(filepath.Join(dir, entry.Name()), id)
		if err != nil {
			return nil, fmt.Errorf("cannot read profile %s: %w", id, err)
		}
		result = append(result, p)
	}
	sort.Slice(result, func(i, j int) bool {
		a, b := strings.ToLower(result[i].Name), strings.ToLower(result[j].Name)
		if a == b {
			return result[i].ID < result[j].ID
		}
		return a < b
	})
	return result, nil
}

func (s *Store) Save(p Profile) (Profile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.save(p)
}
func (s *Store) save(p Profile) (Profile, error) {
	p.Name, p.Host = strings.TrimSpace(p.Name), strings.TrimSpace(p.Host)
	if err := validate(p); err != nil {
		return Profile{}, err
	}
	dir, err := s.directory()
	if err != nil {
		return Profile{}, err
	}
	if p.ID == "" {
		var id [16]byte
		if _, err := rand.Read(id[:]); err != nil {
			return Profile{}, err
		}
		p.ID = hex.EncodeToString(id[:])
	} else {
		if !validID(p.ID) {
			return Profile{}, errors.New("invalid profile ID")
		}
		// A stale selection must not recreate a deleted profile or overwrite an
		// unreadable/future-version file with defaults.
		if _, err := read(filepath.Join(dir, p.ID+".json"), p.ID); err != nil {
			return Profile{}, err
		}
	}
	data, err := json.MarshalIndent(document{Version: 1, Profile: p}, "", "  ")
	if err != nil {
		return Profile{}, err
	}
	if len(data)+1 > 64*1024 {
		return Profile{}, errors.New("profile exceeds 64 KiB")
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return Profile{}, err
	}
	temp, err := os.CreateTemp(dir, ".profile-*")
	if err != nil {
		return Profile{}, err
	}
	defer os.Remove(temp.Name())
	defer temp.Close()
	if _, err := temp.Write(append(data, '\n')); err != nil {
		return Profile{}, err
	}
	if err := temp.Sync(); err != nil {
		return Profile{}, err
	}
	if err := temp.Close(); err != nil {
		return Profile{}, err
	}
	if err := os.Rename(temp.Name(), filepath.Join(dir, p.ID+".json")); err != nil {
		return Profile{}, err
	}
	return p, nil
}

func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !validID(id) {
		return errors.New("invalid profile ID")
	}
	dir, err := s.directory()
	if err != nil {
		return err
	}
	// Check the document before deleting; corrupt or unknown versions require
	// manual recovery rather than silently discarding the user's data.
	path := filepath.Join(dir, id+".json")
	if _, err := read(path, id); err != nil {
		return err
	}
	return os.Remove(path)
}

func (s *Store) Get(id string) (Profile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !validID(id) {
		return Profile{}, errors.New("invalid profile ID")
	}
	dir, err := s.directory()
	if err != nil {
		return Profile{}, err
	}
	return read(filepath.Join(dir, id+".json"), id)
}
