package database

import (
	"bytes"
	"encoding/csv"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"unicode/utf8"
)

type SACSVPreview struct {
	Token     string           `json:"token"`
	Headers   []string         `json:"headers"`
	Sample    [][]string       `json:"sample"`
	Rows      int              `json:"rows"`
	Name      string           `json:"name"`
	Columns   []EditableColumn `json:"columns"`
	Cancelled bool             `json:"cancelled"`
}
type SACSVMapping struct {
	Source int    `json:"source"`
	Target string `json:"target"`
}
type SACSVPlan struct {
	Token string `json:"token"`
	SQL   string `json:"sql"`
	Rows  int    `json:"rows"`
}
type saCSVPending struct {
	preview         SACSVPreview
	records         [][]string
	database, table string
	schema          [32]byte
	mapping         []SACSVMapping
	values          [][]any
	plan            SACSVPlan
}

func ParseCSV(data []byte, separator string, header bool) ([]string, [][]string, error) {
	if len(data) > 8*1024*1024 || !utf8.Valid(data) || bytes.IndexByte(data, 0) >= 0 {
		return nil, nil, errors.New("CSV must be UTF-8 without NUL, at most 8 MiB")
	}
	sep := []rune(separator)
	if len(sep) != 1 || (sep[0] != ',' && sep[0] != ';' && sep[0] != '\t') {
		return nil, nil, errors.New("choose comma, semicolon or tab as CSV separator")
	}
	data = bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf})
	r := csv.NewReader(bytes.NewReader(data))
	r.Comma = sep[0]
	r.FieldsPerRecord = -1
	first, err := r.Read()
	if err != nil {
		return nil, nil, fmt.Errorf("CSV first record: %w", err)
	}
	if len(first) == 0 || len(first) > 1000 {
		return nil, nil, errors.New("CSV requires 1–1,000 columns")
	}
	headers := first
	records := [][]string{}
	if !header {
		headers = make([]string, len(first))
		for i := range headers {
			headers[i] = "Column " + strconv.Itoa(i+1)
		}
		records = append(records, first)
	}
	for {
		row, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, nil, fmt.Errorf("CSV record %d: %w", len(records)+1, err)
		}
		if len(row) != len(first) {
			return nil, nil, fmt.Errorf("CSV record %d has %d fields; expected %d", len(records)+1, len(row), len(first))
		}
		if len(records) >= 20000 || (len(records)+1)*len(first) > 200000 {
			return nil, nil, errors.New("CSV import is limited to 20,000 records and 200,000 cells per file")
		}
		records = append(records, row)
	}
	if len(records) == 0 {
		return nil, nil, errors.New("CSV contains no data records")
	}
	return headers, records, nil
}
func decodeCSVValue(text, format string) (Cell, error) {
	if format == "plain" {
		return Cell{Value: text}, nil
	}
	if format != "sequel-v1" {
		return Cell{}, errors.New("choose plain CSV or Sequel CSV v1")
	}
	if text == `\N` {
		return Cell{Null: true}, nil
	}
	if text == `\E` {
		return Cell{Value: ""}, nil
	}
	if strings.HasPrefix(text, `\B`) {
		if _, err := hex.DecodeString(text[2:]); err != nil {
			return Cell{}, errors.New("invalid Sequel CSV binary hex")
		}
		return Cell{Binary: true, Value: "0x" + text[2:]}, nil
	}
	var out strings.Builder
	for i := 0; i < len(text); i++ {
		if text[i] != '\\' {
			out.WriteByte(text[i])
			continue
		}
		i++
		if i >= len(text) {
			return Cell{}, errors.New("incomplete Sequel CSV escape")
		}
		switch text[i] {
		case '\\':
			out.WriteByte('\\')
		case 'n':
			out.WriteByte('\n')
		case 'r':
			out.WriteByte('\r')
		case 't':
			out.WriteByte('\t')
		case '0':
			out.WriteByte(0)
		default:
			return Cell{}, errors.New("unknown Sequel CSV escape; choose plain CSV for ordinary text")
		}
	}
	return Cell{Value: out.String()}, nil
}
func (s *Session) PreviewCSV(db, table, name string, data []byte, separator string, header bool) (SACSVPreview, error) {
	headers, records, err := ParseCSV(data, separator, header)
	if err != nil {
		return SACSVPreview{}, err
	}
	ctx, done, err := s.begin()
	if err != nil {
		return SACSVPreview{}, err
	}
	defer done()
	s.csvPending = nil
	source, mode, err := s.schemaSnapshot(ctx, db, table)
	if err != nil {
		return SACSVPreview{}, err
	}
	details, err := s.tableDetails(ctx, db, table)
	if err != nil {
		return SACSVPreview{}, err
	}
	// Inserts need a base table, not a row identity key. Only known write engines are supported.
	if !strings.EqualFold(details.Engine, "InnoDB") && !strings.EqualFold(details.Engine, "MyISAM") {
		return SACSVPreview{}, errors.New("CSV import supports InnoDB/MyISAM base tables only")
	}
	token, err := newPlanToken()
	if err != nil {
		return SACSVPreview{}, err
	}
	sample := records[:min(20, len(records))]
	preview := SACSVPreview{Token: token, Headers: headers, Sample: sample, Rows: len(records), Name: name, Columns: details.Columns}
	s.csvPending = &saCSVPending{preview: preview, records: records, database: db, table: table, schema: schemaFingerprint(source, mode)}
	return preview, nil
}
func (s *Session) PrepareCSVImport(token string, mapping []SACSVMapping, format string) (SACSVPlan, error) {
	ctx, done, err := s.begin()
	if err != nil {
		return SACSVPlan{}, err
	}
	defer done()
	p := s.csvPending
	if p == nil || p.preview.Token != token {
		return SACSVPlan{}, errors.New("CSV preview expired; open the file again")
	}
	p.plan = SACSVPlan{}
	p.values = nil
	if _, err := s.writeReady(ctx); err != nil {
		return SACSVPlan{}, err
	}
	if len(mapping) == 0 || len(mapping) > len(p.preview.Headers) {
		return SACSVPlan{}, errors.New("map at least one CSV column")
	}
	seen := map[string]bool{}
	names := []string{}
	marks := []string{}
	for _, m := range mapping {
		if m.Source < 0 || m.Source >= len(p.preview.Headers) || seen[m.Target] {
			return SACSVPlan{}, errors.New("invalid or duplicate CSV mapping")
		}
		found := false
		for _, c := range p.preview.Columns {
			if c.Name == m.Target && !c.Generated {
				found = true
			}
		}
		if !found {
			return SACSVPlan{}, errors.New("map only existing, non-generated columns")
		}
		seen[m.Target] = true
		names = append(names, m.Target)
		marks = append(marks, "?")
	}
	values := make([][]any, len(p.records))
	for i, row := range p.records {
		values[i] = make([]any, len(mapping))
		for j, m := range mapping {
			c, err := decodeCSVValue(row[m.Source], format)
			if err != nil {
				return SACSVPlan{}, fmt.Errorf("CSV record %d: %w", i+1, err)
			}
			value, err := cellArgument(c)
			if err != nil {
				return SACSVPlan{}, err
			}
			values[i][j] = value
		}
	}
	newToken, err := newPlanToken()
	if err != nil {
		return SACSVPlan{}, err
	}
	plan := SACSVPlan{Token: newToken, SQL: "INSERT INTO " + qualified(p.database, p.table) + " (" + quotedList(names) + ") VALUES (" + strings.Join(marks, ", ") + ")", Rows: len(p.records)}
	p.mapping = append([]SACSVMapping(nil), mapping...)
	p.values = values
	p.plan = plan
	return plan, nil
}
func (s *Session) ApplyCSVImport(token string) SABatchOutcome {
	ctx, done, err := s.begin()
	if err != nil {
		return SABatchOutcome{Error: err.Error()}
	}
	defer done()
	p := s.csvPending
	if p == nil || token == "" || p.plan.Token != token {
		return SABatchOutcome{Error: "CSV import plan expired; preview again"}
	}
	s.csvPending = nil
	out := SABatchOutcome{Total: len(p.records)}
	source, mode, err := s.schemaSnapshot(ctx, p.database, p.table)
	if err != nil {
		out.Error = err.Error()
		return out
	}
	if schemaFingerprint(source, mode) != p.schema {
		out.Error = "table schema changed since CSV preview; open the file again"
		return out
	}
	for i, values := range p.values {
		if _, err := s.execContext(ctx, p.plan.SQL, values...); err != nil {
			out.Error = fmt.Sprintf("CSV record %d: %s", i+1, s.queryError(err))
			out.Uncertain = s.failed || ctx.Err() != nil
			return out
		}
		out.Completed++
		warnings, err := s.exchangeWarnings(ctx)
		if err != nil {
			out.Error = err.Error()
			out.Uncertain = true
			return out
		}
		if warnings != "" {
			out.Warnings = fmt.Sprintf("CSV record %d: %s", i+1, warnings)
			out.Error = "import stopped after a warning; review earlier rows before continuing"
			return out
		}
	}
	return out
}
