package database

import (
	"bytes"
	"encoding/csv"
	"encoding/xml"
	"io"
	"sequel-rewrite/internal/sqlscript"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestCSVImportParsingAndValues(t *testing.T) {
	headers, rows, err := ParseCSV([]byte("\xef\xbb\xbfname;message\r\n\"a;é\";\"line1\nline2\"\r\n"), ";", true)
	if err != nil || headers[0] != "name" || rows[0][1] != "line1\nline2" {
		t.Fatal(headers, rows, err)
	}
	if _, _, err := ParseCSV([]byte("a,b\n1\n"), ",", true); err == nil {
		t.Fatal("ragged rows accepted")
	}
	if _, _, err := ParseCSV([]byte{0xff}, ",", true); err == nil {
		t.Fatal("invalid UTF8 accepted")
	}
	if _, _, err := ParseCSV([]byte("a,b\n"), ",", true); err == nil {
		t.Fatal("no data accepted")
	}
	cells := []Cell{{Null: true}, {Value: ""}, {Binary: true, Value: "0x00ff"}, {Value: "\\N\x00\n\r\té😀"}, {Value: "=A1"}}
	for _, c := range cells {
		got, err := decodeCSVValue(csvValue(c), "sequel-v1")
		if err != nil || got != c {
			t.Fatal(c, got, err)
		}
	}
	got, err := decodeCSVValue(`\N`, "plain")
	if err != nil || got.Null || got.Value != `\N` {
		t.Fatal(got, err)
	}
	for _, text := range []string{`\B0`, `\q`, `abc\`} {
		if _, err := decodeCSVValue(text, "sequel-v1"); err == nil {
			t.Fatal(text)
		}
	}
}
func TestDataExportFormats(t *testing.T) {
	result := Result{Columns: []Column{{Name: "id", Type: "BIGINT"}, {Name: "text", Type: "TEXT"}, {Name: "bytes", Type: "BLOB"}, {Name: "nullable", Type: "TEXT"}}, Rows: [][]Cell{{{Value: "18446744073709551615"}, {Value: "é<&\x00\n"}, {Binary: true, Value: "0x00ff"}, {Null: true}}, {{Value: "2"}, {Value: "\\N"}, {Binary: true, Value: "0x"}, {Value: ""}}}}
	for _, format := range []string{"csv", "sql", "xml"} {
		var b bytes.Buffer
		n, err := WriteResultExport(&b, SAExportSpec{Format: format, Database: "d`b", Table: "t"}, result)
		if err != nil || n != 2 {
			t.Fatal(format, n, err)
		}
		switch format {
		case "csv":
			records, err := csv.NewReader(strings.NewReader(b.String())).ReadAll()
			if err != nil {
				t.Fatal(err)
			}
			if records[1][0] != "18446744073709551615" || records[1][3] != `\N` || records[2][1] != `\\N` {
				t.Fatal(records)
			}
		case "sql":
			if !strings.Contains(b.String(), "INSERT INTO `d``b`.`t`") || !strings.Contains(b.String(), "X'00ff'") || !strings.Contains(b.String(), "NULL") {
				t.Fatal(b.String())
			}
			if strings.Contains(b.String(), "\x00") {
				t.Fatal("raw NUL in SQL")
			}
		case "xml":
			dec := xml.NewDecoder(&b)
			for {
				_, err := dec.Token()
				if err == io.EOF {
					break
				}
				if err != nil {
					t.Fatal(err)
				}
			}
		}
	}
}
func TestCloneTableKeepsAttributesAndRemapsOnlyFKIdentifiers(t *testing.T) {
	source := "CREATE TABLE `child` (`id` int, `name` varchar(30) COMMENT 'REFERENCES `child` (x)', CONSTRAINT `fk` FOREIGN KEY (`id`) REFERENCES `child` (`id`)) ENGINE=InnoDB"
	create, fk, err := cloneCreate(source, "", "db", "child", "other", "new", false)
	if err != nil || len(fk) != 1 {
		t.Fatal(create, fk, err)
	}
	if !strings.Contains(create, "COMMENT 'REFERENCES `child` (x)'") || strings.Contains(create, "FOREIGN KEY") {
		t.Fatal(create)
	}
	if !strings.Contains(fk[0], "REFERENCES `other`.`new` (`id`)") {
		t.Fatal(fk)
	}
	_, fk, err = cloneCreate(source, "", "db", "child", "copied", "child", true)
	if err != nil || !strings.Contains(fk[0], "REFERENCES `copied`.`child`") {
		t.Fatal(fk, err)
	}
}
func TestUnpagedFilterExportRetainsOnlyFiltersAndSort(t *testing.T) {
	r := BrowseRequest{Database: "db", Table: "t", Limit: 50, Offset: 100, Filters: []SAFilterRule{{Column: "id", Operator: ">", Value: "1"}}, Sort: "id", Descending: true}
	sql, args, err := browseSelectSQL(r, false)
	if err != nil || strings.Contains(sql, "LIMIT") || !strings.Contains(sql, "WHERE `id` > ? ORDER BY `id` DESC") || len(args) != 1 {
		t.Fatal(sql, args, err)
	}
}

func TestSQLDumpPreviewKeepsTheFirstStatementAndMarksTruncation(t *testing.T) {
	large := "SELECT '" + strings.Repeat("😀", 80000) + "'"
	preview := sqlImportSample([]sqlscript.SAStatement{{SQL: large, Line: 1}, {SQL: "DROP TABLE later", Line: 2}})
	if len(preview) > 256*1024 || !utf8.ValidString(preview) || !strings.Contains(preview, "SELECT '") || strings.Contains(preview, "DROP TABLE later") || !strings.Contains(preview, "Preview truncated") {
		t.Fatal("preview skipped/truncated source without notice")
	}
}

func TestImportWarningsBounded(t *testing.T) {
	var out SABatchOutcome
	appendImportWarning(&out, 1, strings.Repeat("😀", 20000))
	first := out.Warnings
	appendImportWarning(&out, 2, "must not grow")
	if len(out.Warnings) > 33*1024 || out.Warnings != first || !strings.HasSuffix(out.Warnings, "Additional warnings omitted.\n") {
		t.Fatal(len(out.Warnings))
	}
}
