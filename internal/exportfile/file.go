// Package exportfile publishes a completed export without overwriting existing files.
package exportfile

import (
	"errors"
	"io"
	"os"
	"path/filepath"
)

func WriteNew(path string, produce func(io.Writer) (int64, error)) (int64, error) {
	if _, err := os.Lstat(path); err == nil {
		return 0, errors.New("destination exists; choose a new filename")
	} else if !errors.Is(err, os.ErrNotExist) {
		return 0, err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".sequel-export-*")
	if err != nil {
		return 0, err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	count, err := produce(file)
	if err != nil {
		return 0, err
	}
	if err := file.Sync(); err != nil {
		return 0, err
	}
	if err := file.Close(); err != nil {
		return 0, err
	}
	// A hard link atomically publishes the complete file and refuses existing names.
	// shortcut: filesystems without hard-link support need a future platform no-replace rename adapter.
	if err := os.Link(file.Name(), path); err != nil {
		return 0, err
	}
	return count, nil
}
