package queryfavorites

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFavoritesCRUD(t *testing.T) {
	dir := t.TempDir()
	s := Store{Dir: dir}
	entry, err := s.Save(SAQueryFavorite{Name: "Report", SQL: "SELECT 'é; 😀';"})
	if err != nil {
		t.Fatal(err)
	}
	restarted := Store{Dir: dir}
	list, err := restarted.List()
	if err != nil || len(list) != 1 || list[0].SQL != entry.SQL {
		t.Fatal(list, err)
	}
	entry.SQL = "SELECT 2"
	if _, err := s.Save(entry); err != nil {
		t.Fatal(err)
	}
	if err := s.Delete(entry.ID); err != nil {
		t.Fatal(err)
	}
	list, err = s.List()
	if err != nil || len(list) != 0 {
		t.Fatal(list, err)
	}
	path := filepath.Join(dir, "query-favorites.json")
	if err := os.WriteFile(path, []byte("broken"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Save(SAQueryFavorite{Name: "x", SQL: "SELECT 1"}); err == nil {
		t.Fatal("corrupt favorites overwritten")
	}
}
