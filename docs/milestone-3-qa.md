# Milestone 3 QA

Code: `ab5e712`. [CI](https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/runs/39745002743).

Local verification on 2026-10-22: frontend tests/typecheck/build, Go race tests,
vet and packaged darwin/arm64 build pass. Disposable MySQL 5.7.44 integration
covers composite key, NULL, binary/empty hex, quotes, generated columns, stale
snapshots, case-only conflicts, insert/update/delete, commit/rollback and physical
connection loss during an INSERT trigger. Transport/commit failures are also
exercised with a connector fake that verifies no write replay.

GUI verification of the new editor/transaction controls remains pending on all
three desktop targets; build/test success alone does not complete that checklist.
Use only a disposable database when performing these steps.

1. Open Content for an InnoDB table with a composite primary key, nullable text,
   binary, default/auto-increment and generated columns.
2. Insert using selected columns. Unchecked columns must use defaults; NULL and
   empty text/hex must remain distinct. Generated columns must stay disabled.
3. Select a row using its row-number button. Edit a non-key column, then a key
   column; confirm exactly the intended row changes, including composite keys.
4. Select a row for deletion. Confirm the dialog displays the primary key. Cancel
   once and confirm no change; confirm deletion once and check affected row count.
5. Change the selected row from another tab before saving/deleting it. The stale
   operation must fail and request reload, including a case-only text change.
6. Browse views, no-PK tables and non-InnoDB tables: mutation controls must remain
   unavailable. Arbitrary Query results must remain read-only.
7. Use Begin, insert/update/delete and inspect from another tab. Commit must make
   changes visible; Rollback must remove them. The transaction state must be
   visible and independent between tabs.
8. Run arbitrary SQL outside managed transactions: state becomes unverified.
   Resolve it with Commit/Rollback before Begin or Content writes. Managed
   transactions must reject DDL/CALL and manual transaction-control SQL.
9. Interrupt a write/commit or lose the connection. The application must report
   uncertainty, discard the broken session, clear the stale editable snapshot,
   and avoid automatic retries. Check server data separately before any retry.
10. Record OS/architecture/version, app commit, tester and results. Check minimum
    window size, keyboard operation, selection and editor scrolling on each OS.

Standalone Content writes use a short transaction and retain the table metadata
lock across metadata validation and write. Managed transactions retain their
changes/locks until Commit/Rollback. Trigger/cascade side effects still apply;
nontransactional/external side effects cannot be assumed reversible.
