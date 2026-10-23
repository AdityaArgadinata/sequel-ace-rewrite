package database

import (
	"strings"
	"testing"
)

func TestColumnAttributeEditsPreserveOtherSQL(t *testing.T) {
	tests := []struct {
		source     string
		edits      map[string]string
		want, mode string
	}{
		{"varchar(30) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL DEFAULT 'DEFAULT (hi), it''s' COMMENT 'UNSIGNED'", map[string]string{"length": "80", "encoding": "utf8mb4", "collation": "utf8mb4_unicode_ci"}, "VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DEFAULT (hi), it''s' COMMENT 'UNSIGNED'", ""},
		{"int GENERATED ALWAYS AS ((`id` + 1)) STORED COMMENT 'keep'", map[string]string{"type": "BIGINT"}, "BIGINT GENERATED ALWAYS AS ((`id` + 1)) STORED COMMENT 'keep'", ""},
		{"enum('a,b','it\\'s','DEFAULT') DEFAULT 'a,b' COMMENT 'keep'", map[string]string{"nullable": "false"}, "enum('a,b','it\\'s','DEFAULT') DEFAULT 'a,b' COMMENT 'keep' NOT NULL", ""},
		{"int DEFAULT 3 COLUMN_FORMAT DEFAULT STORAGE MEMORY CHECK ((`id` > 0))", map[string]string{"default": "4"}, "int DEFAULT 4 COLUMN_FORMAT DEFAULT STORAGE MEMORY CHECK ((`id` > 0))", ""},
		{"varchar(30) NULL DEFAULT 'a\\' COMMENT 'keep'", map[string]string{"comment": "c\\'d"}, "varchar(30) NULL DEFAULT 'a\\' COMMENT 'c\\''d'", "NO_BACKSLASH_ESCAPES"},
		{"varchar(30) NULL DEFAULT 'a'", map[string]string{"encoding": "utf8mb4", "collation": "utf8mb4_bin"}, "varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL DEFAULT 'a'", ""},
		{"timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'ON UPDATE'", map[string]string{"extra": "None"}, "timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)  COMMENT 'ON UPDATE'", ""},
		{"varchar(30) DEFAULT 'old'", map[string]string{"default": "x'; DROP TABLE t; --", "comment": "c'\\"}, "varchar(30) DEFAULT 'x''; DROP TABLE t; --' COMMENT 'c''\\\\'", ""},
	}
	for _, tt := range tests {
		got, err := patchColumnAttributes(tt.source, tt.edits, tt.mode)
		if err != nil || got != tt.want {
			t.Fatalf("%q: got %q (%v), want %q", tt.source, got, err, tt.want)
		}
	}
}
func TestColumnAttributeRejectsInvalidEdits(t *testing.T) {
	for _, edits := range []map[string]string{
		{"type": "INT; DROP TABLE t"}, {"length": "1) NULL, ADD bad INT ("}, {"encoding": "utf8mb4; DROP TABLE t"},
		{"collation": "utf8mb4_bin --"}, {"unsigned": "yes"}, {"extra": "GENERATED AS (1)"}, {"unknown": "x"},
	} {
		if _, err := patchColumnAttributes("int DEFAULT 1", edits, ""); err == nil {
			t.Fatal("accepted", edits)
		}
	}
	got, err := schemaSQL(SASchemaChange{Database: "d", Table: "t", Kind: "column", Action: "edit", Original: "id", Name: "renamed", Definition: "INT /* stale client SQL */", ColumnEdits: map[string]string{"type": "BIGINT"}}, []SASchemaObject{{Kind: "column", Name: "id", Definition: "int NOT NULL COMMENT 'server definition'"}}, "")
	if err != nil || !strings.Contains(got, "`renamed` BIGINT NOT NULL COMMENT 'server definition'") {
		t.Fatal(got, err)
	}
}

func TestColumnDefaultValuesKeepText(t *testing.T) {
	for _, tt := range []struct{ source, value, want string }{
		{"varchar(20)", "001.00", "varchar(20) DEFAULT '001.00'"},
		{"varchar(20)", "CURRENT_TIMESTAMP", "varchar(20) DEFAULT 'CURRENT_TIMESTAMP'"},
		{"int", "42", "int DEFAULT 42"},
		{"timestamp(3)", "CURRENT_TIMESTAMP(3)", "timestamp(3) DEFAULT CURRENT_TIMESTAMP(3)"},
	} {
		got, err := patchColumnAttributes(tt.source, map[string]string{"default": tt.value}, "")
		if err != nil || got != tt.want {
			t.Fatal(got, err, tt.want)
		}
	}
}
