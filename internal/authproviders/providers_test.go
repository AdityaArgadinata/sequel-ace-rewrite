package authproviders

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestVaultCredentialsAndRedirects(t *testing.T) {
	calls := 0
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Header.Get("X-Vault-Token") != "secret" || r.Header.Get("X-Vault-Namespace") != "team" || r.URL.Path != "/v1/database/creds/reader" {
			t.Error("invalid request")
		}
		fmt.Fprint(w, `{"data":{"username":"dynamic-user","password":"dynamic-secret"}}`)
	}))
	defer server.Close()
	options := SAOptions{Settings: SASettings{Provider: "vault", VaultAddress: server.URL, VaultMount: "database", VaultRole: "reader", VaultNamespace: "team"}, VaultToken: "secret"}
	client := server.Client()
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	user, password, err := vaultCredentials(context.Background(), options, client)
	if err != nil || user != "dynamic-user" || password != "dynamic-secret" || calls != 1 {
		t.Fatal(user, err, calls)
	}
	if _, _, err = Resolve(context.Background(), options, "db", 3306, "root"); err == nil || strings.Contains(err.Error(), "secret") {
		t.Fatal("untrusted certificate accepted or secret exposed", err)
	}
	targetCalls := 0
	redirect := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		targetCalls++
		http.Redirect(w, r, server.URL, http.StatusFound)
	}))
	defer redirect.Close()
	options.Settings.VaultAddress = redirect.URL
	client = redirect.Client()
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	if _, _, err = vaultCredentials(context.Background(), options, client); err == nil || targetCalls != 1 || calls != 1 {
		t.Fatal("redirect followed", err, calls, targetCalls)
	}
	for _, address := range []string{"http://localhost:8200", "https://token@host", "https://host/path", "https://host?q=secret"} {
		options.Settings.VaultAddress = address
		if Validate(options.Settings) == nil {
			t.Fatal("unsafe address accepted", address)
		}
	}
}
func TestAWSCLIInvocation(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake AWS CLI uses a POSIX shell; native Windows CLI QA is separate")
	}
	dir := t.TempDir()
	script := `#!/bin/sh
if [ "$1" != rds ] || [ "$2" != generate-db-auth-token ]; then exit 1; fi
printf '%s\n' 'fixture.example:3306/?Action=connect&token=temporary'
`
	if err := os.WriteFile(filepath.Join(dir, "aws"), []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir)
	user, token, err := Resolve(context.Background(), SAOptions{Settings: SASettings{Provider: "aws", Region: "us-east-1", AWSProfile: "team"}}, "fixture.example", 3306, "iam-user")
	if err != nil || user != "iam-user" || !strings.Contains(token, "temporary") {
		t.Fatal(user, err)
	}
	t.Setenv("PATH", t.TempDir())
	if _, _, err = Resolve(context.Background(), SAOptions{Settings: SASettings{Provider: "aws", Region: "us-east-1"}}, "fixture", 3306, "u"); err == nil {
		t.Fatal("missing CLI accepted")
	}
}
