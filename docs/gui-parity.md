# GUI parity with Sequel Ace

Status: first layout implementation; **not pixel-identical or accepted as complete**.

## Reference inspected on 2026-10-21

- Installed Sequel Ace **5.0.9**, read from its application bundle metadata.
- Source reference: original Sequel Ace checkout at **a82ae6c30**, especially
  `Source/Interfaces/ConnectionView.xib` and `MainWindow.xib`. The installed
  binary and source revision are different references, not claimed to be the same build.
- Native connection window inspected visually in dark appearance. Logical
  sidebar width is approximately 200 px; the connection panel is about 425 px.
- Native workspace accessibility exposes Structure, Content, Relations,
  Triggers, Table Info, Query, Table History, Users, Console; table filtering,
  content filters, a result grid, row actions, and pagination are separate regions.
- Native screenshots contained existing user favorites/data and are deliberately
  not committed or copied into the rewrite. They are not safe golden fixtures.
  Sanitized screenshots of Content/Structure/Query still need to be captured
  using a disposable database before an overlay comparison can be checked off.

## Implemented in this pass

- Compact icon toolbar and database selector above the full-height workspace.
- Favorites sidebar with Quick Connect, saved profiles, create and delete actions.
- Centered vertical connection form: TCP/IP tab, name/color row, host, username,
  password, database/port/time-zone rows, SSL and optional CA, Connect action.
- Unsupported settings are disabled. SSL verification remains **on by default**;
  matching a screenshot must not weaken the established connection policy.
- Connected workspace has a table sidebar/filter, SQL editor with line numbers,
  run/cancel controls, compact striped result table, row numbers and status bars.
- Existing profile storage, SQL execution, bounded streaming and cancel backend
  are reused; SQL values remain escaped by React and never rendered as HTML.
- Light/dark colors follow OS appearance. Light appearance is not yet visually
  compared with a native reference.

## Known differences and unfinished work

- Mac now uses a full-content inset title bar with an 80 px toolbar allowance
  for native window buttons. Render and accessibility were checked in a separate
  test bundle. Windows/Linux retain their platform frame; those are unverified.
- SVG toolbar symbols are newly drawn approximations, not the original system
  symbols. Icon shapes, disabled opacity, font metrics, selection and exact
  spacing still require measured comparison.
- Default window is now 1200×710, matching the observed native reference.
  Complete same-scale golden comparisons are still pending.
- Query, Content and read-only Structure are functional. Relations, Triggers,
  Table Info, table history, Users and Console remain unavailable. Query history
  metadata has its own toolbar control; this differs from the original Console.
- Socket, favorite colors, preselected database, configurable time zone,
  LOCAL_DATA_INFILE and cleartext plugin settings are not implemented and disabled.
- Profile save is explicit, credential-vault save/load/forget are explicit, and CA
  uses a PEM text area. SSH uses key/known_hosts path fields. These differ from the
  native app's full connection controls.
- Arbitrary Query results remain read-only. Content supports row selection
  and a separate insert/edit form with delete confirmation on eligible tables.
  Native cell editing is not implemented. Grid copy menus and column resizing are implemented as described below.
  Content pagination, sorting, filters and row forms have not been compared for
  exact native visual/interaction parity.
- Editor uses a plain textarea; no syntax highlighting/autocomplete. Line numbers
  synchronize with the textarea scroll position. Cmd/Ctrl+Enter
  runs one statement; original shortcut parity has not been established.
- Sidebar/editor splitters are implemented with pointer and keyboard controls.
  Native splitter measurements, column resizing, native menu parity, full keyboard
  navigation/accessibility validation, and Windows/Linux GUI comparison remain open.

Functional tests and build success are separate from visual parity. Keep the
remaining checks in milestone 1A open until measured comparison and OS testing.

## Verification for the first layout pass

macOS desktop fixture smoke test passed: add favorite and select after restart,
verified TLS with a custom CA, database/table selection, two-row query with NULL
and DECIMAL values, Cmd+Enter, incremental results (9 rows while running), and
cancel returning to favorites with partial rows cleared. Backend test/race/vet
and TypeScript/production desktop build passed locally. Temporary profile/schema
were removed and the disposable server stopped. Native user's database connections
were not queried or edited; only the new reference connection window was closed.

