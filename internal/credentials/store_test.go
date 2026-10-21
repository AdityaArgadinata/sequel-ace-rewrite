package credentials

import (
	"errors"
	"github.com/zalando/go-keyring"
	"os"
	"sequel-rewrite/internal/profiles"
	"testing"
)

func TestCredentialBindingAndUnavailable(t *testing.T) {
	values := map[string]string{}
	s := &Store{get: func(_, id string) (string, error) {
		v, ok := values[id]
		if !ok {
			return "", keyring.ErrNotFound
		}
		return v, nil
	}, set: func(_, id, value string) error { values[id] = value; return nil }, remove: func(_, id string) error { delete(values, id); return nil }}
	p := profiles.Profile{ID: "fixture", Host: "localhost", Port: 3306, User: "root"}
	secret := Secrets{Password: "fixture-secret", SSHPassword: "ssh-secret", KeyPassphrase: "phrase"}
	if err := s.Save(p, secret); err != nil {
		t.Fatal(err)
	}
	loaded, err := s.Load(p)
	if err != nil || loaded != secret {
		t.Fatal("roundtrip failed")
	}
	p.Host = "other-host"
	if _, err = s.Load(p); err == nil {
		t.Fatal("password reused for changed identity")
	}
	s.set = func(string, string, string) error { return errors.New("raw secret error") }
	if err = s.Save(p, secret); err == nil || err.Error() == "raw secret error" {
		t.Fatal("unsafe unavailable error")
	}
	if err = s.Delete(p.ID); err != nil {
		t.Fatal(err)
	}
}
func TestNativeVault(t *testing.T) {
	if os.Getenv("SEQUEL_TEST_KEYRING") != "1" {
		t.Skip("native credential store opt-in")
	}
	store := profiles.NewStore(t.TempDir())
	p, err := store.Save(profiles.Profile{Name: "Disposable keyring QA", Host: "127.0.0.1", Port: 3306, User: "fixture"})
	if err != nil {
		t.Fatal(err)
	}
	s := New()
	defer s.Delete(p.ID)
	want := Secrets{Password: "disposable-not-a-real-password"}
	if err = s.Save(p, want); err != nil {
		t.Fatal(err)
	}
	got, err := s.Load(p)
	if err != nil || got != want {
		t.Fatal("native vault roundtrip failed")
	}
	if err = s.Delete(p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Load(p); err == nil {
		t.Fatal("deleted secret returned")
	}
}
