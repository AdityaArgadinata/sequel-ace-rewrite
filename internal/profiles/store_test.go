package profiles

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

func fixture() Profile {
	return Profile{Name: "Development", Host: "127.0.0.1", Port: 3306, User: "alice", TLS: true}
}

func TestCRUDAndNoPassword(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "profiles")
	store := NewStore(dir)
	if list, err := store.List(); err != nil || len(list) != 0 {
		t.Fatalf("empty store: %v %v", list, err)
	}
	var p Profile
	if err := json.Unmarshal([]byte(`{"name":" Development ","host":" localhost ","port":3306,"user":"alice","tls":true,"password":"never-persist-this-secret"}`), &p); err != nil {
		t.Fatal(err)
	}
	saved, err := store.Save(p)
	if err != nil {
		t.Fatal(err)
	}
	if !validID(saved.ID) || saved.Name != "Development" || saved.Host != "localhost" {
		t.Fatalf("invalid saved profile: %#v", saved)
	}
	path := filepath.Join(dir, saved.ID+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "password") || strings.Contains(string(data), "never-persist-this-secret") {
		t.Fatal("password leaked to disk")
	}
	if runtime.GOOS != "windows" {
		info, _ := os.Stat(path)
		if info.Mode().Perm() != 0600 {
			t.Fatalf("profile permissions: %v", info.Mode())
		}
	}
	restarted := NewStore(dir)
	list, err := restarted.List()
	if err != nil || len(list) != 1 || !reflect.DeepEqual(list[0], saved) {
		t.Fatalf("restart: %#v %v", list, err)
	}
	saved.Host, saved.Name = "db.example.test", "Updated"
	updated, err := restarted.Save(saved)
	if err != nil || updated.ID != saved.ID {
		t.Fatalf("update: %#v %v", updated, err)
	}
	list, err = store.List()
	if err != nil || len(list) != 1 || list[0].Host != saved.Host {
		t.Fatalf("update not persisted: %#v %v", list, err)
	}
	if err := store.Delete(saved.ID); err != nil {
		t.Fatal(err)
	}
	if list, err = restarted.List(); err != nil || len(list) != 0 {
		t.Fatalf("delete: %#v %v", list, err)
	}
	if _, err := store.Save(updated); !os.IsNotExist(err) {
		t.Fatalf("stale edit recreated a deleted profile: %v", err)
	}
}

func TestInvalidAndUnreadableProfilesPreserved(t *testing.T) {
	dir := t.TempDir()
	store := NewStore(dir)
	p, err := store.Save(fixture())
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, p.ID+".json")
	good, _ := os.ReadFile(path)
	for _, id := range []string{"../outside", "", strings.Repeat("A", 32), strings.Repeat("g", 32)} {
		if err := store.Delete(id); err == nil {
			t.Fatalf("invalid delete ID accepted: %q", id)
		}
		if id != "" {
			bad := fixture()
			bad.ID = id
			if _, err := store.Save(bad); err == nil {
				t.Fatalf("invalid save ID accepted: %q", id)
			}
		}
	}
	for _, data := range []string{
		`{broken`,
		strings.Replace(string(good), `"version": 1`, `"version": 2`, 1),
		strings.Replace(string(good), `"user": "alice"`, `"user": "alice", "password": "unexpected"`, 1),
		string(good) + ` {}`,
		strings.Repeat("x", 65537),
	} {
		if err := os.WriteFile(path, []byte(data), 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := store.List(); err == nil {
			t.Fatal("corrupt/unknown profile silently accepted")
		}
		if _, err := store.Save(p); err == nil {
			t.Fatal("unreadable profile overwritten")
		}
		if err := store.Delete(p.ID); err == nil {
			t.Fatal("unreadable profile deleted")
		}
		after, _ := os.ReadFile(path)
		if string(after) != data {
			t.Fatal("failed operation changed existing data")
		}
	}
}

func TestValidationAndWriteFailure(t *testing.T) {
	store := NewStore(t.TempDir())
	for _, change := range []func(*Profile){
		func(p *Profile) { p.Name = " " }, func(p *Profile) { p.Name = strings.Repeat("a", 101) },
		func(p *Profile) { p.Host = " " }, func(p *Profile) { p.User = "" },
		func(p *Profile) { p.Port = 0 }, func(p *Profile) { p.Port = 65536 },
		func(p *Profile) { p.CAPEM = "not a certificate" },
		func(p *Profile) { p.TLS = false; p.CAPEM = "certificate" },
	} {
		p := fixture()
		change(&p)
		if _, err := store.Save(p); err == nil {
			t.Fatal("invalid profile accepted")
		}
	}
	file := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(file, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := NewStore(file).Save(fixture()); err == nil {
		t.Fatal("write failure not reported")
	}
	data, _ := os.ReadFile(file)
	if string(data) != "keep" {
		t.Fatal("failed save changed existing data")
	}
}

func TestCertificatesOnly(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	cert := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "fixture"}, NotBefore: time.Now(), NotAfter: time.Now().Add(time.Hour)}
	der, err := x509.CreateCertificate(rand.Reader, cert, cert, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	p := fixture()
	p.CAPEM = string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
	if err := validate(p); err != nil {
		t.Fatal(err)
	}
	for _, extra := range []string{"secret text", string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: []byte("private")}))} {
		bad := p
		bad.CAPEM += extra
		if err := validate(bad); err == nil {
			t.Fatal("non-certificate data accepted in CA bundle")
		}
	}
}

func TestConcurrentCreatesAndDeterministicList(t *testing.T) {
	dir := t.TempDir()
	store := NewStore(dir)
	var group sync.WaitGroup
	for i := 0; i < 20; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			if _, err := store.Save(fixture()); err != nil {
				t.Error(err)
			}
		}()
	}
	group.Wait()
	list, err := store.List()
	if err != nil || len(list) != 20 {
		t.Fatalf("profiles lost: %d %v", len(list), err)
	}
	again, err := NewStore(dir).List()
	if err != nil || !reflect.DeepEqual(list, again) {
		t.Fatal("list order changed between reads")
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 20 {
		t.Fatal("temporary files left behind")
	}
}
