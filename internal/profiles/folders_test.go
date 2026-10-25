package profiles

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestFolderOperationsRetainProfileIdentity(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	p, err := s.Save(Profile{Name: "one", Host: "localhost", Port: 3306, User: "root", Folder: "Work/Dev", Color: "red", TimeZone: "+07:00"})
	if err != nil {
		t.Fatal(err)
	}
	q, err := s.Save(Profile{Name: "two", Host: "elsewhere", Port: 3307, User: "reader", Folder: "Work/Prod", InitialDatabase: "db"})
	if err != nil {
		t.Fatal(err)
	}
	if out := s.ChangeFolder(FolderChange{Action: "create", Folder: "Empty/Nested"}); out.Error != "" {
		t.Fatal(out)
	}
	if got, err := s.ListFolders(); err != nil || !reflect.DeepEqual(got, []string{"Empty", "Empty/Nested", "Work", "Work/Dev", "Work/Prod"}) {
		t.Fatal(got, err)
	}
	out := s.ChangeFolder(FolderChange{Action: "rename", Folder: "Work", Destination: "Personal/Servers"})
	if out.Error != "" || out.Completed != 3 {
		t.Fatal(out)
	}
	got, _ := s.Get(p.ID)
	expected := p
	expected.Folder = "Personal/Servers/Dev"
	if !reflect.DeepEqual(got, expected) {
		t.Fatal(got, expected)
	}
	out = s.ChangeFolder(FolderChange{Action: "remove", Folder: "Personal"})
	if out.Error != "" || out.Completed != 3 {
		t.Fatal(out)
	}
	for _, id := range []string{p.ID, q.ID} {
		got, err := s.Get(id)
		if err != nil || got.Folder != "" {
			t.Fatal(got, err)
		}
	}
	// New instances still read the original v1 profile files and persisted empty folders.
	again := NewStore(dir)
	folders, err := again.ListFolders()
	if err != nil || !reflect.DeepEqual(folders, []string{"Empty", "Empty/Nested"}) {
		t.Fatal(folders, err)
	}
}
func TestFolderChangesFailBeforeMutatingUnreadableProfiles(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	p, err := s.Save(Profile{Name: "one", Host: "h", Port: 1, User: "u", Folder: "A/Child"})
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range []FolderChange{{Action: "rename", Folder: "A", Destination: "A/Child/Loop"}, {Action: "create", Folder: "../x"}, {Action: "create", Folder: "A//B"}, {Action: "create", Folder: " A"}, {Action: "rename", Folder: "A/Child", Destination: "A"}} {
		if out := s.ChangeFolder(r); out.Error == "" {
			t.Fatal(r, out)
		}
	}
	before, _ := os.ReadFile(filepath.Join(dir, p.ID+".json"))
	if err := os.WriteFile(filepath.Join(dir, "00000000000000000000000000000000.json"), []byte(`{"version":999}`), 0600); err != nil {
		t.Fatal(err)
	}
	if out := s.ChangeFolder(FolderChange{Action: "rename", Folder: "A", Destination: "B"}); out.Error == "" || out.Completed != 0 {
		t.Fatal(out)
	}
	after, _ := os.ReadFile(filepath.Join(dir, p.ID+".json"))
	if string(before) != string(after) {
		t.Fatal("partial mutation before validation")
	}
}
func TestUnknownFolderDocumentIsNotOverwritten(t *testing.T) {
	dir := t.TempDir()
	s := NewStore(dir)
	file := filepath.Join(dir, ".folders-v1")
	before := []byte(`{"version":2,"folders":[]}`)
	os.WriteFile(file, before, 0600)
	if out := s.ChangeFolder(FolderChange{Action: "create", Folder: "A"}); out.Error == "" {
		t.Fatal(out)
	}
	after, _ := os.ReadFile(file)
	if string(before) != string(after) {
		t.Fatal("overwrote future document")
	}
}
