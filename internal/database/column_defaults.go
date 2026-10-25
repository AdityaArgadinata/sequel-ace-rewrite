package database

import (
	"context"
	"database/sql"
	"encoding/hex"
	"math/big"
	"regexp"
	"strings"
)

var columnHexDefault = regexp.MustCompile(`(?i)^0x[0-9a-f]+$`)

// Use the server's canonical SQL to distinguish literals from expressions.
// Parse only literals for display; default expressions always run on the server.
func (s *Session) insertDefaults(ctx context.Context, db, table string, details *TableDetails) error {
	var mode, name, source string
	if err := s.conn.QueryRowContext(ctx, "SELECT @@session.sql_mode").Scan(&mode); err != nil {
		return s.queryError(err)
	}
	if err := s.conn.QueryRowContext(ctx, "SHOW CREATE TABLE "+qualified(db, table)).Scan(&name, &source); err != nil {
		return s.queryError(err)
	}
	objects, err := schemaObjects(source, mode)
	if err != nil {
		// Unknown definitions must not prevent browsing or invent concrete defaults.
		for i := range details.Columns {
			if !details.Columns[i].Generated && !details.Columns[i].AutoIncrement {
				details.Columns[i].DefaultExpression = "DEFAULT"
			}
		}
		return nil
	}
	definitions := map[string]string{}
	for _, object := range objects {
		if object.Kind == "column" {
			definitions[object.Name] = object.Definition
		}
	}
	for i := range details.Columns {
		c := &details.Columns[i]
		if c.AutoIncrement || c.Generated {
			continue
		}
		definition, found := definitions[c.Name]
		attrs, err := columnAttributes(definition, mode)
		if !found || err != nil {
			c.DefaultExpression = "DEFAULT"
			continue
		}
		if value, exists := attrs["default"]; exists {
			if columnHexDefault.MatchString(value.value) {
				// MySQL 8 prints non-ASCII literals as hex; metadata decodes their charset.
				var literal sql.NullString
				if err := s.conn.QueryRowContext(ctx, "SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?", db, table, c.Name).Scan(&literal); err != nil {
					return s.queryError(err)
				}
				if literal.Valid && literal.String != value.value {
					columnDefault(c, adminString(literal.String, mode), mode)
					continue
				}
			}
			columnDefault(c, value.value, mode)
		}
	}
	return nil
}
func columnDefault(c *EditableColumn, raw, mode string) {
	if c.Generated || c.AutoIncrement {
		return
	}
	if strings.EqualFold(raw, "NULL") {
		c.DefaultValue = &Cell{Null: true}
		return
	}
	value := raw
	// MySQL 8 may retain a character-set introducer in SHOW CREATE defaults.
	if strings.HasPrefix(value, "_") {
		if quote := strings.IndexByte(value, '\''); quote > 1 && columnIdentifier.MatchString(value[1:quote]) {
			value = value[quote:]
		}
	}
	quoted := len(value) >= 2 && value[0] == '\'' && value[len(value)-1] == '\''
	if quoted {
		value = defaultString(value[1:len(value)-1], strings.Contains(","+strings.ToUpper(mode)+",", ",NO_BACKSLASH_ESCAPES,"))
	} else {
		isBit := strings.HasPrefix(strings.ToLower(value), "b'") && strings.HasSuffix(value, "'")
		if isBit {
			if n, ok := new(big.Int).SetString(value[2:len(value)-1], 2); ok {
				value = n.String()
			} else {
				c.DefaultExpression = raw
				return
			}
		}
		if !isBit && !columnNumber.MatchString(value) {
			c.DefaultExpression = raw
			return
		}
	}
	cell := Cell{Value: value}
	typ := strings.ToUpper(c.Type)
	if strings.HasPrefix(typ, "BINARY") || strings.HasPrefix(typ, "VARBINARY") || strings.Contains(typ, "BLOB") {
		cell.Binary = true
		cell.Value = "0x" + hex.EncodeToString([]byte(value))
	}
	c.DefaultValue = &cell
}
func defaultString(value string, noBackslash bool) string {
	var out strings.Builder
	for i := 0; i < len(value); i++ {
		c := value[i]
		if c == '\'' && i+1 < len(value) && value[i+1] == '\'' {
			i++
			out.WriteByte('\'')
			continue
		}
		if c == '\\' && !noBackslash && i+1 < len(value) {
			i++
			c = value[i]
			switch c {
			case '0':
				c = 0
			case 'b':
				c = '\b'
			case 'n':
				c = '\n'
			case 'r':
				c = '\r'
			case 't':
				c = '\t'
			case 'Z':
				c = 26
			case '%', '_':
				out.WriteByte('\\')
			}
		}
		out.WriteByte(c)
	}
	return out.String()
}
