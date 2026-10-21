package database

import (
	"errors"
	"fmt"
	"strings"
)

type BrowseRequest struct {
	Database   string `json:"database"`
	Table      string `json:"table"`
	Offset     int    `json:"offset"`
	Limit      int    `json:"limit"`
	Sort       string `json:"sort"`
	Descending bool   `json:"descending"`
	Column     string `json:"column"`
	Operator   string `json:"operator"`
	Value      string `json:"value"`
}

func browseSQL(r BrowseRequest) (string, []any, error) {
	for _, name := range []string{r.Database, r.Table} {
		if name == "" || strings.ContainsRune(name, 0) {
			return "", nil, errors.New("select a valid database and table")
		}
	}
	if r.Offset < 0 || r.Offset > 10000000 || r.Limit < 1 || r.Limit > 200 {
		return "", nil, errors.New("page size must be 1–200; offset must be 0–10000000")
	}
	q := "SELECT * FROM " + quoteIdentifier(r.Database) + "." + quoteIdentifier(r.Table)
	args := []any{}
	if r.Column != "" {
		if strings.ContainsRune(r.Column, 0) {
			return "", nil, errors.New("invalid filter column")
		}
		q += " WHERE " + quoteIdentifier(r.Column)
		switch r.Operator {
		case "=", "!=", "<", ">", "<=", ">=":
			q += " " + r.Operator + " ?"
			args = append(args, r.Value)
		case "contains":
			q += " LIKE ? ESCAPE '!'"
			value := strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(r.Value)
			args = append(args, "%"+value+"%")
		case "is null":
			q += " IS NULL"
		case "is not null":
			q += " IS NOT NULL"
		default:
			return "", nil, errors.New("unsupported filter operator")
		}
	}
	if r.Sort != "" {
		if strings.ContainsRune(r.Sort, 0) {
			return "", nil, errors.New("invalid sort column")
		}
		q += " ORDER BY " + quoteIdentifier(r.Sort)
		if r.Descending {
			q += " DESC"
		} else {
			q += " ASC"
		}
	}
	q += fmt.Sprintf(" LIMIT %d OFFSET %d", r.Limit, r.Offset)
	return q, args, nil
}

func (s *Session) Browse(r BrowseRequest) (Result, error) {
	q, args, err := browseSQL(r)
	if err != nil {
		return Result{}, err
	}
	return s.execute(q, args, nil)
}
