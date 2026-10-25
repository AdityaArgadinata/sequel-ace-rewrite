package database

import (
	"context"
	"database/sql"
	"time"
)

const (
	maxDiscardRows     = 10000
	maxDiscardBytes    = 16 * 1024 * 1024
	resultDrainTimeout = 2 * time.Second
)

// Finish only the current result; extra CALL results are not replayed or exposed.
// The query-local cancel also interrupts a blocked driver read at the deadline.
func finishLimitedRows(ctx context.Context, rows *sql.Rows, columns, initialBytes int, cancel context.CancelFunc) (bool, error) {
	expired := make(chan struct{})
	timer := time.AfterFunc(resultDrainTimeout, func() { cancel(); close(expired) })
	defer func() {
		if !timer.Stop() {
			<-expired
		}
	}()
	count, size := 1, initialBytes
	raw := make([]sql.RawBytes, columns)
	dest := make([]any, columns)
	for i := range raw {
		dest[i] = &raw[i]
	}
	if size > maxDiscardBytes {
		return false, nil
	}
	for rows.Next() {
		if err := ctx.Err(); err != nil {
			return false, err
		}
		count++
		if count > maxDiscardRows {
			return false, nil
		}
		if err := rows.Scan(dest...); err != nil {
			return false, err
		}
		for _, value := range raw {
			size += len(value)
		}
		if size > maxDiscardBytes {
			return false, nil
		}
	}
	if err := rows.Err(); err != nil {
		return false, err
	}
	if err := ctx.Err(); err != nil {
		return false, err
	}
	// NextResultSet must run under the same deadline: CALL may wait before a header.
	more := rows.NextResultSet()
	if err := rows.Err(); err != nil {
		return false, err
	}
	return !more && ctx.Err() == nil, nil
}
