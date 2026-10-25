package database

import (
	"context"
	"database/sql/driver"
	"encoding/base64"
	"encoding/csv"
	"encoding/hex"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"
)

type SAExportSpec struct {
	Format     string        `json:"format"`
	Scope      string        `json:"scope"`
	Browse     BrowseRequest `json:"browse"`
	Database   string        `json:"database"`
	Table      string        `json:"table"`
	IncludeDDL bool          `json:"includeDDL"`
}
type saDataWriter struct {
	w       io.Writer
	format  string
	columns []Column
	csv     *csv.Writer
	xml     *xml.Encoder
	table   string
}

func sqlLiteral(c Cell) (string, error) {
	if c.Null {
		return "NULL", nil
	}
	if c.Binary {
		b, err := cellArgument(c)
		if err != nil {
			return "", err
		}
		return "X'" + hex.EncodeToString(b.([]byte)) + "'", nil
	}
	if !utf8.ValidString(c.Value) {
		return "", errors.New("SQL text must be UTF-8")
	}
	if c.Value == "" {
		return "''", nil
	}
	return "CONVERT(0x" + hex.EncodeToString([]byte(c.Value)) + " USING utf8mb4)", nil
}
func validXML(text string) bool {
	for _, r := range text {
		if !(r == 9 || r == 10 || r == 13 || r >= 0x20 && r <= 0xd7ff || r >= 0xe000 && r <= 0xfffd || r >= 0x10000 && r <= 0x10ffff) {
			return false
		}
	}
	return utf8.ValidString(text)
}
func newDataWriter(w io.Writer, format string, cols []Column, db, table string) (*saDataWriter, error) {
	d := &saDataWriter{w: w, format: format, columns: cols, table: qualified(db, table)}
	if len(cols) == 0 || len(cols) > 1000 {
		return nil, errors.New("export requires 1–1,000 columns")
	}
	names := make([]string, len(cols))
	seen := map[string]bool{}
	for i, c := range cols {
		if !utf8.ValidString(c.Name) || strings.ContainsRune(c.Name, 0) {
			return nil, errors.New("invalid export column name")
		}
		if format == "sql" && seen[strings.ToLower(c.Name)] {
			return nil, errors.New("SQL INSERT export requires unique column names; add aliases in the query")
		}
		seen[strings.ToLower(c.Name)] = true
		names[i] = c.Name
	}
	switch format {
	case "csv":
		d.csv = csv.NewWriter(w)
		if err := d.csv.Write(names); err != nil {
			return nil, err
		}
	case "sql":
		if !objectName(db) || !objectName(table) {
			return nil, errors.New("choose target database/table for SQL INSERT export")
		}
	case "xml":
		if _, err := io.WriteString(w, xml.Header); err != nil {
			return nil, err
		}
		d.xml = xml.NewEncoder(w)
		if err := d.xml.EncodeToken(xml.StartElement{Name: xml.Name{Local: "result"}}); err != nil {
			return nil, err
		}
	default:
		return nil, errors.New("choose CSV, SQL or XML export")
	}
	return d, nil
}
func (d *saDataWriter) row(values []Cell) error {
	if len(values) != len(d.columns) {
		return errors.New("export row shape mismatch")
	}
	size := 0
	for _, c := range values {
		size += len(c.Value)
		if c.Binary {
			if _, err := cellArgument(c); err != nil {
				return err
			}
		} else if !utf8.ValidString(c.Value) {
			return errors.New("export text must be UTF-8")
		}
	}
	if size > MaxResultBytes {
		return errors.New("export row exceeds 4 MiB")
	}
	switch d.format {
	case "csv":
		record := make([]string, len(values))
		for i, c := range values {
			record[i] = csvValue(c)
		}
		return d.csv.Write(record)
	case "sql":
		names := make([]string, len(values))
		literals := make([]string, len(values))
		for i, c := range values {
			names[i] = d.columns[i].Name
			literal, err := sqlLiteral(c)
			if err != nil {
				return err
			}
			literals[i] = literal
		}
		_, err := fmt.Fprintf(d.w, "INSERT INTO %s (%s) VALUES (%s);\n", d.table, quotedList(names), strings.Join(literals, ", "))
		return err
	case "xml":
		start := xml.StartElement{Name: xml.Name{Local: "row"}}
		if err := d.xml.EncodeToken(start); err != nil {
			return err
		}
		for i, c := range values {
			if !validXML(d.columns[i].Name) || !validXML(d.columns[i].Type) {
				return errors.New("XML column metadata contains unsupported control characters")
			}
			attrs := []xml.Attr{{Name: xml.Name{Local: "column"}, Value: d.columns[i].Name}, {Name: xml.Name{Local: "type"}, Value: d.columns[i].Type}}
			text := c.Value
			if c.Null {
				attrs = append(attrs, xml.Attr{Name: xml.Name{Local: "null"}, Value: "true"})
				text = ""
			} else if c.Binary {
				b, err := cellArgument(c)
				if err != nil {
					return err
				}
				text = base64.StdEncoding.EncodeToString(b.([]byte))
				attrs = append(attrs, xml.Attr{Name: xml.Name{Local: "encoding"}, Value: "base64-binary"})
			} else if !validXML(text) {
				text = base64.StdEncoding.EncodeToString([]byte(text))
				attrs = append(attrs, xml.Attr{Name: xml.Name{Local: "encoding"}, Value: "base64-utf8"})
			}
			element := xml.StartElement{Name: xml.Name{Local: "value"}, Attr: attrs}
			if err := d.xml.EncodeElement(text, element); err != nil {
				return err
			}
		}
		return d.xml.EncodeToken(start.End())
	}
	return nil
}
func (d *saDataWriter) finish() error {
	if d.csv != nil {
		d.csv.Flush()
		return d.csv.Error()
	}
	if d.xml != nil {
		if err := d.xml.EncodeToken(xml.EndElement{Name: xml.Name{Local: "result"}}); err != nil {
			return err
		}
		return d.xml.Flush()
	}
	return nil
}
func WriteResultExport(w io.Writer, spec SAExportSpec, result Result) (int64, error) {
	if len(result.Rows) > MaxRows {
		return 0, errors.New("loaded-result export is limited to 500 rows")
	}
	size := 0
	for _, column := range result.Columns {
		size += len(column.Name) + len(column.Type)
	}
	for _, row := range result.Rows {
		for _, c := range row {
			size += len(c.Value)
		}
	}
	if size > MaxResultBytes {
		return 0, errors.New("loaded-result export exceeds 4 MiB")
	}
	d, err := newDataWriter(w, spec.Format, result.Columns, spec.Database, spec.Table)
	if err != nil {
		return 0, err
	}
	for i, row := range result.Rows {
		if err := d.row(row); err != nil {
			return int64(i), err
		}
	}
	return int64(len(result.Rows)), d.finish()
}
func (s *Session) ExportData(w io.Writer, spec SAExportSpec) (int64, error) {
	ctx, done, err := s.begin()
	if err != nil {
		return 0, err
	}
	defer done()
	if s.conn == nil {
		return 0, errors.New("connect first")
	}
	if s.txUnverified {
		return 0, errors.New("resolve unverified session state before exporting")
	}
	r := spec.Browse
	if r.Limit == 0 {
		r.Limit = 50
	}
	if spec.Scope == "table" {
		r.Filters = nil
		r.Column = ""
		r.Sort = ""
		r.Offset = 0
	}
	if spec.Scope != "table" && spec.Scope != "filtered" && spec.Scope != "page" {
		return 0, errors.New("unknown export scope")
	}
	statement, args, err := browseSelectSQL(r, spec.Scope == "page")
	if err != nil {
		return 0, err
	}
	if spec.Format == "sql" {
		cols, err := s.tableColumns(ctx, r.Database, r.Table)
		if err != nil {
			return 0, err
		}
		statement = strings.Replace(statement, "SELECT * FROM ", "SELECT "+quotedList(cols)+" FROM ", 1)
		if spec.IncludeDDL {
			var kind string
			if err := s.conn.QueryRowContext(ctx, "SELECT TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?", r.Database, r.Table).Scan(&kind); err != nil {
				return 0, s.queryError(err)
			}
			if kind != "BASE TABLE" {
				return 0, errors.New("CREATE TABLE export supports base tables only; export view data without structure")
			}
			source, err := s.tableDefinition(ctx, r.Database, r.Table)
			if err != nil {
				return 0, err
			}
			_, tail, ok := schemaIdentifier(strings.TrimPrefix(source, "CREATE TABLE "))
			if !ok {
				return 0, errors.New("SQL structure export requires a quoted base-table definition")
			}
			var mode string
			if err := s.conn.QueryRowContext(ctx, "SELECT @@session.sql_mode").Scan(&mode); err != nil {
				return 0, s.queryError(err)
			}
			if _, err := io.WriteString(w, "-- sequelx table structure and data; review target names before importing.\n-- Source SQL_MODE: "+mode+"\nCREATE TABLE "+qualified(r.Database, r.Table)+" "+tail+";\n"); err != nil {
				return 0, err
			}
		}
	}
	return s.exportQuery(ctx, w, spec.Format, r.Database, r.Table, statement, args)
}

