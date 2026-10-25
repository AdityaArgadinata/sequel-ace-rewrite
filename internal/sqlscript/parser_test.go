package sqlscript

import (
	"strings"
	"testing"
)

func TestSplit(t *testing.T) {
	for _, tt := range []struct {
		source string
		count  int
	}{
		{"SELECT ';'; SELECT \"a;\"; SELECT `semi;colon`;", 3},
		{"-- lead ;\nSELECT 'it''s; fine'; # ignored ;\n/* ; */ SELECT 2; -- trailing", 2},
		{"SELECT 4--2; SELECT 5", 2},
		{`SELECT 'escaped\'; still literal'; SELECT 2`, 2},
		{"DELIMITER $$\nCREATE PROCEDURE p() BEGIN SELECT ';'; SELECT 2; END$$\nDELIMITER ;\nCALL p();", 2},
		{" /* leading */\n DELIMITER '//'\nSELECT '//'//\nDELIMITER ;\nSELECT 2;", 2},
		{"# only comments\n/* comment */", 0},
		{"/*!40101 SET @x=1 */; /*M!100100 SET @y=2 */;", 2},
		{"\ufeffSELECT 1;", 1},
	} {
		got, err := Parse(tt.source, "")
		if err != nil || len(got) != tt.count {
			t.Fatalf("%q: %#v %v", tt.source, got, err)
		}
	}
}
func TestModesAndOffsets(t *testing.T) {
	source := "-- 😀\nSELECT '😀';\nSELECT 2"
	statements, err := Parse(source, "")
	if err != nil || len(statements) != 2 {
		t.Fatal(statements, err)
	}
	for _, s := range statements {
		a, err := ByteOffset(source, s.From)
		if err != nil {
			t.Fatal(err)
		}
		b, err := ByteOffset(source, s.To)
		if err != nil || source[a:b] != s.SQL {
			t.Fatal(s, err)
		}
	}
	if statements[1].Line != 3 {
		t.Fatal(statements)
	}
	if _, err := ByteOffset("😀", 1); err == nil {
		t.Fatal("split surrogate accepted")
	}
	if _, err := Parse("SELECT 'a\\'; SELECT 2;", "NO_BACKSLASH_ESCAPES"); err != nil {
		t.Fatal(err)
	}
	if _, err := Parse("SELECT 'a\\'; SELECT 2;", ""); err == nil {
		t.Fatal("mode ignored")
	}
	if _, err := Parse("SELECT \"a\\\"; SELECT 2;", "ANSI_QUOTES"); err != nil {
		t.Fatal(err)
	}
}
func TestRejectIncomplete(t *testing.T) {
	for _, s := range []string{"SELECT 'open", "/* open", "DELIMITER\nSELECT 1", "SELECT 1\nDELIMITER $$", "DELIMITER \\x", "DELIMITER --", strings.Repeat("SELECT 1;", MaxStatements+1)} {
		if _, err := Parse(s, ""); err == nil {
			t.Fatalf("accepted %q", s[:min(50, len(s))])
		}
	}
}

func TestDumpLimitsDoNotChangeInteractiveLimits(t *testing.T) {
	source := strings.Repeat("SELECT 1;", 1001)
	if _, err := Parse(source, ""); err == nil {
		t.Fatal("interactive limit removed")
	}
	got, err := ParseWithLimits(source, "", 64*1024*1024, 100000)
	if err != nil || len(got) != 1001 {
		t.Fatal(len(got), err)
	}
}

func TestImportModeTransitions(t *testing.T) {
	source := "-- header\nSET SESSION sql_mode = 'NO_BACKSLASH_ESCAPES';\nSELECT 'ends in \\';\nSET SESSION sql_mode = '';\nSELECT 'escape \\' quote';"
	result, err := ParseImport(source, "")
	if err != nil || len(result) != 4 {
		t.Fatal(result, err)
	}
	if result[0].Mode != "" || result[1].Mode != "NO_BACKSLASH_ESCAPES" || result[2].Mode != "NO_BACKSLASH_ESCAPES" || result[3].Mode != "" {
		t.Fatal(result)
	}
	if interactive, err := Parse(source, ""); err == nil && len(interactive) == 4 {
		t.Fatal("interactive parser unexpectedly switched modes")
	}
	result, err = ParseImport("SET SESSION sql_mode = CONCAT('ANSI','_QUOTES'); SELECT 1", "")
	if err != nil || result[1].Mode != "" {
		t.Fatal("expression mode changes must remain unrecognized", result, err)
	}
}
