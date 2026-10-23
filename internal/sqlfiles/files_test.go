package sqlfiles

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSQLFileRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "script.sql")
	for _, text := range []string{"SELECT '😀;';\n", "DELIMITER $$\nSELECT 1$$\n"} {
		if err := Save(path, text); err != nil {
			t.Fatal(err)
		}
		got, err := Read(path)
		if err != nil || got != text {
			t.Fatal(got, err)
		}
	}
	if err := Save(path, string([]byte{255})); err == nil {
		t.Fatal("invalid UTF-8 saved")
	}
	if err := Save(path, strings.Repeat("x", 4*1024*1024+1)); err == nil {
		t.Fatal("oversized file saved")
	}
	link := filepath.Join(dir, "link.sql")
	if err := os.Symlink(path, link); err != nil {
		t.Fatal(err)
	}
	if err := Save(link, "SELECT 2"); err == nil {
		t.Fatal("symlink overwritten")
	}
}
