package updates

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReleaseSelection(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("User-Agent") == "" || r.Header.Get("Authorization") != "" {
			t.Error("unexpected request headers")
		}
		ioText := `[{"tag_name":"v1.2.10"},{"tag_name":"v1.2.9"},{"tag_name":"v2.0.0-beta.10","prerelease":true},{"tag_name":"v2.0.0-beta.9","prerelease":true},{"tag_name":"v9.0.0","draft":true},{"tag_name":"v8.0.0-alpha"},{"tag_name":"../bad"}]`
		w.Write([]byte(ioText))
	}))
	defer server.Close()
	for _, tc := range []struct {
		current                string
		preview                bool
		latest                 string
		available, development bool
	}{{"v1.2.9", false, "v1.2.10", true, false}, {"v1.2.10", false, "v1.2.10", false, false}, {"v1.3.0", false, "v1.2.10", false, false}, {"dev-abc", false, "v1.2.10", true, true}, {"v2.0.0-beta.9", true, "v8.0.0-alpha", true, false}} {
		out, err := Check(context.Background(), server.Client(), server.URL, tc.current, tc.preview)
		if err != nil || out.Latest != tc.latest || out.Available != tc.available || out.Development != tc.development || out.URL != ReleasesURL+"/tag/"+tc.latest {
			t.Fatal(out, err)
		}
	}
}
func TestVersionOrderingAndValidation(t *testing.T) {
	ordered := []string{"v1.0.0-alpha", "v1.0.0-alpha.1", "v1.0.0-alpha.beta", "v1.0.0-beta", "v1.0.0-beta.2", "v1.0.0-beta.11", "v1.0.0-rc.1", "v1.0.0", "v1.0.1", "v1.10.0"}
	for i := 1; i < len(ordered); i++ {
		a, _ := parse(ordered[i-1])
		b, _ := parse(ordered[i])
		if compare(a, b) >= 0 {
			t.Fatal(ordered[i-1], ordered[i])
		}
	}
	for _, tag := range []string{"v01.0.0", "v1.0.0-alpha.01", "v1.0", "1.0.0", "v1.0.0/evil", "v9999999999999999999999.0.0"} {
		if _, ok := parse(tag); ok {
			t.Fatal(tag)
		}
	}
}
func TestMetadataErrorsAndNoRelease(t *testing.T) {
	for _, tc := range []struct {
		status int
		body   string
		bad    bool
	}{{403, `rate limited`, true}, {200, `[]`, false}, {200, `{"bad":true}`, true}, {200, strings.Repeat("x", 2*1024*1024+1), true}} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(tc.status); w.Write([]byte(tc.body)) }))
		out, err := Check(context.Background(), server.Client(), server.URL, "dev", false)
		server.Close()
		if (err != nil) != tc.bad {
			t.Fatal(out, err)
		}
		if !tc.bad && out.Latest != "" {
			t.Fatal(out)
		}
	}
}
