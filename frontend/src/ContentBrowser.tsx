import {useEffect, useState} from 'react';
import {Browse, TableDetails, Mutate} from '../wailsjs/go/main/App';
import {database} from '../wailsjs/go/models';
import ResultGrid from './ResultGrid';
import RowEditor from './RowEditor';

type Props = {tab: string; databaseName: string; table: string; busy: boolean; operation: (work: () => Promise<void>) => Promise<void>};
export default function ContentBrowser({tab, databaseName, table, busy, operation}: Props) {
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
    const signature = JSON.stringify([limit, column, operator, value, sort, descending]);
    const dirty = signature !== applied;
    async function load(next: number) {
        setResult(null); setSelected(-1); setEditor(null); setConfirmDelete(false);
        await operation(async () => {
            setDetails(await TableDetails(tab, databaseName, table));
            const output = await Browse(tab, new database.BrowseRequest({database: databaseName, table, offset: next, limit, column, operator, value, sort, descending}));
            setResult(output); setColumns(output.columns); setOffset(next); setApplied(signature);
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
                const output = await Browse(tab, new database.BrowseRequest({database: databaseName, table, offset, limit, column, operator, value, sort, descending}));
                setResult(output); setColumns(output.columns); setApplied(signature);
            } catch (error) {
                setWriteMessage(previous => `${previous} Refresh failed; reload separately. Do not repeat the write.`);
                throw error;
            }
        });
    }
    useEffect(() => { void load(0); }, []);
    return <section className="query-workspace" aria-label="Table content">
        <div className="query-heading"><strong>{table}</strong><span>{details?.editable ? 'Primary-key row editor' : 'Read-only content'}</span></div>
        <fieldset className="content-controls" disabled={!!editor || confirmDelete}><form className="content-filter" onSubmit={e => { e.preventDefault(); void load(0); }}>
            <select aria-label="Filter column" disabled={busy} value={column} onChange={e => setColumn(e.target.value)}><option value="">No filter</option>{columns.map((c, i) => <option key={i}>{c.name}</option>)}</select>
            <select aria-label="Filter operator" disabled={busy || !column} value={operator} onChange={e => setOperator(e.target.value)}>{['=','!=','<','>','<=','>=','contains','is null','is not null'].map(op => <option key={op}>{op}</option>)}</select>
            <input aria-label="Filter value" disabled={busy || !column || operator.startsWith('is ')} value={value} onChange={e => setValue(e.target.value)} />
            <select aria-label="Sort column" disabled={busy} value={sort} onChange={e => setSort(e.target.value)}><option value="">Server order</option>{columns.map((c, i) => <option key={i}>{c.name}</option>)}</select>
            <label><input type="checkbox" disabled={busy} checked={descending} onChange={e => setDescending(e.target.checked)} /> Desc</label>
            <button disabled={busy}>Apply</button>
        </form></fieldset>
        <div className="content-actions">
            <button disabled={busy || !details?.editable || !!editor || confirmDelete || dirty} onClick={() => { setEditor('insert'); setWriteMessage(''); }}>Insert row</button>
            <button disabled={busy || !details?.editable || selected < 0 || !!editor || confirmDelete || dirty} onClick={() => { setEditor('update'); setWriteMessage(''); }}>Edit row</button>
            <button disabled={busy || !details?.editable || selected < 0 || !!editor || confirmDelete || dirty} onClick={() => setConfirmDelete(true)}>Delete row</button>
            {!details?.editable && <span>{details?.reason}</span>}
        </div>
        {confirmDelete && <div className="delete-confirmation" role="alert"><p>Delete the selected row from {databaseName}.{table}? Verify the selected primary key below. Related rows may be affected by database triggers or foreign-key cascades.</p><dl>{details?.columns.map((c, i) => c.primary && result?.rows[selected] ? <div key={c.name}><dt>{c.name}</dt><dd>{result.rows[selected][i].value}</dd></div> : null)}</dl><button disabled={busy} onClick={() => void write('delete')}>Confirm delete</button> <button disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button></div>}
        {editor && details && <RowEditor key={`${editor}:${selected}`} details={details} row={editor === 'update' ? result!.rows[selected] : null} busy={busy} onSave={values => void write(editor, values)} onCancel={() => setEditor(null)} />}
        {writeMessage && <p className="form-note" role="status">{writeMessage}</p>}
        <ResultGrid result={result} busy={busy || !!editor || confirmDelete} selected={selected} onSelect={details?.editable ? setSelected : undefined} />
        <div className="results-footer"><fieldset className="content-controls" disabled={!!editor || confirmDelete}><button disabled={busy || dirty || offset === 0} onClick={() => void load(Math.max(0, offset-limit))}>Previous</button> <button disabled={busy || dirty || !result || result.rows.length < limit || offset+limit>10000000} onClick={() => void load(offset+limit)}>Next</button> <select aria-label="Rows per page" disabled={busy} value={limit} onChange={e => { setLimit(Number(e.target.value)); setResult(null); setOffset(0); }} >{[25,50,100,200].map(n => <option key={n} value={n}>{n} rows</option>)}</select> <button disabled={busy} onClick={() => void load(0)}>Reload</button></fieldset><span>Offset {offset} · {result?.rows.length ?? 0} rows · {result?.durationMS ?? 0} ms</span></div>
        <p className="form-note">Choose a unique sort column for stable pages. Concurrent changes can shift rows between pages.</p>
    </section>;
}
