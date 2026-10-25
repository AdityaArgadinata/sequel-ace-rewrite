package database

import (
	"strings"
	"testing"
)

func TestAdvancedAccountSQL(t *testing.T) {
	base := SAAdminRequest{Kind: "user", Action: "grant", User: "reader", Host: "localhost", Database: "d_b%", Table: "t`x", Privileges: []string{"SELECT"}}
	for _, tc := range []struct {
		scope    string
		columns  []string
		priv     string
		contains string
	}{{"global", nil, "PROCESS", " ON *.* "}, {"database", nil, "SELECT", " ON `d\\_b\\%`.* "}, {"table", nil, "TRIGGER", " ON `d_b%`.`t``x` "}, {"column", []string{"name", "a`b"}, "UPDATE", "UPDATE (`name`, `a``b`)"}, {"procedure", nil, "EXECUTE", "ON PROCEDURE `d_b%`.`t``x`"}, {"function", nil, "ALTER ROUTINE", "ON FUNCTION `d_b%`.`t``x`"}} {
		r := base
		r.Scope = tc.scope
		r.Columns = tc.columns
		r.Privileges = []string{tc.priv}
		q, _, err := adminSQL(r, "")
		if err != nil || !strings.Contains(q, tc.contains) {
			t.Fatal(tc, q, err)
		}
	}
	r := base
	r.Scope = "database"
	r.GrantOption = true
	q, _, err := adminSQL(r, "")
	if err != nil || !strings.HasSuffix(q, "WITH GRANT OPTION") {
		t.Fatal(q, err)
	}
	q, _, err = adminSQLForServer(r, "", "8.4.0", true)
	if err != nil || !strings.Contains(q, "ON `d_b%`.*") {
		t.Fatal(q, err)
	}
	r.Action = "revokeGrantOption"
	q, _, err = adminSQL(r, "")
	if err != nil || !strings.HasPrefix(q, "REVOKE GRANT OPTION ON") {
		t.Fatal(q, err)
	}
	for _, action := range []string{"lock", "unlock", "rename"} {
		r := base
		r.Action = action
		r.NewUser = "new'account"
		r.NewHost = "host"
		if _, _, err := adminSQL(r, "NO_BACKSLASH_ESCAPES"); err != nil {
			t.Fatal(action, err)
		}
	}
	for _, r := range []SAAdminRequest{
		{Kind: "user", Action: "rename", User: "u", Host: "h", NewHost: "h"},
		{Kind: "user", Action: "grant", User: "u", Host: "h", Scope: "column", Database: "d", Table: "t", Columns: []string{"x"}, Privileges: []string{"DELETE"}},
		{Kind: "user", Action: "grant", User: "u", Host: "h", Scope: "procedure", Database: "d", Table: "p", Privileges: []string{"SELECT"}},
		{Kind: "user", Action: "grant", User: "u", Host: "h", Scope: "global", Privileges: []string{"SELECT,INSERT"}},
		{Kind: "user", Action: "grant", User: "u", Host: "h", Scope: "database", Database: "d", Privileges: []string{"SELECT", "SELECT"}},
	} {
		if q, _, err := adminSQL(r, ""); err == nil {
			t.Fatal("invalid grant accepted", q)
		}
	}
}
func TestRoleDialectAndVersionGates(t *testing.T) {
	r := SAAdminRequest{Kind: "user", Action: "grantRole", User: "u", Host: "h", Role: "read'er", RoleHost: "%", GrantOption: true}
	if _, _, err := adminSQL(r, ""); err == nil {
		t.Fatal("MySQL 5.7 accepted roles")
	}
	for _, version := range []string{"8.0.36", "8.4.0", "10.11.0-MariaDB", "5.5.5-10.6.0-MariaDB"} {
		for _, action := range []string{"grantRole", "revokeRole", "defaultRole", "clearDefaultRole"} {
			r.Action = action
			q, _, err := adminSQLForServer(r, "", version, false)
			if err != nil {
				t.Fatal(version, action, err)
			}
			if action == "defaultRole" {
				if strings.Contains(version, "MariaDB") && !strings.Contains(q, "`read'er` FOR ") {
					t.Fatal(q)
				}
				if !strings.Contains(version, "MariaDB") && !strings.Contains(q, "'read''er'@'%' TO ") {
					t.Fatal(q)
				}
			}
		}
	}
	if supportsPartialRevokes("8.0.15") || !supportsPartialRevokes("8.0.16") || supportsPartialRevokes("10.11.0-MariaDB") {
		t.Fatal("partial-revoke capability mismatch")
	}
}
