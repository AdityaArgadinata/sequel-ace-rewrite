// Package history persists query metadata only: SQL text/values/errors are never stored.
package history

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Entry struct {
	Time       string `json:"time"`
	Kind       string `json:"kind"`
	Rows       int    `json:"rows"`
	DurationMS int64  `json:"durationMS"`
	Success    bool   `json:"success"`
}
type Store struct {
	Dir string
	mu  sync.Mutex
}

func Kind(statement string) string {
	words := strings.Fields(statement)
	if len(words) > 0 {
		switch strings.ToUpper(words[0]) {
		case "SELECT", "SHOW", "EXPLAIN", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP", "USE", "SET", "BEGIN", "COMMIT", "ROLLBACK":
			return strings.ToUpper(words[0])
		}
	}
	return "STATEMENT"
}
func (s *Store) path() (string, error) {
	dir := s.Dir
	if dir == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			return "", err
		}
		dir = filepath.Join(base, "SequelRewrite")
	}
	return filepath.Join(dir, "history.json"), nil
}
func read(path string) ([]Entry, error) {
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return []Entry{}, nil
	}
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > 64*1024 {
		return nil, errors.New("history is not a regular file of at most 64 KiB")
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var list []Entry
	if err = json.Unmarshal(b, &list); err != nil || len(list) > 100 {
		return nil, errors.New("invalid history file; recover it manually before saving history")
	}
	return list, nil
}
func (s *Store) List() ([]Entry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	path, err := s.path()
	if err != nil {
		return nil, err
	}
	return read(path)
}
func (s *Store) Add(statement string, rows int, duration int64, success bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	path, err := s.path()
	if err != nil {
		return err
	}
	list, err := read(path)
	if err != nil {
		return err
	}
	list = append([]Entry{{time.Now().UTC().Format(time.RFC3339), Kind(statement), rows, duration, success}}, list...)
	if len(list) > 100 {
		list = list[:100]
	}
	return write(path, list)
}
func write(path string, list []Entry) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".history-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	if err = json.NewEncoder(file).Encode(list); err != nil {
		return err
	}
	if err = file.Sync(); err != nil {
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}
func (s *Store) Clear() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	path, err := s.path()
	if err != nil {
		return err
	}
	if _, err = read(path); err != nil {
		return err
	}
	return write(path, []Entry{})
}
