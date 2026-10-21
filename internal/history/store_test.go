package history

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHistoryNeverStoresSQL(t *testing.T) {
	s := Store{Dir: t.TempDir()}
	for i := 0; i < 105; i++ {
		if err := s.Add("SELECT 'super-secret-token', 987654321 /* private */", 2, 5, true); err != nil {
			t.Fatal(err)
		}
	}
	list, err := s.List()
	if err != nil || len(list) != 100 || list[0].Kind != "SELECT" {
		t.Fatalf("history: %v %v", list, err)
	}
	raw, err := os.ReadFile(filepath.Join(s.Dir, "history.json"))
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"super-secret", "987654321", "private"} {
		if strings.Contains(string(raw), secret) {
			t.Fatal("SQL text leaked")
		}
	}
	if err = s.Clear(); err != nil {
		t.Fatal(err)
	}
	list, err = s.List()
	if err != nil || len(list) != 0 {
		t.Fatal("clear failed")
	}
	if err = os.WriteFile(filepath.Join(s.Dir, "history.json"), []byte("broken"), 0600); err != nil {
		t.Fatal(err)
	}
	if err = s.Add("SELECT 1", 1, 0, true); err == nil {
		t.Fatal("corrupt history overwritten")
	}
	if Kind("/* secret */ SELECT 1") != "STATEMENT" || Kind("secret-token") != "STATEMENT" {
		t.Fatal("unknown text stored")
	}
}