CI for code commit `ff149bd` passed desktop build/test/vet on macOS 15, Windows
Server 2022, and Ubuntu 24.04, plus MySQL 8.4/MariaDB 11.4 integration tests.
Run: https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/runs/39545854229.
This proves build/test compatibility, not Windows/Linux visual parity.

## Panel resizing follow-up

Sidebar width (15–35%, initially 17%) is shared between Favorites and Tables
within the current app session. Editor height (20–65%, initially 32%) has its
own separator. Arrow keys move one percentage point; Home/End reach the limits.
Both expose labeled, focusable separators with orientation and current values.
Pointer capture keeps dragging active outside the divider and clears on cancel.
Sizes are not persisted. Exact native dimensions/interactions are still unverified.

Two Node tests cover pointer scaling/clamping and keyboard axes/bounds. They run
in the desktop CI jobs before the frontend build. Local frontend, Go race/vet,
and packaged Mac build pass. Mac Favorites separator smoke test confirmed
17→18% with Right, 35% with End, 15% with Home, and 15→25% by dragging.
Connected Tables/editor and minimum-window interaction still need manual QA;
no database server or Windows/Linux GUI was used for this follow-up.

## Grid and Structure follow-up — 2026-10-22

Inspected the installed 5.0.9 binary using an isolated temporary bundle with a
separate bundle identifier and executable name. This kept the reference free
of user favorites. Only temporary packaging/signing was changed. A disposable
`sequel_parity_fixture.sample_records` table supplied three rows including NULL,
empty text and DECIMAL values. Dark Connection, Content, Structure and Query
were inspected; these are observations, not a committed golden screenshot set.

Native observations: unified toolbar about 52 logical px high, sidebar about
200–214 px, table filter at the top, 22 px striped grid rows, no extra numbered
column in Content, and Columns above Indexes in Structure. The native Query
editor starts below the toolbar and has a favorites/history/run action strip.
The rewrite's title bar, additional transaction strip, Query heading/editor,
metadata header names, field actions and connection settings still differ.

Implemented shared Query/Content/Structure grid row selection with click,
Up/Down/Home/End, bounded 48–800 px column resizing by pointer and keyboard,
and a copy-cell/copy-row menu. Empty strings render as empty cells; NULL remains
explicit. Grids retain their column widths rather than stretching to fill the
pane, and unused space has alternating rows. Structure defaults to stacked
Columns/Indexes with an adjustable splitter; Foreign keys and CREATE statement
remain accessible separately. This is closer to the native arrangement, not
full native schema editing or exact column-header parity.

Four Node tests and TypeScript/Vite production build passed. Packaged macOS
arm64 build passed. Desktop smoke test with verified TLS confirmed three fixture
rows, click + Down selecting the second row, context-menu copy of DECIMAL
`123.4500`, and pasting the exact value back into the editor. Structure loaded four columns and the PRIMARY index; its splitter responded
to Down (60→61%). Pointer resizing, clipboard failure, and Windows/Linux GUI
were not manually verified in this pass. Go unit tests also passed; server
integration suites requiring environment variables were skipped. No raw user query/data was used in the comparison.

## Source-derived styling — 2026-10-22

Read `ConnectionView.xib`: sidebar frame 200 px, label frames 98 px, text
fields 247×22 px, standard system fonts and semantic AppKit colors. CSS now
uses these metrics rather than stretching inputs. Initial sidebar is 16⅔%
(200 px at 1200 px); it remains adjustable. Native dark reference and XIB are
complementary: the source uses semantic colors, not fixed cross-platform RGB.
Existing light/dark tokens remain approximations, not measured color parity.

Mac title bar and 52 px toolbar share one region. Document tabs move below
that toolbar, active toolbar labels use accent color, sidebar rows and field
spacing are compact, empty Favorites stays blank, and the table icon is tinted.
The native default size observed (1200×710) is now used. Credential controls
are grouped under Password storage to keep the main connection form compact;
this is a documented functional extension, not an original AppKit control.

An isolated copy of the first styling build showed the unified toolbar and
unobscured fields/Connect button; accessibility exposed fields, splitters and
native window buttons after focusing the WebView. Final credential grouping
was typechecked/built but not re-inspected in the GUI. Connected tab positioning,
minimum size, light appearance, and Windows/Linux rendering still need manual QA.
No original asset was copied; drawn SVG icons remain approximations.

## Semantic palette, icons and selection — 2026-10-22

