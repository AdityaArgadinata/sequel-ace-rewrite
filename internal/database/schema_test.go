package database

import (
	"strings"
	"testing"
)

func TestSchemaDefinitionRoundTrip(t *testing.T) {
	source := "CREATE TABLE `example` (\n `i``d` int NOT NULL AUTO_INCREMENT,\n `text` enum('a,b','it''s','semi;') DEFAULT 'a,b' COMMENT 'c, (d)',\n `g` int GENERATED ALWAYS AS ((`i``d` + 1)) STORED,\n PRIMARY KEY (`i``d`),\n UNIQUE KEY `u``q` (`text`(8)) USING BTREE COMMENT 'keep',\n FULLTEXT KEY `search` (`text`),\n CONSTRAINT `fk` FOREIGN KEY (`i``d`) REFERENCES `parent` (`id`) ON DELETE CASCADE,\n CONSTRAINT `check` CHECK (`i``d` > 0)\n) ENGINE=InnoDB"
	objects, err := schemaObjects(source, "")
	if err != nil || len(objects) != 7 {
		t.Fatal(objects, err)
	}
	if objects[0].Name != "i`d" || objects[1].Definition != "enum('a,b','it''s','semi;') DEFAULT 'a,b' COMMENT 'c, (d)'" || objects[3].IndexKind != "PRIMARY" || objects[4].IndexKind != "UNIQUE" || objects[6].Kind != "foreignKey" {
		t.Fatal(objects)
	}
	sql, err := schemaSQL(SASchemaChange{Database: "d`b", Table: "example", Action: "edit", Kind: "column", Original: "text", Name: "renamed", Definition: objects[1].Definition}, objects, "")
	if err != nil || sql != "ALTER TABLE `d``b`.`example` CHANGE COLUMN `text` `renamed` "+objects[1].Definition {
		t.Fatal(sql, err)
	}
}
func TestSchemaSQLBuild(t *testing.T) {
	objects := []SASchemaObject{{Kind: "column", Name: "id"}, {Kind: "index", Name: "PRIMARY"}, {Kind: "index", Name: "old"}, {Kind: "foreignKey", Name: "old_fk"}}
	tests := []struct {
		r    SASchemaChange
		want string
	}{
		{SASchemaChange{Action: "add", Kind: "column", Name: "new", Definition: "varchar(30) NULL DEFAULT 'a; b'"}, "ADD COLUMN `new` varchar(30) NULL DEFAULT 'a; b'"},
		{SASchemaChange{Action: "drop", Kind: "column", Original: "id"}, "DROP COLUMN `id`"},
		{SASchemaChange{Action: "edit", Kind: "index", Original: "PRIMARY", Name: "PRIMARY", IndexKind: "PRIMARY", Definition: "(`id`)"}, "DROP PRIMARY KEY, ADD PRIMARY KEY (`id`)"},
		{SASchemaChange{Action: "edit", Kind: "index", Original: "old", Name: "uq", IndexKind: "UNIQUE", Definition: "(`id`) USING BTREE"}, "DROP INDEX `old`, ADD UNIQUE INDEX `uq` (`id`) USING BTREE"},
		{SASchemaChange{Action: "drop", Kind: "index", Original: "PRIMARY"}, "DROP PRIMARY KEY"},
		{SASchemaChange{Action: "add", Kind: "foreignKey", Name: "fk", Definition: "(`id`) REFERENCES `parent` (`id`) ON DELETE RESTRICT"}, "ADD CONSTRAINT `fk` FOREIGN KEY (`id`) REFERENCES `parent` (`id`) ON DELETE RESTRICT"},
		{SASchemaChange{Action: "edit", Kind: "foreignKey", Original: "old_fk", Name: "fk", Definition: "(`id`) REFERENCES `parent` (`id`)"}, "DROP FOREIGN KEY `old_fk`, ADD CONSTRAINT `fk` FOREIGN KEY (`id`) REFERENCES `parent` (`id`)"},
	}
	for _, tt := range tests {
		tt.r.Database = "db"
		tt.r.Table = "table"
		sql, err := schemaSQL(tt.r, objects, "")
		if err != nil || sql != "ALTER TABLE `db`.`table` "+tt.want {
			t.Fatal(sql, err, tt.want)
		}
	}
}
func TestSchemaFragmentBoundary(t *testing.T) {
	for _, text := range []string{"int, DROP COLUMN `id`", "int; DROP TABLE t", "int /*, ADD x int */", "int -- comment", "int #comment", "int)", "varchar(20", "enum('open)", "int\x00", strings.Repeat("x", 65537)} {
		if err := validateSchemaFragment(text, ""); err == nil {
			t.Fatalf("accepted %q", text)
		}
	}
	for _, text := range []string{"enum('a,b','it''s','x;#--') DEFAULT 'a,b'", "int GENERATED ALWAYS AS ((`id` + 1)) STORED", "(`a`(10), `b` DESC) USING BTREE COMMENT 'keep'", "varchar(50) DEFAULT 'it\\'s'"} {
		if err := validateSchemaFragment(text, ""); err != nil {
			t.Fatal(text, err)
		}
	}
	if err := validateSchemaFragment("varchar(10) DEFAULT 'a\\'", "NO_BACKSLASH_ESCAPES"); err != nil {
		t.Fatal(err)
	}
	if err := validateSchemaFragment("varchar(10) DEFAULT 'a\\'", ""); err == nil {
		t.Fatal("unclosed quote accepted")
	}
}
func TestSchemaRejectsStaleOrInvalidObjects(t *testing.T) {
	objects := []SASchemaObject{{Kind: "column", Name: "id"}}
	for _, r := range []SASchemaChange{
		{Action: "drop", Kind: "column", Original: "missing"},
		{Action: "add", Kind: "column", Name: "ID", Definition: "int"},
		{Action: "add", Kind: "index", Name: "PRIMARY", IndexKind: "INDEX", Definition: "(`id`)"},
		{Action: "add", Kind: "index", Name: "key", IndexKind: "unknown", Definition: "(`id`)"},
		{Action: "add", Kind: "foreignKey", Name: "fk", Definition: "REFERENCES parent(id)"},
		{Action: "add", Kind: "column", Name: strings.Repeat("a", 65), Definition: "int"},
		{Action: "drop", Kind: "table", Original: "id"},
		{Action: "edit", Kind: "foreignKey", Original: "fk", Name: "fk", Definition: "(`id`) REFERENCES t(id)"},
	} {
		r.Database = "db"
		r.Table = "t"
		if sql, err := schemaSQL(r, objects, ""); err == nil {
			t.Fatal("accepted", sql)
		}
	}
	s := &Session{}
	if _, err := s.ApplySchemaChange("missing"); err == nil {
		t.Fatal("applied without a preview")
	}
}

