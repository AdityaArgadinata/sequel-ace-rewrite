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
