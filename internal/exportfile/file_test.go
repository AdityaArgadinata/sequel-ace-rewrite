package exportfile

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriteNew(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "export.csv")
	produce := func(w io.Writer) (int64, error) { _, err := io.WriteString(w, "id\n1\n"); return 1, err }
	n, err := WriteNew(path, produce)
	if err != nil || n != 1 {
		t.Fatal(n, err)
	}
	raw, _ := os.ReadFile(path)
	if string(raw) != "id\n1\n" {
		t.Fatal(string(raw))
	}
	if _, err := WriteNew(path, produce); err == nil {
		t.Fatal("overwrote existing destination")
	}
	failed := filepath.Join(dir, "failed.csv")
	if _, err := WriteNew(failed, func(w io.Writer) (int64, error) {
		io.WriteString(w, "partial")
		return 0, errors.New("fixture failure")
	}); err == nil {
		t.Fatal("failure ignored")
	}
	if _, err := os.Stat(failed); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("failed export published")
	}
	race := filepath.Join(dir, "race.csv")
	if _, err := WriteNew(race, func(w io.Writer) (int64, error) {
		if err := os.WriteFile(race, []byte("existing"), 0600); err != nil {
			t.Fatal(err)
		}
		return produce(w)
	}); err == nil {
		t.Fatal("destination race overwritten")
	}
	raw, _ = os.ReadFile(race)
	if string(raw) != "existing" {
		t.Fatal("existing file changed")
	}
	files, _ := os.ReadDir(dir)
	for _, f := range files {
		if strings.HasPrefix(f.Name(), ".sequel-export-") {
			t.Fatal("temporary export leaked")
		}
	}
}
