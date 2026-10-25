package database

import (
	"errors"
	"regexp"
	"strings"
)

// Keep quoted literals and parenthesized expressions opaque. Only top-level
// attributes are replaced; CHECKs, generated expressions and unknown options survive.
type saColumnToken struct {
	text       string
	start, end int
}

func columnTokens(source, mode string) ([]saColumnToken, error) {
	if err := validateSchemaFragment(source, mode); err != nil {
		return nil, err
	}
	noBackslash := strings.Contains(","+strings.ToUpper(mode)+",", ",NO_BACKSLASH_ESCAPES,")
	ansi := strings.Contains(","+strings.ToUpper(mode)+",", ",ANSI_QUOTES,")
	var quote byte
	depth, start := 0, -1
	var out []saColumnToken
	for i := 0; i <= len(source); i++ {
		if i == len(source) || (quote == 0 && depth == 0 && source[i] <= 32) {
			if start >= 0 {
				out = append(out, saColumnToken{source[start:i], start, i})
				start = -1
			}
			continue
		}
		if start < 0 {
			start = i
		}
		c := source[i]
		if quote != 0 {
			if c == '\\' && quote != '`' && !noBackslash && !(quote == '"' && ansi) {
				i++
				continue
			}
			if c == quote {
				if i+1 < len(source) && source[i+1] == quote {
					i++
				} else {
					quote = 0
				}
			}
			continue
		}
		switch c {
		case '\'', '"', '`':
			quote = c
		case '(':
			depth++
		case ')':
			depth--
		}
	}
	return out, nil
}

