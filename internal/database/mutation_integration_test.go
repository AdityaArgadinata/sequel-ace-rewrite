package database

import (
	"fmt"
	"os"
	"strconv"
	"testing"
	"time"
)

func TestMutationIntegration(t *testing.T) {
	portText := os.Getenv("SEQUEL_TEST_PORT")
	if portText == "" {
		t.Skip("disposable database not configured")
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		t.Fatal(err)
	}
	connection := Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD")}
	var s, other Session
	for _, session := range []*Session{&s, &other} {
		if err := session.Connect(connection); err != nil {
			t.Fatal(err)
		}
		defer session.Shutdown()
	}
	run := func(session *Session, q string) Result {
		t.Helper()
		r, err := session.Query(q)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	name := fmt.Sprintf("sequel_rewrite_test_mutation_%d", time.Now().UnixNano())
	target := quoteIdentifier(name) + ".`odd``table`"
	run(&s, "CREATE DATABASE "+quoteIdentifier(name))
	defer run(&other, "DROP DATABASE "+quoteIdentifier(name))
	run(&s, "CREATE TABLE "+target+" (`part` INT, `id` INT, `text` VARCHAR(128) NULL, `bytes` VARBINARY(16), `computed` INT GENERATED ALWAYS AS (part+id) STORED, PRIMARY KEY(part,id)) ENGINE=InnoDB")
	run(&s, "INSERT INTO "+target+" (part,id,text,bytes) VALUES (1,1,NULL,0x00ff),(1,2,'case',0x6162),(2,1,'other',X'')")
	details, err := s.TableDetails(name, "odd`table")
	if err != nil || !details.Editable || !details.Columns[4].Generated {
		t.Fatal(details, err)
	}
	browse := func() Result {
		t.Helper()
		r, err := s.Browse(BrowseRequest{Database: name, Table: "odd`table", Limit: 50, Sort: "id"})
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	request := func(row []Cell, columns []Column, action string) Mutation {
		names := []string{}
		for _, c := range columns {
			names = append(names, c.Name)
		}
		return Mutation{Database: name, Table: "odd`table", Action: action, Columns: names, Original: row, Values: map[string]Cell{}}
	}
	snapshot := browse()
	var row []Cell
	for _, r := range snapshot.Rows {
		if r[0].Value == "1" && r[1].Value == "1" {
			row = r
		}
	}
	if row == nil {
		t.Fatal("row missing")
	}
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	r := request(row, snapshot.Columns, "update")
	r.Values["text"] = Cell{Value: "quote' \\ %_!"}
	r.Values["bytes"] = Cell{Binary: true, Value: "0xff00"}
	if n, err := s.Mutate(r); err != nil || n != 1 {
		t.Fatal(n, err)
	}
	if n, err := s.Mutate(r); err == nil || n != 0 {
		t.Fatal("stale snapshot accepted", n, err)
	}
	data := run(&other, "SELECT text,HEX(bytes) FROM "+target+" WHERE part=1 AND id=1")
	if data.Rows[0][0].Value != "quote' \\ %_!" || data.Rows[0][1].Value != "FF00" {
		t.Fatal(data)
	}
	data = run(&other, "SELECT text FROM "+target+" WHERE part=2 AND id=1")
	if data.Rows[0][0].Value != "other" {
		t.Fatal("composite key changed another row")
	}
	snapshot = browse()
	for _, row := range snapshot.Rows {
		if row[0].Value == "1" && row[1].Value == "2" {
			r = request(row, snapshot.Columns, "delete")
			// Case-only concurrent updates must conflict despite a case-insensitive collation.
			run(&other, "UPDATE "+target+" SET text='CASE' WHERE part=1 AND id=2")
			if _, err := s.Mutate(r); err == nil {
				t.Fatal("concurrent delete overwrote case-only change")
			}
		}
	}
	r = Mutation{Database: name, Table: "odd`table", Action: "insert", Values: map[string]Cell{"part": {Value: "3"}, "id": {Value: "1"}, "text": {Null: true}, "bytes": {Binary: true, Value: "0x"}}}
	if n, err := s.Mutate(r); err != nil || n != 1 {
		t.Fatal(n, err)
	}
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	} // resolve state from setup SQL
	if err := s.Transaction("begin"); err != nil {
		t.Fatal(err)
	}
	r.Values["part"] = Cell{Value: "4"}
	if _, err := s.Mutate(r); err != nil {
		t.Fatal(err)
	}
	if s.TransactionStatus() != "active" {
		t.Fatal(s.TransactionStatus())
	}
	if data := run(&other, "SELECT COUNT(*) FROM "+target+" WHERE part=4"); data.Rows[0][0].Value != "0" {
		t.Fatal("uncommitted insert leaked")
	}
	if _, err := s.Query("CREATE TABLE " + quoteIdentifier(name) + ".implicit_commit(id INT)"); err == nil {
		t.Fatal("implicit commit allowed")
	}
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	if data := run(&other, "SELECT COUNT(*) FROM "+target+" WHERE part=4"); data.Rows[0][0].Value != "0" {
		t.Fatal("rollback failed")
	}
	if err := s.Transaction("begin"); err != nil {
		t.Fatal(err)
	}
	r.Values["part"] = Cell{Value: "5"}
	if _, err := s.Mutate(r); err != nil {
		t.Fatal(err)
	}
	if err := s.Transaction("commit"); err != nil {
		t.Fatal(err)
	}
	if data := run(&other, "SELECT COUNT(*) FROM "+target+" WHERE part=5"); data.Rows[0][0].Value != "1" {
		t.Fatal("commit failed")
	}
	snapshot = browse()
	for _, row := range snapshot.Rows {
		if row[0].Value == "3" {
			r = request(row, snapshot.Columns, "delete")
			if n, err := s.Mutate(r); err != nil || n != 1 {
				t.Fatal(n, err)
			}
			if _, err := s.Mutate(r); err == nil {
				t.Fatal("deleted snapshot accepted")
			}
		}
	}
	// Kill the physical connection while a trigger holds the INSERT in flight.
	connectionID := run(&s, "SELECT CONNECTION_ID()").Rows[0][0].Value
	if _, err := strconv.ParseUint(connectionID, 10, 64); err != nil {
		t.Fatal(err)
	}
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	run(&other, "CREATE TRIGGER "+quoteIdentifier(name)+".hold_write BEFORE INSERT ON "+target+" FOR EACH ROW SET @fixture_sleep = SLEEP(10)")
	pending := Mutation{Database: name, Table: "odd`table", Action: "insert", Values: map[string]Cell{"part": {Value: "77"}, "id": {Value: "1"}}}
	done := make(chan error, 1)
	go func() { _, err := s.Mutate(pending); done <- err }()
	deadline := time.Now().Add(5 * time.Second)
	observed := false
	for time.Now().Before(deadline) {
		active := run(&other, "SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE ID="+connectionID+" AND STATE='User sleep'")
		if active.Rows[0][0].Value == "1" {
			observed = true
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	run(&other, "KILL CONNECTION "+connectionID)
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("disconnected write reported success")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("disconnected write did not return")
	}
	if !observed {
		t.Fatal("fixture did not observe in-flight INSERT")
	}
	if s.Connected() {
		t.Fatal("failed write session retained")
	}
	if run(&other, "SELECT COUNT(*) FROM "+target+" WHERE part=77").Rows[0][0].Value != "0" {
		t.Fatal("interrupted write was committed or replayed")
	}
	if err := s.Connect(connection); err != nil {
		t.Fatal(err)
	}
	run(&s, "CREATE TABLE "+quoteIdentifier(name)+".no_key(id INT) ENGINE=InnoDB")
	run(&s, "CREATE VIEW "+quoteIdentifier(name)+".a_view AS SELECT * FROM "+target)
	for _, table := range []string{"no_key", "a_view"} {
		d, err := s.TableDetails(name, table)
		if err != nil || d.Editable {
			t.Fatal(table, d, err)
		}
		r = Mutation{Database: name, Table: table, Action: "insert", Values: map[string]Cell{"id": {Value: "1"}}}
		if _, err := s.Mutate(r); err == nil {
			t.Fatal("read-only table writable", table)
		}
	}
}

func TestMyISAMMutationIntegration(t *testing.T) {
	portText := os.Getenv("SEQUEL_TEST_PORT")
	if portText == "" {
		t.Skip("disposable database not configured")
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		t.Fatal(err)
	}
	connection := Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD")}
	var s, other Session
	for _, session := range []*Session{&s, &other} {
		if err := session.Connect(connection); err != nil {
			t.Fatal(err)
		}
		defer session.Shutdown()
	}
	name := fmt.Sprintf("sequel_rewrite_test_myisam_%d", time.Now().UnixNano())
	target := quoteIdentifier(name) + ".`config`"
	run := func(session *Session, q string) Result {
		t.Helper()
		r, err := session.Query(q)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	run(&s, "CREATE DATABASE "+quoteIdentifier(name))
	defer run(&other, "DROP DATABASE "+quoteIdentifier(name))
	run(&s, "CREATE TABLE "+target+" (id INT PRIMARY KEY, name VARCHAR(25), params TEXT) ENGINE=MyISAM")
	run(&s, "INSERT INTO "+target+" VALUES (1,'email','old')")
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	d, err := s.TableDetails(name, "config")
	if err != nil || !d.Editable || d.Engine != "MyISAM" {
		t.Fatal(d, err)
	}
	browse := func() Result {
		t.Helper()
		r, err := s.Browse(BrowseRequest{Database: name, Table: "config", Limit: 50})
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	snapshot := browse()
	request := Mutation{Database: name, Table: "config", Action: "update", Columns: []string{"id", "name", "params"}, Original: snapshot.Rows[0], Values: map[string]Cell{"params": {Value: "new"}}}
	if err := s.Transaction("begin"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Mutate(request); err == nil {
		t.Fatal("MyISAM wrote inside managed transaction")
	}
	if s.TransactionStatus() != "active" {
		t.Fatal("managed transaction was ended")
	}
	if err := s.Transaction("rollback"); err != nil {
		t.Fatal(err)
	}
	if n, err := s.Mutate(request); err != nil || n != 1 {
		t.Fatal(n, err)
	}
	if got := run(&other, "SELECT params FROM "+target).Rows[0][0].Value; got != "new" {
		t.Fatal("write not immediately visible", got)
	}
	// The stale original must not overwrite the value just saved.
	request.Values = map[string]Cell{"params": {Value: "stale"}}
	if _, err := s.Mutate(request); err == nil {
		t.Fatal("stale row overwritten")
	}
	// A second session can write after conflict cleanup, proving UNLOCK ran.
	run(&other, "UPDATE "+target+" SET params='external' WHERE id=1")
	request.Original = browse().Rows[0]
	request.Values = map[string]Cell{"unknown": {Value: "bad"}}
	if _, err := s.Mutate(request); err == nil {
		t.Fatal("invalid column accepted")
	}
	run(&other, "UPDATE "+target+" SET params='after validation error' WHERE id=1")
	request.Original = browse().Rows[0]
	request.Action = "delete"
	request.Values = nil
	if n, err := s.Mutate(request); err != nil || n != 1 {
		t.Fatal(n, err)
	}
	request.Action = "insert"
	request.Columns = nil
	request.Original = nil
	request.Values = map[string]Cell{"id": {Value: "2"}, "name": {Value: "entry"}, "params": {Null: true}}
	if n, err := s.Mutate(request); err != nil || n != 1 {
		t.Fatal(n, err)
	}
	if rows := browse().Rows; len(rows) != 1 || !rows[0][2].Null {
		t.Fatal(rows)
	}
}

func TestUniqueIdentityMutationIntegration(t *testing.T) {
	portText := os.Getenv("SEQUEL_TEST_PORT")
	if portText == "" {
		t.Skip("disposable database not configured")
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		t.Fatal(err)
	}
	var s Session
	if err := s.Connect(Connection{Host: "127.0.0.1", Port: port, User: "root", Password: os.Getenv("SEQUEL_TEST_PASSWORD")}); err != nil {
		t.Fatal(err)
	}
	defer s.Shutdown()
	name := fmt.Sprintf("sequel_rewrite_test_unique_%d", time.Now().UnixNano())
	run := func(q string) Result {
		t.Helper()
		r, err := s.Query(q)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	run("CREATE DATABASE " + quoteIdentifier(name))
	defer run("DROP DATABASE " + quoteIdentifier(name))
	for _, engine := range []string{"InnoDB", "MyISAM"} {
		t.Run(engine, func(t *testing.T) {
			table := "unique_" + engine
			target := quoteIdentifier(name) + "." + quoteIdentifier(table)
			run("CREATE TABLE " + target + " (tenant INT NOT NULL, code VARCHAR(20) NOT NULL, value TEXT, UNIQUE KEY identity_key(tenant,code)) ENGINE=" + engine)
			run("INSERT INTO " + target + " VALUES (1,'one','old'),(2,'one','other')")
			if err := s.Transaction("rollback"); err != nil {
				t.Fatal(err)
			}
			d, err := s.TableDetails(name, table)
			if err != nil || !d.Editable || !d.Columns[0].Identity || !d.Columns[1].Identity || d.Columns[0].Primary {
				t.Fatal(d, err)
			}
			result, err := s.Browse(BrowseRequest{Database: name, Table: table, Sort: "tenant", Limit: 50})
			if err != nil {
				t.Fatal(err)
			}
			request := Mutation{Database: name, Table: table, Action: "update", Columns: []string{"tenant", "code", "value"}, Original: result.Rows[0], Values: map[string]Cell{"value": {Value: "new"}}}
			if n, err := s.Mutate(request); err != nil || n != 1 {
				t.Fatal(n, err)
			}
			// Composite identity and the old full-row snapshot must both remain in WHERE.
			if _, err := s.Mutate(request); err == nil {
				t.Fatal("stale unique row overwritten")
			}
			check := run("SELECT value FROM " + target + " ORDER BY tenant")
			if check.Rows[0][0].Value != "new" || check.Rows[1][0].Value != "other" {
				t.Fatal(check)
			}
			if err := s.Transaction("rollback"); err != nil {
				t.Fatal(err)
			}
		})
	}
	run("CREATE TABLE " + quoteIdentifier(name) + ".nullable_key (code VARCHAR(20) UNIQUE, value TEXT) ENGINE=InnoDB")
	d, err := s.TableDetails(name, "nullable_key")
	if err != nil || d.Editable {
		t.Fatal("nullable unique key became editable", d, err)
	}
	run("CREATE TABLE " + quoteIdentifier(name) + ".auto_id (id INT PRIMARY KEY AUTO_INCREMENT, value TEXT) ENGINE=InnoDB")
	d, err = s.TableDetails(name, "auto_id")
	if err != nil || !d.Columns[0].AutoIncrement || d.Columns[1].AutoIncrement {
		t.Fatal("auto increment metadata", d, err)
	}
}
