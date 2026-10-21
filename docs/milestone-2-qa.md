# Milestone 2 verification

Implementation and automated CI are complete; Windows/Ubuntu GUI QA is pending.
Code: `62c4750`. [Successful CI and desktop artifacts](https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/runs/39549139051).

## Evidence already collected

| Check | Result |
| --- | --- |
| Go tests/vet, frontend tests/build, desktop artifact | Passed on macOS 15, Windows Server 2022, Ubuntu 24.04 |
| Native credential save/load/delete with random-ID dummy | Passed on Keychain, Windows Credential Manager, Linux Secret Service |
| Verified SSH, encrypted key/password auth, rejection of unknown host/wrong password | Passed in loopback fixtures on desktop runners |
| SSH forwarding to MySQL, sorting, bound filters, escaped wildcards, NULL, pagination | Passed on MySQL 5.7.44 locally, MySQL 8.4/MariaDB 11.4 in CI |
| TLS inside SSH | Passed locally with a disposable CA; not claimed for CI database services |
| Distinct connection IDs, independent USE/variables/temp tables, rollback on tab close, isolated cancel | Passed locally and both CI database services |
| Profile compatibility/SSH settings, metadata history retention/clear, unavailable vault | Passed in automated tests |
| macOS GUI TLS/Content/sort/filter/pagination/two tabs/history | Passed with synthetic data; see milestone notes |
| Windows 10/11 and Ubuntu desktop GUI | Not yet tested |

The first CI run found cancellation of buffered rows could report success.
The fix checks cancellation while consuming/emitting buffered rows and before
returning a final snapshot. The successful run above includes this fix.

## Manual QA handoff

Use a disposable database and SSH host; record OS version, architecture, desktop
session, display scaling, app commit, tester and result for each step. Windows
Server CI is not a Windows 10/11 GUI test. Use the artifacts linked above.

1. Open the packaged app without a developer toolchain. Confirm all controls
   remain reachable at the minimum window size and with the OS display scaling.
2. Save/reopen/update a profile. Confirm JSON contains no passwords. Explicitly
   save a dummy password to the OS vault, restart, load and forget it. With the
   vault unavailable/denied, connect using manually entered credentials with
   Save passwords unchecked; verify no plaintext fallback is created.
3. Connect with verified TLS using the fixture CA. Connect through SSH once with
   password and once with an encrypted private key and preverified known_hosts.
   An unknown or changed host key must fail without automatically adding trust.
4. Open two query tabs. Set a session variable and select a database in one tab;
   confirm the other tab has neither. Switch tabs and confirm editor/results
   remain separate. Closing a tab must close its session.
5. In a fixture transaction, insert without committing, then close that tab.
   From another tab confirm the row was not committed. Do not use production data.
6. Browse a table with more than 200 rows. Sort by a unique column, page forward/
   backward, change page size, and apply comparison/contains/NULL filters. Test
   quotes and literal `%`, `_`, `!`; filter text must not become executable SQL.
7. Opt into history, execute queries and inspect History. It must contain only
   time, statement kind, counts, duration and status. Restart to verify persistence;
   Clear history must remove the saved metadata. SQL replay is not implemented.
8. Cancel a slow query in one tab while another tab remains usable. The cancelled
   tab must be inactive and partial rows cleared. Open a new session explicitly;
   queries, transactions and session state must not be replayed automatically.
9. Close all tabs and the app, then confirm fixture database/SSH connections are
   gone. Reopen the app and confirm no session was silently restored.

Offset pagination can shift when other sessions modify rows. SQL history is
metadata-only. Agent/keyboard-interactive SSH, grid editing, exact native visual
parity and installer release validation are outside this implementation pass.