var columnTypePattern = regexp.MustCompile(`(?is)^([A-Z][A-Z0-9_]*(?:\s+PRECISION)?)(?:\s*\((.*)\))?$`)
var columnIdentifier = regexp.MustCompile(`^[a-zA-Z0-9_]+$`)
var columnLength = regexp.MustCompile(`^[0-9]+(?:\s*,\s*[0-9]+)?$`)
var columnCurrentTimestamp = regexp.MustCompile(`(?i)^CURRENT_TIMESTAMP(?:\([0-6]?\))?$`)
var columnNumericType = regexp.MustCompile(`^(?:TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|FLOAT|DOUBLE|DOUBLE PRECISION|REAL|DECIMAL|DEC|FIXED|NUMERIC|BIT|BOOL|BOOLEAN|SERIAL)$`)
var columnDefaultFunction = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*\(`)
var columnBitDefault = regexp.MustCompile(`(?i)^b'[01]+'$`)
var columnNumber = regexp.MustCompile(`^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$`)

type saColumnAttribute struct {
	start, end int
	value      string
}

func columnAttributes(source, mode string) (map[string]saColumnAttribute, error) {
	tokens, err := columnTokens(source, mode)
	if err != nil {
		return nil, err
	}
	if len(tokens) == 0 {
		return nil, errors.New("cannot read column type")
	}
	typeEnd := 0
	if len(tokens) > 1 && (strings.EqualFold(tokens[1].text, "PRECISION") || strings.HasPrefix(tokens[1].text, "(")) {
		typeEnd = 1
	}
	if typeEnd == 1 && len(tokens) > 2 && strings.HasPrefix(tokens[2].text, "(") {
		typeEnd = 2
	}
	typeSQL := source[tokens[0].start:tokens[typeEnd].end]
	match := columnTypePattern.FindStringSubmatch(typeSQL)
	if match == nil {
		return nil, errors.New("use the SQL editor for this column type")
	}
	out := map[string]saColumnAttribute{"type": {0, tokens[typeEnd].end, strings.ToUpper(match[1])}, "length": {0, tokens[typeEnd].end, match[2]}}
	for i := typeEnd + 1; i < len(tokens); i++ {
		key, n, value := "", 1, ""
		word := strings.ToUpper(tokens[i].text)
		switch word {
		case "COLUMN_FORMAT", "STORAGE", "ENGINE_ATTRIBUTE", "SECONDARY_ENGINE_ATTRIBUTE", "SRID":
			if i+1 < len(tokens) {
				i++
			}
			continue
		case "UNSIGNED", "ZEROFILL", "BINARY":
			key = strings.ToLower(word)
			value = "true"
		case "NULL":
			key = "nullable"
			value = "true"
		case "NOT":
			if i+1 < len(tokens) && strings.EqualFold(tokens[i+1].text, "NULL") {
				key = "nullable"
				n = 2
				value = "false"
			}
		case "DEFAULT", "COLLATE", "COMMENT":
			if i+1 < len(tokens) {
				key = map[string]string{"DEFAULT": "default", "COLLATE": "collation", "COMMENT": "comment"}[word]
				n = 2
				value = tokens[i+1].text
			}
		case "CHARACTER":
			if i+2 < len(tokens) && strings.EqualFold(tokens[i+1].text, "SET") {
				key = "encoding"
				n = 3
				value = tokens[i+2].text
			}
		case "AUTO_INCREMENT":
			key = "auto_increment"
			value = "auto_increment"
		case "ON":
			if i+2 < len(tokens) && strings.EqualFold(tokens[i+1].text, "UPDATE") {
				key = "on_update"
				n = 3
				value = "on update " + tokens[i+2].text
			}
		}
		if key != "" {
			if _, exists := out[key]; exists {
				return nil, errors.New("ambiguous column attributes; use the SQL editor")
			}
			out[key] = saColumnAttribute{tokens[i].start, tokens[i+n-1].end, value}
			i += n - 1
		}
	}
	return out, nil
}
func patchColumnAttributes(source string, edits map[string]string, mode string) (string, error) {
	// A fixed order makes previews deterministic and handles charset/collation together.
	for key := range edits {
		switch key {
		case "type", "length", "unsigned", "zerofill", "nullable", "default", "extra", "encoding", "collation", "comment":
		default:
			return "", errors.New("unsupported column attribute")
		}
	}
	for _, key := range []string{"type", "length", "unsigned", "zerofill", "nullable", "default", "extra", "encoding", "collation", "comment"} {
		value, ok := edits[key]
		if !ok {
			continue
		}
		if len(value) > 64*1024 || strings.ContainsRune(value, 0) {
			return "", errors.New("invalid column attribute")
		}
		attrs, err := columnAttributes(source, mode)
		if err != nil {
			return "", err
		}
		replacement := ""
		switch key {
		case "type", "length":
			typ, length := attrs["type"].value, attrs["length"].value
			if key == "type" {
				typ = strings.ToUpper(strings.TrimSpace(value))
				if !columnTypePattern.MatchString(typ) || strings.ContainsAny(typ, "()") {
					return "", errors.New("invalid column type")
				}
			} else {
				length = strings.TrimSpace(value)
				if length != "" {
					if typ == "ENUM" || typ == "SET" {
						if err := validateSchemaFragment("("+length+")", mode); err != nil {
							return "", err
						}
					} else if !columnLength.MatchString(length) {
						return "", errors.New("invalid column length")
					}
				}
			}
			replacement = typ
			if length != "" {
				replacement += "(" + length + ")"
			}
		case "unsigned", "zerofill", "nullable":
			if value != "true" && value != "false" {
				return "", errors.New("invalid column checkbox")
			}
			if key == "nullable" {
				if value == "true" {
					replacement = "NULL"
				} else {
					replacement = "NOT NULL"
				}
			} else if value == "true" {
				replacement = strings.ToUpper(key)
			}
		case "default":
			if value != "" {
				literal := adminString(value, mode)
				typ := attrs["type"].value
				if decoded, ok := columnQuotedLiteral(value, mode); ok {
					literal = adminString(decoded, mode)
				}
				if strings.HasPrefix(value, "(") || columnDefaultFunction.MatchString(value) {
					_, end, err := schemaPartsEnd(value, mode)
					if err == nil && end == len(value) {
						if err = validateSchemaFragment(value, mode); err != nil {
							return "", err
						}
						literal = value
					}
				}
				if columnNumericType.MatchString(typ) && (columnBitDefault.MatchString(value) || columnHexDefault.MatchString(value) || strings.EqualFold(value, "TRUE") || strings.EqualFold(value, "FALSE")) {
					literal = value
				}
				if strings.EqualFold(value, "NULL") || ((typ == "TIMESTAMP" || typ == "DATETIME") && columnCurrentTimestamp.MatchString(value)) || (columnNumericType.MatchString(typ) && columnNumber.MatchString(value)) {
					literal = value
				}
				replacement = "DEFAULT " + literal
			}
		case "comment":
			if value != "" {
				replacement = "COMMENT " + adminString(value, mode)
			}
		case "encoding", "collation":
			if value != "" {
				if !columnIdentifier.MatchString(value) {
					return "", errors.New("invalid encoding or collation")
				}
				prefix := "COLLATE "
				if key == "encoding" {
					prefix = "CHARACTER SET "
				}
				replacement = prefix + value
			}
		case "extra":
			if value != "None" && value != "auto_increment" && value != "on update CURRENT_TIMESTAMP" && value != "SERIAL DEFAULT VALUE" {
				return "", errors.New("invalid extra attribute")
			}
			// Remove only the two editable Extra clauses, keeping GENERATED and storage attributes.
			for _, extra := range []string{"auto_increment", "on_update"} {
				current, _ := columnAttributes(source, mode)
				if old, exists := current[extra]; exists {
					source = strings.TrimSpace(source[:old.start] + source[old.end:])
				}
			}
			if value != "None" {
				source += " " + value
				if value == "on update CURRENT_TIMESTAMP" {
					current, err := columnAttributes(source, mode)
					if err != nil {
						return "", err
					}
					if length := current["length"].value; length != "" {
						source += "(" + length + ")"
					}
				}
			}
			continue
		}
		if old, exists := attrs[key]; exists {
			source = strings.TrimSpace(source[:old.start] + replacement + source[old.end:])
		} else if replacement != "" {
			if key == "encoding" || key == "collation" {
				at := attrs["type"].end
				if key == "collation" {
					if encoding, exists := attrs["encoding"]; exists {
						at = encoding.end
					}
				}
				source = source[:at] + " " + replacement + source[at:]
			} else {
				source += " " + replacement
			}
		}
	}
	if err := validateSchemaFragment(source, mode); err != nil {
		return "", err
	}
	return source, nil
}

// A quoted UI default is a literal, never a route to append ALTER attributes.
func columnQuotedLiteral(value, mode string) (string, bool) {
	if len(value) < 2 || (value[0] != '\'' && value[0] != '"') {
		return "", false
	}
	quote := value[0]
	noBackslash := strings.Contains(","+strings.ToUpper(mode)+",", ",NO_BACKSLASH_ESCAPES,")
	for i := 1; i < len(value); i++ {
		if value[i] == '\\' && !noBackslash {
			i++
			continue
		}
		if value[i] == quote {
			if i+1 < len(value) && value[i+1] == quote {
				i++
				continue
			}
			if i != len(value)-1 {
				return "", false
			}
			return defaultQuotedString(value[1:i], noBackslash, quote), true
		}
	}
	return "", false
}
