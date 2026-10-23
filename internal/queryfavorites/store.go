package queryfavorites

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sequel-rewrite/internal/sqlfiles"
	"strings"
	"sync"
)

type SAQueryFavorite struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	SQL  string `json:"sql"`
}
type Store struct {
	Dir string
	mu  sync.Mutex
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
	return filepath.Join(dir, "query-favorites.json"), nil
}
func read(path string) ([]SAQueryFavorite, error) {
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return []SAQueryFavorite{}, nil
	}
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > 8*1024*1024 {
		return nil, errors.New("query favorites must be a regular file of at most 8 MiB")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var list []SAQueryFavorite
	if err := json.Unmarshal(data, &list); err != nil || len(list) > 100 {
		return nil, errors.New("invalid query favorites; recover the file before saving")
	}
	seen := map[string]bool{}
	for _, entry := range list {
		if !validID(entry.ID) || seen[entry.ID] || strings.TrimSpace(entry.Name) == "" || len(entry.Name) > 120 || len(entry.SQL) > 1024*1024 || sqlfiles.Validate(entry.SQL) != nil {
			return nil, errors.New("invalid query favorite entry")
		}
		seen[entry.ID] = true
	}
	return list, nil
}
func validID(id string) bool {
	b, err := hex.DecodeString(id)
	return err == nil && len(b) == 16 && id == strings.ToLower(id)
}
func (s *Store) List() ([]SAQueryFavorite, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	path, err := s.path()
	if err != nil {
		return nil, err
	}
	return read(path)
}
func write(path string, list []SAQueryFavorite) error {
	data, err := json.Marshal(list)
	if err != nil {
		return err
	}
	if len(data) > 8*1024*1024 {
		return errors.New("query favorites exceed 8 MiB")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".query-favorites-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	if _, err := file.Write(data); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}
func (s *Store) Save(entry SAQueryFavorite) (SAQueryFavorite, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry.Name = strings.TrimSpace(entry.Name)
	if entry.Name == "" || len(entry.Name) > 120 || strings.TrimSpace(entry.SQL) == "" || len(entry.SQL) > 1024*1024 || sqlfiles.Validate(entry.SQL) != nil {
		return SAQueryFavorite{}, errors.New("favorite requires a name up to 120 bytes and UTF-8 SQL up to 1 MiB")
	}
	path, err := s.path()
	if err != nil {
		return SAQueryFavorite{}, err
	}
	list, err := read(path)
	if err != nil {
		return SAQueryFavorite{}, err
	}
	if entry.ID != "" {
		for i := range list {
			if list[i].ID == entry.ID {
				list[i] = entry
				return entry, write(path, list)
			}
		}
		return SAQueryFavorite{}, errors.New("query favorite not found")
	}
	if len(list) >= 100 {
		return SAQueryFavorite{}, errors.New("at most 100 query favorites are supported")
	}
	id := make([]byte, 16)
	if _, err := rand.Read(id); err != nil {
		return SAQueryFavorite{}, err
	}
	entry.ID = hex.EncodeToString(id)
	list = append(list, entry)
	return entry, write(path, list)
}
func (s *Store) Delete(id string) error {
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
		if list[i].ID == id {
			return write(path, append(list[:i], list[i+1:]...))
		}
	}
	return errors.New("query favorite not found")
}
