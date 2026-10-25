package database

import (
	"context"
	"errors"
	"fmt"
	"sequel-rewrite/internal/sqlscript"
	"strings"
	"unicode/utf8"
)

type SASQLImportPreview struct {
	Token      string `json:"token"`
	Name       string `json:"name"`
	Statements int    `json:"statements"`
	Preview    string `json:"preview"`
	Cancelled  bool   `json:"cancelled"`
}
type saSQLImportPending struct {
	token      string
	statements []sqlscript.SAStatement
	mode       string
}

func (s *Session) PreviewSQLImport(name, source string) (SASQLImportPreview, error) {
	ctx, done, err := s.begin()
	if err != nil {
		return SASQLImportPreview{}, err
	}
	defer done()
	s.sqlImportPending = nil
	mode, err := s.writeReady(ctx)
	if err != nil {
		return SASQLImportPreview{}, err
	}
	statements, err := sqlscript.ParseImport(source, mode)
	if err != nil {
		return SASQLImportPreview{}, err
	}
	if len(statements) == 0 {
		return SASQLImportPreview{}, errors.New("SQL file contains no statements")
	}
	for _, statement := range statements {
		if len(statement.SQL) > 4*1024*1024 {
			return SASQLImportPreview{}, errors.New("each imported SQL statement must be at most 4 MiB")
		}
	}
	sample := sqlImportSample(statements)
	token, err := newPlanToken()
	if err != nil {
		return SASQLImportPreview{}, err
	}
	s.sqlImportPending = &saSQLImportPending{token, statements, mode}
	return SASQLImportPreview{Token: token, Name: name, Statements: len(statements), Preview: sample}, nil
}
func (s *Session) ApplySQLImport(token string) SABatchOutcome {
	ctx, done, err := s.begin()
	if err != nil {
		return SABatchOutcome{Error: err.Error()}
	}
	defer done()
	p := s.sqlImportPending
	if p == nil || token == "" || token != p.token {
		return SABatchOutcome{Error: "SQL import preview expired"}
	}
	s.sqlImportPending = nil
	out := SABatchOutcome{Total: len(p.statements)}
	mode, err := s.writeReady(ctx)
	if err != nil {
		out.Error = err.Error()
		return out
	}
	if mode != p.mode {
		out.Error = "SQL mode changed since preview; prepare the file again"
		return out
	}
	for i, statement := range p.statements {
		out.Statement = i + 1
		out.Line = statement.Line
		if err := s.conn.QueryRowContext(ctx, "SELECT @@session.sql_mode").Scan(&mode); err != nil {
			out.Error = s.queryError(err).Error()
			out.Uncertain = true
			return out
		}
		if mode != statement.Mode {
			out.Error = "script SQL_MODE changed; stopped before the next statement. Review the remaining file under the new mode"
			return out
		}
		s.txUnverified = true
		if _, err := s.execContext(ctx, statement.SQL); err != nil {
			out.Error = fmt.Sprintf("Statement %d (line %d): %s", i+1, statement.Line, s.queryError(err))
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
			appendImportWarning(&out, i+1, warnings)
			if sqlscript.IsLiteralModeChange(statement.SQL) {
				informational, err := s.onlyModeDeprecations(ctx)
				if err != nil {
					out.Error = err.Error()
					out.Uncertain = true
					return out
				}
				if informational {
					continue
				}
			}
			out.Error = "SQL import stopped after a server warning"
			return out
		}
	}
	return out
}

func sqlImportSample(statements []sqlscript.SAStatement) string {
	const limit = 256 * 1024
	var sample strings.Builder
	for i, statement := range statements {
		if i >= 100 {
			sample.WriteString("\n-- Preview truncated; review the full source file.\n")
			break
		}
		label := fmt.Sprintf("-- Statement %d (line %d)\n", i+1, statement.Line)
		remaining := limit - sample.Len() - len(label) - 80
		if remaining <= 0 {
			sample.WriteString("\n-- Preview truncated; review the full source file.\n")
			break
		}
		sample.WriteString(label)
		if len(statement.SQL) > remaining {
			prefix := statement.SQL[:remaining]
			for !utf8.ValidString(prefix) {
				prefix = prefix[:len(prefix)-1]
			}
			sample.WriteString(prefix)
			sample.WriteString("\n-- Preview truncated; review the full source file.\n")
			break
		}
		sample.WriteString(statement.SQL)
		sample.WriteString(";\n")
	}
	return sample.String()
}

// MySQL 5.7 warns when restoring its own deprecated SQL_MODE values. These
// exact deprecation codes on a literal mode SET do not indicate data coercion.
func (s *Session) onlyModeDeprecations(ctx context.Context) (bool, error) {
	rows, err := s.queryContext(ctx, "SHOW WARNINGS")
	if err != nil {
		return false, s.queryError(err)
	}
	defer rows.Close()
	safe := true
	for rows.Next() {
		var level, message string
		var code int
		if err := rows.Scan(&level, &code, &message); err != nil {
			return false, s.queryError(err)
		}
		if level != "Note" && code != 1287 && code != 1681 && code != 3090 {
			safe = false
		}
	}
	if err := rows.Err(); err != nil {
		return false, s.queryError(err)
	}
	return safe, nil
}

func appendImportWarning(out *SABatchOutcome, statement int, message string) {
	const max = 32 * 1024
	if len(out.Warnings) >= max {
		return
	}
	out.Warnings += fmt.Sprintf("Statement %d: %s\n", statement, message)
	if len(out.Warnings) > max {
		out.Warnings = out.Warnings[:max]
		for !utf8.ValidString(out.Warnings) {
			out.Warnings = out.Warnings[:len(out.Warnings)-1]
		}
		out.Warnings += "\nAdditional warnings omitted.\n"
	}
}
