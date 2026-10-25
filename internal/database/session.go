// Package database owns one pinned MySQL session, independent of the desktop UI.
package database

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"database/sql/driver"
	"encoding/hex"
	"errors"
	"fmt"
	"golang.org/x/crypto/ssh"
	"net"
	"path/filepath"
	"sequel-rewrite/internal/authproviders"
	"sequel-rewrite/internal/tunnel"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/go-sql-driver/mysql"
)

const (
	MaxRows        = 500
	MaxCatalogRows = 50000
	MaxResultBytes = 4 * 1024 * 1024
)

type Connection struct {
	Auth     *authproviders.SAOptions `json:"auth,omitempty"`
	Socket   string                   `json:"socket,omitempty"`
	TimeZone string                   `json:"timeZone,omitempty"`
	Host     string                   `json:"host"`
	Port     int                      `json:"port"`
	User     string                   `json:"user"`
	Password string                   `json:"password"`
	TLS      bool                     `json:"tls"`
	CAPEM    string                   `json:"caPEM"`
	SSH      *tunnel.Options          `json:"ssh"`
}

type Cell struct {
	Value  string `json:"value"`
	Null   bool   `json:"null"`
	Binary bool   `json:"binary"`
}

type Column struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type Result struct {
	Columns       []Column `json:"columns"`
	Rows          [][]Cell `json:"rows"`
	Truncated     bool     `json:"truncated"`
	SessionClosed bool     `json:"sessionClosed"`
	Notice        string   `json:"notice,omitempty"`
	DurationMS    int64    `json:"durationMS"`
}

// Batch contains only new rows. Offset lets consumers reject late or out-of-order
// events; Query's final result remains the authoritative complete snapshot.
type Batch struct {
	Columns []Column `json:"columns"`
	Rows    [][]Cell `json:"rows"`
	Offset  int      `json:"offset"`
}

// Session never obtains a replacement connection after the original is lost.
// Cancellation/timeout discards the session: session variables and transactions
// cannot be silently reconstructed on a new connection.
type Session struct {
	op               sync.Mutex
	mu               sync.Mutex
	cancel           context.CancelFunc
	db               *sql.DB
	conn             *sql.Conn
	transaction      bool
	txUnverified     bool
	failed           bool
	schemaPending    *saSchemaPending
	objectPending    *saObjectPending
	csvPending       *saCSVPending
	sqlImportPending *saSQLImportPending
	adminPending     *saAdminPending
	activity         []SAActivity
	tunnel           *ssh.Client
}

func config(c Connection) (*mysql.Config, error) {
	if c.User == "" || (c.Socket == "" && (strings.TrimSpace(c.Host) == "" || c.Port < 1 || c.Port > 65535)) {
		return nil, errors.New("host, port (1–65535), and user are required")
	}
	cfg := mysql.NewConfig()
	cfg.Net = "tcp"
	cfg.Addr = net.JoinHostPort(strings.TrimSpace(c.Host), strconv.Itoa(c.Port))
	if c.Socket != "" {
		if !filepath.IsAbs(c.Socket) || strings.ContainsRune(c.Socket, 0) || len(c.Socket) > 103 || c.SSH != nil || c.TLS || c.CAPEM != "" {
			return nil, errors.New("UNIX socket requires an absolute path up to 103 bytes, with SSH and TLS disabled")
		}
		cfg.Net, cfg.Addr = "unix", c.Socket
	}
	if len(c.TimeZone) > 64 || strings.ContainsRune(c.TimeZone, 0) || !utf8.ValidString(c.TimeZone) {
		return nil, errors.New("invalid time zone")
	}
	if c.Auth != nil {
		if err := authproviders.Validate(c.Auth.Settings); err != nil {
			return nil, err
		}
		if !c.TLS || c.Socket != "" {
			return nil, errors.New("AWS/Vault authentication requires verified MySQL TLS")
		}
		cfg.AllowCleartextPasswords = c.Auth.Settings.Provider == "aws"
	}
	cfg.User, cfg.Passwd = c.User, c.Password
	cfg.Timeout = 10 * time.Second
	cfg.ReadTimeout, cfg.WriteTimeout = 60*time.Second, 15*time.Second
	// Limit outgoing statements; incoming rows are materialized by the driver
	// before the separate UI result limit below can be checked.
	cfg.MaxAllowedPacket = 8 * 1024 * 1024
	if c.TLS {
		cfg.TLS = &tls.Config{MinVersion: tls.VersionTLS12, ServerName: strings.TrimSpace(c.Host)}
		if c.CAPEM != "" {
			roots, err := x509.SystemCertPool()
			if err != nil {
				roots = x509.NewCertPool()
			}
			if !roots.AppendCertsFromPEM([]byte(c.CAPEM)) {
				return nil, errors.New("CA must contain a valid PEM certificate")
			}
			cfg.TLS.RootCAs = roots
		}
	} else if c.CAPEM != "" {
		return nil, errors.New("enable TLS before supplying a CA certificate")
	}
	return cfg, nil
}

