package database

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

var globalPrivileges = "SELECT,INSERT,UPDATE,DELETE,CREATE,DROP,ALTER,INDEX,REFERENCES,TRIGGER,CREATE VIEW,SHOW VIEW,EXECUTE,CREATE ROUTINE,ALTER ROUTINE,EVENT,CREATE TEMPORARY TABLES,LOCK TABLES,PROCESS,RELOAD,SHUTDOWN,FILE,SHOW DATABASES,SUPER,REPLICATION CLIENT,REPLICATION SLAVE,CREATE USER,CREATE TABLESPACE"
var databasePrivileges = "SELECT,INSERT,UPDATE,DELETE,CREATE,DROP,ALTER,INDEX,REFERENCES,TRIGGER,CREATE VIEW,SHOW VIEW,EXECUTE,CREATE ROUTINE,ALTER ROUTINE,EVENT,CREATE TEMPORARY TABLES,LOCK TABLES"
var tablePrivileges = "SELECT,INSERT,UPDATE,DELETE,CREATE,DROP,ALTER,INDEX,REFERENCES,TRIGGER,CREATE VIEW,SHOW VIEW"

func privilegeScope(r SAAdminRequest, partialRevokes bool) (string, string, error) {
	scope := r.Scope
	if scope == "" {
		scope = "database"
		if r.Table != "" {
			scope = "table"
		}
	}
	if scope == "global" {
		return "*.*", globalPrivileges, nil
	}
	if !objectName(r.Database) {
		return "", "", errors.New("select a privilege database")
	}
	switch scope {
	case "database":
		name := r.Database
		if !partialRevokes {
			name = strings.NewReplacer("\\", "\\\\", "_", "\\_", "%", "\\%").Replace(name)
		}
		return quoteIdentifier(name) + ".*", databasePrivileges, nil
	case "table", "column":
		if !objectName(r.Table) {
			return "", "", errors.New("select a privilege table")
		}
		allowed := tablePrivileges
		if scope == "column" {
			allowed = "SELECT,INSERT,UPDATE,REFERENCES"
		}
		return qualified(r.Database, r.Table), allowed, nil
	case "procedure", "function":
		if !objectName(r.Table) {
			return "", "", errors.New("select a privilege routine")
		}
		return strings.ToUpper(scope) + " " + qualified(r.Database, r.Table), "EXECUTE,ALTER ROUTINE", nil
	}
	return "", "", errors.New("unknown privilege scope")
}
func accountPrivilegesSQL(r SAAdminRequest, mode, version string, partialRevokes bool) (string, string, error) {
	account := adminString(r.User, mode) + "@" + adminString(r.Host, mode)
	switch r.Action {
	case "rename":
		if r.NewUser == "" || !accountPart(r.NewUser) || !accountPart(r.NewHost) || r.NewHost == "" {
			return "", "", errors.New("enter the new account user and host")
		}
		v := "RENAME USER " + account + " TO " + adminString(r.NewUser, mode) + "@" + adminString(r.NewHost, mode)
		return v, v, nil
	case "lock", "unlock":
		v := "ALTER USER " + account + " ACCOUNT " + strings.ToUpper(r.Action)
		return v, v, nil
	case "grantRole", "revokeRole", "defaultRole", "clearDefaultRole":
		maria := strings.Contains(strings.ToLower(version), "mariadb")
		major, minor, _ := serverVersionNumbers(version)
		if (!maria && major < 8) || (maria && (major < 10 || major == 10 && minor < 2)) {
			return "", "", errors.New("role assignment requires MySQL 8+ or MariaDB 10.2+")
		}
		role := ""
		if r.Action != "clearDefaultRole" {
			if !accountPart(r.Role) || r.Role == "" {
				return "", "", errors.New("enter an existing role")
			}
			if maria {
				role = quoteIdentifier(r.Role)
			} else {
				if !accountPart(r.RoleHost) || r.RoleHost == "" {
					return "", "", errors.New("enter the role host")
				}
				role = adminString(r.Role, mode) + "@" + adminString(r.RoleHost, mode)
			}
		}
		v := ""
		switch r.Action {
		case "grantRole":
			v = "GRANT " + role + " TO " + account
			if r.GrantOption {
				v += " WITH ADMIN OPTION"
			}
		case "revokeRole":
			v = "REVOKE " + role + " FROM " + account
		case "defaultRole", "clearDefaultRole":
			if role == "" {
				role = "NONE"
			}
			end := " TO "
			if maria {
				end = " FOR "
			}
			v = "SET DEFAULT ROLE " + role + end + account
		}
		return v, v, nil
	case "grant", "revoke", "revokeGrantOption":
		scope, allowed, err := privilegeScope(r, partialRevokes)
		if err != nil {
			return "", "", err
		}
		if r.Action == "revokeGrantOption" {
			if r.Scope == "column" {
				return "", "", errors.New("revoke grant option at table scope")
			}
			v := "REVOKE GRANT OPTION ON " + scope + " FROM " + account
			return v, v, nil
		}
		if len(r.Privileges) == 0 {
			return "", "", errors.New("select at least one privilege")
		}
		parts := []string{}
		allowedSet := map[string]bool{}
		for _, p := range strings.Split(allowed, ",") {
			allowedSet[p] = true
		}
		seen := map[string]bool{}
		for _, p := range r.Privileges {
			if !allowedSet[p] || seen[p] {
				return "", "", errors.New("unsupported or duplicate privilege at this scope")
			}
			seen[p] = true
			parts = append(parts, p)
		}
		if r.Scope == "column" {
			if len(r.Columns) == 0 || len(r.Columns) > 1000 {
				return "", "", errors.New("select 1–1,000 column names")
			}
			seen := map[string]bool{}
			for _, name := range r.Columns {
				if !objectName(name) || seen[name] {
					return "", "", errors.New("invalid or duplicate privilege column")
				}
				seen[name] = true
			}
			for i := range parts {
				parts[i] += " (" + quotedList(r.Columns) + ")"
			}
		}
		verb, end := "GRANT ", " TO "
		if r.Action == "revoke" {
			verb, end = "REVOKE ", " FROM "
		}
		v := verb + strings.Join(parts, ", ") + " ON " + scope + end + account
		if r.Action == "grant" && r.GrantOption {
			if r.Scope == "column" {
				return "", "", errors.New("grant option applies to table scope, not individual columns")
			}
			v += " WITH GRANT OPTION"
		}
		return v, v, nil
	}
	return "", "", errors.New("unknown account action")
}
func serverVersionNumbers(version string) (int, int, int) {
	// MariaDB may advertise the compatibility prefix 5.5.5-10.x.
	if strings.Contains(strings.ToLower(version), "mariadb") {
		version = strings.TrimPrefix(version, "5.5.5-")
	}
	fields := strings.Split(version, ".")
	values := []int{0, 0, 0}
	for i := 0; i < len(fields) && i < 3; i++ {
		text := fields[i]
		for j, c := range text {
			if c < '0' || c > '9' {
				text = text[:j]
				break
			}
		}
		values[i], _ = strconv.Atoi(text)
	}
	return values[0], values[1], values[2]
}
func supportsPartialRevokes(version string) bool {
	if strings.Contains(strings.ToLower(version), "mariadb") {
		return false
	}
	a, b, c := serverVersionNumbers(version)
	return a > 8 || a == 8 && (b > 0 || c >= 16)
}
func roleSnapshotQuery(r SAAdminRequest, mode, version string) string {
	if r.Role == "" || r.Action == "clearDefaultRole" {
		return ""
	}
	if strings.Contains(strings.ToLower(version), "mariadb") {
		return "SHOW GRANTS FOR " + quoteIdentifier(r.Role)
	}
	return fmt.Sprintf("SHOW GRANTS FOR %s@%s", adminString(r.Role, mode), adminString(r.RoleHost, mode))
}
