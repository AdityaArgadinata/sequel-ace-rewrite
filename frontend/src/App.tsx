import {useRef, useState} from 'react';
import {Cancel, Connect, Connected, Databases, Disconnect, Query, StreamQuery, Tables, UseDatabase} from '../wailsjs/go/main/App';
import {database} from '../wailsjs/go/models';
import {EventsOn} from '../wailsjs/runtime/runtime';
import './App.css';
import ConnectionForm from './ConnectionForm';
import ToolbarIcon from './ToolbarIcon';
import Splitter from './Splitter';

export default function App() {
    const [sidebarWidth, setSidebarWidth] = useState(17);
    const [editorHeight, setEditorHeight] = useState(32);
    const lineNumbers = useRef<HTMLDivElement>(null);
    const [connected, setConnected] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('Hubungkan server untuk memulai.');
    const [databases, setDatabases] = useState<string[]>([]);
    const [selectedDB, setSelectedDB] = useState('');
    const [tables, setTables] = useState<string[]>([]);
    const [sql, setSQL] = useState('SELECT VERSION(), DATABASE(), CONNECTION_ID();');
    const [tableFilter, setTableFilter] = useState('');
    const [selectedTable, setSelectedTable] = useState('');
    const [connectionName, setConnectionName] = useState('Sequel Rewrite');
    const [result, setResult] = useState<database.Result | null>(null);

    async function operation(work: () => Promise<void>) {
        setBusy(true);
        setMessage('Memproses…');
        try {
            await work();
        } catch (error) {
            setMessage(String(error));
        } finally {
            try {
                const live = await Connected();
                setConnected(live);
                if (!live) {
                    setDatabases([]); setTables([]); setSelectedDB(''); setSelectedTable('');
                    setMessage(previous => `${previous} Sesi tidak aktif; hubungkan ulang. Query pengubah data yang terputus perlu diperiksa hasilnya sebelum diulang.`);
                }
            } catch {
                setConnected(false);
                setMessage('Backend tidak tersedia. Jalankan jendela desktop melalui Wails.');
            }
            setBusy(false);
        }
    }

    async function connect(connection: database.Connection) {
        setResult(null);
        await operation(async () => {
            await Connect(connection);
            setConnectionName(`${connection.user}@${connection.host}`);
            const list = await Databases();
            setDatabases(list.rows.map(row => row[0].value));
            setMessage('Terhubung. Pilih database atau jalankan satu statement SQL.');
        });
    }

    async function chooseDatabase(name: string) {
        setSelectedTable('');
        setTables([]);
        setResult(null);
        await operation(async () => {
            await UseDatabase(name);
            setSelectedDB(name);
            const list = await Tables(name);
            setTables(list.rows.map(row => row[0].value));
            setMessage(`Database aktif: ${name}`);
        });
    }

    async function refreshSchema() {
        await operation(async () => {
            const current = await Query('SELECT DATABASE()');
            const active = current.rows[0]?.[0];
            const name = active && !active.null ? active.value : '';
            setSelectedDB(name);
            const list = await Databases();
            setDatabases(list.rows.map(row => row[0].value));
            setTables(name ? (await Tables(name)).rows.map(row => row[0].value) : []);
            setMessage('Daftar database dan tabel diperbarui.');
        });
    }

    async function run() {
        setResult(null);
        await operation(async () => {
            const id = crypto.randomUUID();
            let accepting = true;
            let offset = 0;
            const stop = EventsOn('query:batch', (event: {id: string; batch: Pick<database.Result, 'columns' | 'rows'> & {offset: number}}) => {
                if (!accepting || event.id !== id || event.batch.offset !== offset) return;
                const batch = event.batch;
                offset += batch.rows.length;
                setResult(previous => new database.Result({
                    columns: batch.columns,
                    rows: [...(previous?.rows ?? []), ...batch.rows],
                    truncated: false, durationMS: 0,
                }));
                setMessage(`${offset} baris dimuat · query masih berjalan…`);
            });
            try {
                const output = await StreamQuery(id, sql);
                accepting = false;
                // The final snapshot wins even if a batch was delayed or missed.
                setResult(output);
                setMessage(`${output.rows.length} baris dimuat · ${output.durationMS} ms${output.truncated ? ' · Hasil terpotong: batas 500 baris / 4 MiB atau result set tambahan. Gunakan satu result set dan LIMIT lebih kecil.' : ''}${output.columns.length === 0 ? ' · Statement selesai tanpa result set; statement dapat mengubah data.' : ''}`);
            } catch (error) {
                // Partial rows from a failed/cancelled query are not a complete result.
                setResult(null);
                throw error;
            } finally {
                accepting = false;
                stop();
            }

        });
    }

    return (
        <main className="app-shell">
            <header className="main-toolbar">
                <strong className="connection-title" title={connectionName}>{connected ? connectionName : 'Sequel Rewrite'}</strong>
                <label className="database-picker"><select aria-label="Select Database" value={selectedDB} disabled={!connected || busy} onChange={e => void chooseDatabase(e.target.value)}><option value="" disabled>Choose Database…</option>{databases.map(name => <option key={name} value={name}>{name}</option>)}</select><span>Select Database</span></label>
                <nav className="view-toolbar" aria-label="Database views">
                    {(['structure', 'content', 'relations', 'triggers', 'info', 'query'] as const).map((icon, i) => <button key={icon} disabled={icon !== 'query' || !connected || busy} aria-current={icon === 'query' && connected ? 'page' : undefined} title={icon === 'query' ? 'Run Query' : 'Not available yet'}><ToolbarIcon name={icon} /><span>{['Structure','Content','Relations','Triggers','Table Info','Query'][i]}</span></button>)}
                </nav>
                <div className="history-tools"><div><button disabled aria-label="Back">‹</button><button disabled aria-label="Forward">›</button></div><span>Table History</span></div>
                <button className="toolbar-item" disabled title="User Manager is not available yet"><ToolbarIcon name="users"/><span>Users</span></button>
                <button className="toolbar-item" disabled title="Console is not available yet"><ToolbarIcon name="console"/><span>Console</span></button>
            </header>
            {!connected ? <ConnectionForm busy={busy} onConnect={connect} sidebarWidth={sidebarWidth} onSidebarResize={setSidebarWidth} /> : <div className="workspace">
                <aside id="tables-panel" className="tables-sidebar" aria-label="Tables" style={{flexBasis: `${sidebarWidth}%`}}>
                    <input className="table-search" type="search" aria-label="Filter tables" placeholder="Filter" value={tableFilter} onChange={e => setTableFilter(e.target.value)} />
                    <h2>TABLES</h2>
                    <div className="table-list">{tables.filter(name => name.toLowerCase().includes(tableFilter.toLowerCase())).map(name => <button key={name} className={`table-name ${selectedTable === name ? 'selected' : ''}`} disabled={busy} onClick={() => { setSelectedTable(name); setSQL(`SELECT * FROM \`${selectedDB.replaceAll('`', '``')}\`.\`${name.replaceAll('`', '``')}\` LIMIT 100;`); }}><ToolbarIcon name="content"/><span>{name}</span></button>)}</div>
                    <div className="sidebar-bottom"><button disabled aria-label="Add table unavailable">＋</button><button title="Refresh databases and tables" aria-label="Refresh databases and tables" disabled={busy} onClick={() => void refreshSchema()}>↻</button><button title="Disconnect" disabled={busy} onClick={() => void operation(async () => { await Disconnect(); setResult(null); setMessage('Koneksi ditutup.'); })}>Disconnect</button></div>
                </aside>
                <Splitter label="Tables sidebar width" controls="tables-panel" axis="x" value={sidebarWidth} min={15} max={35} onChange={setSidebarWidth} />
                <section className="query-workspace" aria-label="Query">
                    <div className="query-heading"><span>Query</span><span>One SQL statement</span></div>
                    <div id="editor-panel" className="sql-editor" style={{flexBasis: `${editorHeight}%`}}><div ref={lineNumbers} className="line-numbers" aria-hidden="true">{sql.split('\n').map((_, i) => <div key={i}>{i+1}</div>)}</div><textarea id="sql" wrap="off" onScroll={e => { if (lineNumbers.current) lineNumbers.current.scrollTop = e.currentTarget.scrollTop; }} aria-label="SQL query" value={sql} onChange={e => setSQL(e.target.value)} spellCheck={false} disabled={busy} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (!busy && sql.trim()) void run(); } }} /></div>
                    <Splitter label="SQL editor height" controls="editor-panel" axis="y" value={editorHeight} min={20} max={65} onChange={setEditorHeight} />
                    <div className="query-actions"><span>{result ? `${result.rows.length} rows` : 'No query executed'}{result?.truncated ? ' · Truncated' : ''}</span><div>{busy && <button aria-label="Cancel query" onClick={() => { void Cancel().catch(error => setMessage(String(error))); }}>Cancel</button>}<button className="primary" disabled={busy || !sql.trim()} onClick={() => void run()}>Run Query <span className="shortcut">⌘/Ctrl ↵</span></button></div></div>
                    <div className="results" aria-label="Query results">{result && result.columns.length ? <table><thead><tr><th className="row-index" aria-label="Row number" />{result.columns.map((column, i) => <th key={i} title={column.type}>{column.name}</th>)}</tr></thead><tbody>{result.rows.map((row, r) => <tr key={r}><td className="row-index">{r+1}</td>{row.map((value, c) => <td key={c} className={value.null ? 'null' : ''} title={value.null ? 'NULL' : value.value}>{value.null ? 'NULL' : value.value === '' ? <span className="empty-value">(empty)</span> : value.value}</td>)}</tr>)}</tbody></table> : <div className="result-empty">{busy ? 'Running query…' : result ? 'Statement completed without a result set.' : 'Run a query to display results.'}</div>}</div>
                    <div className="results-footer"><span>{result ? `${result.rows.length} rows loaded` : '0 rows'}{result ? (busy ? ' · running' : ` · ${result.durationMS} ms`) : ''}</span><span>Read-only result grid</span></div>
                </section>
            </div>}
            <footer className="status-bar"><span className={`connection-dot ${connected ? 'online' : ''}`} /><span role="status" title={message}>{message}</span>{busy && <button aria-label="Cancel operation" onClick={() => { void Cancel().catch(error => setMessage(String(error))); }}>Cancel</button>}</footer>
        </main>
    );
}
