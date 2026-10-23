package database

import (
	"context"
	"database/sql"
	"strings"
	"time"
)

// Record the verb only: SQL and bound parameters can contain credentials or data.
func activityVerb(statement string) string {
	fields := strings.Fields(statement)
	if len(fields) == 0 {
		return "SQL statement"
	}
	verb := strings.ToUpper(fields[0])
	switch verb {
	case "SELECT", "INSERT", "UPDATE", "DELETE", "REPLACE", "CREATE", "ALTER", "DROP", "TRUNCATE", "RENAME", "GRANT", "REVOKE", "SHOW", "HELP", "SET", "USE", "START", "COMMIT", "ROLLBACK", "EXPLAIN", "WITH":
		return "SQL " + verb
	}
	return "SQL statement"
}
func (s *Session) execContext(ctx context.Context, statement string, args ...any) (sql.Result, error) {
	started := time.Now()
	result, err := s.conn.ExecContext(ctx, statement, args...)
	s.recordActivity(activityVerb(statement), started, err == nil)
	return result, err
}
func (s *Session) queryContext(ctx context.Context, statement string, args ...any) (*sql.Rows, error) {
	started := time.Now()
	rows, err := s.conn.QueryContext(ctx, statement, args...)
	s.recordActivity(activityVerb(statement), started, err == nil)
	return rows, err
}
