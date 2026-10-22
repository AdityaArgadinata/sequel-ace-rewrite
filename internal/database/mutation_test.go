package database

import (
	"reflect"
	"strings"
	"testing"
)

func mutationFixture() (Mutation, TableDetails) {
	d := TableDetails{Editable: true, Columns: []EditableColumn{{Name: "id`", Primary: true}, {Name: "part", Primary: true}, {Name: "value", Nullable: true}, {Name: "computed", Generated: true}}}
	r := Mutation{Database: "db`", Table: "table`", Action: "update", Columns: []string{"id`", "part", "value", "computed"}, Original: []Cell{{Value: "1"}, {Value: "2"}, {Null: true}, {Value: "3"}}, Values: map[string]Cell{"value": {Value: "x' OR 1=1 --"}}}
	return r, d
}
func TestMutationSQL(t *testing.T) {
	r, d := mutationFixture()
	q, args, err := mutationSQL(r, d)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(q, "UPDATE `db```.`table``` SET `value`=? WHERE `id``` <=> ? AND `part` <=> ? AND CAST(") || !strings.HasSuffix(q, " LIMIT 1") || strings.Contains(q, "OR 1=1") {
		t.Fatal(q)
	}
	want := []any{"x' OR 1=1 --", "1", "2", "1", "2", nil, "3"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("%#v", args)
	}
	r.Action = "delete"
	r.Values = nil
	q, args, err = mutationSQL(r, d)
	if err != nil || !strings.HasPrefix(q, "DELETE FROM ") || len(args) != 6 {
		t.Fatalf("%s %#v %v", q, args, err)
	}
	r.Action = "insert"
	r.Values = map[string]Cell{"value": {Null: true}}
	q, args, err = mutationSQL(r, d)
	if err != nil || q != "INSERT INTO `db```.`table``` (`value`) VALUES (?)" || !reflect.DeepEqual(args, []any{nil}) {
		t.Fatalf("%s %#v %v", q, args, err)
	}
	r.Values = nil
	q, _, err = mutationSQL(r, d)
	if err != nil || !strings.HasSuffix(q, "() VALUES ()") {
		t.Fatal(q, err)
	}
}
func TestMutationRejectsUnsafeRequests(t *testing.T) {
	for _, change := range []func(*Mutation, *TableDetails){
		func(r *Mutation, d *TableDetails) { d.Editable = false },
		func(r *Mutation, d *TableDetails) { r.Database = "bad\x00" },
		func(r *Mutation, d *TableDetails) { r.Action = "replace" },
		func(r *Mutation, d *TableDetails) { r.Columns[0] = "other" },
		func(r *Mutation, d *TableDetails) { r.Original = r.Original[:1] },
		func(r *Mutation, d *TableDetails) { r.Original[0] = Cell{Null: true} },
		func(r *Mutation, d *TableDetails) { r.Values["unknown"] = Cell{} },
		func(r *Mutation, d *TableDetails) { r.Values["computed"] = Cell{} },
		func(r *Mutation, d *TableDetails) { r.Values["part"] = Cell{Null: true} },
		func(r *Mutation, d *TableDetails) { r.Values["value"] = Cell{Binary: true, Value: "0xGG"} },
		func(r *Mutation, d *TableDetails) { r.Values = nil },
		func(r *Mutation, d *TableDetails) { r.Action = "delete" },
	} {
		r, d := mutationFixture()
		change(&r, &d)
		if _, _, err := mutationSQL(r, d); err == nil {
			t.Fatal("unsafe mutation accepted", r)
		}
	}
}
func TestCellArgument(t *testing.T) {
	for _, tt := range []struct {
		cell Cell
		want any
	}{{Cell{Null: true}, nil}, {Cell{Value: ""}, ""}, {Cell{Binary: true, Value: "0x00ff"}, []byte{0, 255}}, {Cell{Binary: true, Value: "0x"}, []byte{}}} {
		got, err := cellArgument(tt.cell)
		if err != nil || !reflect.DeepEqual(got, tt.want) {
			t.Fatal(got, err)
		}
	}
	for _, c := range []Cell{{Binary: true, Value: "ff"}, {Binary: true, Value: "0x0"}, {Value: strings.Repeat("x", MaxResultBytes+1)}} {
		if _, err := cellArgument(c); err == nil {
			t.Fatal("invalid cell accepted")
		}
	}
}
