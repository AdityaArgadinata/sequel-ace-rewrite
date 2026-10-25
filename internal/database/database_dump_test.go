package database

import (
	"bytes"
	"sequel-rewrite/internal/sqlscript"
	"strings"
	"testing"
)

func TestDatabaseDumpDependencies(t *testing.T) {
	out := SADatabaseInventory{Database: "d`b", Objects: []SADumpObject{
		{Kind: "VIEW", Name: "a", Definition: "CREATE VIEW `a` AS select * from `d``b`.`z` where 'd`b.z' <> ''"},
		{Kind: "TRIGGER", Name: "trigger"}, {Kind: "VIEW", Name: "z", Definition: "CREATE VIEW `z` AS select `d``b`.`base`.`id` from `d``b`.`base`"},
		{Kind: "FUNCTION", Name: "f"}, {Kind: "TABLE", Name: "base"}, {Kind: "EVENT", Name: "e"},
	}}
	if err := orderDumpObjects(&out); err != nil {
		t.Fatal(err)
	}
	names := []string{}
	for _, o := range out.Objects {
		names = append(names, o.Name)
	}
	if strings.Join(names, ",") != "base,f,z,a,trigger,e" {
		t.Fatal(names)
	}
	if strings.Join(out.Objects[3].Dependencies, ",") != "d`b.z" {
		t.Fatal(out.Objects[3])
	}
	out.Objects[2].Definition = "CREATE VIEW `z` AS select * from `d``b`.`a`"
	if orderDumpObjects(&out) == nil {
		t.Fatal("cycle accepted")
	}
	refs := dumpReferences("'`db`.`fake`' /* `db`.`fake2` */ `db`.`real` -- `db`.`fake3`\n `db`.`other`", "")
	if strings.Join(refs, ",") != "db.real,db.other" {
		t.Fatal(refs)
	}
}
func TestDatabaseDumpDelimiterAndEvent(t *testing.T) {
	var b bytes.Buffer
	w := &saDumpWriter{w: &b}
	source := "CREATE PROCEDURE `p`() BEGIN SELECT '$$;'; SELECT '😀'; END"
	if err := w.statement(source); err != nil {
		t.Fatal(err)
	}
	parsed, err := sqlscript.ParseImport(b.String(), "")
	if err != nil || len(parsed) != 1 || parsed[0].SQL != source {
		t.Fatal(parsed, err)
	}
	for _, status := range []string{"ENABLE", "DISABLE", "DISABLE ON SLAVE", "DISABLE ON REPLICA"} {
		sql := "CREATE EVENT `ENABLE` ON SCHEDULE EVERY 1 DAY ON COMPLETION NOT PRESERVE " + status + " COMMENT 'DO ENABLE' DO INSERT INTO `t` VALUES ('ENABLE')"
		got, err := disabledDumpEvent(sql, "")
		if err != nil || !strings.Contains(got, "NOT PRESERVE DISABLE COMMENT") || !strings.HasSuffix(got, "VALUES ('ENABLE')") {
			t.Fatal(got, err)
		}
	}
	if _, err := disabledDumpEvent("CREATE EVENT `x` ON SCHEDULE EVERY 1 DAY DO SELECT 1", ""); err == nil {
		t.Fatal("missing status accepted")
	}
	limited := &saDumpWriter{w: &b, bytes: 64 * 1024 * 1024}
	if _, err := limited.Write([]byte("x")); err == nil {
		t.Fatal("size cap bypassed")
	}
	limited = &saDumpWriter{w: &b, statements: 100000}
	if err := limited.statement("SELECT 1"); err == nil {
		t.Fatal("statement cap bypassed")
	}
}
