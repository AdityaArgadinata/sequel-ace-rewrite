package main

import (
	"strings"
	"testing"
)

func TestPrepareSQLScopes(t *testing.T) {
	source := "SELECT 1;\nSELECT '😀;';\nSELECT 3;"
	plan, err := prepareSQL(source, "all", 0, 0, 0, "")
	if err != nil || len(plan.Statements) != 3 {
		t.Fatal(plan, err)
	}
	selected := plan.Statements[1]
	plan, err = prepareSQL(source, "current", 0, 0, selected.From+3, "")
	if err != nil || len(plan.Statements) != 1 || plan.Statements[0].SQL != "SELECT '😀;'" {
		t.Fatal(plan, err)
	}
	plan, err = prepareSQL(source, "selection", selected.From, selected.To, 0, "")
	if err != nil || len(plan.Statements) != 1 || plan.Statements[0].SQL != "SELECT '😀;'" {
		t.Fatal(plan, err)
	}
	if plan.Statements[0].From != selected.From || plan.Statements[0].Line != selected.Line {
		t.Fatal("selection lost editor position", plan)
	}
	if _, err := prepareSQL(source, "selection", 0, 0, 0, ""); err == nil {
		t.Fatal("empty selection accepted")
	}
	plan, err = prepareSQL("SELECT 1; SELECT 'open", "current", 0, 0, 2, "")
	if err != nil || len(plan.Statements) != 1 {
		t.Fatal(plan, err)
	}
	if _, err := prepareSQL("SELECT 1; SELECT 'open", "all", 0, 0, 2, ""); err == nil {
		t.Fatal("malformed script accepted")
	}
	if _, err := prepareSQL(strings.Repeat("x", 4*1024*1024+1), "all", 0, 0, 0, ""); err == nil {
		t.Fatal("oversized script accepted")
	}
	if _, err := prepareSQL("SELECT 1;"+strings.Repeat(" ", 4*1024*1024), "selection", 0, 8, 0, ""); err == nil {
		t.Fatal("selection bypassed editor size limit")
	}
}
