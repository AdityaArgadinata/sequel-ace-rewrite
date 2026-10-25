# sequelx

Previously named Sequel Rewrite. Older draft packages retain their original
`sequel-rewrite` filenames; the commands below describe new sequelx builds.

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
The current normal release is [v0.1.0](https://github.com/AdityaArgadinata/sequel-ace-rewrite/releases/tag/v0.1.0).
Tags with a preview suffix are marked as pre-releases. If a release has not been
published yet, repository collaborators can access its draft; other users can
try a successful [GitHub Actions build](https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/workflows/rewrite.yml)
by downloading and extracting its OS-specific artifact.

| Platform | File suffix | Installation and launch |
| --- | --- | --- |
| macOS, Apple Silicon | `macos-arm64.dmg` | Open the disk image, drag `sequelx.app` to Applications, then open it. A `macos-arm64.zip` alternative includes the app, README, and license. |
| Windows 10/11, x64 | `windows-amd64-setup.exe` | Run the installer. It can install WebView2 if missing. A `windows-amd64-portable.zip` alternative can be extracted and run without installing the app; the [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) is still required. |
| Ubuntu 24.04, x64 | `linux-amd64.tar.gz` | Install the runtime packages below, extract the archive, then run `./sequelx`. |

Filenames include the version, for example
`sequelx-v0.1.0-macos-arm64.dmg`. CI artifacts for ordinary branch
builds use `dev-<commit>` instead. The archive downloaded from GitHub Actions
wraps the actual distribution files; extract it first.

For Ubuntu 24.04, install the [GTK 3](https://packages.ubuntu.com/noble/libgtk-3-0t64)
and [WebKitGTK 4.1](https://packages.ubuntu.com/noble/libwebkit2gtk-4.1-0) runtime
packages, then launch from the folder containing the downloaded archive
(replace the example version with yours):

```sh
sudo apt-get update
sudo apt-get install -y libgtk-3-0t64 libwebkit2gtk-4.1-0
mkdir sequelx
tar -xzf sequelx-v0.1.0-linux-amd64.tar.gz -C sequelx
cd sequelx
./sequelx
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
   five packages and checksums to a **draft release**. A preview suffix also marks
   the draft as a pre-release; ordinary version tags create a normal draft.
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
| macOS | `build/bin/sequelx.app` | `open build/bin/sequelx.app` |
| Windows | `build/bin/sequelx.exe` | `& .\build\bin\sequelx.exe` in PowerShell |
| Linux | `build/bin/sequelx` | `./build/bin/sequelx` |

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

To save a connection, enter a name and click **Save Connection**. Subsequent
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
- **New inline row:** click **+ / Insert row**, choose **Insert row** from the
  grid context menu, or double-click the empty area below the last Content row
  to create the same draft using column defaults. Double-click the empty area again, press
  Enter, or click **Save new row** to insert it. Tab/Shift+Tab move between draft
  cells; Escape or **Cancel new row** discards it. Failed inserts keep the draft
  and offer **Edit row** / **Discard changes**. Untouched defaults are evaluated
  by the server; auto-increment and generated values are not supplied by the draft.
  If a saved row cannot be refreshed, reload separately instead of inserting again.
- **Expanded cell editor:** right-click a Content cell and choose **Open cell
  editor**, or press **Alt+Enter** from its inline editor. Text/JSON/BLOB values
  open in a larger editor with literal Find/Next/Previous (Cmd/Ctrl+F), Text/Hex
  representations, explicit NULL and read-only previews. JSON preview keeps large
  numeric literals intact; JSON columns are syntax-checked before saving. Preview
  supports text, JSON, hex and local PNG/JPEG/GIF/WebP bytes; HTML/SVG stay text.
  Double-clicking Content still starts inline editing. Double-click a Query cell,
  or choose **Open cell viewer**, to inspect/export its loaded value read-only.
  Import uses a native file dialog and changes the draft only. Export writes raw
  UTF-8 text or decoded binary bytes to a new filename, preserving BOM/CRLF/NUL;
  NULL is not exported as an empty file. Values must fit the existing 4 MiB encoded
  cell limit (binary imports approximately 2 MiB raw). JSON preview accepts up to
  64 KiB input, text preview shows up to 65,536 characters, and hex preview shows
  up to 4 KiB of bytes; previews do not change the saved value. **Save cell** uses
  the original row snapshot for conflict detection. **Apply to new row** only
  updates its draft; save the row separately. After a failed write, the cell draft
  remains available for export, while another save requires closing, checking the
  server and reloading. Cmd/Ctrl+Enter saves; Escape/Cancel discards cell edits.
- **CRUD dialogs:** row duplication/editing and delete confirmations use
  centered modal dialogs with the existing app icon. Delete focuses Cancel;
  Escape cancels without writing. Structure uses inline field editing and native-style
  index/delete dialogs; advanced SQL, table/database and administration changes
  retain their SQL review/acknowledgment requirements. Errors show server details; acknowledging an error never retries
  a write. Successful row counts remain in the bottom status area.
- **Grid context menu:** copy cell/row/selection, headers, CSV or SQL INSERT
  (with/without auto-increment), select/clear, edit, insert, duplicate, delete,
  set NULL, prepare a cell filter and refresh. SQL copy excludes generated columns.
- **Import/Export dialogs:** **Connection actions → Export…** opens format tabs
  (SQL/CSV/XML), the export source, and an object list. Content defaults to CSV
  with all applied filtered rows; Query defaults to CSV of the retained result
  without rerunning SQL. SQL supports separate Structure, Content and DROP flags
  for each selected object. CREATE DATABASE is optional and off by default, so
  selected objects can be restored into the existing original database. CSV has
  separator, line-ending, field-name and NULL-output controls; one table can be
  exported per CSV/XML file. SQL supports multiple selected objects. Native
  advanced features such as Dot, compression, arbitrary delimiters/encodings,
  multi-file CSV/XML and continue-on-import-error are not implemented.
  **Import…** opens the native SQL/CSV/TSV file chooser immediately. SQL shows
  an overwrite warning and waits for Import; CSV opens destination/mapping and
  preview first. Imports show acknowledged progress, support cancellation, stop
  on errors/warnings, and consume the plan before execution to prevent replay.
- **Database SQL transfer:** open **Export… → Advanced → Full database backup…**,
  inspect the visible inventory, review it, then save structure and optional data.
  Tables (including generated columns), internal foreign keys, view dependencies,
  functions, procedures, ordered triggers and events are included. Table data is
  loaded before triggers and foreign keys; events restore disabled for review.
  TIMESTAMP data is read/restored in UTC; the source session time zone is restored.
  Import the file through **Import SQL dump** on a server where the original
  database name does not exist. Database names, DEFINER accounts and external SQL
  references are preserved; grants and accounts are not exported. Direct database
  copy/move retains its existing restrictions on special objects.
  The exporter checks definitions before and after writing and publishes only a
  completed new file. Use an account with full metadata visibility; inventories
  cannot reveal objects hidden from that account. Pause concurrent writes/DDL:
  this is not a consistent transactional snapshot across tables/engines.
  Limits: 1,000 objects, 8 MiB definitions, 64 MiB file, 100,000 statements,
  4 MiB per statement and the existing 60-second operation timeout. Unsupported
  object kinds, unreadable definitions, ambiguous/cyclic view dependencies or
  changed database creation collation fail explicitly. Cross-server version,
  charset, DEFINER privileges and external dependencies require review.
  Literal `SET SESSION sql_mode = '...'` transitions are split under their declared
  mode and checked on the server before each imported statement. MySQL SQL_MODE
  deprecation warnings (1287/1681/3090) are reported and allowed only for these
  literal SETs; other warnings/errors stop import. Failure reports the statement,
  source line and acknowledged prefix; there is no automatic retry or rollback.
  Stored-object context follows [MySQL SHOW CREATE documentation](https://dev.mysql.com/doc/refman/8.0/en/show-create-trigger.html).
- **Table History:** Back/Forward restores table/database/view per session,
  keeping up to 100 entries; navigating elsewhere clears the forward branch.
  Each connection tab retains up to eight Content workspaces in memory: filters,
  sorting, page, selection, scroll, column widths and unsaved row drafts return
  when navigating tables, databases, views or connection tabs. Clean workspaces
  are evicted first; drafts and unapplied filter changes are protected. Restoring
  does not rerun queries or writes. Cached rows may have changed on the server;
  writes still check the original row. SQL, schema/admin changes and transaction
  completion invalidate snapshots and require reload before writing. Explicitly
  discarding drafts requires confirmation. Closing the connection tab or app
  ends this in-memory lifetime; it is not saved to disk.
- **Structure:** field editing follows the original Sequel Ace row lifecycle.
  Double-click a text cell to edit. Enter saves the complete row directly; Tab/
  Shift+Tab moves between enabled cells, saving at the row boundary and wrapping
  to the adjacent row. Escape reverts the whole row. Selecting a different row,
  table, database or view, switching/closing sessions, or reloading first saves
  its draft; failure keeps the current workspace and offers **Edit row** or
  **Discard changes**. A clean row does not issue an ALTER.
  **+** and a double-click in empty field-table space create an inline INT/NULL
  draft after the selection (or at the end when none is selected). Duplicate
  appends a **Copy** draft with Key/Extra cleared. Drag a clean field-name cell
  to reorder columns. Type/Extra dropdowns, server Encoding/Collation options,
  checkbox dependencies, type help and MySQL 8.4 integer AUTO_INCREMENT rules
  follow the native editor. AUTO_INCREMENT can add its chosen index in the same
  ALTER. Temporal precision updates CURRENT_TIMESTAMP defaults and ON UPDATE.
  Add index opens a column/size/order sheet, with type and storage options;
  leaving its name empty lets the server name it. Delete asks for confirmation
  with Cancel focused. Field removal lists any related foreign keys and drops
  only those explicitly confirmed constraints in the same ALTER.
  The gear menu retains **Edit column SQL… / Add column SQL…** and reviewed SQL
  forms for advanced definitions; Relations retains reviewed foreign-key editing.
  Inline saves still prepare a one-use, schema-fingerprinted backend plan. DDL can
  lock/rebuild tables, discard data and implicitly commit. Active/unverified
  transactions, autocommit off, views and incomplete metadata remain blocked.
  A known acknowledged write is cleared before metadata/warning errors are shown;
  reload before further changes. Errors never automatically replay a write.
  Definitions are limited to 64 KiB with no comments or statement separators
  outside quoted strings. Unknown/version-comment attributes require the SQL
  editor; CHECK constraints have no dedicated editor. Coordinate external DDL;
  the optimistic snapshot is rechecked immediately before execution and requires
  `sql_quote_show_create=1`. Windows/Linux native desktop QA remains open.

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

**Import…** in Connection actions auto-detects SQL/CSV/TSV by filename. SQL
accepts up to 64 MiB / 100,000 statements
and 4 MiB per statement, with the same comment/string/DELIMITER parser as Query.
Review the full file before confirming: the UI sample is limited to 100 statements
and 256 KiB. Parsing completes before the first write. Error, warning, cancel or
SQL_MODE changes stop later statements. There is no automatic COMMIT/ROLLBACK or
replay. Session state remains unverified after arbitrary imported SQL until resolved
through the transaction controls. Normal server Notes such as absent DROP IF EXISTS
are not treated as coercion warnings. Interactive Query limits remain unchanged.

**Export…** in the connection actions menu offers CSV, SQL INSERT and XML.
Content can export selected tables, all applied filtered rows or selected loaded rows.
The inline Export data panel has been removed from Content and Query. Query exports only its retained loaded result and never
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

Under **Advanced connection options** on the connection form, **Import Sequel Ace favorites** reads XML/binary
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

**Save Session** in Connection actions writes the current connection settings,
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
When the display limit is reached, the app consumes and discards the remaining
response within a separate budget: at most 10,000 discarded rows / 16 MiB of raw
cell data / 2 seconds. If the current response finishes, the same pinned session,
temporary tables, variables and transaction remain active. No query is rerun and
no implicit COMMIT is sent. The displayed result stays incomplete, and remaining
script statements are not executed. If the response exceeds that budget or has
additional result sets, the session is closed and the notice asks for reconnect.
Sessions and SQL are never replayed automatically. A cancelled write is not guaranteed to have rolled back: verify
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

These are defaults. **Settings → Keyboard shortcuts** remaps view commands,
reload/filter, run current/selection, run all, and Preferences. `Mod` means Command
on macOS and Control on Windows/Linux; optional Shift/Alt modifiers are supported.
Save validates duplicates and reserves common editing/app/window commands.
Repeats, input composition and AltGr text input do not execute web shortcut commands. Empty
bindings disable a command; Reset shortcuts restores defaults. The native Settings
menu accelerator follows the Preferences binding; the gear/menu click remains
available if it is disabled. SQL run shortcuts act only in the SQL editor.
Option+Cmd+F also focuses the Content filter on macOS while its default binding
remains configured. Refresh/filter shortcuts leave an open row editor or delete
confirmation alone; modal dialogs block workspace shortcuts.

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
shows metadata and changes engine/default collation/comment. Users provides
account create/password/drop, rename and lock/unlock, plus explicit grant/revoke
scopes for global, database, table, column, procedure and function privileges.
Database-level grants escape wildcard characters unless MySQL partial_revokes
requires literal database names. Column names are entered one per line. Delegation
uses WITH GRANT OPTION, with a separate action to revoke that option. Existing
roles can be assigned/revoked or set/cleared as defaults on MySQL 8+ / MariaDB 10.2+;
role hosts apply only to MySQL. Role creation, MySQL dynamic privileges, account
resource limits and arbitrary authentication plugins remain SQL-editor tasks.
Account management requires privileges to inspect mysql.user, SHOW CREATE USER,
SHOW GRANTS and, on MySQL role changes, mysql.default_roles. Previews include
account definition, grants/role metadata and partial_revokes state in stale checks.
Account SQL is one reviewed, single-use statement; passwords stay hidden in previews.
Role syntax/capabilities follow [MySQL GRANT](https://dev.mysql.com/doc/refman/8.0/en/grant.html)
and [MariaDB SET DEFAULT ROLE](https://mariadb.com/docs/server/reference/sql-statements/account-management-sql-statements/set-default-role).
Locking an account does not terminate its existing sessions. Unsupported syntax or
insufficient privileges fails without automatic retries. SQL Console retains up to 500 verb/initial-response events in memory,
without query text or parameters. Changes may implicitly commit; there is no
automatic replay or undo. Editing an existing trigger still requires separate
reviewed drop/create operations.

Connection settings include local UNIX sockets (absolute path, no TLS/SSH), server
session timezone, SSH agent (`SSH_AUTH_SOCK`) and pre-entered keyboard-interactive
answers. Named zones require MySQL timezone tables. Folder paths and colors are
saved with favorites. **Folders** on the connection sidebar creates persistent
empty/nested folders, renames/moves subtrees, or removes folders while moving all
their favorites to Unfiled. Profile IDs and credential-store entries are preserved.
Folder filter/collapse controls organize the list; an individual favorite moves via
its Folder field and Save Changes. Paths support ten levels/200 UTF-8 bytes, with
no implicit merges. Folder changes validate all profiles first and publish each
profile atomically, then the folder document. Multi-profile changes are not atomic;
a failure reports its completed prefix. Reload before retrying a partial operation.
The existing profile v1 format stays readable; .folders-v1 stores empty folder paths.
Preferences offers dark/light/system, editor font/size/wrap, SQL tab width (2/4/8),
default Content page size (25/50/100/200) and shortcut remapping. The page default
applies only to newly opened table workspaces, preserving existing pages/drafts.
Reset preferences restores these settings without clearing favorites or SQL drafts.
Preferences and bindings persist in localStorage using the existing key/legacy values.
Cmd/Ctrl+1–6 switches views by default. The Settings gear beside Console or Cmd/Ctrl+, opens the preferences dialog;
there is no extra preferences toolbar row. A native Settings menu is also available.

AWS IAM needs `aws` available in the app environment with configured credentials;
select region/profile and verified database TLS. Tokens are generated for each new
session. Vault uses HTTPS token auth to `/v1/<mount>/creds/<role>`, an optional
namespace and verified database TLS. Vault tokens/issued secrets are not profile
fields; OIDC and lease renewal are not implemented. SPF export refuses these
additional connection settings until they can round-trip faithfully.

Query exposes server HELP. The inline Save print view control was removed with
the Export data panel. Native print dialogs and external AWS/Vault account QA
are still open. See [milestone.md](milestone.md) for all remaining parity/verification work.


Preferences includes an explicit **Check for updates** button. It fetches public
GitHub release metadata (up to 100 recent releases), compares complete SemVer tags
and excludes prereleases unless enabled. CI embeds the release tag; local builds
are identified as development builds. **Open release downloads** opens the trusted
repository release page in your browser. Installation is manual; no automatic
network checks, package installation or session shutdown occurs. Offline/API rate
limit errors can be retried explicitly. No GitHub credentials are bundled.

Distribution remains development grade: macOS signatures are ad hoc, Windows
packages are unsigned. Distribution is via GitHub Releases with manual installation;
production signing/notarization is optional outside the current distribution scope.
CI now includes native startup smoke tests for Linux under Xvfb and a
fresh Windows NSIS installation, using empty application configuration and no SQL
connections. JSON evidence is uploaded separately. The v0.1.0 workflow passed both
startup probes, including startup from a clean Windows installation. A passing
startup probe does not establish full
desktop, upgrade/uninstall or database QA. See milestone priority 6 for the remaining
manual checks. Signing guidance: [Apple Developer ID](https://developer.apple.com/developer-id/)
and [notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

New connection tab: **Cmd+T** on macOS / **Ctrl+T** on Windows/Linux, or
**File → New Connection Tab**. Opens the connection chooser without contacting a server.
Choose a saved connection or enter another server; connected tabs keep independent sessions.
Structure drafts save first, SQL drafts remain in their original tab. Maximum 16 tabs,
including connection forms. Enter a name and click **Save Connection** to keep a profile;
password storage is optional through the OS credential store.

Connection tab titles follow the selected database independently in each tab.
Before selecting a database, connected tabs retain their Query label.

The connection home follows the Sequel Ace layout: a Favorites sidebar and a
compact TCP/IP, Socket, or SSH form. Folder, alternate authentication, and native
file migration tools are under **Advanced connection options**. The Time Zone
menu offers server/system defaults, IANA time zones, and a Custom entry for offsets.

Fresh connections start in Content with an empty striped grid. Data controls stay
disabled until a table is selected; the SQL editor opens through Query. Imported
SPF sessions still restore their saved SQL/view instead of using this default.