// begin serializes all operations, while leaving Cancel callable from another goroutine.
func (s *Session) begin() (context.Context, func(), error) {
	if !s.op.TryLock() {
		return nil, nil, errors.New("another database operation is running")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	s.failed = false
	s.mu.Lock()
	s.cancel = cancel
	s.mu.Unlock()
	return ctx, func() {
		s.mu.Lock()
		s.cancel = nil
		s.mu.Unlock()
		if ctx.Err() != nil || s.failed {
			s.close()
		}
		cancel()
		s.op.Unlock()
	}, nil
}

func (s *Session) Connect(c Connection) error {
	ctx, done, err := s.begin()
	if err != nil {
		return err
	}
	defer done()
	if s.conn != nil {
		return errors.New("disconnect the current session first")
	}
	cfg, err := config(c)
	if err != nil {
		return err
	}
	if c.SSH != nil {
		client, err := tunnel.Open(ctx, *c.SSH)
		if err != nil {
			return err
		}
		s.tunnel = client
		defer func() {
			if s.conn == nil {
				client.Close()
				s.tunnel = nil
			}
		}()
		cfg.DialFunc = func(ctx context.Context, _, address string) (net.Conn, error) {
			return tunnel.Dial(ctx, client, address)
		}
	}
	if c.Auth != nil {
		user, password, err := authproviders.Resolve(ctx, *c.Auth, c.Host, c.Port, c.User)
		if err != nil {
			return err
		}
		cfg.User, cfg.Passwd = user, password
	}
	connector, err := mysql.NewConnector(cfg)
	if err != nil {
		return err
	}
	db := sql.OpenDB(connector)
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(0)
	connectCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	conn, err := db.Conn(connectCtx)
	if err != nil {
		db.Close()
		return connectionError("handshake/authentication", err)
	}
	if err = conn.PingContext(connectCtx); err != nil {
		conn.Close()
		db.Close()
		return connectionError("connection check", err)
	}
	if c.TimeZone != "" {
		if _, err = conn.ExecContext(connectCtx, "SET SESSION time_zone = ?", c.TimeZone); err != nil {
			conn.Close()
			db.Close()
			return connectionError("time zone initialization", err)
		}
	}
	var autocommit int
	if err = conn.QueryRowContext(connectCtx, "SELECT @@session.autocommit").Scan(&autocommit); err != nil {
		conn.Close()
		db.Close()
		return connectionError("session initialization", err)
	}
	s.txUnverified = autocommit != 1
	s.db, s.conn = db, conn
	return nil
}

// Keep the underlying error available without including connection credentials.
func connectionError(stage string, err error) error {
	if errors.Is(err, mysql.ErrInvalidConn) || errors.Is(err, driver.ErrBadConn) {
		return fmt.Errorf("MySQL %s failed: server or tunnel closed the connection, or sent an incomplete response. Check the MySQL host/port, SSH forwarding destination (if used), and server logs; no active session was created: %w", stage, err)
	}
	return fmt.Errorf("MySQL %s failed: %w", stage, err)
}

func (s *Session) Cancel() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
	}
}

func (s *Session) close() {
	s.adminPending = nil
	s.schemaPending = nil
	s.objectPending = nil
	s.csvPending = nil
	s.sqlImportPending = nil
	s.transaction = false
	s.txUnverified = false
	if s.tunnel != nil {
		s.tunnel.Close()
		s.tunnel = nil
	}
	if s.conn != nil {
		s.conn.Close()
		s.conn = nil
	}
	if s.db != nil {
		s.db.Close()
		s.db = nil
	}
}

func (s *Session) Disconnect() error {
	if !s.op.TryLock() {
		return errors.New("cancel the running operation before disconnecting")
	}
	defer s.op.Unlock()
	s.close()
	return nil
}

func (s *Session) Shutdown() {
	s.Cancel()
	s.op.Lock()
	defer s.op.Unlock()
	s.close()
}

func (s *Session) Connected() bool {
	s.op.Lock()
	defer s.op.Unlock()
	return s.conn != nil
}

