package updates

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

const Repository = "AdityaArgadinata/sequel-ace-rewrite"
const Endpoint = "https://api.github.com/repos/" + Repository + "/releases?per_page=100"
const ReleasesURL = "https://github.com/" + Repository + "/releases"

type Result struct {
	Current     string `json:"current"`
	Latest      string `json:"latest"`
	Available   bool   `json:"available"`
	Development bool   `json:"development"`
	URL         string `json:"url"`
	Preview     bool   `json:"preview"`
}
type release struct {
	Tag     string `json:"tag_name"`
	Draft   bool   `json:"draft"`
	Preview bool   `json:"prerelease"`
}
type version struct {
	core [3]uint64
	pre  []string
}

var tagPattern = regexp.MustCompile(`^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$`)

func parse(tag string) (version, bool) {
	var out version
	m := tagPattern.FindStringSubmatch(tag)
	if m == nil || len(tag) > 150 {
		return out, false
	}
	for i := 0; i < 3; i++ {
		n, e := strconv.ParseUint(m[i+1], 10, 64)
		if e != nil {
			return out, false
		}
		out.core[i] = n
	}
	if m[4] != "" {
		out.pre = strings.Split(m[4], ".")
		for _, p := range out.pre {
			if numeric(p) && len(p) > 1 && p[0] == '0' {
				return out, false
			}
		}
	}
	return out, true
}
func numeric(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return s != ""
}
func compare(a, b version) int {
	for i, n := range a.core {
		if n < b.core[i] {
			return -1
		}
		if n > b.core[i] {
			return 1
		}
	}
	if len(a.pre) == 0 {
		if len(b.pre) == 0 {
			return 0
		}
		return 1
	}
	if len(b.pre) == 0 {
		return -1
	}
	for i, x := range a.pre {
		if i >= len(b.pre) {
			return 1
		}
		y := b.pre[i]
		if x == y {
			continue
		}
		nx, ny := numeric(x), numeric(y)
		if nx && ny {
			if len(x) < len(y) {
				return -1
			}
			if len(x) > len(y) {
				return 1
			}
		} else if nx != ny {
			if nx {
				return -1
			}
			return 1
		}
		if x < y {
			return -1
		}
		return 1
	}
	if len(a.pre) < len(b.pre) {
		return -1
	}
	return 0
}

// Only release metadata is fetched. No credentials, downloads, installation or SQL.
func Check(ctx context.Context, client *http.Client, endpoint, current string, preview bool) (Result, error) {
	out := Result{Current: current, URL: ReleasesURL}
	installed, known := parse(current)
	out.Development = !known
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return out, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "sequelx-update-check")
	response, err := client.Do(req)
	if err != nil {
		return out, errors.New("update check could not reach GitHub; retry later")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return out, fmt.Errorf("GitHub update check returned HTTP %d; retry later", response.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024+1))
	if err != nil {
		return out, err
	}
	if len(data) > 2*1024*1024 {
		return out, errors.New("release metadata exceeds 2 MiB")
	}
	var releases []release
	if err := json.Unmarshal(data, &releases); err != nil || len(releases) > 100 {
		return out, errors.New("invalid GitHub release metadata")
	}
	var best version
	found := false
	for _, r := range releases {
		v, valid := parse(r.Tag)
		if !valid || r.Draft || (!preview && (r.Preview || len(v.pre) > 0)) {
			continue
		}
		if !found || compare(v, best) > 0 {
			best = v
			found = true
			out.Latest = r.Tag
			out.Preview = r.Preview || len(v.pre) > 0
		}
	}
	if found {
		out.Available = !known || compare(best, installed) > 0
		out.URL = ReleasesURL + "/tag/" + out.Latest
	}
	return out, nil
}
