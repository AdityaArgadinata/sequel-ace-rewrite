// Package sqlscript splits MySQL client scripts without enabling multi-statements.
package sqlscript

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

const MaxBytes = 4 * 1024 * 1024
const MaxStatements = 1000

type SAStatement struct {
	SQL  string `json:"sql"`
	From int    `json:"from"`
	To   int    `json:"to"`
	Line int    `json:"line"`
	Mode string `json:"mode"`
}

// Offsets use UTF-16 code units, matching desktop editor selections.
func ByteOffset(source string, offset int) (int, error) {
	if offset < 0 {
		return 0, errors.New("invalid SQL selection")
	}
	units := 0
	for i, r := range source {
		if units == offset {
			return i, nil
		}
		units++
		if r > 0xffff {
			units++
		}
		if units > offset {
			return 0, errors.New("selection splits a Unicode character")
		}
	}
	if units == offset {
		return len(source), nil
	}
	return 0, errors.New("SQL selection is outside the editor")
}

func Parse(source, sqlMode string) ([]SAStatement, error) {
	return ParseWithLimits(source, sqlMode, MaxBytes, MaxStatements)
}
func ParseWithLimits(source, sqlMode string, maxBytes, maxStatements int) ([]SAStatement, error) {
	return parse(source, sqlMode, maxBytes, maxStatements, false)
}

// Dump imports allow only literal session SQL_MODE transitions; each statement
// records the mode used to split it, which must match the server before execution.
func ParseImport(source, mode string) ([]SAStatement, error) {
	return parse(source, mode, 64*1024*1024, 100000, true)
}

var literalMode = regexp.MustCompile(`(?is)^\s*SET\s+SESSION\s+sql_mode\s*=\s*'([A-Z0-9_,]*)'\s*$`)

