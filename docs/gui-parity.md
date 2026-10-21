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

- Native title bar is retained. An inset/full-content toolbar experiment could
  not be verified with native accessibility, so it was reverted. The native app
  has a unified toolbar; this difference is not yet accepted as parity.
- SVG toolbar symbols are newly drawn approximations, not the original system
  symbols. Icon shapes, disabled opacity, font metrics, selection and exact
  spacing still require measured comparison.
- Rewrite's default window is 1200×760; observed native connection reference was
  approximately 1200×710. Size/scale must be standardized for golden comparison.
- Only Query is functional among the main view buttons. Structure, Content,
  Relations, Triggers, Table Info, history, Users and Console remain disabled.
- Socket/SSH, favorite colors, preselected database, configurable time zone,
  LOCAL_DATA_INFILE and cleartext plugin settings are not implemented and disabled.
- Profile save is explicit, password storage is unavailable, and CA uses a PEM
  text area. These differ from the native app's full connection controls.
- Result grid is read-only. It does not yet implement native row selection,
  cell editing, context menus, column resizing, filter UI or pagination.
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
