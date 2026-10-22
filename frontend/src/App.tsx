import {useEffect, useRef, useState} from 'react';
import {Cancel, Connect, Connected, Databases, Disconnect, Query, StreamQuery, Tables, UseDatabase, NewTab, CloseTab, Transaction, TransactionStatus} from '../wailsjs/go/main/App';
import {database} from '../wailsjs/go/models';
import {EventsOn} from '../wailsjs/runtime/runtime';
import './App.css';
import ConnectionForm from './ConnectionForm';
import ToolbarIcon from './ToolbarIcon';
import Splitter from './Splitter';
import ContentBrowser from './ContentBrowser';
import StructureView from './StructureView';
import HistoryPanel from './HistoryPanel';
import ResultGrid from './ResultGrid';

function Workspace({tab, connectionName, onClose}: {tab: string; connectionName: string; onClose: () => Promise<void>}) {
    const [sidebarWidth, setSidebarWidth] = useState(214 / 12);
    const [editorHeight, setEditorHeight] = useState(32);
    const lineNumbers = useRef<HTMLDivElement>(null);
    const [transaction, setTransaction] = useState('idle');
    const [connected, setConnected] = useState(true);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('Hubungkan server untuk memulai.');
    const [databases, setDatabases] = useState<string[]>([]);
    const [selectedDB, setSelectedDB] = useState('');
    const [tables, setTables] = useState<string[]>([]);
    const [sql, setSQL] = useState('SELECT VERSION(), DATABASE(), CONNECTION_ID();');
    const [tableFilter, setTableFilter] = useState('');
    const [selectedTable, setSelectedTable] = useState('');
    const [view, setView] = useState<'query' | 'content' | 'structure'>('query');
    const [showHistory, setShowHistory] = useState(false);
    const [recordHistory, setRecordHistory] = useState(false);
    const [result, setResult] = useState<database.Result | null>(null);

    async function operation(work: () => Promise<void>, mayWrite = false) {
        setBusy(true);
        setMessage('Memproses…');
        try {
            await work();
            setMessage(previous => previous === 'Memproses…' ? 'Selesai.' : previous);
        } catch (error) {
            setMessage(String(error));
        } finally {
            try {
                const live = await Connected(tab);
                setConnected(live);
                setTransaction(await TransactionStatus(tab));
                if (!live) {
                    setDatabases([]); setTables([]); setSelectedDB(''); setSelectedTable('');
                    setMessage(previous => `${previous} Sesi tab ini tidak aktif; tutup tab lalu hubungkan ulang.${mayWrite ? " Periksa hasil query pengubah data sebelum mengulang; tidak ada retry otomatis." : ""}`);
                }
            } catch {
                setConnected(false); setTransaction('disconnected');
                setMessage('Backend tidak tersedia. Jalankan jendela desktop melalui Wails.');
            }
            setBusy(false);
        }
    }

    useEffect(() => {
        void operation(async () => {
            const list = await Databases(tab);
            setDatabases(list.rows.map(row => row[0].value));
            setMessage('Terhubung. Tiap tab memakai sesi database terpisah.');
        });
        return EventsOn('history:error', (message: string) => setMessage(message));
    }, [tab]);

    async function chooseDatabase(name: string) {
        setSelectedTable('');
        setTables([]);
        setResult(null);
        await operation(async () => {
            await UseDatabase(tab, name);
            setSelectedDB(name);
            const list = await Tables(tab, name);
            setTables(list.rows.map(row => row[0].value));
            setMessage(`Database aktif: ${name}`);
        });
    }

    async function refreshSchema() {
        await operation(async () => {
            const current = await Query(tab, 'SELECT DATABASE()');
            const active = current.rows[0]?.[0];
            const name = active && !active.null ? active.value : '';
            setSelectedDB(name);
            const list = await Databases(tab);
            setDatabases(list.rows.map(row => row[0].value));
            setTables(name ? (await Tables(tab, name)).rows.map(row => row[0].value) : []);
            setMessage('Daftar database dan tabel diperbarui.');
        });
    }

    async function transactionAction(action: 'begin' | 'commit' | 'rollback') {
        await operation(async () => {
            await Transaction(tab, action);
            setMessage(action === 'begin' ? 'Transaksi aktif. Gunakan Commit/Rollback untuk mengakhirinya.' : `${action.toUpperCase()} diterima server. Reload Content untuk melihat data terbaru. Perubahan pada tabel nontransaksional tidak dapat di-rollback.`);
            setResult(null);
        }, true);
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
                const output = await StreamQuery(tab, id, sql, recordHistory);
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

        }, true);
    }

    return (
        <main className="app-shell">
            <header className="main-toolbar">
                <strong className="connection-title" title={connectionName}>{connected ? connectionName : 'Sequel Rewrite'}</strong>
                <label className="database-picker"><select aria-label="Select Database" value={selectedDB} disabled={!connected || busy} onChange={e => void chooseDatabase(e.target.value)}><option value="" disabled>Choose Database…</option>{databases.map(name => <option key={name} value={name}>{name}</option>)}</select><span>Select Database</span></label>
                <nav className="view-toolbar" aria-label="Database views">
                    {(['structure', 'content', 'relations', 'triggers', 'info', 'query'] as const).map((icon, i) => <button key={icon} disabled={(icon !== 'query' && icon !== 'content' && icon !== 'structure') || !connected || busy || (icon !== 'query' && !selectedTable)} aria-current={icon === view && connected ? 'page' : undefined} title={icon === 'query' || icon === 'content' || icon === 'structure' ? icon : 'Not available yet'} onClick={() => { if (icon === 'query' || icon === 'content' || icon === 'structure') setView(icon); }}><ToolbarIcon name={icon} /><span>{['Structure','Content','Relations','Triggers','Table Info','Query'][i]}</span></button>)}
                </nav>
                <div className="history-tools"><div><button disabled aria-label="Back">‹</button><button disabled aria-label="Forward">›</button></div><span>Table History</span></div>
                <button className="toolbar-item" disabled title="User Manager is not available yet"><ToolbarIcon name="users"/><span>Users</span></button>
                <button className="toolbar-item" onClick={() => setShowHistory(v => !v)} title="Query history (metadata only)"><ToolbarIcon name="console"/><span>History</span></button>
            </header>
            {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} />}
            <div className="workspace">
                <aside id={`tables-panel-${tab}`} className="tables-sidebar" aria-label="Tables" style={{flexBasis: `${sidebarWidth}%`}}>
                    <input className="table-search" type="search" aria-label="Filter tables" placeholder="Filter" value={tableFilter} onChange={e => setTableFilter(e.target.value)} />
                    <h2>TABLES</h2>
                    <div className="table-list">{tables.filter(name => name.toLowerCase().includes(tableFilter.toLowerCase())).map(name => <button key={name} className={`table-name ${selectedTable === name ? 'selected' : ''}`} disabled={busy} onClick={() => { setSelectedTable(name); setSQL(`SELECT * FROM \`${selectedDB.replaceAll('`', '``')}\`.\`${name.replaceAll('`', '``')}\` LIMIT 100;`); setView(previous => previous === 'structure' ? 'structure' : 'content'); }}><ToolbarIcon name="content"/><span>{name}</span></button>)}</div>
                    <div className="sidebar-bottom"><button disabled aria-label="Add table unavailable">＋</button><button title="Refresh databases and tables" aria-label="Refresh databases and tables" disabled={busy} onClick={() => void refreshSchema()}>↻</button><button title="Disconnect" disabled={busy} onClick={() => void onClose()}>Disconnect</button></div>
                </aside>
                <Splitter label="Tables sidebar width" controls={`tables-panel-${tab}`} axis="x" value={sidebarWidth} min={15} max={35} onChange={setSidebarWidth} />
                {view === 'structure' && connected && selectedTable ? <StructureView key={`${selectedDB}:${selectedTable}`} tab={tab} databaseName={selectedDB} table={selectedTable} busy={busy} operation={operation} /> : view === 'content' && connected && selectedTable ? <ContentBrowser key={`${selectedDB}:${selectedTable}`} tab={tab} databaseName={selectedDB} table={selectedTable} busy={busy} operation={operation} /> : <section className="query-workspace" aria-label="Query">

                    <div id={`editor-panel-${tab}`} className="sql-editor" style={{flexBasis: `${editorHeight}%`}}><div ref={lineNumbers} className="line-numbers" aria-hidden="true">{sql.split('\n').map((_, i) => <div key={i}>{i+1}</div>)}</div><textarea id={`sql-${tab}`} wrap="off" onScroll={e => { if (lineNumbers.current) lineNumbers.current.scrollTop = e.currentTarget.scrollTop; }} aria-label="SQL query" value={sql} onChange={e => setSQL(e.target.value)} spellCheck={false} disabled={busy} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (!busy && connected && sql.trim()) void run(); } }} /></div>
                    <Splitter label="SQL editor height" controls={`editor-panel-${tab}`} axis="y" value={editorHeight} min={20} max={65} onChange={setEditorHeight} />
                    <div className="query-actions"><div className="query-tools"><button disabled title="SQL favorites are not available yet">Query Favorites</button><button onClick={() => setShowHistory(v => !v)} title="Execution metadata only; SQL text is not stored">History (metadata)</button><label title="Record execution metadata only; SQL text is never stored"><input type="checkbox" checked={recordHistory} onChange={e => setRecordHistory(e.target.checked)} /> Record</label></div><span>{result ? `${result.rows.length} rows` : 'No query executed'}{result?.truncated ? ' · Truncated' : ''}</span><div>{busy && <button aria-label="Cancel query" onClick={() => { void Cancel(tab).catch(error => setMessage(String(error))); }}>Cancel</button>}<button className="primary" disabled={busy || !connected || !sql.trim()} onClick={() => void run()}>Run Query <span className="shortcut">⌘/Ctrl ↵</span></button></div></div>
                    <ResultGrid result={result} busy={busy} />
                    <div className="results-footer"><span>{result ? `${result.rows.length} rows loaded` : '0 rows'}{result ? (busy ? ' · running' : ` · ${result.durationMS} ms`) : ''}</span><span>Read-only result grid</span></div>
                </section>}
            </div>
            <footer className="status-bar">
                <details className="transaction-menu"><summary>Transaction: {transaction}</summary><div className="transaction-controls" aria-label="Transaction controls">
                <span role="status">Transaction: {transaction === 'unverified' ? 'unverified after SQL/error — use Commit/Rollback' : transaction}</span>
                <button disabled={busy || !connected || transaction !== 'idle'} onClick={() => void transactionAction('begin')}>Begin</button>
                <button disabled={busy || !connected || transaction === 'idle'} onClick={() => void transactionAction('commit')}>Commit</button>
                <button disabled={busy || !connected || transaction === 'idle'} onClick={() => void transactionAction('rollback')}>Rollback</button>
                <span>Rollback applies to transactional tables. Closing a session discards uncommitted work.</span>
            </div></details><span className={`connection-dot ${connected ? 'online' : ''}`} /><span role="status" title={message}>{message}</span>{busy && <button aria-label="Cancel operation" onClick={() => { void Cancel(tab).catch(error => setMessage(String(error))); }}>Cancel</button>}</footer>
        </main>
    );
}


