package database

import (
	"strings"
	"testing"
)

func TestColumnDefaultMetadata(t *testing.T) {
	tests := []struct {
		typ, raw, mode, want, expression string
		null, binary                     bool
	}{
		{typ: "int", raw: "0", want: "0"},
		{typ: "varchar(30)", raw: "'001'", want: "001"},
		{typ: "varchar(30)", raw: "_utf8mb4'quote\\' \\\\ é😀'", want: "quote' \\ é😀"},
		{typ: "varchar(30)", raw: "'CURRENT_TIMESTAMP'", want: "CURRENT_TIMESTAMP"},
		{typ: "varchar(30)", raw: "'it''s \\n é😀'", want: "it's \n é😀"},
		{typ: "varchar(30)", raw: "'x\\y'", mode: "NO_BACKSLASH_ESCAPES", want: "x\\y"},
		{typ: "varchar(30)", raw: "'NULL'", want: "NULL"},
		{typ: "varchar(30)", raw: "NULL", null: true},
		{typ: "bit(4)", raw: "b'1010'", want: "10"},
		{typ: "varbinary(10)", raw: "'\\0ÿ'", want: "0x00c3bf", binary: true},
		{typ: "timestamp", raw: "CURRENT_TIMESTAMP", expression: "CURRENT_TIMESTAMP"},
		{typ: "datetime(3)", raw: "current_timestamp(3)", expression: "current_timestamp(3)"},
		{typ: "varchar(30)", raw: "uuid()", expression: "uuid()"},
	}
	for _, tt := range tests {
		c := EditableColumn{Type: tt.typ}
		columnDefault(&c, tt.raw, tt.mode)
		if c.DefaultExpression != tt.expression {
			t.Fatal(tt, c)
		}
		if tt.expression != "" {
			if c.DefaultValue != nil {
				t.Fatal(c)
			}
			continue
		}
		if c.DefaultValue == nil || c.DefaultValue.Value != tt.want || c.DefaultValue.Null != tt.null || c.DefaultValue.Binary != tt.binary {
			t.Fatal(tt, c.DefaultValue)
		}
	}
	for _, c := range []EditableColumn{{AutoIncrement: true}, {Generated: true}} {
		columnDefault(&c, "NULL", "")
		if c.DefaultValue != nil {
			t.Fatal(c)
		}
	}
}

func TestUnknownDefaultDefinitionsDoNotBlockBrowsing(t *testing.T) {
	for _, source := range []string{
		"CREATE TABLE `sample` (`id` int /*!80000 INVISIBLE */, `text` varchar(20))",
		strings.Repeat("x", 4*1024*1024+1),
	} {
		session := fakeSession(t, &writeConnector{schemaSource: source})
		details, err := session.TableDetails("test", "sample")
		if err != nil || !details.Editable || details.Columns[0].DefaultExpression != "DEFAULT" || details.Columns[0].DefaultValue != nil {
			t.Fatal(details, err)
		}
	}
}
