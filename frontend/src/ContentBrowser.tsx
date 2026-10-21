import {useEffect, useState} from 'react';
import {Browse} from '../wailsjs/go/main/App';
import {database} from '../wailsjs/go/models';
import ResultGrid from './ResultGrid';

type Props = {tab: string; databaseName: string; table: string; busy: boolean; operation: (work: () => Promise<void>) => Promise<void>};
export default function ContentBrowser({tab, databaseName, table, busy, operation}: Props) {
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
        setResult(null);
        await operation(async () => {
            const output = await Browse(tab, new database.BrowseRequest({database: databaseName, table, offset: next, limit, column, operator, value, sort, descending}));
            setResult(output); setColumns(output.columns); setOffset(next); setApplied(signature);
        });
    }
    useEffect(() => { void load(0); }, []);
    return <section className="query-workspace" aria-label="Table content">
        <div className="query-heading"><strong>{table}</strong><span>Read-only content</span></div>
        <form className="content-filter" onSubmit={e => { e.preventDefault(); void load(0); }}>
            <select aria-label="Filter column" disabled={busy} value={column} onChange={e => setColumn(e.target.value)}><option value="">No filter</option>{columns.map((c, i) => <option key={i}>{c.name}</option>)}</select>
            <select aria-label="Filter operator" disabled={busy || !column} value={operator} onChange={e => setOperator(e.target.value)}>{['=','!=','<','>','<=','>=','contains','is null','is not null'].map(op => <option key={op}>{op}</option>)}</select>
            <input aria-label="Filter value" disabled={busy || !column || operator.startsWith('is ')} value={value} onChange={e => setValue(e.target.value)} />
            <select aria-label="Sort column" disabled={busy} value={sort} onChange={e => setSort(e.target.value)}><option value="">Server order</option>{columns.map((c, i) => <option key={i}>{c.name}</option>)}</select>
            <label><input type="checkbox" disabled={busy} checked={descending} onChange={e => setDescending(e.target.checked)} /> Desc</label>
            <button disabled={busy}>Apply</button>
        </form>
        <ResultGrid result={result} busy={busy} />
        <div className="results-footer"><div><button disabled={busy || dirty || offset === 0} onClick={() => void load(Math.max(0, offset-limit))}>Previous</button> <button disabled={busy || dirty || !result || result.rows.length < limit || offset+limit>10000000} onClick={() => void load(offset+limit)}>Next</button> <select aria-label="Rows per page" disabled={busy} value={limit} onChange={e => { setLimit(Number(e.target.value)); setResult(null); setOffset(0); }} >{[25,50,100,200].map(n => <option key={n} value={n}>{n} rows</option>)}</select> <button disabled={busy} onClick={() => void load(0)}>Reload</button></div><span>Offset {offset} · {result?.rows.length ?? 0} rows · {result?.durationMS ?? 0} ms</span></div>
        <p className="form-note">Choose a unique sort column for stable pages. Concurrent changes can shift rows between pages.</p>
    </section>;
}
