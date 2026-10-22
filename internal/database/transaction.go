package database

import (
	"errors"
	"strings"
)

// Status describes managed transactions. Arbitrary SQL outside one may change
// server state, so that state is explicitly unverified until COMMIT/ROLLBACK.
func (s *Session) TransactionStatus() string {
	s.op.Lock()
	defer s.op.Unlock()
	if s.conn == nil {
		return "disconnected"
	}
	if s.txUnverified {
		return "unverified"
	}
	if s.transaction {
		return "active"
	}
	return "idle"
}
func (s *Session) Transaction(action string) error {
	ctx, done, err := s.begin()
	if err != nil {
		return err
	}
	defer done()
	if s.conn == nil {
		return errors.New("connect first")
	}
	switch action {
	case "begin":
		if s.transaction || s.txUnverified {
			return errors.New("finish the current or unverified transaction with COMMIT/ROLLBACK before starting another")
		}
		var autocommit int
		if err := s.conn.QueryRowContext(ctx, "SELECT @@session.autocommit").Scan(&autocommit); err != nil {
			return s.queryError(err)
		}
		if autocommit != 1 {
			s.txUnverified = true
			return errors.New("enable autocommit explicitly in SQL before starting a managed transaction")
		}
		_, err := s.conn.ExecContext(ctx, "START TRANSACTION")
		if err != nil {
			return s.queryError(err)
		}
		s.transaction = true
	case "commit", "rollback":
		if action == "commit" && s.transaction && s.txUnverified {
			return errors.New("transaction state is uncertain after an error; use ROLLBACK")
		}
		_, err = s.conn.ExecContext(ctx, strings.ToUpper(action))
		if err != nil {
			s.txUnverified = true
			s.failed = true
			return errors.New("transaction outcome could not be confirmed; verify on the server before retrying")
		}
		s.transaction = false
		var autocommit int
		if err := s.conn.QueryRowContext(ctx, "SELECT @@session.autocommit").Scan(&autocommit); err != nil {
			s.txUnverified = true
			s.failed = true
			return errors.New("transaction statement was acknowledged, but session state could not be checked; verify before retrying")
		}
		s.txUnverified = autocommit != 1
	default:
		return errors.New("unsupported transaction action")
	}
	if err := ctx.Err(); err != nil {
		return s.queryError(err)
	}
	return nil
}
func (s *Session) allowManagedStatement(statement string) error {
	if !s.transaction {
		return nil
	}
	if s.txUnverified {
		return errors.New("transaction state is uncertain; use ROLLBACK before continuing")
	}
	words := strings.Fields(statement)
	if len(words) > 0 {
		switch strings.ToUpper(words[0]) {
		case "SELECT", "INSERT", "UPDATE", "DELETE":
			return nil
		}
	}
	return errors.New("managed transactions accept SELECT/INSERT/UPDATE/DELETE only, without leading comments; finish with the transaction controls before running DDL, CALL, or transaction SQL")
}
