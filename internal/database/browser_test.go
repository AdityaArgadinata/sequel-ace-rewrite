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
