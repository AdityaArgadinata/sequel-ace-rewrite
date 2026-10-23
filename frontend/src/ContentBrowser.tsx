import {useEffect, useRef, useState} from 'react';
import {Browse, TableDetails, Mutate, ExportTableCSV} from '../wailsjs/go/main/App';
import {database} from '../wailsjs/go/models';
import ResultGrid from './ResultGrid';
import RowEditor from './RowEditor';
import ToolbarIcon from './ToolbarIcon';
import {workspaceShortcut} from './workspace-shortcuts';

type Props = {tab: string; databaseName: string; table: string; busy: boolean; operation: (work: () => Promise<void>) => Promise<void>};
export default function ContentBrowser({tab, databaseName, table, busy, operation}: Props) {
    const filterControl = useRef<HTMLSelectElement>(null);
    const focusFilter = useRef(false);
    const [showFilter, setShowFilter] = useState(true);
    const [filterEnabled, setFilterEnabled] = useState(false);
    const [details, setDetails] = useState<database.TableDetails | null>(null);
    const [selected, setSelected] = useState(-1);
    const [editor, setEditor] = useState<'insert' | 'update' | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [writeMessage, setWriteMessage] = useState('');
    const [result, setResult] = useState<database.Result | null>(null);
    const [columns, setColumns] = useState<database.Column[]>([]);
    const [applied, setApplied] = useState('');
    const [offset, setOffset] = useState(0);
    const [limit, setLimit] = useState(50);
    const [column, setColumn] = useState('');
    const [operator, setOperator] = useState('=');
    const [value, setValue] = useState('');
    const [sort, setSort] = useState('');
    const [descending, setDescending] = useState(false);
    const activeColumn = filterEnabled ? column || columns[0]?.name || '' : '';
    const signature = JSON.stringify([limit, activeColumn, operator, value, sort, descending]);
    const dirty = signature !== applied;
    async function load(next: number) {
        setResult(null); setSelected(-1); setEditor(null); setConfirmDelete(false);
        await operation(async () => {
            setDetails(await TableDetails(tab, databaseName, table));
            const output = await Browse(tab, new database.BrowseRequest({database: databaseName, table, offset: next, limit, column: activeColumn, operator, value, sort, descending}));
            setResult(output); setColumns(output.columns); setOffset(next); setApplied(signature);
        });
    }
    async function exportCSV() {
        await operation(async () => {
            setWriteMessage('');
            try {
                const output = await ExportTableCSV(tab, databaseName, table);
                setWriteMessage(output.cancelled ? 'Export cancelled.' : `Exported ${output.rows} rows from the entire table (filters and pagination are not applied).`);
            } catch (error) { setWriteMessage('Export failed; no completed export file was published.'); throw error; }
        });
    }
    async function write(action: 'insert' | 'update' | 'delete', values: Record<string, database.Cell> = {}) {
        if (action !== 'insert' && (!result || selected < 0)) return;
        await operation(async () => {
            setWriteMessage('');
            try {
                const request = new database.Mutation({database: databaseName, table, action,
                    columns: action === 'insert' ? [] : result!.columns.map(c => c.name),
                    original: action === 'insert' ? [] : result!.rows[selected]} );
                // Avoid generated map conversion treating columns named slice/map as arrays.
                request.values = values;
                const affected = await Mutate(tab, request);
                setWriteMessage(`${affected} row(s) affected. If a transaction is open, changes still need COMMIT.`);
                // Clear the old snapshot before reloading: a refresh failure must not invite replay.
                setResult(null); setSelected(-1); setEditor(null); setConfirmDelete(false);
            } catch (error) {
                setWriteMessage('Write failed. Reload and verify the server before trying again.');
                setResult(null); setSelected(-1); setEditor(null); setConfirmDelete(false);
                throw error;
            }
            try {
                const output = await Browse(tab, new database.BrowseRequest({database: databaseName, table, offset, limit, column: activeColumn, operator, value, sort, descending}));
                setResult(output); setColumns(output.columns); setApplied(signature);
            } catch (error) {
                setWriteMessage(previous => `${previous} Refresh failed; reload separately. Do not repeat the write.`);
                throw error;
            }
        });
    }
    useEffect(() => { void load(0); }, []);
    useEffect(() => {
        if (showFilter && focusFilter.current) { filterControl.current?.focus(); focusFilter.current = false; }
    }, [showFilter]);
    return <section className="query-workspace" aria-label="Table content" onKeyDown={event => {
        const action = workspaceShortcut(event.nativeEvent, /Mac/.test(navigator.platform));
        if (action !== 'refresh' && action !== 'filter') return;
        event.preventDefault();
        if (busy || editor || confirmDelete) return;
        if (action === 'refresh') { void load(dirty ? 0 : offset); return; }
        if (showFilter) filterControl.current?.focus();
        else { focusFilter.current = true; setShowFilter(true); }
    }}>

        <fieldset hidden={!showFilter} id={`content-filter-${tab}`} className="content-controls" disabled={!!editor || confirmDelete}><form className="content-filter" onSubmit={e => { e.preventDefault(); void load(0); }}>
            <input type="checkbox" aria-label="Enable content filter" disabled={busy} checked={filterEnabled} onChange={e => setFilterEnabled(e.target.checked)} />
            <select ref={filterControl} aria-label="Filter column" disabled={busy} value={column || columns[0]?.name || ''} onChange={e => { setColumn(e.target.value); setFilterEnabled(true); }}>{columns.map((c, i) => <option key={i}>{c.name}</option>)}</select>
            <select aria-label="Filter operator" disabled={busy} value={operator} onChange={e => { setOperator(e.target.value); setFilterEnabled(true); }}>{['=','!=','<','>','<=','>=','contains','is null','is not null'].map(op => <option key={op}>{op}</option>)}</select>
            <input aria-label="Filter value" disabled={busy || operator.startsWith('is ')} value={value} onChange={e => { setValue(e.target.value); setFilterEnabled(true); }} />
            <div className="filter-rule-actions"><button type="button" title="Disable filter" aria-label="Disable filter" disabled={busy || !filterEnabled} onClick={() => setFilterEnabled(false)}><ToolbarIcon name="remove"/></button><button type="button" disabled title="Additional filter rules are not available yet" aria-label="Add filter rule unavailable"><ToolbarIcon name="add"/></button></div>
            <button className="primary" disabled={busy}>Apply Filter(s)</button>
        </form></fieldset>
        {confirmDelete && <div className="delete-confirmation" role="alert"><p>Delete the selected row from {databaseName}.{table}? Verify the selected primary key below. Related rows may be affected by database triggers or foreign-key cascades.</p><dl>{details?.columns.map((c, i) => c.primary && result?.rows[selected] ? <div key={c.name}><dt>{c.name}</dt><dd>{result.rows[selected][i].value}</dd></div> : null)}</dl><button disabled={busy} onClick={() => void write('delete')}>Confirm delete</button> <button disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button></div>}
        {editor && details && <RowEditor key={`${editor}:${selected}`} details={details} row={editor === 'update' ? result!.rows[selected] : null} busy={busy} onSave={values => void write(editor, values)} onCancel={() => setEditor(null)} />}
        {writeMessage && <p className="form-note" role="status">{writeMessage}</p>}
        <ResultGrid result={result} busy={busy || !!editor || confirmDelete} selected={selected} onSelect={setSelected} showColumnTypes />
        <div className="content-bottom-bar">
            <div className="content-actions">
                <button disabled={busy || !details?.editable || !!editor || confirmDelete || dirty} onClick={() => { setEditor('insert'); setWriteMessage(''); }} title="Insert row" aria-label="Insert row"><ToolbarIcon name="add"/></button>
                <button disabled={busy || !details?.editable || selected < 0 || !!editor || confirmDelete || dirty} onClick={() => setConfirmDelete(true)} title="Delete selected row" aria-label="Delete row"><ToolbarIcon name="remove"/></button>
                <button disabled aria-label="Duplicate row unavailable" title="Duplicate row is not available yet"><ToolbarIcon name="duplicate"/></button>
                <button disabled={busy || !!editor || confirmDelete} aria-label="Reload content" title="Reload content (⌘/Ctrl+R)" onClick={() => void load(dirty ? 0 : offset)}><ToolbarIcon name="refresh"/></button>
                <button disabled={busy || !details?.editable || selected < 0 || !!editor || confirmDelete || dirty} onClick={() => { setEditor('update'); setWriteMessage(''); }} title="Edit selected row" aria-label="Edit row"><ToolbarIcon name="edit"/></button>
                <button className="filter-toggle" title="Filter Content (⌘/Ctrl+F)" aria-label="Toggle content filter" aria-expanded={showFilter} aria-controls={`content-filter-${tab}`} disabled={busy || !!editor || confirmDelete} onClick={() => setShowFilter(open => !open)}><ToolbarIcon name="filter"/></button>
            </div>
            <span className="content-row-count" role="status">{result?.rows.length ?? 0} rows on page{selected >= 0 ? '; 1 row selected' : ''}{dirty ? ' · Filter changed' : ''}</span>
            <fieldset className="content-controls pagination" disabled={!!editor || confirmDelete}>
                <button aria-label="Previous page" title="Previous page" disabled={busy || dirty || offset === 0} onClick={() => void load(Math.max(0, offset-limit))}><ToolbarIcon name="back"/></button>
                <details className="content-options"><summary aria-label="Content options" title="Content options"><ToolbarIcon name="more"/></summary><div className="content-options-panel">
                    <label>Sort column<select aria-label="Sort column" disabled={busy} value={sort} onChange={e => setSort(e.target.value)}><option value="">Server order</option>{columns.map((c, i) => <option key={i}>{c.name}</option>)}</select></label>
                    <label><input type="checkbox" disabled={busy} checked={descending} onChange={e => setDescending(e.target.checked)} /> Descending</label>
                    <label>Rows per page<select aria-label="Rows per page" disabled={busy} value={limit} onChange={e => { setLimit(Number(e.target.value)); setResult(null); setOffset(0); }}>{[25,50,100,200].map(n => <option key={n} value={n}>{n} rows</option>)}</select></label>
                    <button disabled={busy} onClick={() => void load(0)}>Apply sort / page size</button>
                    <button disabled={busy} onClick={() => void exportCSV()}>Export entire table CSV</button>
                    <p>Offset {offset} · {result?.durationMS ?? 0} ms. Choose a unique sort column for stable pages. Concurrent changes can shift rows between pages.</p>
                    <p>CSV uses Sequel CSV v1. Export includes the entire table, ignoring filters. Spreadsheet apps may interpret formulas.</p>
                    {!details?.editable && <p>{details?.reason}</p>}
                </div></details>
                <button aria-label="Next page" title="Next page" disabled={busy || dirty || !result || result.rows.length < limit || offset+limit>10000000} onClick={() => void load(offset+limit)}><ToolbarIcon name="forward"/></button>
            </fieldset>
        </div>
    </section>;
}
