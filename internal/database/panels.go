package database

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"sequel-rewrite/internal/sqlscript"
)

// Administration plans are session-local, single-use and never persist passwords.
type SAAdminRequest struct {
	Kind       string   `json:"kind"`
	Action     string   `json:"action"`
	Database   string   `json:"database"`
	Table      string   `json:"table"`
	Name       string   `json:"name"`
	Timing     string   `json:"timing"`
	Event      string   `json:"event"`
	Body       string   `json:"body"`
	Engine     string   `json:"engine"`
	Collation  string   `json:"collation"`
	Comment    string   `json:"comment"`
	User       string   `json:"user"`
	Host       string   `json:"host"`
	Password   string   `json:"password"`
	Privileges []string `json:"privileges"`
}
type saAdminPending struct {
	request                         SAAdminRequest
	statement, preview, token, mode string
	snapshot                        [32]byte
}
type SAActivity struct {
	Time       string `json:"time"`
	Operation  string `json:"operation"`
	DurationMS int64  `json:"durationMS"`
	Success    bool   `json:"success"`
}

func (s *Session) recordActivity(operation string, started time.Time, success bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.activity = append(s.activity, SAActivity{time.Now().UTC().Format(time.RFC3339), operation, time.Since(started).Milliseconds(), success})
	if len(s.activity) > 500 {
		s.activity = append([]SAActivity(nil), s.activity[len(s.activity)-500:]...)
	}
}
func (s *Session) Activity(clear bool) []SAActivity {
	s.mu.Lock()
	defer s.mu.Unlock()
	if clear {
		s.activity = nil
	}
	return append([]SAActivity{}, s.activity...)
}
func (s *Session) Panel(kind, db, table, user, host string) (Result, error) {
	switch kind {
	case "help":
		if len(user) > 256 || !utf8.ValidString(user) || strings.ContainsRune(user, 0) {
			return Result{}, errors.New("help topic exceeds 256 bytes")
		}
		mode, err := s.SQLMode()
		if err != nil {
			return Result{}, err
		}
		return s.execute("HELP "+adminString(user, mode), nil, nil, true)
	case "triggers":
		return s.execute(`SELECT TRIGGER_NAME, ACTION_TIMING, EVENT_MANIPULATION, ACTION_STATEMENT, SQL_MODE, DEFINER FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=? AND EVENT_OBJECT_TABLE=? ORDER BY TRIGGER_NAME`, []any{db, table}, nil, true)
	case "info":
		return s.execute(`SELECT TABLE_NAME, TABLE_TYPE, ENGINE, ROW_FORMAT, TABLE_ROWS, AVG_ROW_LENGTH, DATA_LENGTH, INDEX_LENGTH, DATA_FREE, AUTO_INCREMENT, CREATE_TIME, UPDATE_TIME, TABLE_COLLATION, CREATE_OPTIONS, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`, []any{db, table}, nil, true)
	case "engines":
		return s.execute("SHOW ENGINES", nil, nil, true)
	case "collations":
		return s.executeWithRowLimit("SHOW COLLATION", nil, nil, true, MaxCatalogRows)
	case "users":
		return s.executeWithRowLimit("SELECT User, Host FROM mysql.user ORDER BY User, Host", nil, nil, true, MaxCatalogRows)
	case "grants":
		if !accountPart(user) || !accountPart(host) {
			return Result{}, errors.New("select an account")
		}
		mode, err := s.SQLMode()
		if err != nil {
			return Result{}, err
		}
		return s.execute("SHOW GRANTS FOR "+adminString(user, mode)+"@"+adminString(host, mode), nil, nil, true)
	}
	return Result{}, errors.New("unknown information panel")
}
func accountPart(v string) bool {
	return len(v) <= 255 && utf8.ValidString(v) && !strings.ContainsRune(v, 0)
}
func adminString(v, mode string) string {
	if !strings.Contains(","+strings.ToUpper(mode)+",", ",NO_BACKSLASH_ESCAPES,") {
		v = strings.ReplaceAll(v, "\\", "\\\\")
	}
	return "'" + strings.ReplaceAll(v, "'", "''") + "'"
}

var adminPrivileges = map[string]bool{"SELECT": true, "INSERT": true, "UPDATE": true, "DELETE": true, "CREATE": true, "DROP": true, "ALTER": true, "INDEX": true, "REFERENCES": true, "TRIGGER": true, "CREATE VIEW": true, "SHOW VIEW": true, "EXECUTE": true, "CREATE ROUTINE": true, "ALTER ROUTINE": true, "EVENT": true}