// Only server SQL errors preserve the session; transport failures require reconnect.
func (s *Session) queryError(err error) error {
	if s.transaction {
		s.txUnverified = true
	}
	// Missing metadata is an expected stale-object result, not a lost connection.
	if errors.Is(err, sql.ErrNoRows) {
		return err
	}
	var serverError *mysql.MySQLError
	if !errors.As(err, &serverError) {
		s.failed = true
	}
	return err
}

func quoteIdentifier(name string) string {
	return "`" + strings.ReplaceAll(name, "`", "``") + "`"
}

func (s *Session) UseDatabase(name string) error {
	ctx, done, err := s.begin()
	if err != nil {
		return err
	}
	defer done()
	if s.conn == nil {
		return errors.New("connect to a server first")
	}
	if name == "" || strings.ContainsRune(name, 0) {
		return errors.New("invalid database name")
	}
	_, err = s.execContext(ctx, "USE "+quoteIdentifier(name))
	if err != nil {
		return s.queryError(err)
	}
	return nil
}

func cell(raw []byte, columnType string) Cell {
	if raw == nil {
		return Cell{Null: true}
	}
	// Binary collations are reported as BINARY/VARBINARY/BLOB by this driver.
	binary := columnType == "BINARY" || columnType == "VARBINARY" ||
		strings.Contains(columnType, "BLOB") || columnType == "BIT" ||
		columnType == "GEOMETRY" || !utf8.Valid(raw)
	if binary {
		return Cell{Value: "0x" + hex.EncodeToString(raw), Binary: true}
	}
	return Cell{Value: string(raw)}
}

func (s *Session) Query(statement string) (Result, error) {
	return s.Stream(statement, nil)
}

// Stream calls emit synchronously while reading rows, without any UI dependency.
// The callback must not wait for another operation on this session.
func (s *Session) Stream(statement string, emit func(Batch)) (Result, error) {
	return s.execute(statement, nil, emit, false)
}

func (s *Session) execute(statement string, args []any, emit func(Batch), metadata bool) (Result, error) {
	return s.executeWithRowLimit(statement, args, emit, metadata, MaxRows)
}

func (s *Session) executeWithRowLimit(statement string, args []any, emit func(Batch), metadata bool, maxRows int) (Result, error) {
	ctx, done, err := s.begin()
	if err != nil {
		return Result{}, err
	}
	defer done()
	if s.conn == nil {
		return Result{}, errors.New("connect to a server first")
	}
	if strings.TrimSpace(statement) == "" {
		return Result{}, errors.New("enter one SQL statement")
	}
	if err := s.allowManagedStatement(statement); !metadata && err != nil {
		return Result{}, err
	}
	if !s.transaction && !metadata {
		s.txUnverified = true
	}
	start := time.Now()
	readCtx, cancelRead := context.WithCancel(ctx)
	defer cancelRead()
	rows, err := s.queryContext(readCtx, statement, args...)
	if err != nil {
		return Result{}, s.queryError(err)
	}
	defer rows.Close()
	types, err := rows.ColumnTypes()
	if err != nil {
		return Result{}, s.queryError(err)
	}
	result := Result{Columns: []Column{}, Rows: [][]Cell{}}
	for _, t := range types {
		result.Columns = append(result.Columns, Column{Name: t.Name(), Type: t.DatabaseTypeName()})
	}
	sent, batchBytes := 0, 0
	lastFlush := time.Now()
	flush := func() {
		if emit != nil && sent < len(result.Rows) {
			emit(Batch{Columns: result.Columns, Rows: append([][]Cell(nil), result.Rows[sent:]...), Offset: sent})
		}
		sent, batchBytes, lastFlush = len(result.Rows), 0, time.Now()
	}
	var bytes, discardedBytes int
	for rows.Next() {
		// Drivers can still yield buffered rows after cancellation.
		if err := ctx.Err(); err != nil {
			return Result{}, s.queryError(err)
		}
		raw := make([][]byte, len(types))
		dest := make([]any, len(types))
		for i := range raw {
			dest[i] = &raw[i]
		}
		if err = rows.Scan(dest...); err != nil {
			return Result{}, s.queryError(err)
		}
		rawBytes := 0
		for _, value := range raw {
			rawBytes += len(value)
		}
		if len(result.Rows) == maxRows {
			result.Truncated = true
			result.Notice = fmt.Sprintf("Showing the first %d rows; the result is incomplete.", maxRows)
			discardedBytes = rawBytes
			break
		}
		values := make([]Cell, len(types))
		rowBytes := 0
		for i := range raw {
			values[i] = cell(raw[i], types[i].DatabaseTypeName())
			rowBytes += len(values[i].Value)
		}
		bytes += rowBytes
		if bytes > MaxResultBytes {
			result.Truncated = true
			result.Notice = "The 4 MiB display limit was reached; the result is incomplete."
			discardedBytes = rawBytes
			break
		}
		result.Rows = append(result.Rows, values)
		batchBytes += rowBytes
		if len(result.Rows) == 1 || len(result.Rows)-sent >= 50 || batchBytes >= 64*1024 || time.Since(lastFlush) >= 100*time.Millisecond {
			flush()
			if err := ctx.Err(); err != nil {
				return Result{}, s.queryError(err)
			}
		}
	}
	if err = rows.Err(); err != nil {
		return Result{}, s.queryError(err)
	}
	if result.Truncated {
		complete, drainErr := finishLimitedRows(readCtx, rows, len(types), discardedBytes, cancelRead)
		if ctx.Err() != nil {
			return Result{}, s.queryError(ctx.Err())
		}
		if drainErr != nil && readCtx.Err() == nil {
			return Result{}, s.queryError(drainErr)
		}
		result.SessionClosed = !complete || readCtx.Err() != nil
	} else if rows.NextResultSet() {
		result.Truncated = true
		result.SessionClosed = true
		result.Notice = "Additional result sets were not displayed."
	}
	if err = rows.Err(); err != nil && !result.SessionClosed {
		return Result{}, s.queryError(err)
	}
	if result.SessionClosed {
		// Never let Close drain an unbounded response or reuse an unread protocol.
		s.failed = true
		cancelRead()
		_ = s.conn.Raw(func(any) error { return driver.ErrBadConn })
		result.Notice += " The response could not be completed within the safety budget; the session was closed. Reconnect before continuing."
	} else if result.Truncated {
		result.Notice += " The remaining response was read and discarded; the session remains active."
	}
	if err = rows.Close(); err != nil && !result.SessionClosed {
		return Result{}, s.queryError(err)
	}
	result.DurationMS = time.Since(start).Milliseconds()
	flush()
	if err := ctx.Err(); err != nil {
		return Result{}, s.queryError(err)
	}
	return result, nil
}

