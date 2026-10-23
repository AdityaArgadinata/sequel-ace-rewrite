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
