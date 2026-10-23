# Native UI → rewrite map

Reference: original source checkout `a82ae6c30`; installed app 5.0.9 is a
separate reference. Dimensions below are XIB logical points, not screen pixels.
XIB sizes can be adjusted at runtime by controller code and user preferences.

| Region | Native source | Rewrite mapping / remaining difference |
| --- | --- | --- |
| Connection sidebar | ConnectionView.xib frame 200 wide | 200 at default 1200 window; resizable percentage |
| Connection fields | ConnectionView.xib labels 98, inputs 247×22 | CSS metrics match; browser bezels differ |
| Font | UserDefaultsExtension.swift systemFontSize | system stack 13, small 11; saved native font preferences not imported |
| Toolbar icons | SPDatabaseDocument+ViewMode.swift symbol names | Own SVG drawings with corresponding concepts; not Apple artwork |
| Table sidebar | DBView.xib split 6032: 214 wide | initial 214 at default width, filter top; native Table Information panel missing |
| Content grid | DBView.xib table 36, rowHeight 16 | shared grid; rendered 22px rows retained from observed native binary; runtime/font differences need comparison |
| Content actions | DBView.xib 5175 add, 5177 delete, 5178 duplicate, 5176 refresh, 5201 edit mode; 25×25 | Bottom action strip; add/delete/reload/edit supported; duplicate visibly disabled; edit opens existing row form, not native spreadsheet mode |
| Content filters | DBView.xib filter controls / Apply Filter(s) | collapsed by default; toggle exposes existing filter/sort and Apply; one filter only |
| Content pagination | DBView.xib 6650/6653/6647, ContentPaginationView.xib | bottom/right previous/next + row limit; no native Go-to-page popover |
| Query editor | DBView.xib textView 8254, 695×142 inside split 7209 | editor begins directly under tabs; adjustable height; textarea lacks highlighting/completion |
| Query action strip | DBView.xib 7218 130×25, 7217 145×25, 8316 200×22 | favorites placeholder disabled; history metadata only; run executes one statement, not native Run Current/All menu |
| Structure columns | DBView.xib table 232 | labels Field/Type/Allow Null/Key/Default/Extra/Encoding/Collation/Comment; XIB initial widths, read-only Allow Null checkbox; raw type retained, no synthetic length/unsigned/zerofill/binary columns |
| Structure indexes | DBView.xib table 289 | stacked under Columns; native Non_unique/Key_name/Seq_in_index/Column_name order and initial widths; no schema write actions |
| Additional schema metadata | catalog queries in rewrite | Foreign keys and CREATE statement remain secondary sections |
| Transaction controls | rewrite extension | compact status-bar summary opens Begin/Commit/Rollback panel; state remains visible |
| Grid interaction | native NSTableView / controllers | row selection, keyboard, resize, copy menu; cell editing and full context-menu parity missing |
| Other view modes | native view-mode/controller files | Relations/Triggers/Table Info/Users remain disabled; not implemented by this UI pass |

## Verification

Frontend tests/typecheck/build, Go unit tests and packaged darwin/arm64 build
passed. A separate test bundle rendered the connection screen. A disposable
TLS server/schema was prepared for workspace QA, but CUA could enumerate the
form only after keyboard focus and failed field interaction with
`elementHasNoFrame` / `noWindowsAvailable`. No fixture connection, Content toggle,
transaction panel, or connected workspace screenshot was verified in this pass.
The test schema/server was removed/stopped. This is a concrete automation gap,
not a passed manual UI check. Windows/Linux, light rendering, minimum size and
same-scale overlays remain pending.

## Structure detail follow-up

Initial widths use table 232/289 XIB values where metadata exists. Widths below
48 px are raised to the shared grid's resize minimum. Server columns missing
from the query (e.g. Cardinality/Packed) are not fabricated. Unknown columns stay
at the end in their server order. Native widths are defaults only; resizing still
works. Values are reordered together with headers and remain unchanged for copy.
Allow Null shows YES/NO as disabled checked/unchecked boxes; NULL and unexpected
values remain textual instead of being silently shown as false. Each panel has
a 25 px action strip, with schema writes disabled and column reload functional.
A new Node test proves header/value association, NULL and extra metadata survive
reordering without mutating the input. Visual desktop verification remains open.

## Keyboard follow-up — 2026-10-23

`MainMenu.xib` View menu items 497/499/500 map Cmd+1/2/6 to Structure,
Content and Query. Content's native Cmd+R refresh and Cmd+F/Option+Cmd+F filter
focus are implemented; Structure supports Cmd+R too. Control replaces Command
on Windows/Linux. Native shortcuts for unsupported views remain unimplemented.
Handlers bubble within the focused workspace, not globally across mounted hidden
tabs. Refresh/filter are ignored while busy, editing a row or confirming delete.
Content refresh preserves offset unless pending filter changes require page one.
SQL is not replayed by refresh. Filter focus uses a ref after the hidden controls
are revealed. Toolbar tooltips expose the available view shortcuts.

Two Node tests cover platform modifiers, supported commands, IME, repeat,
additional modifiers and unsupported views. Grid tests now also cover stale
selection indices after a shorter result replaces the old one. Seven frontend
tests, typecheck/build, Go unit tests and Mac package build passed locally.
Native keyboard delivery, minimum size and Windows/Linux GUI remain unverified.

## Keyboard context menu and CSS cleanup

The focused grid accepts Shift+F10 or ContextMenu to open the copy menu for the
selected row's first cell. Up/Down/Home/End select menu actions; Escape closes
it and restores grid focus. Command/Control+C copies the selected row as raw
tab-separated text; editor/input selections keep their normal copy behavior.
Copy completion restores focus only if focus was still inside the grid.
Native keyboard/clipboard delivery has not been manually verified for this pass.

60 declarations overridden later in identical selector/at-rule contexts were
removed using PostCSS. A one-off assert checked the last declaration value for
each selector/media/property/importance stayed identical. Three unused selector
rules for old row numbers/empty favorites were removed after checking component
references. No stylesheet dependency or cleanup script was added to the product.
App.css decreased from 777 to 715 lines. This is a conservative cascade cleanup,
not a computed-style or pixel-overlay comparison. Eight frontend tests,
TypeScript build, Go unit tests and Mac package build passed.