Read the view-mode symbol mapping from `SPDatabaseDocument+ViewMode.swift`:
Structure `scale.3d`, Content `text.justify`, Query `terminal`, Info `info.circle`,
Relations `arrow.2.squarepath`, Triggers `bolt.circle`; Users uses `person.3`
in `SPDatabaseDocument.m`. Portable SVG drawings now follow those concepts.
They are original drawings, not exported Apple SF Symbols; exact glyph parity
is not claimed. The repository LICENSE was reviewed; no original asset or
Apple symbol artwork was copied into the rewrite.

`UserDefaultsExtension.swift` defaults to NSFont.systemFontSize; a read-only
AppKit probe confirmed 13 pt system and 11 pt small-system fonts on the reference
Mac. The Swift probe could not compile because the installed CLT compiler/SDK
versions differ. The same read-only values were obtained through AppKit's
Objective-C runtime from Python ctypes, without changing OS appearance/settings.

Resolved standalone Aqua/Dark Aqua values (sRGB; alpha retained for text/rings):

| Semantic role | Aqua | Dark Aqua |
| --- | --- | --- |
| Window / surface | #ececec | #323232 |
| Text background | #ffffff | #1e1e1e |
| Label | black / .847 | white / .847 |
| Secondary label | black / .498 | white / .549 |
| Separator | black / .098 | white / .098 |
| Grid line | #e6e6e6 | #1a1a1a |
| Active row | #0064e1 | #0059d1 |
| Inactive row | #dcdcdc | #464646 |
| Selected foreground | #ffffff | #ffffff |
| Alternating row | #f4f5f5 | #292929 (white/.047 over #1e1e1e) |
| Focus ring | rgb(0,103,244) / .498 | rgb(26,169,255) / .498 |

CSS now uses these values for grids, form surfaces/text, separators, selection,
context menus and focus rings. Sidebar vibrancy and field bezel borders remain
opaque approximations; live AppKit materials, accent settings, wallpaper and
OS versions can alter the native appearance. Native browser select/button
bevels also remain platform dependent. The Mac screenshot verified the dark
connection form and toolbar rendering, not an overlay match with the original.

Grid focus selects blue/white; inactive selection is gray; hover preserves row
stripes. Numeric column types align right without parsing or converting cell
values. Cell text, including DECIMAL, remains unchanged. Selection/focus styling
was implemented but not manually exercised on a connected grid in this pass;
the CUA AX bridge failed during the focus-ring check. Light values were resolved
from AppKit but a light GUI render was not captured. Four frontend tests,
TypeScript/Vite production build, Go unit tests and packaged Mac build passed.
Server integration suites were skipped without fixture environment variables.
Windows/Linux GUI and same-scale overlays remain open.

## Workspace layout from DBView.xib — 2026-10-22

See `source-ui-map.md` for the element IDs, sizes, source files and remaining
behavior differences. Content actions/pagination now sit below the grid; filter
and sort are hidden until toggled. The selected read-only row can also be copied;
selection does not enable writes on ineligible tables. Delete confirmation and
mutation guards remain in place. Duplicate is visibly unavailable, not a fake
action. CSV export remains explicit and Content information explains its scope.

Query starts with the editor instead of an extra heading. Its 130/145 px
favorites/history controls and 200×22 run control follow the XIB action strip;
favorites stays disabled and history is accurately labeled metadata-only.
The extra transaction strip was moved into a status-bar popover while keeping
transaction state and existing Begin/Commit/Rollback checks. Native 214 px table
sidebar width is used initially at 1200 px. Structure headers use native display
labels while metadata identifiers and values remain unchanged.

Four frontend tests, TypeScript/Vite build, Go unit tests and packaged Mac build
passed. Desktop workspace smoke testing was blocked by CUA AX frame errors;
no connected layout verification is claimed. Test fixture cleanup completed.

## Structure detail follow-up — 2026-10-22

Columns and Indexes now use initial widths from DBView.xib tables 232/289,
clamped to the existing 48 px resize minimum. Index headers/values are reordered
together to the native Non_unique/Key_name/Seq_in_index/Column_name sequence;
additional server columns remain available at the end. Allow Null is a disabled
checkbox for known YES/NO values; NULL/unexpected data stays visible as text.
Clipboard still receives the raw server value. Both panels have 25 px action
strips; schema writes are visibly disabled and reload stays functional. Empty
Structure/Indexes no longer instruct the user to run a SQL query.

