package nativefiles

import (
	"bytes"
	"howett.net/plist"
	"os"
	"strings"
	"testing"
)

func TestNativeFavoritesFixtures(t *testing.T) {
	for _, format := range []string{"xml", "binary"} {
		data, err := os.ReadFile("testdata/favorites-" + format + ".plist")
		if err != nil {
			t.Fatal(err)
		}
		got, err := ReadFavorites(data)
		if err != nil || len(got) != 2 || got[0].Profile.Name != "Group / Fixture" || got[0].Profile.Port != 3307 || got[0].Issue != "" || got[1].Issue == "" {
			t.Fatal(got, err)
		}
		encoded, _ := plist.Marshal(got[0].Profile, plist.XMLFormat)
		if bytes.Contains(encoded, []byte("must-not-import")) || bytes.Contains(encoded, []byte("never-follow")) {
			t.Fatal("credentials migrated")
		}
	}
}
func TestNativeSPFFixturesAndCompatibleSave(t *testing.T) {
	for _, format := range []string{"xml", "binary"} {
		data, err := os.ReadFile("testdata/session-" + format + ".plist")
		if err != nil {
			t.Fatal(err)
		}
		got, err := ReadSPF(data)
		if err != nil || got.Database != "sample" || got.Table != "people" || got.View != "content" || got.SQL != "SELECT 'é;😀';" {
			t.Fatal(got, err)
		}
		saved, err := WriteSPF(got)
		if err != nil {
			t.Fatal(err)
		}
		var root map[string]any
		if _, err := plist.Unmarshal(saved, &root); err != nil {
			t.Fatal(err)
		}
		if root["format"] != "connection" || truth(root["auto_connect"]) || truth(root["encrypted"]) {
			t.Fatal(root)
		}
		if bytes.Contains(saved, []byte("must-not-import")) || bytes.Contains(saved, []byte("kcid")) {
			t.Fatal("secret in saved SPF")
		}
		round, err := ReadSPF(saved)
		if err != nil || round.SQL != got.SQL || round.Table != got.Table {
			t.Fatal(round, err)
		}
	}
}
func TestNativeRejectsUnsupportedFormats(t *testing.T) {
	for _, data := range [][]byte{[]byte("no plist"), []byte(strings.Repeat("x", MaxBytes+1))} {
		if _, err := ReadSPF(data); err == nil {
			t.Fatal("bad file accepted")
		}
	}
	root := map[string]any{"version": 1, "format": "connection", "encrypted": true, "data": []byte("ciphertext")}
	data, _ := plist.Marshal(root, plist.XMLFormat)
	if _, err := ReadSPF(data); err == nil {
		t.Fatal("encrypted SPF accepted")
	}
}

func TestLargeSPFRemainsReadableWhenXMLWouldExceedLimit(t *testing.T) {
	data, err := os.ReadFile("testdata/session-xml.plist")
	if err != nil {
		t.Fatal(err)
	}
	state, err := ReadSPF(data)
	if err != nil {
		t.Fatal(err)
	}
	state.SQL = strings.Repeat("<&", 1024*1024)
	encoded, err := WriteSPF(state)
	if err != nil || len(encoded) > MaxBytes || !bytes.HasPrefix(encoded, []byte("bplist")) {
		t.Fatal(len(encoded), err)
	}
	got, err := ReadSPF(encoded)
	if err != nil || got.SQL != state.SQL {
		t.Fatal("large SPF could not round trip", err)
	}
}

func TestSSHKeyPathIsOnlyMetadataAndDoesNotOpenFiles(t *testing.T) {
	fixture := map[string]any{"SPConnectionFavorites": []any{map[string]any{"type": 2, "name": "SSH", "host": "db.invalid", "user": "fixture", "port": 3306, "sshHost": "ssh.invalid", "sshUser": "fixture", "sshPort": 22, "sshKeyLocationEnabled": true, "sshKeyLocation": "/does/not/exist/key"}}}
	data, err := plist.Marshal(fixture, plist.XMLFormat)
	if err != nil {
		t.Fatal(err)
	}
	candidates, err := ReadFavorites(data)
	if err != nil || len(candidates) != 1 || candidates[0].Issue != "" || candidates[0].Profile.SSH.KeyFile != "/does/not/exist/key" {
		t.Fatal(candidates, err)
	}
	state := SASession{Profile: candidates[0].Profile, SQL: "SELECT 1;", View: "query"}
	saved, err := WriteSPF(state)
	if err != nil {
		t.Fatal(err)
	}
	got, err := ReadSPF(saved)
	if err != nil || got.Profile.SSH == nil || got.Profile.SSH.KeyFile != "/does/not/exist/key" {
		t.Fatal(got, err)
	}
}
