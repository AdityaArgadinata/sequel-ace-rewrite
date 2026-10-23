package database

import (
	"reflect"
	"strings"
	"testing"
)

func TestBrowseSQL(t *testing.T) {
	r := BrowseRequest{Database: "db`x", Table: "t`; DROP TABLE x; --", Limit: 50, Offset: 100, Column: "value`", Operator: "=", Value: "' OR 1=1 --", Sort: "id`", Descending: true}
	sql, args, err := browseSQL(r)
	if err != nil || !strings.Contains(sql, "`db``x`.`t``; DROP TABLE x; --`") || !strings.Contains(sql, "WHERE `value``` = ? ORDER BY `id``` DESC LIMIT 50 OFFSET 100") || strings.Contains(sql, r.Value) || !reflect.DeepEqual(args, []any{r.Value}) {
		t.Fatalf("%s %#v %v", sql, args, err)
	}
	r.Operator = "contains"
	r.Value = "50%_!"
	_, args, err = browseSQL(r)
	if err != nil || args[0] != "%50!%!_!!%" {
		t.Fatalf("wildcards: %#v %v", args, err)
	}
	r.Operator = "is null"
	_, args, err = browseSQL(r)
	if err != nil || len(args) != 0 {
		t.Fatal("NULL must not bind a value")
	}
	r.Operator = "= ?; DROP"
	if _, _, err = browseSQL(r); err == nil {
		t.Fatal("operator injection accepted")
	}
	r.Column = ""
	r.Limit = 201
	if _, _, err = browseSQL(r); err == nil {
		t.Fatal("unbounded page accepted")
	}
	r.Limit = 50
	r.Offset = -1
	if _, _, err = browseSQL(r); err == nil {
		t.Fatal("negative offset accepted")
	}
}

func TestSAMultipleFilters(t *testing.T) {
	r := BrowseRequest{Database: "db", Table: "table", Limit: 50, Sort: "id", Filters: []SAFilterRule{
		{Column: "name`", Operator: "contains", Value: "%_!' OR 1=1"},
		{Column: "message", Operator: "is null"},
		{Column: "id", Operator: ">", Value: "3"},
	}}
	for _, mode := range []string{"all", "any"} {
		r.Match = mode
		q, args, err := browseSQL(r)
		join := " AND "
		if mode == "any" {
			join = " OR "
		}
		if err != nil || !strings.Contains(q, "WHERE `name``` LIKE ? ESCAPE '!'"+join+"`message` IS NULL"+join+"`id` > ? ORDER BY `id` ASC") || !reflect.DeepEqual(args, []any{"%!%!_!!' OR 1=1%", "3"}) {
			t.Fatalf("%s %#v %v", q, args, err)
		}
	}
	for _, rule := range []SAFilterRule{{Column: "id", Operator: "=; DROP"}, {Column: "bad\x00", Operator: "="}, {Operator: "="}} {
		r.Filters = []SAFilterRule{rule}
		if _, _, err := browseSQL(r); err == nil {
			t.Fatal("invalid rule accepted")
		}
	}
	r.Filters = nil
	r.Match = "OR 1=1"
	if _, _, err := browseSQL(r); err == nil {
		t.Fatal("invalid match accepted")
	}
	r.Match = "all"
	r.Filters = make([]SAFilterRule, 101)
	if _, _, err := browseSQL(r); err == nil {
		t.Fatal("unbounded rules accepted")
	}
}
