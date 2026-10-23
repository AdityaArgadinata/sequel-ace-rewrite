# Sequel Rewrite

A desktop MySQL and MariaDB client built with Go, Wails, React, and TypeScript,
with a UI modeled after Sequel Ace. This is a separate implementation of the
original macOS application, targeting macOS, Windows, and Linux.

**Status: in development.** Connection profiles, SSH connections, SQL queries,
Content browsing/editing, a Structure schema editor, table/database operations,
CSV/SQL/XML transfer, and native favorites/SPF migration are available.
Full Sequel Ace feature and visual parity are still in progress. Windows/Linux
builds run in CI; manual GUI validation on those platforms remains open.

## Install a prebuilt application

You do **not** need Go, Node.js, or the Wails CLI to run a prebuilt application.
Download the assets for your OS from [GitHub Releases](https://github.com/AdityaArgadinata/sequel-ace-rewrite/releases).
Development releases are marked as pre-releases. If a release has not been
published yet, repository collaborators can access its draft; other users can
try a successful [GitHub Actions build](https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/workflows/rewrite.yml)
by downloading and extracting its OS-specific artifact.

| Platform | File suffix | Installation and launch |
| --- | --- | --- |
| macOS, Apple Silicon | `macos-arm64.dmg` | Open the disk image, drag `sequel-rewrite.app` to Applications, then open it. A `macos-arm64.zip` alternative includes the app, README, and license. |
| Windows 10/11, x64 | `windows-amd64-setup.exe` | Run the installer. It can install WebView2 if missing. A `windows-amd64-portable.zip` alternative can be extracted and run without installing the app; the [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) is still required. |
| Ubuntu 24.04, x64 | `linux-amd64.tar.gz` | Install the runtime packages below, extract the archive, then run `./sequel-rewrite`. |

Filenames include the version, for example
`sequel-rewrite-v0.1.0-alpha.1-macos-arm64.dmg`. CI artifacts for ordinary branch
builds use `dev-<commit>` instead. The archive downloaded from GitHub Actions
wraps the actual distribution files; extract it first.

For Ubuntu 24.04, install the [GTK 3](https://packages.ubuntu.com/noble/libgtk-3-0t64)
and [WebKitGTK 4.1](https://packages.ubuntu.com/noble/libwebkit2gtk-4.1-0) runtime
packages, then launch from the folder containing the downloaded archive
(replace the example version with yours):

```sh
sudo apt-get update
sudo apt-get install -y libgtk-3-0t64 libwebkit2gtk-4.1-0
mkdir sequel-rewrite
tar -xzf sequel-rewrite-v0.1.0-alpha.1-linux-amd64.tar.gz -C sequel-rewrite
cd sequel-rewrite
./sequel-rewrite
```

The Linux executable needs a graphical desktop session. Password storage also
needs an unlocked Secret Service provider, such as GNOME Keyring, in that session.
You can connect without saving passwords if no credential service is available.

Release assets include `SHA256SUMS.txt`. Download all five package files beside
it and run `shasum -a 256 -c SHA256SUMS.txt` on macOS, or
`sha256sum -c SHA256SUMS.txt` on Linux. For an individual file, compare its SHA-256
with its line in the checksum file; PowerShell provides `Get-FileHash -Algorithm SHA256`.

macOS packages are not Developer ID signed/notarized, and Windows packages do
not carry a publisher signature. Some systems may block these development
builds. There is no automatic updater: download a newer package to update.
Other macOS architectures, Linux distributions, and Windows ARM64 are not part
of the current artifact matrix.

## Create distribution files and a draft release

The **Go desktop rewrite** workflow builds macOS DMG/ZIP, a Windows NSIS
installer/portable ZIP, and a Linux tarball, each containing the license. It
runs the frontend and Go checks plus MySQL/MariaDB integration tests before
creating a release. The release job alone has repository write permission.

To create a version from GitHub:

1. Push your changes and open **Actions → Go desktop rewrite → Run workflow**.
2. Choose the branch/commit to build and enter a new `release_tag`, such as
   `v0.1.0-alpha.1`. Leave it empty for an ordinary CI build without a release.
3. Wait for every build and database test to pass. The final job uploads all
   five packages and checksums to a **draft pre-release**.
4. Open **Releases**, inspect the draft and try the packages. Edit the notes as
   needed, then click **Publish release** when ready.

Alternatively, push a version tag on the desired commit:

```sh
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1
```

An existing tag must point to the same commit being built. Version numbers
must have the form `vMAJOR.MINOR.PATCH` with an optional suffix such as
`-alpha.1`; numeric components must be at most 65535 for Windows metadata.
Numeric app metadata uses `MAJOR.MINOR.PATCH`; filenames and release tags retain
the suffix. Existing releases are not overwritten: use a new version, or remove
an incomplete draft deliberately before retrying that release job.

A successful build creates downloadable packages; it does not establish that
GUI installation and database operations work on every target machine.

## Build and run from source

The instructions below assume a fresh checkout of the standalone
`sequel-ace-rewrite` repository. All commands after cloning run from its root,
which contains `go.mod`, `wails.json`, and `frontend/`. If you are working in the
original Sequel Ace checkout with this project inside `rewrite/`, use that
`rewrite/` folder instead. This Go application does not use the Xcode project.

### 1. Install the toolchain

Use the versions pinned in this project's CI:

| Tool | Version | Download |
| --- | --- | --- |
| Git | Available on your PATH | [Git downloads](https://git-scm.com/downloads) |
| Go | 1.25.3 | [Go downloads](https://go.dev/dl/) |
| Node.js with npm | 24.4.1 | [Node.js 24.4.1](https://nodejs.org/download/release/v24.4.1/) |
| Wails CLI | 2.17.0 | Installed in step 2 below |

The Go module declares a minimum of Go 1.25.0; 1.25.3 is the CI reference.
Dependencies are locked in `go.mod`, `go.sum`, and `frontend/package-lock.json`.
The first installation/build needs internet access to download them.

**macOS:** install Apple's Xcode Command Line Tools, then complete the installer:

```sh
xcode-select --install
```

If they are already installed, continue. The current macOS build target is
Apple Silicon; CI uses macOS 15. Full Xcode is not needed for this Go rewrite.

**Windows:** install Git, Go, Node.js, and the
[WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).
Use **PowerShell** for the Windows commands below. Reopen your terminal after
installing the toolchain so its PATH changes take effect.

**Ubuntu 24.04:** install the native build dependencies:

```sh
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev gnome-keyring dbus-x11
```

Ubuntu 24.04 uses WebKitGTK 4.1. Include `-tags webkit2_41` in the Wails and Go
commands shown below. See the [Wails installation guide](https://wails.io/docs/gettingstarted/installation/)
for platform dependency details.

### 2. Clone the repository and install dependencies

These commands work in macOS/Linux terminals and Windows PowerShell:

```sh
git clone https://github.com/AdityaArgadinata/sequel-ace-rewrite.git
cd sequel-ace-rewrite
go install github.com/wailsapp/wails/v2/cmd/wails@v2.17.0
npm --prefix frontend ci
```

Add the default Go executable directory to your current terminal's PATH.

macOS/Linux:

```sh
export PATH="$(go env GOPATH)/bin:$PATH"
wails doctor
```

Windows PowerShell:

```powershell
$env:Path += ";" + (Join-Path (go env GOPATH) "bin")
wails doctor
```

If you have a custom `GOBIN`, add that directory instead. To make the PATH
change persistent, add the directory to your shell configuration or Windows
user PATH. Resolve missing platform dependencies reported by `wails doctor`.
On Ubuntu 24.04, a WebKitGTK **4.0** warning can occur despite having 4.1
installed; use the `webkit2_41` tag rather than substituting the 4.0 package.

### 3. Prepare the assets and generated bindings

Go embeds `frontend/dist`, so the directory must exist before Wails generates
bindings on a clean checkout. Create a placeholder, then generate the bindings.
The production frontend build replaces this placeholder.

macOS:

```sh
mkdir -p frontend/dist
touch frontend/dist/index.html
wails generate module
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force frontend/dist | Out-Null
if (!(Test-Path frontend/dist/index.html)) {
    New-Item -ItemType File frontend/dist/index.html | Out-Null
}
wails generate module
```

Ubuntu 24.04:

```sh
mkdir -p frontend/dist
touch frontend/dist/index.html
wails generate module -tags webkit2_41
```

Bindings live in `frontend/wailsjs/`. Regenerate them after changing exported
Go methods or models used by the frontend.

### 4. Start the desktop application

macOS / Windows:

```sh
wails dev
```

Ubuntu 24.04:

```sh
wails dev -tags webkit2_41
```

Use the desktop window that Wails opens. Running only `npm run dev` in the
frontend starts a browser preview without the Go backend; database connections,
OS credential storage, and native dialogs require Wails.

### 5. Create a production build

macOS / Windows:

```sh
wails build
```

Ubuntu 24.04:

```sh
wails build -tags webkit2_41
```

Build on the target OS for the documented workflow. Wails builds the frontend
and writes the application to `build/bin/`:

| OS | Output | Launch from the repository root |
| --- | --- | --- |
| macOS | `build/bin/sequel-rewrite.app` | `open build/bin/sequel-rewrite.app` |
| Windows | `build/bin/sequel-rewrite.exe` | `& .\build\bin\sequel-rewrite.exe` in PowerShell |
| Linux | `build/bin/sequel-rewrite` | `./build/bin/sequel-rewrite` |

See the [Wails build guide](https://wails.io/docs/gettingstarted/building/) for
additional packaging options.

## Connect to a database

1. Open the app and choose **TCP/IP** for a direct connection, or **SSH** for a
   tunnel.
2. Enter the database host, port (normally `3306`), username, and password.
3. **TLS is enabled by default and verifies the server certificate.** For a
   private CA, open the custom CA field and paste its PEM certificate. The
   certificate must match the database host name. A local server without TLS
   needs a deliberate change to the TLS option before connecting.
4. Click **Connect**, choose a database using **Select Database**, then select
   a table in the sidebar to open **Content**.
5. For SQL, select **Query**, enter SQL, choose **Current statement**, **Selection**,
   or **All statements**, and click **Run Query**. Cmd/Ctrl+Enter runs the selection
   when present, otherwise the current statement; Cmd/Ctrl+Shift+Enter runs all.

To save a connection, enter a name and click **Add to Favorites**. Subsequent
edits use **Save Changes**. Passwords are not included in profile JSON. Open
**Password storage** to opt into the OS credential store, load saved passwords,
or forget them. macOS uses Keychain, Windows uses Credential Manager, and Linux
uses Secret Service. Passwords are cleared from the form after connecting.

For SSH, provide the SSH host, port, username, and password or absolute private
key path. Encrypted keys need a passphrase. The database host is resolved from
the SSH server. An empty Known Hosts field uses `~/.ssh/known_hosts`; unknown or
changed host keys are rejected. SSH agent and keyboard-interactive auth are not
implemented. Database TLS verification remains enabled independently of SSH.

## Workspace and current features

- **Content:** select rows, filter using the controls above the grid, and click
  **Apply Filter(s)** on the last row. Each checkbox enables its own condition;
  + inserts a condition below that row, and − removes it. Choose All (AND) or
  Any (OR) in the bottom ellipsis menu. Click a column header to sort ascending; click
  again for descending. A different column starts ascending. The bottom ellipsis
  menu contains sorting, page size,
  **Go to page**, and **Export entire table CSV**. Pages contain 25–200 rows. Select a unique
  sort column for stable ordering; concurrent writes can still shift pages.
- **Editing:** Insert/Edit/Delete are available for eligible InnoDB and MyISAM base tables
  with a primary key or a complete NOT NULL unique key. Select a row by clicking it, or double-click a cell to edit
  just that value in place, with its text selected. Enter saves; Escape or
  clicking away discards the draft. Shift+Enter inserts a newline. Use the row
  editor for explicit NULL/hex controls.
  Tab/Shift+Tab save and move across editable cells; Enter saves and moves down.
  Use Shift-click or Cmd/Ctrl-click for multiple rows, or Cmd/Ctrl+A for all rows
  on the page. Edit applies checked values to the selection; identity columns
  cannot be mass-edited. Bulk delete requires confirmation. Rows are processed
  individually and stop on the first error; earlier writes may already be saved.
  Duplicate opens a draft with auto-increment omitted and generated fields excluded.
  Sorting and filtering are locked until that edit is saved or cancelled. NULL and empty strings stay
  distinct; binary values use hex. Generated columns are not writable. Delete
  requires confirmation; update/delete detect changes to the original row.
  MyISAM writes acquire a table write lock and take effect immediately; they
  cannot be rolled back. Finish any active managed transaction before editing
  MyISAM. The account needs LOCK TABLES permission. Arbitrary Query results,
  views, and ineligible tables remain read-only.
- **Grid context menu:** copy cell/row/selection, headers, CSV or SQL INSERT
  (with/without auto-increment), select/clear, edit, insert, duplicate, delete,
  set NULL, prepare a cell filter and refresh. SQL copy excludes generated columns.
- **Table History:** Back/Forward restores table/database/view per session,
  keeping up to 100 entries; navigating elsewhere clears the forward branch.
  It reloads data without replaying user SQL; filter/editor drafts are not restored.
- **Structure:** inspect Columns, Indexes / Primary key, Foreign keys, and CREATE
  statement. Select a row and Edit/Drop, or double-click to edit. Add opens a new
  object form. Name + Definition SQL preserve the server's complete type and
  attributes; definitions can include defaults, comments, generated expressions,
  FIRST/AFTER, composite/prefix indexes, and foreign-key reference/actions. Index
  types include INDEX, UNIQUE, PRIMARY, FULLTEXT and SPATIAL (server support applies).
  Preview SQL, review it, check the confirmation, then Apply. A foreign-key edit
  uses a new constraint name so replacement stays in one ALTER on MySQL 5.7.
  DDL can lock/rebuild the table, discard data and implicitly commit; Rollback
  cannot undo it. Active/unverified transactions, autocommit off, views and
  incomplete definitions are blocked. Metadata reloads after acknowledged DDL;
  up to 20 server warnings and reload failures are shown separately. No automatic
  retry occurs. Definitions are limited to 64 KiB, one clause, with no SQL comments
  or separators outside quoted text. Existing version-comment attributes require
  manual review in Query; CHECK constraints have no dedicated editor yet.
  Preview checks are optimistic: changed schema/SQL_MODE invalidates the plan,
  while ordinary AUTO_INCREMENT advances do not. Coordinate external schema
  changes during apply. Identifiers require quoted SHOW CREATE output
  (`sql_quote_show_create=1`).
- **Sessions and transactions:** the sidebar connection-actions menu opens a new
  query tab, disconnects, and exposes Begin/Commit/Rollback. Each tab has its own
  database session, up to 16 tabs. A single session hides the tab strip. Closing
  a session discards uncommitted transactional work. Manual SQL may leave
  transaction state unverified; resolve it with Commit/Rollback.
- **SQL editor:** syntax highlighting, line numbers, undo/search and schema completion
  (Ctrl+Space). Refresh completion after schema changes. Table names use the loaded
  catalog; column completion reads at most 2,000 columns from the active database.
  Open/Save SQL uses native file dialogs and protects unsaved editor contents when
  loading another query. Files must be UTF-8, without NUL, at most 4 MiB.
- **Query Favorites:** save, update, load and delete named SQL locally. Up to 100
  favorites, 1 MiB each, 8 MiB total. SQL is plain text and can contain secrets.
- **History:** choose **Off** (default), **Metadata only**, or **Include SQL text
  (local)**. The last option explicitly stores SQL as local plain text. Up to 100
  entries / 4 MiB are retained; statements over 32 KiB keep metadata only. Loading
  SQL from history/favorites opens it for review and never executes it. Clear all
  history or remove saved SQL while retaining metadata. Changing back to Off or
  Metadata only stops new SQL recording; existing SQL requires explicit removal.
  The separate Console feature is not implemented.
- **Appearance:** the workspace uses a dark theme. macOS sidebars expose native
  wallpaper blur/transparency; their tint depends on the background. Other
  platforms use a neutral fallback. Disabled toolbar items mark unavailable
  features. Exact visual parity is tracked in [GUI parity](docs/gui-parity.md).

### Table/database operations and transfer

Open **Manage tables/databases** from Connection actions, or the sidebar +.
Create, rename, copy or drop tables/databases; truncate applies to tables. Preview
SQL and confirm before applying. Destructive actions require the exact source
name. Multi-step copy/move reports acknowledged steps and stops on the first
error/warning/cancel without retry or automatic cleanup. DDL cannot be rolled back.

Database copy/move supports at most 1,000 base tables without visible triggers,
views/sequences, routines or events. Use an account with full metadata visibility.
Internal FKs are restored after table/data creation; external grants and SQL
references require separate migration. MySQL has no direct RENAME DATABASE:
rename creates a destination, moves tables together, then drops the empty source.
There is no cross-session lock during review or consistent database snapshot;
coordinate concurrent writers/schema changes. Partial destinations remain visible
for review. Targets must be new. [MySQL RENAME TABLE](https://dev.mysql.com/doc/refman/8.4/en/rename-table.html)
describes cross-database trigger/view restrictions.

In Content options, **Import CSV** reads UTF-8 (comma/semicolon/tab, optional
header), previews 20 records and maps fields to non-generated table columns.
Unmapped columns use defaults. Limits: 8 MiB, 20,000 records, 200,000 cells. Choose
Plain CSV for literal text or Sequel CSV v1 for explicit NULL/empty/binary escapes.
Every record is prevalidated before insertion; server errors/warnings stop the
row-by-row autocommit import. Earlier rows can already be saved. Views and engines
other than InnoDB/MyISAM are not supported for CSV import.

**Import SQL dump** in Connection actions accepts up to 64 MiB / 100,000 statements
and 4 MiB per statement, with the same comment/string/DELIMITER parser as Query.
Review the full file before confirming: the UI sample is limited to 100 statements
and 256 KiB. Parsing completes before the first write. Error, warning, cancel or
SQL_MODE changes stop later statements. There is no automatic COMMIT/ROLLBACK or
replay. Session state remains unverified after arbitrary imported SQL until resolved
through the transaction controls. Normal server Notes such as absent DROP IF EXISTS
are not treated as coercion warnings. Interactive Query limits remain unchanged.

**Export data** in Content/Query offers CSV, SQL INSERT and XML. Content can export
entire tables, all applied filtered rows, the current filtered page, loaded rows or
selected loaded rows. Query exports only its retained loaded result and never
reruns SQL. SQL table export can include CREATE TABLE and omits generated columns
from INSERT; triggers/routines/events are not included. Specify target table/database
for SQL exports of arbitrary query results. Partial UI results export only loaded
rows. XML encodes NULL separately and binary/control text with explicit base64.
Streaming exports bypass the 500-row UI limit but retain the 60-second operation
and 4 MiB row bounds. Loaded snapshots remain limited to 500 rows / 4 MiB. Completed
files require a new filename and are published atomically; no overwrite or incomplete
file is published. Exports can exceed this app's import limits; split large files
or use a dedicated database tool. Review SQL_MODE and target names before importing
SQL structure from another session/server.

### Sequel Ace favorites and sessions

On the connection form, **Import Sequel Ace favorites** reads XML/binary
Favorites.plist or exported SPConnectionFavorites files, previews supported entries,
and creates only selected profiles. Group names are flattened; existing favorites
are preserved and repeated imports can create duplicates. Database defaults and
TCP/SSH settings are retained. Passwords/Keychain IDs are ignored; SSH key paths
are metadata only and are not opened during parsing/import. Review TLS/SSH paths
and settings before Connect. Socket, IAM/Vault, special auth plugins, remote SSH
sockets and certificate-path settings require manual setup. Timezone, color and
native folder layout are not migrated.

**Open SPF session** loads unencrypted v1 connection/session data for review.
Only explicit Connect opens a connection; restored SQL is loaded into the editor
without executing. Selected database/table and Structure/Content/Query view are
restored when available. XML/binary plist and native compressed query text are
supported (8 MiB file, 4 MiB editor text). Opaque archived selection/history/filter
and layout state are ignored, without unarchiving arbitrary classes.

**Save SPF session** in Connection actions writes the current connection settings,
database/table/view and SQL using Sequel Ace's unencrypted data-dictionary format,
without passwords/Keychain IDs and with auto_connect=false. Large XML can fall back
to binary plist. SQL text can itself contain secrets: review before sharing.
Encrypted SPF, custom CA PEM and custom known_hosts need manual native setup and
are rejected rather than saving incomplete verification settings. This implements
the connection/editor subset, not every native session/preference field.

### Query limits and cancellation

Scripts execute sequentially on a pinned session after parsing comments, strings,
and MySQL client DELIMITER directives (up to 1,000 statements / 4 MiB). Current
runs the statement at the caret; Selection parses only the selected text; All
validates the entire script before executing. Scripts stop at the first error,
cancellation, truncated result or SQL_MODE change. Earlier changes may already
be saved; execution never retries or commits automatically. Five recent statement
results remain selectable. Results stream into the grid and preserve numeric,
date, binary, and NULL values without converting them to JavaScript numbers.
The query limit is **500 rows / 4 MiB of cell content**. Database/table catalogs
use a separate limit of **50,000 entries / 4 MiB**, so a database with more than
500 tables does not disconnect merely when its table list is loaded. Incomplete
catalogs fail explicitly. Connections have a **10-second connection
timeout** and **60-second operation timeout**. The driver reads a complete row
before the content limit is checked, so a very large BLOB can exceed that limit
in temporary memory.

Cancellation or timeout discards the session and clears partial query results.
Reaching a result limit also discards the session; any displayed truncated
result is incomplete. Reconnect explicitly; sessions and SQL are never replayed
automatically. A cancelled write is not guaranteed to have rolled back: verify
the server before repeating it. Rollback protects transactional engines, not
external effects or writes to nontransactional tables.

After manual `USE` or DDL, use **Refresh databases and tables** in the sidebar
to reload metadata. That action issues queries and can change session diagnostics
such as `ROW_COUNT()`. Metadata is not refreshed automatically after SQL.

### CSV export format

**Export entire table CSV** writes the entire selected table/view, ignoring
Content filters, sorting, and pagination. Choose a new filename; existing files
are not overwritten. Export streams through Go and is not limited to 500 rows,
but retains the operation timeout and 4 MiB encoded-row limit. A filesystem
supporting hard links is required to publish the completed file.

The **Sequel CSV v1** format uses UTF-8 without BOM, comma separators, a header,
and standard CSV quoting, with these cell encodings:

| Database value | CSV cell content |
| --- | --- |
| SQL NULL | `\N` |
| Empty text | `\E` |
| Binary | `\B` followed by hex; empty binary is `\B` |
| Literal backslash | `\\` |
| CR / LF / tab / NUL in text | `\r` / `\n` / `\t` / `\0` |
| Other text, numbers, dates, decimals | Original server text |

For example, literal text `\N` becomes `\\N`, distinct from SQL NULL. This is a
loss-preserving database format; spreadsheet applications may interpret formula
prefixes. NUL text is escaped as `\0`. Use **Sequel CSV v1** when importing these
files; Plain CSV treats every field literally, including `\N`.

## Keyboard shortcuts

Use **Cmd** on macOS or **Ctrl** on Windows/Linux with focus in the workspace.

| Shortcut | Action |
| --- | --- |
| Cmd/Ctrl+1 | Structure for the selected table |
| Cmd/Ctrl+2 | Content for the selected table |
| Cmd/Ctrl+6 | Query |
| Cmd/Ctrl+R | Reload Content/Structure; does not rerun SQL in Query |
| Cmd/Ctrl+F | Show and focus the Content filter |
| Cmd/Ctrl+Enter | Run selection, otherwise current statement |
| Cmd/Ctrl+Shift+Enter | Run all editor statements |
| Ctrl+Space | Show SQL/schema completion |
| Cmd/Ctrl+C | Copy the selected row when the result grid has focus |
| Shift+F10 / Context Menu key | Open the grid copy menu |
| Arrow keys / Home / End | Navigate grid rows or copy-menu actions |
| Escape | Close the grid copy menu |

Option+Cmd+F also focuses the Content filter on macOS. Refresh/filter shortcuts
leave an open row editor or delete confirmation alone.

## Development checks

After installing dependencies and generating bindings, build the real embedded
assets before running Go checks.

macOS / Windows:

```sh
npm --prefix frontend test
npm --prefix frontend run build
go test ./...
go vet ./...
wails build
```

Ubuntu 24.04:

```sh
npm --prefix frontend test
npm --prefix frontend run build
go test -tags webkit2_41 ./...
go vet -tags webkit2_41 ./...
wails build -tags webkit2_41
```

Unit tests run without a database. Database integration tests are skipped when
`SEQUEL_TEST_PORT` is unset. A skipped integration suite does not establish
server compatibility. CI builds on macOS 15, Windows Server 2022, and Ubuntu
24.04, and runs database integration tests against MySQL 8.4 and MariaDB 11.4.
Local fixture testing has also covered MySQL 5.7.44. A successful CI build does
not replace manual GUI tests; see [milestones](milestone.md),
[GUI parity](docs/gui-parity.md), [daily-use QA](docs/milestone-2-qa.md), and
[row-editing QA](docs/milestone-3-qa.md) for evidence and remaining work.

### UI regression checks

After installing frontend dependencies, install the pinned Playwright browsers
and run the UI checks:

```sh
cd frontend
npx playwright install chromium webkit
npm run test:ui
```

On Ubuntu, use `npx playwright install --with-deps chromium webkit` to install
browser system dependencies as well. CI runs Chromium and WebKit on macOS,
Windows and Ubuntu, checking dropdown readability, field metrics, filters,
small-window layout, editors and menus. Screenshots are saved in
`frontend/test-results/` and uploaded as `ui-checks-<runner>` workflow artifacts.
The tests use synthetic data and never connect to a real database or credential
vault. Native dialogs, wallpaper materials and every OS/scaling combination
still require platform testing.

### Optional database integration tests

Use a **disposable localhost database server**. Tests create and delete uniquely
named `sequel_rewrite_test_*` schemas and require a fixture `root` account with
those permissions. Do not point them at production databases.

macOS/Linux shell, with a fixture listening on port `13367`:

```sh
export SEQUEL_TEST_PORT=13367
# Set SEQUEL_TEST_PASSWORD in your environment if the fixture requires one.
go test -race ./internal/database ./internal/workspace ./internal/tunnel -v -count=1 -timeout=180s
```

PowerShell:

```powershell
$env:SEQUEL_TEST_PORT = "13367"
# Set $env:SEQUEL_TEST_PASSWORD if the fixture requires one.
go test -race ./internal/database ./internal/workspace ./internal/tunnel -v -count=1 -timeout=180s
```

Race-detector testing also needs a working C toolchain; Windows contributors
should use the appropriate Go-supported GCC toolchain or use the Linux CI job.
Set `SEQUEL_TEST_CA_FILE` to a private fixture CA file for the optional TLS tests.
Its server certificate must cover `127.0.0.1`; the CA must not already be trusted
by the OS so the rejection test remains meaningful. The fixture also needs
`max_allowed_packet` of at least 8 MiB for large-row tests.

Native credential-vault tests are opt-in via `SEQUEL_TEST_KEYRING=1` and use
random dummy credentials. See the CI workflow for isolated vault setup on each OS.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `wails: command not found` / command not recognized | Run the PATH command in step 2; check `go env GOPATH` and a custom `GOBIN`. |
| Missing `frontend/dist` / `pattern all:frontend/dist: no matching files found` | Complete step 3, then build the frontend before Go checks. |
| Missing `frontend/wailsjs` imports | Regenerate bindings with `wails generate module`; include the Linux tag on Ubuntu 24.04. |
| Ubuntu cannot find WebKitGTK 4.0 | Install `libwebkit2gtk-4.1-dev` and use `-tags webkit2_41`. |
| Windows opens a blank window or reports a missing webview | Install WebView2 Evergreen Runtime, then reopen the app. |
| Browser preview reports that the backend is unavailable | Start `wails dev` and use its desktop window. |
| Certificate verification fails | Verify the host name, server certificate, and custom CA. An SSH tunnel does not disable database TLS verification. |
| Password vault is unavailable | Unlock the OS credential service or connect with manual passwords without saving them. |
| Session becomes inactive after cancellation or a large result | Close that session and connect again; reduce the query/page size before retrying. |

## Project layout and license

`main.go` configures the native window and embeds the frontend. `app.go` and
`export.go` bridge the UI to Go. Database/session code lives in
`internal/database`, with separate packages for profiles, credentials, history,
SSH tunnels, workspace sessions, and export files. React UI code lives in
`frontend/src`. The database layer does not depend on Wails.

See [LICENSE](LICENSE) for the MIT license and retained Sequel Ace attribution.


## Additional panels and connection options

Relations edits foreign keys; Triggers supports reviewed create/drop; Table Info
shows metadata and changes engine/default collation/comment. Users provides basic
account/password and database/table privilege management and requires server admin
permissions. SQL Console retains up to 500 verb/initial-response events in memory,
without query text or parameters. Changes may implicitly commit; there is no
automatic replay or undo. Advanced native privilege/trigger controls remain open.

Connection settings include local UNIX sockets (absolute path, no TLS/SSH), server
session timezone, SSH agent (`SSH_AUTH_SOCK`) and pre-entered keyboard-interactive
answers. Named zones require MySQL timezone tables. Folder paths and colors are
saved with favorites. Preferences offers dark/light/system, editor font/size/wrap;
Cmd/Ctrl+1–6 switches views and Cmd/Ctrl+, opens preferences.

AWS IAM needs `aws` available in the app environment with configured credentials;
select region/profile and verified database TLS. Tokens are generated for each new
session. Vault uses HTTPS token auth to `/v1/<mount>/creds/<role>`, an optional
namespace and verified database TLS. Vault tokens/issued secrets are not profile
fields; OIDC and lease renewal are not implemented. SPF export refuses these
additional connection settings until they can round-trip faithfully.

Query exposes server HELP. **Save print view** exports the loaded result as HTML;
open it in a browser and choose **Print / Save PDF**. It never reruns SQL and marks
truncated results. Native print dialogs and external AWS/Vault account QA are still
open. See [milestone.md](milestone.md) for all remaining parity/verification work.
