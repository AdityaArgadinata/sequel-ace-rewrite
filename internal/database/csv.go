package database

import (
	"database/sql/driver"
	"encoding/csv"
	"errors"
	"io"
	"strings"
)

var csvTextEscaper = strings.NewReplacer(`\`, `\\`, "\r", `\r`, "\n", `\n`, "\t", `\t`)

// Sequel CSV v1 keeps NULL, empty strings, bytes and escaped text distinct.
func csvValue(c Cell) string {
	if c.Null {
		return `\N`
	}
	if c.Binary {
		return `\B` + strings.TrimPrefix(c.Value, "0x")
	}
	if c.Value == "" {
		return `\E`
	}
	return csvTextEscaper.Replace(c.Value)
}

// ExportCSV holds only one driver row and the CSV writer buffer. It deliberately
// bypasses the UI's 500-row limit, while preserving its per-row byte bound.
func (s *Session) ExportCSV(db, table string, writer io.Writer) (int64, error) {
	if !validName(db) || !validName(table) {
		return 0, errors.New("select a valid database and table")
	}
	ctx, done, err := s.begin()
	if err != nil {
		return 0, err
	}
	defer done()
	if s.conn == nil {
		return 0, errors.New("connect first")
	}
	if s.txUnverified {
		return 0, errors.New("resolve unverified session state with Commit/Rollback before exporting")
	}
	rows, err := s.conn.QueryContext(ctx, "SELECT * FROM "+quoteIdentifier(db)+"."+quoteIdentifier(table))
	if err != nil {
		return 0, s.queryError(err)
	}
	complete := false
	defer func() {
		if !complete {
			// Closing unread rows can drain the whole table. Abort the physical session.
			s.Cancel()
			_ = s.conn.Raw(func(any) error { return driver.ErrBadConn })
		}
		rows.Close()
	}()
	types, err := rows.ColumnTypes()
	if err != nil {
		return 0, s.queryError(err)
	}
	names := make([]string, len(types))
	for i, t := range types {
		names[i] = t.Name()
	}
	csvWriter := csv.NewWriter(writer)
	if err := csvWriter.Write(names); err != nil {
		return 0, err
	}
	var count int64
	for rows.Next() {
		if err := ctx.Err(); err != nil {
			return count, err
		}
		raw := make([][]byte, len(types))
		dest := make([]any, len(types))
		for i := range raw {
			dest[i] = &raw[i]
		}
		if err := rows.Scan(dest...); err != nil {
			return count, s.queryError(err)
		}
		record := make([]string, len(types))
		size := 0
		for i, b := range raw {
			record[i] = csvValue(cell(b, types[i].DatabaseTypeName()))
			size += len(record[i])
		}
		if size > MaxResultBytes {
			return count, errors.New("CSV row exceeds 4 MiB encoded cell data; export was discarded")
		}
		if err := csvWriter.Write(record); err != nil {
			return count, err
		}
		count++
	}
	if err := rows.Err(); err != nil {
		return count, s.queryError(err)
	}
	if rows.NextResultSet() {
		return count, errors.New("unexpected additional export result set")
	}
	if err := rows.Err(); err != nil {
		return count, s.queryError(err)
	}
	csvWriter.Flush()
	if err := csvWriter.Error(); err != nil {
		return count, err
	}
	if err := ctx.Err(); err != nil {
		return count, err
	}
	if err := rows.Close(); err != nil {
		return count, s.queryError(err)
	}
	complete = true
	return count, nil
}