Five frontend tests now pass, including a lossless reordering test. Typecheck/
frontend build, Go unit tests and packaged Mac build are run for this change.
The new layout has not been manually verified on desktop; XIB defaults and
functional tests do not establish pixel equivalence or Windows/Linux GUI QA.

## Latest cumulative CI — 2026-10-23

Commit `b4b5fc3` includes the accumulated GUI, Structure presentation, connection
diagnostics and native keyboard shortcuts. Run
https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/runs/39896410477
completed successfully in all five jobs: macOS 15, Windows Server 2022,
Ubuntu 24.04, MySQL 8.4 and MariaDB 11.4. Desktop artifact upload succeeded.
This supersedes earlier pending CI notes for those code changes. It does not
supersede unperformed manual GUI checks, native shortcut delivery, light/dark
same-scale overlays or the recorded CUA frame errors.

## Supplied Content screenshot — 2026-10-23

The user's dark Content screenshot is now the visual reference for the Go
rewrite. Default window size is 1408×1024 logical pixels. The workspace uses a
52 px toolbar, 20.5% initial sidebar (approximately 289 px), a 29 px Content
filter, 28 px column header, 22 px rows and a 25 px bottom action strip.
Dark colors now follow this reference regardless of OS appearance; this
supersedes the earlier OS-following palette notes above.

The title shows the actual server version, host, database and table. Table
icons use a yellow grid, sidebar search has a magnifying glass, and the extra
TABLES heading is removed. A single session hides the session tab strip; the
sidebar's connection-actions menu retains New query tab, Disconnect, history
metadata and transaction controls. Multiple sessions still expose the tab bar.
Busy/error messages appear above the bottom strip when needed.

Content filters are visible initially. The checkbox enables/disables the
single existing filter; editing its controls enables it. Initial loading does
not implicitly filter the first column. Additional filter rules stay disabled.
Sort, page size, export and Content information remain in the bottom ellipsis
menu. The row count explicitly describes the current page rather than claiming
a whole-table count. Column headers include type metadata; initial column
widths account for visible values and allow manual resizing. Selection fills
the remaining row canvas. Console stays disabled; existing history metadata is
accurately labeled in the connection menu and Query controls.

[Layout preview before the transparency correction below](screenshots/content-dark.png) uses six synthetic rows and a
mock Wails bridge, not a database connection. Headless Chrome checks passed at
1408×1024 and 800×600: full-width row selection, insert eligibility after initial
load, filter enable/apply/disable, sort parameters, error visibility/recovery,
opening/closing sessions and toolbar fit. Nine frontend tests and TypeScript /
production frontend build passed. Go unit tests passed, including loopback
fixtures; database integration suites remain environment-skipped.

This is a visual implementation against the supplied image, not a pixel-overlay
certification. Portable SVG symbols, opaque sidebar gradient and platform font
rendering still differ from native AppKit/SF Symbols/vibrancy. Actual Wails
WebKit rendering with a live MySQL/MariaDB connection and Windows/Linux manual
GUI checks remain open. Earlier light-mode QA is superseded by this dark-only
reference pass; full milestone 1A remains open.

Packaged darwin/arm64 production build also passed with Wails 2.17.0; the updated
application is in `build/bin/sequel-rewrite.app`. No native Sequel Ace sources,
project settings, user profiles or database contents were changed.


## Wallpaper transparency correction — 2026-10-23

The user clarified that the sidebar's green tint comes from wallpaper through
native transparency. The previous fixed green gradient has been removed.
macOS now enables Wails `WebviewIsTransparent` and `WindowIsTranslucent`, which
in the pinned 2.17.0 implementation inserts an `NSVisualEffectView` with
behind-window blending. Dark Aqua matches the current dark workspace.
The window background is clear, and the HTML root/sidebar stay transparent
only inside the native macOS runtime. Other platforms and browser previews
use a neutral sidebar fallback. The connection form and result surfaces remain
opaque so the native backdrop is exposed through the sidebars.

The earlier PNG demonstrates layout only and predates this transparency fix;
it must not be treated as proof of wallpaper-dependent rendering. Frontend
build and nine tests, plus Go unit tests passed. Native visual comparison
against different wallpapers and Windows/Linux GUI QA remain open.
The updated darwin/arm64 app also built and passed code-signature verification.