func parse(source, sqlMode string, maxBytes, maxStatements int, importModes bool) ([]SAStatement, error) {
	statements := []SAStatement{}
	if len(source) > maxBytes || !utf8.ValidString(source) || strings.ContainsRune(source, 0) {
		return statements, fmt.Errorf("SQL must be valid UTF-8 without NUL, at most %d MiB", maxBytes/(1024*1024))
	}
	modes := "," + strings.ToUpper(sqlMode) + ","
	noBackslash := strings.Contains(modes, ",NO_BACKSLASH_ESCAPES,")
	ansiQuotes := strings.Contains(modes, ",ANSI_QUOTES,")
	delimiter := ";"
	start, lineStart, line := 0, 0, 1
	var quote byte
	block, lineComment, hasCode := false, false, false
	cursor, units, cursorLine := 0, 0, 1
	position := func(end int) (int, int) {
		for _, r := range source[cursor:end] {
			units++
			if r > 0xffff {
				units++
			}
			if r == '\n' {
				cursorLine++
			}
		}
		cursor = end
		return units, cursorLine
	}
	emit := func(end int) error {
		if !hasCode {
			return nil
		}
		raw := source[start:end]
		left := len(raw) - len(strings.TrimLeftFunc(raw, unicode.IsSpace))
		text := strings.TrimSpace(raw)
		if text == "" {
			return nil
		}
		from, atLine := position(start + left)
		to, _ := position(start + left + len(text))
		statements = append(statements, SAStatement{SQL: text, From: from, To: to, Line: atLine, Mode: sqlMode})
		if importModes {
			if match := literalMode.FindStringSubmatch(withoutLeadingComments(text)); match != nil {
				sqlMode = match[1]
				modes = "," + strings.ToUpper(sqlMode) + ","
				noBackslash = strings.Contains(modes, ",NO_BACKSLASH_ESCAPES,")
				ansiQuotes = strings.Contains(modes, ",ANSI_QUOTES,")
			}
		}
		if len(statements) > maxStatements {
			return fmt.Errorf("script exceeds %d statements", maxStatements)
		}
		return nil
	}
	i := 0
	if strings.HasPrefix(source, "\ufeff") {
		i = 3
		start = 3
		lineStart = 3
	}
	for i < len(source) {
		c := source[i]
		if lineComment {
			if c == '\n' {
				lineComment = false
				line++
				lineStart = i + 1
			}
			i++
			continue
		}
		if block {
			if c == '*' && i+1 < len(source) && source[i+1] == '/' {
				block = false
				i += 2
				continue
			}
			if c == '\n' {
				line++
				lineStart = i + 1
			}
			i++
			continue
		}
		if quote != 0 {
			if c == '\\' && quote != '`' && !noBackslash && !(quote == '"' && ansiQuotes) {
				if i+1 < len(source) {
					if source[i+1] == '\n' {
						line++
						lineStart = i + 2
					}
					i += 2
					continue
				}
			}
			if c == quote {
				if i+1 < len(source) && source[i+1] == quote {
					i += 2
					continue
				}
				quote = 0
			}
			if c == '\n' {
				line++
				lineStart = i + 1
			}
			i++
			continue
		}
		// DELIMITER is a line command only, never SQL inside a routine or literal.
		if i == lineStart {
			end := strings.IndexByte(source[i:], '\n')
			if end < 0 {
				end = len(source)
			} else {
				end += i
			}
			text := strings.TrimSpace(source[i:end])
			fields := strings.Fields(text)
			if len(fields) > 0 && strings.EqualFold(fields[0], "DELIMITER") {
				if hasCode {
					return statements, fmt.Errorf("line %d: DELIMITER inside an unfinished statement", line)
				}
				arg := strings.TrimSpace(text[len(fields[0]):])
				if len(arg) >= 2 && (arg[0] == '\'' || arg[0] == '"' || arg[0] == '`') && arg[len(arg)-1] == arg[0] {
					arg = arg[1 : len(arg)-1]
				}
				if arg == "" || len(arg) > 16 || strings.ContainsAny(arg, " \t\r\n\\'\"`#") || strings.HasPrefix(arg, "--") || strings.HasPrefix(arg, "/*") {
					return statements, fmt.Errorf("line %d: delimiter must be 1–16 non-whitespace characters without quotes, backslashes or comment prefixes", line)
				}
				delimiter = arg
				i = end
				start = end
				continue
			}
		}
		if strings.HasPrefix(source[i:], delimiter) {
			if err := emit(i); err != nil {
				return statements, err
			}
			i += len(delimiter)
			start = i
			hasCode = false
			continue
		}
		if c == '#' || (c == '-' && i+1 < len(source) && source[i+1] == '-' && (i+2 == len(source) || source[i+2] <= 32)) {
			lineComment = true
			i++
			continue
		}
		if c == '/' && i+1 < len(source) && source[i+1] == '*' {
			// MySQL/MariaDB executable comments count as executable SQL.
			if i+2 < len(source) && (source[i+2] == '!' || strings.HasPrefix(source[i+2:], "M!")) {
				hasCode = true
			}
			block = true
			i += 2
			continue
		}
		if c == '\'' || c == '"' || c == '`' {
			quote = c
			hasCode = true
			i++
			continue
		}
		if c == '\n' {
			line++
			lineStart = i + 1
		}
		if c > 32 {
			hasCode = true
		}
		i++
	}
	if quote != 0 || block {
		return statements, fmt.Errorf("line %d: unterminated SQL quote or block comment", line)
	}
	if err := emit(len(source)); err != nil {
		return statements, err
	}
	return statements, nil
}

// Only ordinary leading comments may be ignored when recognizing a mode switch.
func withoutLeadingComments(text string) string {
	for {
		text = strings.TrimSpace(text)
		if strings.HasPrefix(text, "#") || strings.HasPrefix(text, "-- ") || strings.HasPrefix(text, "--\n") {
			i := strings.IndexByte(text, '\n')
			if i < 0 {
				return ""
			}
			text = text[i+1:]
			continue
		}
		if strings.HasPrefix(text, "/*") && !strings.HasPrefix(text, "/*!") && !strings.HasPrefix(text, "/*M!") {
			i := strings.Index(text, "*/")
			if i < 0 {
				return text
			}
			text = text[i+2:]
			continue
		}
		return text
	}
}

func IsLiteralModeChange(source string) bool {
	return literalMode.MatchString(withoutLeadingComments(source))
}