// Catalogs contain names, not table contents: give them a separate bounded budget.
// Never return a partial catalog as if it were a complete list.
func (s *Session) catalog(statement string) (Result, error) {
	result, err := s.executeWithRowLimit(statement, nil, nil, true, MaxCatalogRows)
	if err != nil {
		return Result{}, err
	}
	if result.Truncated {
		return Result{}, fmt.Errorf("database catalog exceeds its safety limit (%d entries or %d MiB); the incomplete list was discarded. %s", MaxCatalogRows, MaxResultBytes/(1024*1024), result.Notice)
	}
	return result, nil
}

func (s *Session) Databases() (Result, error) { return s.catalog("SHOW DATABASES") }

func (s *Session) Tables(database string) (Result, error) {
	if database == "" || strings.ContainsRune(database, 0) {
		return Result{}, fmt.Errorf("select a database first")
	}
	return s.catalog("SHOW FULL TABLES FROM " + quoteIdentifier(database))
}

// WorkspaceInfo reads only fixed session metadata, without running user SQL or
// clearing uncertainty from an earlier query/error.
func (s *Session) WorkspaceInfo() (Result, error) {
	return s.execute("SELECT VERSION(), DATABASE()", nil, nil, true)
}

// Fixed metadata reads never mark an otherwise idle session as user SQL.
func (s *Session) SQLMode() (string, error) {
	ctx, done, err := s.begin()
	if err != nil {
		return "", err
	}
	defer done()
	if s.conn == nil {
		return "", errors.New("connect to a server first")
	}
	var mode string
	if err := s.conn.QueryRowContext(ctx, "SELECT @@session.sql_mode").Scan(&mode); err != nil {
		return "", s.queryError(err)
	}
	return mode, nil
}
func (s *Session) CompletionSchema(db string) (Result, error) {
	if !validName(db) {
		return Result{}, errors.New("select a valid database for completion")
	}
	// Fully consume this small result; partial completion must not abort the session.
	result, err := s.executeWithRowLimit("SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME, ORDINAL_POSITION LIMIT 2001", []any{db}, nil, true, MaxCatalogRows)
	if err != nil {
		return Result{}, err
	}
	if len(result.Rows) > 2000 {
		result.Rows = result.Rows[:2000]
		result.Truncated = true
	}
	return result, nil
}