## Cross-platform control rendering — 2026-10-23

A Linux package screenshot showed database/filter select text clipped vertically.
The compact controls used 18–20 px heights while allowing GTK's native select
appearance and padding. A connection-form selector also unintentionally styled
all selects. The shared `controls.css` now sets explicit appearance, 24 px field
height, 18 px line height, text/background colors, and a portable select arrow.
Native select semantics and keyboard interaction are retained. Checkbox and
button surfaces are styled consistently; forced-colors mode retains native
controls. The Content filter strip grows to 32 px to fit the controls.

The review also corrected search-icon/text overlap after the field reset, narrow
Quick Connect labels, row-editor checkbox spacing/wrapping, credential action
wrapping and scroll limits for the Content options panel. Native macOS sidebar
vibrancy is unchanged.

Playwright 1.62.1 checks Connection/SSH/credentials, Content filter/sort controls,
row editor, operation errors, Structure and Query/history in Chromium and WebKit.
The 800×600, 1280×720 and 1408×1024 layouts verify readable control metrics,
selected values, search insets, toolbar bounds, menu visibility and working filter
requests. Tests use a synthetic Wails bridge, with no user database or vault.
Fourteen local engine/layout checks, nine frontend unit tests and frontend build
passed. CI now runs both engines on every desktop OS and uploads screenshots
as `ui-checks-<runner>` artifacts; failures block distribution release creation.

Browser engine tests complement native testing; they do not certify all OS/font,
GTK theme, scaling, screen reader or platform dialog combinations. The original
native popup menu and macOS wallpaper material remain platform-provided.

CI screenshot review also found a type label clipped in a default Content header
under Linux WebKit's wider font metrics. Initial header width estimates now
reserve more space, and the UI tests assert that the fixture's header name/type
text fits before any manual resize. Long identifiers still intentionally cap at
260 px and can be resized. SQL values and column metadata are unchanged.

## Content interactions — 2026-10-23

- Content column headers request server-side ASC/DESC sorting, resetting to
  page one; a newly selected column starts ascending. Query and Structure grids
  keep their existing header behavior.
- Double-click an eligible Content cell to edit that value inline. Save cell
  updates only that column through the existing optimistic-concurrency mutation
  path. Cancel/Escape discards the draft. NULL and hex values remain explicit;
  generated columns and ineligible tables remain protected. The editing column
  expands temporarily to fit the controls.
- The filter + button adds conditions (up to 100 total). All (AND) and Any (OR)
  apply across the conditions. Additional rules can be removed individually;
  disabling the filter excludes every rule. SQL values stay bound parameters,
  operators are allow-listed and identifiers quoted.
- TypeScript checking, 9 frontend unit tests and the Go suite pass. Browser
  checks use the synthetic bridge, not a live MySQL/MariaDB server. No GitHub
  Release build or publish was run.

### Compact cell editor — 2026-10-23

The inline editor now keeps the original cell width and row height, with a dark
field and blue focus ring matching the supplied screenshot. Text is selected on
entry. Enter saves, Shift+Enter inserts a newline, Escape or blur cancels.
An untouched NULL stays NULL; typing replaces it with text. Explicit NULL/hex
controls remain in the row editor. There are no inline Save/Cancel controls.
This supersedes the expanding editor described above.

### Startup metadata and transaction state — 2026-10-23

The workspace previously called the user Query endpoint for SELECT VERSION()
when connecting, and SELECT DATABASE() when refreshing schema. That endpoint
conservatively marks unmanaged SQL as transaction-unverified, so simply opening
a workspace blocked Content writes. Both reads now use WorkspaceInfo, a fixed
SELECT VERSION(), DATABASE() metadata query. It preserves idle/active/unverified
state and never commits, rolls back, or clears uncertainty from earlier SQL.
Regression tests cover writes after startup and schema refresh, plus rejection
of writes when the session really is unverified. Existing open sessions need a
reconnect after updating; the app does not silently end user transactions.

### Grid text selection — 2026-10-23

Disable browser text selection in result grids (including WebKit's prefixed
property), so repeated clicks or drags into empty space cannot highlight the
entire grid viewport. Row selection, keyboard navigation and copy commands
remain available. Text fields explicitly allow selection for inline editing.

