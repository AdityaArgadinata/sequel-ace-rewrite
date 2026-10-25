package cellfiles

import (
	"bytes"
	"os"
	"path/filepath"
	"sequel-rewrite/internal/database"
	"testing"
)

func TestCellFileRoundTrip(t *testing.T) {
	for _, tc := range []struct {
		name   string
		raw    []byte
		binary bool
	}{
		{"empty text", []byte{}, false}, {"text", []byte("\ufeffé😀\r\n\x00"), false}, {"empty binary", []byte{}, true}, {"binary", []byte{0, 255, 13, 10, 239, 187, 191}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			source := filepath.Join(dir, "input")
			target := filepath.Join(dir, "output")
			if err := os.WriteFile(source, tc.raw, 0600); err != nil {
				t.Fatal(err)
			}
			c, err := Read(source, tc.binary)
			if err != nil || c.Null || c.Binary != tc.binary {
				t.Fatal(c, err)
			}
			if err = Write(target, c); err != nil {
				t.Fatal(err)
			}
			out, err := os.ReadFile(target)
			if err != nil || !bytes.Equal(out, tc.raw) {
				t.Fatal(out, err)
			}
			if err = Write(target, database.Cell{Value: "changed"}); err == nil {
				t.Fatal("existing file overwritten")
			}
		})
	}
}
func TestCellFileValidation(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "input")
	if err := os.WriteFile(source, []byte{255}, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := Read(source, false); err == nil {
		t.Fatal("invalid UTF-8 accepted as text")
	}
	if _, err := Read(dir, true); err == nil {
		t.Fatal("directory accepted")
	}
	file, err := os.Create(source)
	if err != nil {
		t.Fatal(err)
	}
	if err = file.Truncate(database.MaxResultBytes); err != nil {
		t.Fatal(err)
	}
	file.Close()
	if _, err = Read(source, true); err == nil {
		t.Fatal("binary import exceeded encoded limit")
	}
	for _, c := range []database.Cell{{Null: true}, {Value: "0x0", Binary: true}, {Value: "xx", Binary: true}, {Value: string([]byte{255})}} {
		if _, err = Bytes(c); err == nil {
			t.Fatal("invalid cell exported", c)
		}
	}
}
