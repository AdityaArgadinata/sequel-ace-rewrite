package sqlfiles

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"sequel-rewrite/internal/sqlscript"
	"strings"
	"unicode/utf8"
)

func Validate(text string) error {
	if len(text) > sqlscript.MaxBytes || !utf8.ValidString(text) || strings.ContainsRune(text, 0) {
		return errors.New("SQL files must be UTF-8 text without NUL and at most 4 MiB")
	}
	return nil
}
func Read(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() || info.Size() > sqlscript.MaxBytes {
		return "", errors.New("SQL file must be a regular file of at most 4 MiB")
	}
	data, err := io.ReadAll(io.LimitReader(file, sqlscript.MaxBytes+1))
	if err != nil {
		return "", err
	}
	text := string(data)
	return text, Validate(text)
}

// The caller obtains the destination from the desktop Save dialog, including
// the platform's overwrite confirmation. Never write the existing file in place.
func Save(path, text string) error {
	if err := Validate(text); err != nil {
		return err
	}
	if info, err := os.Lstat(path); err == nil && !info.Mode().IsRegular() {
		return errors.New("SQL destination is not a regular file")
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".sequel-sql-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	if _, err := file.WriteString(text); err != nil {
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
