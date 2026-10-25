package profiles

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"
)

type FolderChange struct {
	Action      string `json:"action"`
	Folder      string `json:"folder"`
	Destination string `json:"destination"`
}
type FolderOutcome struct {
	Completed int    `json:"completed"`
	Total     int    `json:"total"`
	Error     string `json:"error"`
}
type folderDocument struct {
	Version int      `json:"version"`
	Folders []string `json:"folders"`
}

func validFolder(path string) bool {
	if path == "" || len(path) > 200 || !utf8.ValidString(path) || strings.ContainsRune(path, 0) {
		return false
	}
	parts := strings.Split(path, "/")
	if len(parts) > 10 {
		return false
	}
	for _, p := range parts {
		if p == "" || p == "." || p == ".." || p != strings.TrimSpace(p) {
			return false
		}
	}
	return true
}
func folderWithin(path, parent string) bool {
	return path == parent || strings.HasPrefix(path, parent+"/")
}
func (s *Store) folders(list []Profile) ([]string, error) {
	dir, err := s.directory()
	if err != nil {
		return nil, err
	}
	path := filepath.Join(dir, ".folders-v1")
	doc := folderDocument{Version: 1, Folders: []string{}}
	info, err := os.Lstat(path)
	if err == nil {
		if !info.Mode().IsRegular() || info.Size() > 64*1024 {
			return nil, errors.New("favorites folders must be a regular file up to 64 KiB")
		}
		data, e := os.ReadFile(path)
		if e != nil {
			return nil, e
		}
		decoder := json.NewDecoder(bytes.NewReader(data))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&doc) != nil || decoder.Decode(new(any)) != io.EOF || doc.Version != 1 || len(doc.Folders) > 1000 {
			return nil, errors.New("invalid favorites folder document; recover it before making changes")
		}
		for _, f := range doc.Folders {
			if !validFolder(f) {
				return nil, errors.New("invalid saved favorites folder")
			}
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	seen := map[string]bool{}
	for _, f := range doc.Folders {
		seen[f] = true
	}
	for _, p := range list {
		if p.Folder != "" {
			seen[p.Folder] = true
		}
	}
	for f := range seen {
		parts := strings.Split(f, "/")
		for i := 1; i < len(parts); i++ {
			seen[strings.Join(parts[:i], "/")] = true
		}
	}
	out := []string{}
	for f := range seen {
		out = append(out, f)
	}
	sort.Strings(out)
	return out, nil
}
func (s *Store) ListFolders() ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	list, err := s.list()
	if err != nil {
		return nil, err
	}
	return s.folders(list)
}
func (s *Store) saveFolders(folders []string) error {
	dir, err := s.directory()
	if err != nil {
		return err
	}
	data, err := json.Marshal(folderDocument{1, folders})
	if err != nil {
		return err
	}
	if len(data) > 64*1024 || len(folders) > 1000 {
		return errors.New("favorites folders exceed storage limits")
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	f, err := os.CreateTemp(dir, ".folders-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	if _, err := f.Write(data); err != nil {
		return err
	}
	if err := f.Sync(); err != nil {
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), filepath.Join(dir, ".folders-v1"))
}
func (s *Store) ChangeFolder(r FolderChange) FolderOutcome {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := FolderOutcome{}
	fail := func(err error) FolderOutcome { out.Error = err.Error(); return out }
	if !validFolder(r.Folder) {
		return fail(errors.New("folder paths require 1–200 UTF-8 bytes and at most 10 nonempty levels"))
	}
	if r.Action != "create" && r.Action != "rename" && r.Action != "remove" {
		return fail(errors.New("unknown folder action"))
	}
	list, err := s.list()
	if err != nil {
		return fail(err)
	}
	folders, err := s.folders(list)
	if err != nil {
		return fail(err)
	}
	for _, f := range folders {
		if !validFolder(f) {
			return fail(errors.New("normalize existing favorite folder paths before changing folders"))
		}
	}
	exists := false
	for _, f := range folders {
		if f == r.Folder {
			exists = true
		}
	}
	if r.Action == "create" {
		if exists {
			return fail(errors.New("folder already exists"))
		}
		folders = append(folders, r.Folder)
		sort.Strings(folders)
		out.Total = 1
		if err := s.saveFolders(folders); err != nil {
			return fail(err)
		}
		out.Completed = 1
		return out
	}
	if !exists {
		return fail(errors.New("folder no longer exists; reload favorites"))
	}
	if r.Action == "rename" {
		if !validFolder(r.Destination) || folderWithin(r.Destination, r.Folder) {
			return fail(errors.New("destination must be a valid path outside the source folder"))
		}
		for _, f := range folders {
			if folderWithin(f, r.Destination) {
				return fail(errors.New("destination folder already exists; folders are not merged"))
			}
		}
	}
	next := []string{}
	for _, f := range folders {
		if !folderWithin(f, r.Folder) {
			next = append(next, f)
		} else if r.Action == "rename" {
			mapped := r.Destination + strings.TrimPrefix(f, r.Folder)
			if !validFolder(mapped) {
				return fail(errors.New("renamed subfolder exceeds path limits"))
			}
			next = append(next, mapped)
		}
	}
	changes := []Profile{}
	for _, p := range list {
		if folderWithin(p.Folder, r.Folder) {
			if r.Action == "remove" {
				p.Folder = ""
			} else {
				p.Folder = r.Destination + strings.TrimPrefix(p.Folder, r.Folder)
				if !validFolder(p.Folder) {
					return fail(errors.New("renamed favorite folder exceeds path limits"))
				}
			}
			changes = append(changes, p)
		}
	}
	encoded, _ := json.Marshal(folderDocument{1, next})
	if len(next) > 1000 || len(encoded) > 64*1024 {
		return fail(errors.New("favorites folders exceed storage limits"))
	}
	out.Total = len(changes) + 1
	// Each profile and the folder document is atomic. A failed batch reports the
	// completed prefix and never deletes profiles or touches credential-store IDs.
	for _, p := range changes {
		if _, err := s.save(p); err != nil {
			return fail(fmt.Errorf("folder change stopped after %d favorites: %w; reload before retrying", out.Completed, err))
		}
		out.Completed++
	}
	if err := s.saveFolders(next); err != nil {
		return fail(err)
	}
	out.Completed++
	return out
}
