// Package nativefiles reads the credential-free subset of Sequel Ace's native
// favorites and SPF formats. It never follows paths, URLs or Keychain references.
package nativefiles

import (
	"bytes"
	"compress/zlib"
	"errors"
	"fmt"
	"howett.net/plist"
	"io"
	"sequel-rewrite/internal/profiles"
	"sequel-rewrite/internal/tunnel"
	"strconv"
	"strings"
	"unicode/utf8"
)

const MaxBytes = 8 * 1024 * 1024

type SASession struct {
	Profile   profiles.Profile `json:"profile"`
	Database  string           `json:"database"`
	Table     string           `json:"table"`
	View      string           `json:"view"`
	SQL       string           `json:"sql"`
	Notice    string           `json:"notice"`
	Cancelled bool             `json:"cancelled"`
}
type SACandidate struct {
	Profile  profiles.Profile `json:"profile"`
	Database string           `json:"database"`
	Issue    string           `json:"issue"`
}

func decode(data []byte) (root map[string]any, err error) {
	if len(data) > MaxBytes {
		return nil, errors.New("native file exceeds 8 MiB")
	}
	defer func() {
		if recover() != nil {
			root = nil
			err = errors.New("invalid native property list")
		}
	}()
	if _, err := plist.Unmarshal(data, &root); err != nil {
		return nil, errors.New("cannot read native XML/binary property list")
	}
	return root, nil
}
func text(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case uint64:
		return strconv.FormatUint(x, 10)
	case int64:
		return strconv.FormatInt(x, 10)
	case bool:
		if x {
			return "1"
		}
		return "0"
	}
	return ""
}
func number(v any, fallback int) int {
	n, err := strconv.Atoi(text(v))
	if err != nil {
		return fallback
	}
	return n
}
func truth(v any) bool {
	switch x := v.(type) {
	case bool:
		return x
	default:
		s := strings.ToLower(text(v))
		return s == "1" || s == "yes" || s == "true"
	}
}
func connection(m map[string]any, spf bool) (profiles.Profile, string, error) {
	p := profiles.Profile{Name: text(m["name"]), Host: text(m["host"]), User: text(m["user"]), Port: number(m["port"], 3306), TLS: truth(m["useSSL"])}
	if p.Name == "" {
		p.Name = p.Host
	}
	if len(p.Name) > 100 {
		for len(p.Name) > 100 {
			_, size := utf8.DecodeLastRuneInString(p.Name)
			p.Name = p.Name[:len(p.Name)-size]
		}
	}
	kind := number(m["type"], 0)
	kindText := text(m["type"])
	if spf {
		switch kindText {
		case "SPTCPIPConnection":
			kind = 0
		case "SPSSHTunnelConnection":
			kind = 2
		default:
			return p, "", errors.New("only TCP and SSH native connections are supported")
		}
	}
	if kind != 0 && kind != 2 {
		return p, "", errors.New("socket, IAM and Vault connections require manual setup")
	}
	for _, key := range []string{"useAWSIAMAuth", "allowDataLocalInfile", "enableClearTextPlugin", "requestServerPublicKey", "sslKeyFileLocationEnabled", "sslCertificateFileLocationEnabled", "sslCACertFileLocationEnabled"} {
		if truth(m[key]) {
			return p, "", fmt.Errorf("%s requires manual configuration; no native file paths will be opened", key)
		}
	}
	if text(m["sshRemoteSocketPath"]) != "" {
		return p, "", errors.New("SSH remote sockets require manual configuration")
	}
	if p.Host == "" || p.User == "" || p.Port < 1 || p.Port > 65535 {
		return p, "", errors.New("connection needs a valid host, user and port")
	}
	if kind == 2 {
		key := func(camel, snake string) any {
			if spf {
				return m[snake]
			}
			return m[camel]
		}
		p.SSH = &tunnel.Settings{Host: text(key("sshHost", "ssh_host")), User: text(key("sshUser", "ssh_user")), Port: number(key("sshPort", "ssh_port"), 22)}
		// A path is restored as text only. The UI requires an explicit Connect;
		// parsing/importing a document never opens the key or contacts its host.
		if truth(key("sshKeyLocationEnabled", "ssh_keyLocationEnabled")) {
			p.SSH.KeyFile = text(key("sshKeyLocation", "ssh_keyLocation"))
		}
		if err := tunnel.Validate(*p.SSH); err != nil {
			return p, "", err
		}
	}
	return p, text(m["database"]), nil
}
func ReadFavorites(data []byte) ([]SACandidate, error) {
	root, err := decode(data)
	if err != nil {
		return nil, err
	}
	var nodes []any
	if list, ok := root["SPConnectionFavorites"].([]any); ok {
		nodes = list
	} else if group, ok := root["Favorites Root"].(map[string]any); ok {
		nodes, _ = group["Children"].([]any)
	} else {
		return nil, errors.New("not a Sequel Ace favorites file")
	}
	out := []SACandidate{}
	visited := 0
	var walk func([]any, string, int) error
	walk = func(nodes []any, path string, depth int) error {
		if depth > 32 {
			return errors.New("favorites groups exceed 32 levels")
		}
		for _, node := range nodes {
			visited++
			if visited > 1000 {
				return errors.New("favorites import is limited to 1,000 nodes")
			}
			m, ok := node.(map[string]any)
			if !ok {
				return errors.New("invalid favorite node")
			}
			if children, ok := m["Children"].([]any); ok {
				group := text(m["Name"])
				if group == "" {
					group = text(m["name"])
				}
				if err := walk(children, path+group+" / ", depth+1); err != nil {
					return err
				}
				continue
			}
			p, db, err := connection(m, false)
			p.Name = path + p.Name
			for len(p.Name) > 100 {
				_, size := utf8.DecodeLastRuneInString(p.Name)
				p.Name = p.Name[:len(p.Name)-size]
			}
			candidate := SACandidate{Profile: p, Database: db}
			if err != nil {
				candidate.Issue = err.Error()
			}
			out = append(out, candidate)
		}
		return nil
	}
	if err := walk(nodes, "", 0); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return nil, errors.New("favorites file contains no connections")
	}
	return out, nil
}
func ReadSPF(data []byte) (SASession, error) {
	root, err := decode(data)
	if err != nil {
		return SASession{}, err
	}
	if text(root["format"]) != "connection" || number(root["version"], 0) != 1 {
		return SASession{}, errors.New("unsupported SPF format/version")
	}
	if truth(root["encrypted"]) {
		return SASession{}, errors.New("encrypted SPF is not supported; save a password-free unencrypted copy in Sequel Ace")
	}
	content, ok := root["data"].(map[string]any)
	if !ok {
		return SASession{}, errors.New("SPF requires an unencrypted data dictionary")
	}
	conn, ok := content["connection"].(map[string]any)
	if !ok {
		return SASession{}, errors.New("SPF has no connection")
	}
	p, db, err := connection(conn, true)
	if err != nil {
		return SASession{}, err
	}
	out := SASession{Profile: p, Database: db, View: "query", Notice: "Passwords and Keychain references were ignored. Review connection/TLS/SSH settings before connecting. Window layout, filters, selection and native history are not restored."}
	if session, ok := content["session"].(map[string]any); ok {
		out.Table = text(session["table"])
		switch text(session["view"]) {
		case "SP_VIEW_CONTENT":
			out.View = "content"
		case "SP_VIEW_STRUCTURE":
			out.View = "structure"
		}
		out.SQL = text(session["queries"])
		if compressed, ok := session["queries"].([]byte); ok {
			reader, err := zlib.NewReader(bytes.NewReader(compressed))
			if err != nil {
				return SASession{}, errors.New("invalid compressed SPF query")
			}
			raw, err := io.ReadAll(io.LimitReader(reader, 4*1024*1024+1))
			reader.Close()
			if err != nil || len(raw) > 4*1024*1024 {
				return SASession{}, errors.New("SPF query exceeds 4 MiB")
			}
			out.SQL = string(raw)
		}
	}
	if !utf8.ValidString(out.SQL) || len(out.SQL) > 4*1024*1024 || strings.ContainsRune(out.SQL, 0) {
		return SASession{}, errors.New("SPF query must be UTF-8 without NUL, at most 4 MiB")
	}
	return out, nil
}
func WriteSPF(session SASession) ([]byte, error) {
	p := session.Profile
	if p.Auth != nil || p.Socket != "" || p.TimeZone != "" || p.SSH != nil && (p.SSH.UseAgent || p.SSH.KeyboardInteractive) {
		return nil, errors.New("socket, timezone and additional SSH authentication settings cannot yet be represented by SPF export")
	}
	if p.Host == "" || p.User == "" || p.Port < 1 || p.Port > 65535 {
		return nil, errors.New("session requires host, user and port")
	}
	if !utf8.ValidString(session.SQL) || len(session.SQL) > 4*1024*1024 || strings.ContainsRune(session.SQL, 0) {
		return nil, errors.New("session SQL exceeds 4 MiB or is not UTF-8 text")
	}
	if p.CAPEM != "" || p.SSH != nil && p.SSH.KnownHosts != "" {
		return nil, errors.New("CA PEM/custom known-hosts settings need manual native configuration; session was not saved")
	}
	conn := map[string]any{"rdbms_type": "mysql", "type": "SPTCPIPConnection", "name": p.Name, "host": p.Host, "user": p.User, "port": p.Port, "useSSL": p.TLS, "database": session.Database}
	if p.SSH != nil {
		conn["type"] = "SPSSHTunnelConnection"
		conn["ssh_host"] = p.SSH.Host
		conn["ssh_user"] = p.SSH.User
		conn["ssh_port"] = p.SSH.Port
		conn["ssh_keyLocationEnabled"] = p.SSH.KeyFile != ""
		conn["ssh_keyLocation"] = p.SSH.KeyFile
	}
	view := "SP_VIEW_CUSTOMQUERY"
	if session.View == "content" {
		view = "SP_VIEW_CONTENT"
	}
	if session.View == "structure" {
		view = "SP_VIEW_STRUCTURE"
	}
	root := map[string]any{"version": uint64(1), "format": "connection", "rdbms_type": "mysql", "encrypted": false, "auto_connect": false, "data": map[string]any{"connection": conn, "session": map[string]any{"table": session.Table, "view": view, "queries": session.SQL}}}
	encoded, err := plist.Marshal(root, plist.XMLFormat)
	if err != nil {
		return nil, err
	}
	if len(encoded) > MaxBytes {
		return plist.Marshal(root, plist.BinaryFormat)
	}
	return encoded, nil
}
