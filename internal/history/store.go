// Package history persists execution metadata, with SQL text only by explicit opt-in.
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
	SQL        string `json:"sql,omitempty"`
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
	if !info.Mode().IsRegular() || info.Size() > 4*1024*1024 {
		return nil, errors.New("history is not a regular file of at most 4 MiB")
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
	return s.AddWithSQL(statement, rows, duration, success, false)
}

func (s *Store) AddWithSQL(statement string, rows int, duration int64, success, includeSQL bool) error {
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
	entry := Entry{Time: time.Now().UTC().Format(time.RFC3339), Kind: Kind(statement), Rows: rows, DurationMS: duration, Success: success}
	// Omit oversized SQL entirely; a truncated statement must never become replayable.
	if includeSQL && len(statement) <= 32*1024 {
		entry.SQL = statement
	}
	list = append([]Entry{entry}, list...)
	if len(list) > 100 {
		list = list[:100]
	}
	size, keep := 2, 0
	for _, item := range list {
		data, err := json.Marshal(item)
		if err != nil {
			return err
		}
		size += len(data) + 1
		if size > 4*1024*1024 {
			break
		}
		keep++
	}
	return write(path, list[:keep])
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

func (s *Store) ClearSQL() error {
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
	for i := range list {
		list[i].SQL = ""
	}
	return write(path, list)
}
