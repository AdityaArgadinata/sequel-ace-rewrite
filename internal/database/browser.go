package database

import (
	"errors"
	"fmt"
	"strings"
)

type SAFilterRule struct {
	Column   string `json:"column"`
	Operator string `json:"operator"`
	Value    string `json:"value"`
}

type BrowseRequest struct {
	Filters    []SAFilterRule `json:"filters"`
	Match      string         `json:"match"`
	Database   string         `json:"database"`
	Table      string         `json:"table"`
	Offset     int            `json:"offset"`
	Limit      int            `json:"limit"`
	Sort       string         `json:"sort"`
	Descending bool           `json:"descending"`
	Column     string         `json:"column"`
	Operator   string         `json:"operator"`
	Value      string         `json:"value"`
}

func browseSQL(r BrowseRequest) (string, []any, error) { return browseSelectSQL(r, true) }
func browseSelectSQL(r BrowseRequest, paged bool) (string, []any, error) {
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
	ruleCount := len(r.Filters)
	if r.Column != "" {
		ruleCount++
	}
	if ruleCount > 100 {
		return "", nil, errors.New("at most 100 filter rules are supported")
	}
	if r.Match != "" && r.Match != "all" && r.Match != "any" {
		return "", nil, errors.New("invalid filter match mode")
	}
	rules := r.Filters
	if r.Column != "" {
		rules = append([]SAFilterRule{{Column: r.Column, Operator: r.Operator, Value: r.Value}}, rules...)
	}
	conditions := []string{}
	for _, rule := range rules {
		r.Column, r.Operator, r.Value = rule.Column, rule.Operator, rule.Value
		if r.Column == "" {
			return "", nil, errors.New("invalid filter column")
		}
		if strings.ContainsRune(r.Column, 0) {
			return "", nil, errors.New("invalid filter column")
		}
		condition := quoteIdentifier(r.Column)
		switch r.Operator {
		case "=", "!=", "<", ">", "<=", ">=":
			condition += " " + r.Operator + " ?"
			args = append(args, r.Value)
		case "contains":
			condition += " LIKE ? ESCAPE '!'"
			value := strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(r.Value)
			args = append(args, "%"+value+"%")
		case "is null":
			condition += " IS NULL"
		case "is not null":
			condition += " IS NOT NULL"
		default:
			return "", nil, errors.New("unsupported filter operator")
		}
		conditions = append(conditions, condition)
	}
	if len(conditions) > 0 {
		join := " AND "
		if r.Match == "any" {
			join = " OR "
		}
		q += " WHERE " + strings.Join(conditions, join)
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
	if paged {
		q += fmt.Sprintf(" LIMIT %d OFFSET %d", r.Limit, r.Offset)
	}
	return q, args, nil
}

func (s *Session) Browse(r BrowseRequest) (Result, error) {
	q, args, err := browseSQL(r)
	if err != nil {
		return Result{}, err
	}
	return s.execute(q, args, nil, true)
}