export default function App() {
    const [connectionName, setConnectionName] = useState('Sequel Rewrite');
    const [tabs, setTabs] = useState<string[]>([]);
    const [active, setActive] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [sidebarWidth, setSidebarWidth] = useState(100 / 6);
    async function connect(connection: database.Connection) {
        setBusy(true); setMessage('');
        try { const id = await Connect(connection); setConnectionName(`${connection.user}@${connection.host}`); setTabs([id]); setActive(id); }
        catch (error) { setMessage(String(error)); }
        finally { setBusy(false); }
    }
    async function addTab() {
        setBusy(true); setMessage('');
        try { const id = await NewTab(); setTabs(old => [...old, id]); setActive(id); }
        catch (error) { setMessage(String(error)); }
        finally { setBusy(false); }
    }
    async function closeTab(id: string) {
        try {
            await CloseTab(id);
            const remaining = tabs.filter(item => item !== id);
            setTabs(remaining); if (active === id) setActive(remaining.at(-1) ?? '');
        } catch (error) { setMessage(String(error)); }
    }
    return <div className="desktop-root">
        {tabs.length > 0 ? <>
            <div className="query-tabs"><div role="tablist" aria-label="Query sessions">{tabs.map(id => <div key={id} className="query-tab"><button id={`tab-${id}`} role="tab" aria-selected={active === id} aria-controls={`pane-${id}`} onClick={() => setActive(id)} onKeyDown={e => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                e.preventDefault(); const next = tabs[(tabs.indexOf(id) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; setActive(next); document.getElementById(`tab-${next}`)?.focus();
            }}>Query {id}</button><button aria-label={`Close Query ${id}`} title="Close session; uncommitted transactions are not preserved" disabled={busy} onClick={() => void closeTab(id)}>×</button></div>)}</div><button disabled={busy || tabs.length >= 16} onClick={() => void addTab()} aria-label="New query tab">＋</button><button disabled={busy} onClick={() => { void Disconnect().then(() => { setTabs([]); setActive(''); }).catch(e => setMessage(String(e))); }}>Disconnect all</button></div>
            {tabs.map(id => <div className="tab-pane" key={id} id={`pane-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`} hidden={id !== active}><Workspace tab={id} connectionName={connectionName} onClose={() => closeTab(id)} /></div>)}
        </> : <div className="app-shell"><header className="main-toolbar">
                <strong className="connection-title">Sequel Rewrite</strong>
                <label className="database-picker"><select aria-label="Select Database" disabled><option>Choose Database…</option></select><span>Select Database</span></label>
                <nav className="view-toolbar" aria-label="Database views">{(['structure','content','relations','triggers','info','query'] as const).map((icon, i) => <button key={icon} disabled><ToolbarIcon name={icon}/><span>{['Structure','Content','Relations','Triggers','Table Info','Query'][i]}</span></button>)}</nav>
                <div className="history-tools"><div><button disabled aria-label="Back">‹</button><button disabled aria-label="Forward">›</button></div><span>Table History</span></div>
                <button className="toolbar-item" disabled><ToolbarIcon name="users"/><span>Users</span></button><button className="toolbar-item" disabled><ToolbarIcon name="console"/><span>History</span></button>
            </header><ConnectionForm busy={busy} onConnect={connect} sidebarWidth={sidebarWidth} onSidebarResize={setSidebarWidth} /></div>}
        {message && <div className="notice" role="alert">{message}</div>}
    </div>;
}