func TestSchemaANSIQuotedIdentifiers(t *testing.T) {
	objects, err := schemaObjects(`CREATE TABLE "t" ("id" int, UNIQUE KEY "u" ("id"), CONSTRAINT "fk" FOREIGN KEY ("id") REFERENCES "parent" ("id"))`, "ANSI_QUOTES")
	if err != nil || len(objects) != 3 || objects[0].Name != "id" || objects[1].IndexKind != "UNIQUE" || objects[2].Name != "fk" {
		t.Fatal(objects, err)
	}
}

func TestSchemaFingerprintIgnoresOnlyNextAutoIncrement(t *testing.T) {
	a := "CREATE TABLE `t` (`id` int AUTO_INCREMENT, `text` varchar(40) COMMENT ' AUTO_INCREMENT=4') ENGINE=InnoDB AUTO_INCREMENT=4 COMMENT='keep AUTO_INCREMENT=4'"
	b := strings.Replace(a, "ENGINE=InnoDB AUTO_INCREMENT=4", "ENGINE=InnoDB AUTO_INCREMENT=1000", 1)
	if schemaFingerprint(a, "") != schemaFingerprint(b, "") {
		t.Fatal("ordinary insert invalidated schema preview")
	}
	for _, changed := range []string{strings.Replace(a, "COMMENT ' AUTO_INCREMENT=4'", "COMMENT ' AUTO_INCREMENT=5'", 1), strings.Replace(a, "keep AUTO_INCREMENT=4", "keep AUTO_INCREMENT=5", 1), strings.Replace(a, "`id` int", "`id` bigint", 1)} {
		if schemaFingerprint(a, "") == schemaFingerprint(changed, "") {
			t.Fatal("schema change was ignored", changed)
		}
	}
	if schemaFingerprint(a, "") == schemaFingerprint(a, "ANSI_QUOTES") {
		t.Fatal("SQL mode ignored")
	}
}