### MyISAM editing — 2026-10-23

Confirmed the reported bbc_config table uses MyISAM with a primary key and no
computed columns. The old InnoDB-only eligibility check blocked all its cells.
MyISAM base tables with primary keys now support the same guarded mutations,
using LOCK TABLES ... WRITE across metadata revalidation and the statement,
followed by UNLOCK TABLES. Active or uncertain transactions are rejected before
locking to avoid an implicit commit. Writes are immediate and cannot be rolled
back; the success message makes that explicit. Other engines remain read-only.

A separate disposable MySQL 5.7 instance verified insert/update/delete, conflict
and validation error cleanup, immediate visibility from a second session, and
preservation of managed transactions. Existing InnoDB mutation integration tests
also pass. No writes or schema changes were made to the user's bbc_config table.

### Filter row layout — 2026-10-23

Filter rows now share aligned checkbox/column/operator/value/minus-plus/Apply
tracks following the supplied reference. Each checkbox enables only its own
condition. Plus inserts after its row and picks the next column; minus removes
that row (the last row resets disabled instead). A single Apply Filter(s) button
appears on the final row with an empty reserved slot above it. Match All/Any is
available in Content options, with AND as the default. Disabled rules are omitted
from the bound server request. Existing single-rule request support remains in
the backend for compatibility.

## Implementasi Prioritas 1 — Content grid — 2026-10-23

Implementasi lokal selesai; QA native Windows/Ubuntu dan verifikasi CI terbaru
masih terbuka. GitHub Release tetap ditunda sampai instruksi pengguna.

- [x] Duplicate satu baris lewat toolbar/menu konteks membuka draft sebelum write.
  Generated columns tidak disalin sebagai assignment; auto-increment tidak
  dicentang sehingga server membuat nilainya. Key unik lain tetap perlu diperiksa.
- [x] Multi-select dengan Shift-click, Cmd/Ctrl-click, Shift+panah, serta
  Cmd/Ctrl+A untuk seluruh baris pada halaman aktif. Seleksi dibersihkan saat reload.
- [x] Edit banyak baris melalui row editor: hanya kolom yang dicentang diterapkan
  ke semua baris terpilih; kolom identitas tidak bisa diubah massal. Nilai yang
  sama dengan snapshot dilewati. Delete massal memerlukan konfirmasi jumlah/key.
- [x] Operasi massal berjalan satu baris per statement, berhenti pada error pertama,
  melaporkan jumlah yang sudah diproses dan membuang snapshot lama. Bukan satu
  transaksi atomik: write sebelumnya bisa sudah tersimpan; pada managed InnoDB
  transaction, perubahan tetap menunggu Commit/Rollback. Tidak ada retry otomatis.
- [x] Tab/Shift+Tab menyimpan lalu berpindah ke sel editable berikut/sebelumnya;
  Enter ke baris berikut pada kolom sama. Shift+Enter tetap newline, Escape/blur
  membatalkan draft. Generated columns dilewati. Setelah refresh/sorting, tujuan
  dicari melalui key, bukan nomor baris; jika tujuan keluar dari hasil, edit berhenti.
- [x] Menu konteks dasar asli: copy, copy dengan nama kolom, SQL INSERT dengan/
  tanpa auto-increment, insert, duplicate dan delete. Ditambah CSV, copy cell/row,
  select all/clear, edit cell/selected rows, NULL, filter by cell dan refresh.
  Copy SQL mengecualikan generated columns dan mengodekan teks sebagai UTF-8 hex.
  Integrasi Bundles/plugin menu asli bukan bagian implementasi Content grid ini.
- [x] Go to page pada menu Content options, validasi integer positif dan batas
  offset 10.000.000. Tidak menjalankan COUNT seluruh tabel; halaman bisa kosong.
- [x] Back/Forward Table History per tab (maksimum 100 tabel), termasuk lintas
  database; navigasi baru memangkas cabang Forward. Hanya memilih tabel/view dan
  memuat datanya, tidak menjalankan ulang SQL pengguna. Draft/filter tidak dipersist
  ke history; transaksi dan sesi database tetap milik tab yang sama.