func (s *Session) exportQuery(ctx context.Context, w io.Writer, format, db, table, statement string, args []any) (int64, error) {
	rows, err := s.queryContext(ctx, statement, args...)
	if err != nil {
		return 0, s.queryError(err)
	}
	complete := false
	defer func() {
		if !complete {
			s.Cancel()
			_ = s.conn.Raw(func(any) error { return driver.ErrBadConn })
		}
		rows.Close()
	}()
	types, err := rows.ColumnTypes()
	if err != nil {
		return 0, s.queryError(err)
	}
	cols := make([]Column, len(types))
	for i, t := range types {
		cols[i] = Column{Name: t.Name(), Type: t.DatabaseTypeName()}
	}
	d, err := newDataWriter(w, format, cols, db, table)
	if err != nil {
		return 0, err
	}
	var count int64
	for rows.Next() {
		if err := ctx.Err(); err != nil {
			return count, err
		}
		raw := make([][]byte, len(types))
		dest := make([]any, len(raw))
		for i := range raw {
			dest[i] = &raw[i]
		}
		if err := rows.Scan(dest...); err != nil {
			return count, s.queryError(err)
		}
		values := make([]Cell, len(raw))
		for i, b := range raw {
			values[i] = cell(b, types[i].DatabaseTypeName())
		}
		if err := d.row(values); err != nil {
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
	if err := d.finish(); err != nil {
		return count, err
	}
	if err := rows.Close(); err != nil {
		return count, s.queryError(err)
	}
	complete = true
	return count, nil
}
