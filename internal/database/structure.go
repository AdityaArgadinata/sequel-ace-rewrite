package database

import "errors"

// Structure is read-only catalog information, never an executable migration plan.
type Structure struct {
	Columns     Result `json:"columns"`
	Indexes     Result `json:"indexes"`
	ForeignKeys Result `json:"foreignKeys"`
	Definition  Result `json:"definition"`
}

func (s *Session) Structure(db, table string) (Structure, error) {
	if !validName(db) || !validName(table) {
		return Structure{}, errors.New("select a valid database and table")
	}
	var output Structure
	queries := []struct {
		target    *Result
		statement string
		args      []any
	}{
		{&output.Columns, `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA, CHARACTER_SET_NAME, COLLATION_NAME, COLUMN_COMMENT, GENERATION_EXPRESSION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`, []any{db, table}},
		{&output.Indexes, `SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, COLLATION, SUB_PART, INDEX_TYPE, NULLABLE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY INDEX_NAME, SEQ_IN_INDEX`, []any{db, table}},
		{&output.ForeignKeys, `SELECT k.CONSTRAINT_NAME, k.ORDINAL_POSITION, k.COLUMN_NAME, k.REFERENCED_TABLE_SCHEMA, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, r.UPDATE_RULE, r.DELETE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=? AND k.TABLE_NAME=? AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.CONSTRAINT_NAME, k.ORDINAL_POSITION`, []any{db, table}},
		{&output.Definition, "SHOW CREATE TABLE " + quoteIdentifier(db) + "." + quoteIdentifier(table), nil},
	}
	for _, query := range queries {
		result, err := s.execute(query.statement, query.args, nil, true)
		if err != nil {
			return Structure{}, err
		}
		if result.Truncated {
			return Structure{}, errors.New("structure metadata exceeds result limits; no complete structure snapshot is available")
		}
		*query.target = result
	}
	return output, nil
}
