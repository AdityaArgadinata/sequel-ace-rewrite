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
	MaxResultBytes = 4 * 1024 * 1024
)

type Connection struct {
	Host     string          `json:"host"`
	Port     int             `json:"port"`
	User     string          `json:"user"`
	Password string          `json:"password"`
	TLS      bool            `json:"tls"`
	CAPEM    string          `json:"caPEM"`
	SSH      *tunnel.Options `json:"ssh"`
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
	Columns    []Column `json:"columns"`
	Rows       [][]Cell `json:"rows"`
	Truncated  bool     `json:"truncated"`
	DurationMS int64    `json:"durationMS"`
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
	op     sync.Mutex
	mu     sync.Mutex
	cancel context.CancelFunc
	db     *sql.DB
	conn   *sql.Conn
	failed bool
	tunnel *ssh.Client
}

func config(c Connection) (*mysql.Config, error) {
	if strings.TrimSpace(c.Host) == "" || c.Port < 1 || c.Port > 65535 || c.User == "" {
		return nil, errors.New("host, port (1–65535), and user are required")
	}
	cfg := mysql.NewConfig()
	cfg.Net = "tcp"
	cfg.Addr = net.JoinHostPort(strings.TrimSpace(c.Host), strconv.Itoa(c.Port))
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
		return err
	}
	if err = conn.PingContext(connectCtx); err != nil {
		conn.Close()
		db.Close()
		return err
	}
	s.db, s.conn = db, conn
	return nil
}

func (s *Session) Cancel() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
	}
}

func (s *Session) close() {
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
	_, err = s.conn.ExecContext(ctx, "USE "+quoteIdentifier(name))
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
	return s.execute(statement, nil, emit)
}

func (s *Session) execute(statement string, args []any, emit func(Batch)) (Result, error) {
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
	start := time.Now()
	rows, err := s.conn.QueryContext(ctx, statement, args...)
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
	var bytes int
	for rows.Next() {
		if len(result.Rows) == MaxRows {
			result.Truncated = true
			break
		}
		raw := make([][]byte, len(types))
		dest := make([]any, len(types))
		for i := range raw {
			dest[i] = &raw[i]
		}
		if err = rows.Scan(dest...); err != nil {
			return Result{}, s.queryError(err)
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
			break
		}
		result.Rows = append(result.Rows, values)
		batchBytes += rowBytes
		if len(result.Rows) == 1 || len(result.Rows)-sent >= 50 || batchBytes >= 64*1024 || time.Since(lastFlush) >= 100*time.Millisecond {
			flush()
		}
	}
	if err = rows.Err(); err != nil {
		return Result{}, s.queryError(err)
	}
	// CALL can return several result sets even with multi-statements disabled.
	// This first UI only displays one set: discard the session instead of draining
	// an arbitrarily large undisplayed second set.
	if !result.Truncated && rows.NextResultSet() {
		result.Truncated = true
	}
	if err = rows.Err(); err != nil {
		return Result{}, s.queryError(err)
	}
	if result.Truncated {
		// Closing unread rows can drain an unbounded server result. Abort instead;
		// reconnect is explicit because cancellation destroys the pinned session.
		s.Cancel()
		// Mark the physical connection bad before rows.Close can drain unread rows.
		_ = s.conn.Raw(func(any) error { return driver.ErrBadConn })
	}
	if err = rows.Close(); err != nil && !result.Truncated {
		return Result{}, s.queryError(err)
	}
	result.DurationMS = time.Since(start).Milliseconds()
	flush()
	return result, nil
}

func (s *Session) Databases() (Result, error) { return s.Query("SHOW DATABASES") }

func (s *Session) Tables(database string) (Result, error) {
	if database == "" || strings.ContainsRune(database, 0) {
		return Result{}, fmt.Errorf("select a database first")
	}
	return s.Query("SHOW FULL TABLES FROM " + quoteIdentifier(database))
}