- [x] Perluasan identitas baris: InnoDB/MyISAM tanpa primary key asli dapat diedit
  bila ada unique index lengkap yang seluruh kolomnya NOT NULL. Baca STATISTICS
  untuk membedakan PK asli dari COLUMN_KEY=PRI semu. Nullable/prefix/expression
  key ditolak, snapshot seluruh kolom tetap dicek, schema direvalidasi dalam lock.
  View, hasil Query arbitrer, tabel tanpa key aman dan engine lain tetap read-only.

Validasi: TypeScript, 12 unit test frontend, 50 tes UI Chromium/WebKit, go vet,
suite Go serta integration test dan race detector database pada MySQL 5.7
disposable lulus. App lokal macOS ARM64 sudah dibuild ulang. Tes mencakup unique key
komposit InnoDB/MyISAM, metadata auto-increment, konflik snapshot, gagal sebagian,
copy/seleksi/navigasi/duplicate/delete dan riwayat tabel. Screenshot UI ditinjau
melalui fixture Chromium/WebKit; tidak ada write pada database pengguna. QA
native tiga OS dan CI source terbaru tetap harus dilakukan sebelum beta.

### Perbaikan tinggi row dan zebra kosong — 2026-10-23

- [x] Gunakan satu metrik tinggi row 22 px untuk data, pola zebra dan editor sel.
  Line-height sel dibuat eksplisit agar isi/jenis font tidak memperbesar row.
- [x] Awal zebra kosong mengikuti tinggi header sebenarnya melalui ResizeObserver,
  menggantikan offset tetap 28 px yang meleset ketika nama/tipe kolom bertumpuk.
- [x] Posisi zebra mengikuti scrollTop tanpa rerender React setiap scroll.
- [x] Suite 54 tes UI Chromium/WebKit lulus, termasuk row sebelum/saat edit
  multiline/emoji dan keselarasan zebra setelah scrolling; screenshot diperiksa.

Pembaruan ini hanya menyentuh layout grid; tidak mengubah data atau schema.
QA pada app native Windows/Ubuntu masih terbuka. GitHub Release tetap ditunda.

### Perbaikan katalog lebih dari 500 tabel — 2026-10-23

- [x] Pisahkan budget daftar database/tabel dari batas hasil query 500 baris.
  Katalog memakai maksimum 50.000 entri / 4 MiB dan timeout operasi yang sama;
  hasil query pengguna tetap maksimum 500 baris / 4 MiB.
- [x] Katalog yang melampaui budget dibuang dengan error eksplisit, sehingga UI
  tidak mengaku sukses dengan daftar parsial setelah sesi ditutup.
- [x] Uji MySQL 5.7 disposable dengan 509 tabel: USE/list mempertahankan sesi dan
  transaksi aktif, tabel terakhir tersedia, serta insert/browse tetap berfungsi.
- [x] Unit test membuktikan Databases/Tables dapat melewati 500 entri, sementara
  query biasa tetap dibatasi dan katalog berlebih tidak dikembalikan sebagian.
- [x] Dua tes UI Chromium/WebKit memastikan 509 tombol tabel tersedia, tabel
  terakhir bisa dibuka, dan pencarian sidebar tetap bekerja. Suite Go lulus.

Database bbo pengguna tidak dimodifikasi. App lokal diperbarui; sesi yang sudah
terputus perlu dihubungkan ulang. Tidak ada reconnect atau replay SQL otomatis,
dan tidak ada build/upload GitHub Release.


### Priority 2 — SQL editor and scripts (2026-10-23)

CodeMirror provides MySQL/MariaDB highlighting, search/undo and schema completion.
Current/Selection/All use the Go parser with UTF-16 offsets, session SQL modes,
comments, quoted literals and DELIMITER routines. Native SQL file dialogs,
Query Favorites CRUD, and explicit Off/metadata/SQL history are implemented.
Loaded history/favorites are reviewed in the editor before execution. SQL storage
is local plaintext and opt-in for history. See README for limits and shortcuts.

Scripts stop on error/cancel/truncation or a SQL mode change, retain the latest
five statement results, and never retry/commit automatically. Earlier writes may
already have taken effect. Disposable MySQL 5.7 integration verifies a DELIMITER
trigger with Unicode and a blocked continuation after SQL_MODE changes. UI fixture
checks cover editor completion, scopes, partial failure, result selection, files,
favorites, history privacy and cancellation in Chromium and WebKit. Native file
dialog QA and Windows/Linux GUI QA remain open; no GitHub Release is requested.


### Priority 3 — Structure schema editor (2026-10-23)

