sequelx, a Go/Wails desktop MySQL and MariaDB client.

## Changes in v0.1.0

- Add rows inline with the plus/Insert button or by double-clicking empty Content space. Save draft rows by double-clicking empty space; write failures preserve the draft with Edit row / Discard changes actions.
- Unified create/update/delete dialogs, clearer typography, consistent row height and row selection.
- Read large query results with bounded draining to preserve the session when possible.
- Expanded TEXT/JSON/BLOB cell editing and binary import/export, with conflict and NULL handling.
- Restore Content filters, sorting, page, selection, widths and drafts when switching table workspaces within the running app.
- Export/import database SQL including tables, dependent views, routines, triggers and disabled events, with review and size limits.
- Added SQL indentation/page-size preferences, shortcut remapping and persistent favorite folders.
- Expanded account privileges, lock/rename actions and version-gated role management.
- Added manual update checks in Settings. Downloads and installation remain manual.
- CI builds packages for three operating systems and includes isolated native startup probes for Windows/Linux.

## Downloads and installation

- **macOS Apple Silicon:** open the `macos-arm64.dmg` and drag the app to Applications. A ZIP containing the app, README, and license is also provided.
- **Windows x64:** run `windows-amd64-setup.exe`. The NSIS installer can install WebView2 when missing. A portable ZIP is also provided; extract it before running the EXE.
- **Ubuntu 24.04 x64:** install `libgtk-3-0t64` and `libwebkit2gtk-4.1-0`, extract `linux-amd64.tar.gz`, and run `./sequelx` in a graphical desktop session.
- **Checksums:** `SHA256SUMS.txt` covers all five distribution files. On macOS use `shasum -a 256 -c SHA256SUMS.txt`; on Linux use `sha256sum -c SHA256SUMS.txt` after downloading all assets. For one file, compare its hash with the matching line; PowerShell provides `Get-FileHash -Algorithm SHA256`.

## Included features

TCP/IP and SSH connections, favorites and optional OS password storage, SQL query sessions, Content browsing/filtering/editing, Structure with reviewed schema changes, metadata history, CSV export, and a dark workspace with native macOS sidebar translucency.

## Current limitations

These are development packages without a publisher signature or macOS notarization. macOS and Windows may show security prompts. Linux needs its system GTK/WebKitGTK libraries. Native GUI installation, wallpaper rendering, and editing flows still need manual validation on the target OS; successful automated builds do not establish complete GUI parity.

Read the bundled README before connecting, particularly the TLS defaults and query cancellation/session behavior. PostgreSQL and full Sequel Ace feature parity are not available. Generated Content cells remain governed by database rules; review the README for editing and transfer limits.