func adminSQL(r SAAdminRequest, mode string) (string, string, error) {
	fail := func() (string, string, error) { return "", "", errors.New("invalid administration request") }
	if r.Kind == "trigger" {
		if !validName(r.Database) || !validName(r.Table) || !validName(r.Name) {
			return fail()
		}
		if r.Action == "drop" {
			v := "DROP TRIGGER " + qualified(r.Database, r.Name)
			return v, v, nil
		}
		if r.Action != "create" || (r.Timing != "BEFORE" && r.Timing != "AFTER") || (r.Event != "INSERT" && r.Event != "UPDATE" && r.Event != "DELETE") || strings.Contains(r.Body, "$$") {
			return fail()
		}
		v := "CREATE TRIGGER " + qualified(r.Database, r.Name) + " " + r.Timing + " " + r.Event + " ON " + qualified(r.Database, r.Table) + " FOR EACH ROW " + r.Body
		stmts, err := sqlscript.Parse("DELIMITER $$\n"+v+"$$\nDELIMITER ;", mode)
		if err != nil || len(stmts) != 1 {
			return "", "", errors.New("enter one complete trigger body (a statement or BEGIN…END)")
		}
		return v, v, nil
	}
	if r.Kind == "info" {
		if r.Action != "edit" || !validName(r.Database) || !validName(r.Table) || len(r.Comment) > 2048 || !utf8.ValidString(r.Comment) || strings.ContainsRune(r.Comment, 0) {
			return fail()
		}
		parts := []string{"COMMENT=" + adminString(r.Comment, mode)}
		if r.Engine != "" {
			if !validName(r.Engine) {
				return fail()
			}
			parts = append(parts, "ENGINE="+quoteIdentifier(r.Engine))
		}
		if r.Collation != "" {
			if !validName(r.Collation) {
				return fail()
			}
			parts = append(parts, "COLLATE="+quoteIdentifier(r.Collation))
		}
		v := "ALTER TABLE " + qualified(r.Database, r.Table) + " " + strings.Join(parts, ", ")
		return v, v, nil
	}
	if r.Kind != "user" || !accountPart(r.User) || !accountPart(r.Host) || r.Host == "" {
		return fail()
	}
	account := adminString(r.User, mode) + "@" + adminString(r.Host, mode)
	switch r.Action {
	case "create", "password":
		if r.Password == "" || len(r.Password) > 4096 || !utf8.ValidString(r.Password) || strings.ContainsRune(r.Password, 0) {
			return fail()
		}
		prefix := "CREATE USER "
		if r.Action == "password" {
			prefix = "ALTER USER "
		}
		return prefix + account + " IDENTIFIED BY " + adminString(r.Password, mode), prefix + account + " IDENTIFIED BY '[password hidden]'", nil
	case "drop":
		v := "DROP USER " + account
		return v, v, nil
	case "grant", "revoke":
		if !validName(r.Database) || len(r.Privileges) == 0 {
			return fail()
		}
		for _, p := range r.Privileges {
			if !adminPrivileges[p] {
				return fail()
			}
		}
		scope := quoteIdentifier(r.Database) + ".*"
		if r.Table != "" {
			if !validName(r.Table) {
				return fail()
			}
			scope = qualified(r.Database, r.Table)
		}
		verb, end := "GRANT ", " TO "
		if r.Action == "revoke" {
			verb, end = "REVOKE ", " FROM "
		}
		v := verb + strings.Join(r.Privileges, ", ") + " ON " + scope + end + account
		return v, v, nil
	}
	return fail()
}
func (s *Session) adminSnapshot(ctx context.Context, r SAAdminRequest) ([32]byte, error) {
	// Fetch complete trigger/account metadata inside the same serialized operation.
	if r.Kind == "trigger" && r.Action == "drop" {
		var count int
		if err := s.conn.QueryRowContext(ctx, "SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=? AND TRIGGER_NAME=? AND EVENT_OBJECT_TABLE=?", r.Database, r.Name, r.Table).Scan(&count); err != nil {
			return [32]byte{}, s.queryError(err)
		}
		if count != 1 {
			return [32]byte{}, errors.New("selected trigger does not belong to this table; reload triggers")
		}
	}
	query := `SELECT TRIGGER_NAME,ACTION_TIMING,EVENT_MANIPULATION,ACTION_STATEMENT,SQL_MODE,DEFINER FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=? AND EVENT_OBJECT_TABLE=? ORDER BY TRIGGER_NAME`
	args := []any{r.Database, r.Table}
	var prefix string
	if r.Kind == "user" {
		query = "SELECT User,Host,plugin,authentication_string FROM mysql.user WHERE User=? AND Host=?"
		args = []any{r.User, r.Host}
	} else {
		source, _, err := s.schemaSnapshot(ctx, r.Database, r.Table)
		if err != nil {
			return [32]byte{}, err
		}
		prefix = fmt.Sprintf("%x", schemaFingerprint(source, ""))
	}
	rows, err := s.queryContext(ctx, query, args...)
	if err != nil {
		return [32]byte{}, s.queryError(err)
	}
	cols, err := rows.Columns()
	if err != nil {
		rows.Close()
		return [32]byte{}, s.queryError(err)
	}
	data := [][]string{}
	size := 0
	for rows.Next() {
		values := make([]string, len(cols))
		ptr := make([]any, len(cols))
		for i := range values {
			ptr[i] = &values[i]
		}
		if err = rows.Scan(ptr...); err != nil {
			break
		}
		for _, v := range values {
			size += len(v)
		}
		if size > MaxResultBytes || len(data) >= MaxCatalogRows {
			err = errors.New("administration metadata exceeds limits")
			break
		}
		data = append(data, values)
	}
	if err == nil {
		err = rows.Err()
	}
	closeErr := rows.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return [32]byte{}, s.queryError(err)
	}
	if r.Kind == "user" && len(data) > 0 {
		// Includes privileges so a concurrent grant/revoke invalidates the preview.
		var mode string
		if err = s.conn.QueryRowContext(ctx, "SELECT @@session.sql_mode").Scan(&mode); err != nil {
			return [32]byte{}, s.queryError(err)
		}
		grants, err := s.queryContext(ctx, "SHOW GRANTS FOR "+adminString(r.User, mode)+"@"+adminString(r.Host, mode))
		if err != nil {
			return [32]byte{}, s.queryError(err)
		}
		for grants.Next() {
			var v string
			if err = grants.Scan(&v); err != nil {
				break
			}
			data = append(data, []string{v})
		}
		if err == nil {
			err = grants.Err()
		}
		grants.Close()
		if err != nil {
			return [32]byte{}, s.queryError(err)
		}
	}
	encoded, _ := json.Marshal(data)
	return sha256.Sum256(append([]byte(prefix), encoded...)), nil
}
func (s *Session) PrepareAdmin(r SAAdminRequest) (SASchemaPlan, error) {
	ctx, done, err := s.begin()
	if err != nil {
		return SASchemaPlan{}, err
	}
	defer done()
	s.adminPending = nil
	mode, err := s.writeReady(ctx)
	if err != nil {
		return SASchemaPlan{}, err
	}
	statement, preview, err := adminSQL(r, mode)
	if err != nil {
		return SASchemaPlan{}, err
	}
	snapshot, err := s.adminSnapshot(ctx, r)
	if err != nil {
		return SASchemaPlan{}, err
	}
	token, err := newPlanToken()
	if err != nil {
		return SASchemaPlan{}, err
	}
	// Remove the duplicate plaintext from the request retained for snapshot checks.
	r.Password = ""
	s.adminPending = &saAdminPending{r, statement, preview, token, mode, snapshot}
	return SASchemaPlan{Token: token, SQL: preview}, nil
}
func (s *Session) ApplyAdmin(token string) (string, error) {
	ctx, done, err := s.begin()
	if err != nil {
		return "", err
	}
	defer done()
	p := s.adminPending
	if p == nil || token == "" || p.token != token {
		return "", errors.New("administration preview expired")
	}
	s.adminPending = nil
	mode, err := s.writeReady(ctx)
	if err != nil {
		return "", err
	}
	snapshot, err := s.adminSnapshot(ctx, p.request)
	if err != nil {
		return "", err
	}
	if mode != p.mode || snapshot != p.snapshot {
		return "", errors.New("metadata changed; reload and prepare again")
	}
	started := time.Now()
	_, err = s.execContext(ctx, p.statement)
	s.recordActivity("Administration: "+p.request.Kind+" "+p.request.Action, started, err == nil)
	if err != nil {
		return "", s.queryError(err)
	}
	warnings, err := s.exchangeWarnings(ctx)
	if err != nil {
		return "", fmt.Errorf("change acknowledged but warnings unavailable: %w", err)
	}
	return warnings, nil
}