Columns, indexes/primary keys and foreign keys now expose Add/Edit/Drop and
row double-click editing. Forms use Name plus the full server Definition SQL,
with index type choices, preserving unfamiliar attributes rather than rebuilding
from display metadata. This is functional schema editing; separate native widgets
for every attribute are still a GUI parity gap. Review/confirmation precedes Apply.
Plans are once-only, per-tab, check schema/SQL mode changes, and block active or
unverified transactions, autocommit off, views and incomplete metadata. Ordinary
INSERT-related AUTO_INCREMENT advances do not invalidate the preview. FK edits
use a new constraint name for MySQL 5.7 COPY ALTER compatibility without disabling
foreign_key_checks. CHECK constraints and version-comment definitions remain
outside this editor. DDL warnings (up to 20) and metadata reload failures are shown
separately. There is no automatic retry or rollback of DDL. External schema checks
are optimistic rather than a cross-session lock held during review.

Disposable MySQL 5.7 tests exercise CRUD, generated columns, composite/prefix
indexes, PK/FK replacement, attribute preservation, stale snapshots, active and
unverified transactions, modes, warning truncation and server errors. Chromium/
WebKit fixtures cover the UI flows and 800px layout. Native Windows/Linux GUI
and newer server versions remain unverified for these local changes.


### Priority 4 — objects, data transfer and native files (2026-10-23)

Reviewed table/database create/rename/copy/drop and table truncate now have UI.
Database move is a staged CREATE/RENAME TABLE/DROP-empty-source operation, with
visible unsupported object categories blocked. Copy preserves table definitions,
index/constraint options, defers FKs until data exists and maps internal references
to the destination. There is no consistent data snapshot or cross-session review
lock; failure reports acknowledged steps and retains partial destinations.

Content CSV import previews/mapping before row-by-row writes; generic CSV/SQL/XML
exports support full/applied-filter/page/loaded/selected scopes. Query exports its
retained result without rerunning SQL. A separate SQL dump import has larger bounds
than the interactive editor and stops on error/warning/cancel/SQL mode changes.
Native XML/binary favorites and unencrypted SPF v1 connection/editor state are
supported without passwords/Keychain or automatic connections/execution. Initial
database is now functional; timezone/socket and full session/layout compatibility
remain gaps. UI uses transfer panels rather than reproducing every native sheet.

Go fixture and disposable MySQL 5.7 tests cover partial copy/CSV/SQL failure, FK
remapping, generated columns, NULL/binary/Unicode, export filters, native fixtures,
credential-free settings and once-only plans. Browser fixtures verify the controls,
confirmation, selection exports, no automatic SQL/connect, and small-window layout.
Native dialog QA, Windows/Linux GUI, newer server matrix and advanced native formats
remain open. Release publication remains on hold.


### Priority 5 — administration panels and everyday settings (2026-10-23)

Relations, Triggers, Table Info, Users and Console are enabled. Relations reuses
reviewed FK editing. Trigger create/drop, table engine/default collation/comment
and basic account/grant changes use once-only, optimistic metadata-checked plans.
DDL requires a verified idle autocommit session. Password previews are redacted;
console is a bounded in-memory verb/response log, with no SQL text or values.
Advanced account/global/role privileges and atomic trigger replacement remain open.

Connections now support local UNIX sockets, per-session timezone, SSH agent and
pre-entered keyboard-interactive answers. Favorites store folder paths/colors.
Appearance supports dark/light/system, persisted editor font/size/wrap and view
shortcuts 1–6. The previous SVG icons are retained at the user’s request; the Priority 5 PNG
replacement was reverted. Apple SF Symbols artwork is not bundled.

AWS IAM uses an installed/configured AWS CLI without a shell. Vault dynamic DB
credentials use verified HTTPS, namespaces and token auth, with redirects blocked.
Both require verified MySQL TLS and refresh credentials on each new tab. No Vault
OIDC or automatic lease renewal. Native SPF export refuses these additional
settings until they have a faithful wire representation.

Server HELP is available in Query. Print view exports escaped loaded-result HTML,
with a truncation notice and a browser Print/Save PDF button; it does not rerun SQL
or offer Wails native printing. Complete shortcuts/preferences/folder operations
and native platform parity remain backlog items. See milestone.md for exact bounds
and verification; no GitHub Release was requested.
