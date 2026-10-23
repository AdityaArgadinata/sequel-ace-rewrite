import {useEffect, useMemo, useRef, useState} from 'react';
import {Cancel, Connect, Connected, Databases, Disconnect, Tables, UseDatabase, NewTab, CloseTab, Transaction, TransactionStatus, WorkspaceInfo, PrepareSQL, StreamPreparedQuery, CompletionSchema, OpenSQLFile, SaveSQLFile, SaveSPF} from '../wailsjs/go/main/App';
import {database, nativefiles} from '../wailsjs/go/models';
import {EventsOn} from '../wailsjs/runtime/runtime';
import './App.css';
import ConnectionForm from './ConnectionForm';
import ToolbarIcon from './ToolbarIcon';
import Splitter from './Splitter';
import ContentBrowser from './ContentBrowser';
import StructureView from './StructureView';
import SAAdminPanel from './SAAdminPanel';
import SAPreferences,{openPreferences} from './SAPreferences';
import SAHelp from './SAHelp';
import HistoryPanel from './HistoryPanel';
import SAQueryEditor from './SAQueryEditor';
import SAQueryFavorites from './SAQueryFavorites';
import ResultGrid from './ResultGrid';
import SAObjectManager from './SAObjectManager';
import SASQLImport from './SASQLImport';
import SADataExport from './SADataExport';
import {workspaceShortcut} from './workspace-shortcuts';

function Workspace({tab, connectionName, onClose, onNewTab, initialState}: {tab: string; connectionName: string; initialState?:nativefiles.SASession; onClose: () => Promise<void>; onNewTab: () => void}) {
    const [sidebarWidth, setSidebarWidth] = useState(20.5);
    const [editorHeight, setEditorHeight] = useState(32);
    const cancelRequested = useRef(false);
    const [selection,setSelection] = useState({from:0,to:0,head:0});
    const [scope,setScope] = useState<'current'|'selection'|'all'>('current');
    const [editorDirty,setEditorDirty] = useState(false);
    const [fileName,setFileName] = useState('');
    const [pendingSQL,setPendingSQL] = useState<{sql:string;name:string}|null>(null);
    const [showFavorites,setShowFavorites] = useState(false);
    const [queryResults,setQueryResults] = useState<{index:number;line:number;result:database.Result}[]>([]);
    const [runSummary,setRunSummary] = useState('');
    const [completion,setCompletion] = useState<{database:string;rows:database.Cell[][];limited:boolean}>({database:'',rows:[],limited:false});
    const [completionAttempt,setCompletionAttempt] = useState('');
    const [showSQLImport,setShowSQLImport]=useState(false);
    const [showObjects,setShowObjects]=useState(false);
    const [catalogEpoch,setCatalogEpoch]=useState(0);
    const [historyNotice,setHistoryNotice] = useState('');
    const [transaction, setTransaction] = useState('idle');
    const [connected, setConnected] = useState(true);
    const [serverVersion, setServerVersion] = useState('');
    const [problem, setProblem] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('Hubungkan server untuk memulai.');
    const [databases, setDatabases] = useState<string[]>([]);
    const [selectedDB, setSelectedDB] = useState('');
    const [tables, setTables] = useState<string[]>([]);
    const [sql, setSQL] = useState('SELECT VERSION(), DATABASE(), CONNECTION_ID();');
    const [tableFilter, setTableFilter] = useState('');
    const [selectedTable, setSelectedTable] = useState('');
    const [tableHistory, setTableHistory] = useState<{database:string; table:string; view:'content'|'structure'}[]>([]);
    const [tableHistoryIndex, setTableHistoryIndex] = useState(-1);
    const [view, setView] = useState<'query' | 'content' | 'structure' | 'relations' | 'triggers' | 'info' | 'users' | 'console'>('query');
    const [showHistory, setShowHistory] = useState(false);
    const [historyPrivacy,setHistoryPrivacy] = useState<'off'|'metadata'|'sql'>('off');
    const [result, setResult] = useState<database.Result | null>(null);

    async function operation(work: () => Promise<void>, mayWrite = false) {
        setBusy(true);
        setProblem(false);
        setMessage('Memproses…');
        try {
            await work();
            setMessage(previous => previous === 'Memproses…' ? 'Selesai.' : previous);
        } catch (error) {
            setProblem(true);
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
                setConnected(false); setTransaction('disconnected'); setProblem(true);
                setMessage('Backend tidak tersedia. Jalankan jendela desktop melalui Wails.');
            }
            setBusy(false);
        }
    }

    useEffect(() => {
        void operation(async () => {
            const version = await WorkspaceInfo(tab);
            setServerVersion(version.rows[0]?.[0]?.value ?? '');
            const list = await Databases(tab);
            setDatabases(list.rows.map(row => row[0].value));
            if(initialState){
                if(initialState.sql){setSQL(initialState.sql);setEditorDirty(true);}
                if(initialState.database){await UseDatabase(tab,initialState.database);setSelectedDB(initialState.database);const tables=await Tables(tab,initialState.database);setTables(tables.rows.map(r=>r[0].value));if(initialState.table && tables.rows.some(r=>r[0].value===initialState.table)){setSelectedTable(initialState.table);setView(initialState.view==='structure' ? 'structure' : initialState.view==='content' ? 'content' : 'query');}}
            }
            setMessage('Terhubung. Tiap tab memakai sesi database terpisah.');
        });
        return EventsOn('history:error', (message: string) => setHistoryNotice(message));
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

    async function visitTable(name: string, historyIndex?: number) {
        if (busy || !connected) return;
        const entry = historyIndex === undefined ? {database:selectedDB,table:name,view:view === 'structure' ? 'structure' as const : 'content' as const} : tableHistory[historyIndex];
        if (!entry) return;
        if (entry.database !== selectedDB) {
            setSelectedTable(''); setResult(null);
            let ready = false;
            await operation(async () => {
                await UseDatabase(tab,entry.database);
                const list = await Tables(tab,entry.database);
                setSelectedDB(entry.database); setTables(list.rows.map(row => row[0].value));
                ready = true;
            });
            if (!ready) return;
        }
        setSelectedTable(entry.table); setResult(null); setView(entry.view);
        if (!editorDirty && !fileName) setSQL(`SELECT * FROM \`${entry.database.replaceAll('`','``')}\`.\`${entry.table.replaceAll('`','``')}\` LIMIT 100;`);
        if (historyIndex !== undefined) setTableHistoryIndex(historyIndex);
        else if (tableHistory[tableHistoryIndex]?.database !== entry.database || tableHistory[tableHistoryIndex]?.table !== entry.table) {
            const history = [...tableHistory.slice(0,tableHistoryIndex+1),entry].slice(-100);
            setTableHistory(history); setTableHistoryIndex(history.length-1);
        }
    }

    async function refreshSchema() {
        await operation(async () => {
            const current = await WorkspaceInfo(tab);
            const active = current.rows[0]?.[1];
            const name = active && !active.null ? active.value : '';
            setSelectedDB(name);
            const list = await Databases(tab);
            setDatabases(list.rows.map(row => row[0].value));
            setTables(name ? (await Tables(tab, name)).rows.map(row => row[0].value) : []);
            setCompletionAttempt('');
            setMessage('Daftar database dan tabel diperbarui.');
        });
    }

    async function reloadObjects(){
        const list=await Databases(tab);setDatabases(list.rows.map(r=>r[0].value));
        const info=await WorkspaceInfo(tab);const active=info.rows[0]?.[1];const db=active && !active.null ? active.value : '';
        setSelectedDB(db);const names=db ? (await Tables(tab,db)).rows.map(r=>r[0].value) : [];setTables(names);
        if(!names.includes(selectedTable)){setSelectedTable('');setView('query');}
        setTableHistory([]);setTableHistoryIndex(-1);setCompletionAttempt('');setCatalogEpoch(v=>v+1);
    }
    async function transactionAction(action: 'begin' | 'commit' | 'rollback') {
        await operation(async () => {
            await Transaction(tab, action);
            setMessage(action === 'begin' ? 'Transaksi aktif. Gunakan Commit/Rollback untuk mengakhirinya.' : `${action.toUpperCase()} diterima server. Reload Content untuk melihat data terbaru. Perubahan pada tabel nontransaksional tidak dapat di-rollback.`);
            setResult(null);
        }, true);
    }
    const completionSchema=useMemo(() => {
        const schema:Record<string,string[]> = Object.create(null);
        for (const table of tables) schema[table]=[];
        if (completion.database===selectedDB) for (const row of completion.rows) {
            if (row[0] && row[1]) (schema[row[0].value] ??= []).push(row[1].value);
        }
        return schema;
    },[tables,completion,selectedDB]);
    useEffect(() => {
        if (!connected || busy || view!=='query' || !selectedDB || completionAttempt===selectedDB) return;
        setCompletionAttempt(selectedDB);
        void operation(async () => {
            const output=await CompletionSchema(tab,selectedDB);
            setCompletion({database:selectedDB,rows:output.rows,limited:output.truncated});
        });
    },[view,selectedDB,busy,connected,completionAttempt]);
    function applySQL(text:string,name='') {
        setSQL(text);setFileName(name);setEditorDirty(false);setSelection({from:0,to:0,head:0});setView('query');setPendingSQL(null);setShowHistory(false);setShowFavorites(false);
    }
    function requestSQL(text:string,name='') {
        if (editorDirty && text!==sql) {setPendingSQL({sql:text,name});return;}
        applySQL(text,name);
    }
    async function openSQL() {await operation(async () => {const file=await OpenSQLFile();if (!file.cancelled) requestSQL(file.sql,file.name);});}
    async function saveSQL() {await operation(async () => {const file=await SaveSQLFile(sql,fileName);if (!file.cancelled) {setFileName(file.name);setEditorDirty(false);}});}
    function cancelQuery() {cancelRequested.current=true;void Cancel(tab).catch(error => {setProblem(true);setMessage(String(error));});}
    async function run(runScope=scope) {
        if (busy || !connected) return;
        cancelRequested.current=false;setResult(null);setQueryResults([]);setRunSummary('');setHistoryNotice('');
        await operation(async () => {
            const plan=await PrepareSQL(tab,sql,runScope,selection.from,selection.to,selection.head);
            const complete:typeof queryResults=[];
            let completed=0;
            try {
                for (const [index,statement] of plan.statements.entries()) {
                    if (cancelRequested.current) throw new Error('Script cancelled before the next statement.');
                    const id=crypto.randomUUID();let accepting=true,offset=0;
                    setRunSummary(`Running statement ${index+1} of ${plan.statements.length} · line ${statement.line}`);
                    const stop=EventsOn('query:batch',(event:{id:string;batch:Pick<database.Result,'columns'|'rows'> & {offset:number}}) => {
                        if (!accepting || event.id!==id || event.batch.offset!==offset) return;
                        const batch=event.batch;offset+=batch.rows.length;
                        setResult(previous => new database.Result({columns:batch.columns,rows:[...(previous?.rows ?? []),...batch.rows],truncated:false,durationMS:0}));
                    });
                    setResult(null);
                    try {
                        const output=await StreamPreparedQuery(tab,id,statement.sql,historyPrivacy,plan.sqlMode);
                        accepting=false;completed++;
                        complete.push({index:index+1,line:statement.line,result:output});if (complete.length>5) complete.shift();
                        setQueryResults([...complete]);setResult(output);
                        if (output.truncated) throw new Error('Result limit or additional result set reached; the session was closed. Remaining statements were not executed.');
                    } finally {accepting=false;stop();}
                }
                const message=`Completed ${completed} of ${plan.statements.length} statements. Earlier changes may require COMMIT in an open transaction.`;
                setRunSummary(message);setMessage(message);
            } catch(error) {
                setResult(complete.at(-1)?.result ?? null);
                const message=`Stopped after ${completed} of ${plan.statements.length} statements. Earlier changes may already be saved. No automatic replay. ${String(error)}`;
                setRunSummary(message);throw new Error(message);
            }
        },true);
    }

    const workspaceRoot=useRef<HTMLElement>(null);
    useEffect(()=>{
        const handler=(event:KeyboardEvent)=>{
            if(event.defaultPrevented || !workspaceRoot.current || workspaceRoot.current.closest('[hidden]'))return;
            const action=workspaceShortcut(event,/Mac/.test(navigator.platform));
            if(!action||action==='refresh'||action==='filter')return;
            event.preventDefault();
            if(!busy&&connected&&(action==='query'||selectedTable))setView(action);
        };
        window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
    },[busy,connected,selectedTable]);
    return (
        <main className="app-shell" ref={workspaceRoot}>
            <header className="main-toolbar">
                <strong className="connection-title" title={connectionName}>{connected ? `${serverVersion ? `(${serverVersion.includes('MariaDB') ? 'MariaDB' : 'MySQL'} ${serverVersion}) ` : ''}${connectionName}${selectedDB ? `/${selectedDB}` : ''}${selectedTable ? `/${selectedTable}` : ''}` : 'sequelx'}</strong>
                <label className="database-picker"><select aria-label="Select Database" value={selectedDB} disabled={!connected || busy} onChange={e => void chooseDatabase(e.target.value)}><option value="" disabled>Choose Database…</option>{databases.map(name => <option key={name} value={name}>{name}</option>)}</select><span>Select Database</span></label>
                <nav className="view-toolbar" aria-label="Database views">
                    {(['structure', 'content', 'relations', 'triggers', 'info', 'query'] as const).map((icon, i) => <button key={icon} disabled={!connected || busy || (icon !== 'query' && !selectedTable)} aria-current={icon === view && connected ? 'page' : undefined} title={`${['Structure','Content','Relations','Triggers','Table Info','Query'][i]} (⌘/Ctrl+${i+1})`} onClick={() => setView(icon)}><ToolbarIcon name={icon} /><span>{['Structure','Content','Relations','Triggers','Table Info','Query'][i]}</span></button>)}
                </nav>
                <div className="history-tools"><div><button disabled={busy || !connected || tableHistoryIndex <= 0} aria-label="Back" onClick={() => void visitTable('',tableHistoryIndex-1)}>‹</button><button disabled={busy || !connected || tableHistoryIndex >= tableHistory.length-1} aria-label="Forward" onClick={() => void visitTable('',tableHistoryIndex+1)}>›</button></div><span>Table History</span></div>
                <button className="toolbar-item" disabled={!connected || busy} onClick={()=>setView('users')}><ToolbarIcon name="users"/><span>Users</span></button>
                <button className="toolbar-item" disabled={!connected || busy} onClick={()=>setView('console')}><ToolbarIcon name="console"/><span>Console</span></button><button className="toolbar-item settings-button" aria-label="Settings" title="Settings (⌘/Ctrl+,)" onClick={openPreferences}><ToolbarIcon name="settings"/><span>Settings</span></button>
            </header>
            {showSQLImport && <SASQLImport tab={tab} busy={busy} operation={operation} onRefresh={reloadObjects} onClose={()=>setShowSQLImport(false)}/>}
            {showObjects && <SAObjectManager tab={tab} databaseName={selectedDB} table={selectedTable} busy={busy} operation={operation} onRefresh={reloadObjects} onClose={()=>setShowObjects(false)}/>}
            {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} busy={busy} onLoadSQL={text => requestSQL(text)} />}
            {showFavorites && <SAQueryFavorites sql={sql} busy={busy} onLoad={text => requestSQL(text)} onClose={() => setShowFavorites(false)}/>}
            {pendingSQL && <div className="notice" role="alert">Replace unsaved editor contents? <button disabled={busy} onClick={() => applySQL(pendingSQL.sql,pendingSQL.name)}>Replace editor contents</button> <button onClick={() => setPendingSQL(null)}>Cancel</button></div>}
            <div className="workspace">
                <aside id={`tables-panel-${tab}`} className="tables-sidebar" aria-label="Tables" style={{flexBasis: `${sidebarWidth}%`}}>
                    <label className="table-search-field"><ToolbarIcon name="search"/><input className="table-search" type="search" aria-label="Filter tables" placeholder="Filter" value={tableFilter} onChange={e => setTableFilter(e.target.value)} /></label>
                    <div className="table-list">{tables.filter(name => name.toLowerCase().includes(tableFilter.toLowerCase())).map(name => <button key={name} className={`table-name ${selectedTable === name ? 'selected' : ''}`} disabled={busy} onClick={() => void visitTable(name)}><ToolbarIcon name="table"/><span>{name}</span></button>)}</div>
                    <div className="sidebar-bottom">
                        <button disabled={busy} aria-label="Manage tables and databases" onClick={()=>setShowObjects(true)}><ToolbarIcon name="add"/></button>
                        <details className="sidebar-menu"><summary aria-label="Connection actions" title="Connection actions"><ToolbarIcon name="more"/><span className="menu-chevron">⌄</span></summary><div className="sidebar-menu-content">
                            <button disabled={busy} onClick={onNewTab}>New query tab</button>
                            <button disabled={busy} onClick={()=>void operation(async()=>{const saved=await SaveSPF(tab,new nativefiles.SASession({database:selectedDB,table:selectedTable,view,sql,profile:{}}));setMessage(saved ? 'Password-free SPF saved. SQL text can contain secrets; review before sharing.' : 'Session save cancelled.');})}>Save SPF session</button>
 <button disabled={busy} onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');setShowSQLImport(false);setShowObjects(true);}}>Manage tables/databases</button>
 <button disabled={busy} onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');setShowObjects(false);setShowSQLImport(true);}}>Import SQL dump</button>
                            <button disabled={busy} onClick={() => void onClose()}>Disconnect</button>
                            <button onClick={() => setShowHistory(v => !v)}>{historyPrivacy==='sql' ? 'Query history (SQL)' : 'Query history (metadata)'}</button>
                            <details className="transaction-menu"><summary>Transaction: {transaction}</summary><div className="transaction-controls" aria-label="Transaction controls">
                                <span role="status">Transaction: {transaction === 'unverified' ? 'unverified after SQL/error — use Commit/Rollback' : transaction}</span>
                                <button disabled={busy || !connected || transaction !== 'idle'} onClick={() => void transactionAction('begin')}>Begin</button>
                                <button disabled={busy || !connected || transaction === 'idle'} onClick={() => void transactionAction('commit')}>Commit</button>
                                <button disabled={busy || !connected || transaction === 'idle'} onClick={() => void transactionAction('rollback')}>Rollback</button>
                                <span>Rollback applies to transactional tables. Closing a session discards uncommitted work.</span>
                            </div></details>
                        </div></details>
                        <button title="Refresh databases and tables" aria-label="Refresh databases and tables" disabled={busy} onClick={() => void refreshSchema()}><ToolbarIcon name="refresh"/></button>
                        <button disabled={!connected||busy||!selectedTable} aria-label="Open table information" onClick={()=>setView('info')}><ToolbarIcon name="eye"/></button>
                        <span className="sidebar-grip" aria-hidden="true">Ⅲ</span>
                    </div>
                </aside>
                <Splitter label="Tables sidebar width" controls={`tables-panel-${tab}`} axis="x" value={sidebarWidth} min={15} max={35} onChange={setSidebarWidth} />
                {(['triggers','info','users','console'] as string[]).includes(view) && connected ? <SAAdminPanel key={`${view}:${catalogEpoch}:${selectedDB}:${selectedTable}`} kind={view as 'triggers'|'info'|'users'|'console'} tab={tab} databaseName={selectedDB} table={selectedTable} busy={busy} operation={operation} onChanged={()=>setCompletionAttempt('')}/> : (view === 'structure' || view === 'relations') && connected && selectedTable ? <StructureView initialSection={view==='relations'?'foreignKeys':'columns'} key={`${view}:${catalogEpoch}:${selectedDB}:${selectedTable}`} tab={tab} databaseName={selectedDB} table={selectedTable} busy={busy} operation={operation} onSchemaChanged={()=>setCompletionAttempt('')} /> : view === 'content' && connected && selectedTable ? <ContentBrowser key={`${catalogEpoch}:${selectedDB}:${selectedTable}`} tab={tab} databaseName={selectedDB} table={selectedTable} busy={busy} operation={operation} /> : <section className="query-workspace" aria-label="Query">

                    <SAHelp tab={tab} busy={busy} operation={operation}/><div className="sql-file-tools">
                        <button disabled={busy} onClick={() => void openSQL()}>Open SQL</button><button disabled={busy} onClick={() => void saveSQL()}>Save SQL</button>
                        <span>{fileName || 'Untitled SQL'}{editorDirty ? ' •' : ''}</span>
                        <button disabled={busy || !selectedDB} onClick={() => setCompletionAttempt('')}>Refresh completion</button>
                    </div>
                    <div id={`editor-panel-${tab}`} className="sql-editor" style={{flexBasis:`${editorHeight}%`}}><SAQueryEditor value={sql} disabled={busy} schema={completionSchema} databaseName={selectedDB} table={selectedTable} mariaDB={serverVersion.includes('MariaDB')} onChange={text => {setSQL(text);setEditorDirty(true);}} onSelection={setSelection} onRun={runScope => void run(runScope)}/></div>
                    <Splitter label="SQL editor height" controls={`editor-panel-${tab}`} axis="y" value={editorHeight} min={20} max={65} onChange={setEditorHeight} />
                    <div className="query-actions">
                        <div className="query-tools"><button disabled={busy} onClick={() => setShowFavorites(v => !v)}>Query Favorites</button><button onClick={() => setShowHistory(v => !v)}>{historyPrivacy==='sql' ? 'History (SQL)' : 'History (metadata)'}</button>
                            <label>History<select aria-label="Query history privacy" disabled={busy} value={historyPrivacy} onChange={e => setHistoryPrivacy(e.target.value as typeof historyPrivacy)}><option value="off">Off</option><option value="metadata">Metadata only</option><option value="sql">Include SQL text (local)</option></select></label>
                        </div>
                        <div><select aria-label="Execution scope" disabled={busy} value={scope} onChange={e => setScope(e.target.value as typeof scope)}><option value="current">Current statement</option><option value="selection">Selection</option><option value="all">All statements</option></select>
                            {busy && <button aria-label="Cancel query" onClick={cancelQuery}>Cancel</button>}
                            <button className="primary" disabled={busy || !connected || !sql.trim() || (scope==='selection' && selection.from===selection.to)} onClick={() => void run()}>Run Query <span className="shortcut">⌘/Ctrl ↵</span></button>
                        </div>
                    </div>
                    {historyPrivacy==='sql' && <p className="query-privacy-note">SQL text may contain secrets. Executed SQL is saved locally as plain text. Choose Off or Metadata only to stop saving SQL; remove existing text in History.</p>}
                    {completion.limited && <p className="query-privacy-note">Column completion is limited to the first 2,000 columns. All listed table names remain available.</p>}
                    {historyNotice && <p role="alert">{historyNotice}</p>}
                    {runSummary && <p className="script-summary" role="status">{runSummary}</p>}
                    {queryResults.length>0 && <nav className="sql-result-tabs" aria-label="Statement results">{queryResults.map(entry => <button key={entry.index} disabled={busy} aria-pressed={result===entry.result} onClick={() => setResult(entry.result)}>Statement {entry.index} · line {entry.line} · {entry.result.rows.length} rows</button>)}<span>Latest 5 results retained.</span></nav>}
                    <SADataExport tab={tab} databaseName={selectedDB} table={selectedTable} result={result} busy={busy} operation={operation}/>
                    <ResultGrid result={result} busy={busy} />
                    <div className="results-footer"><span>{result ? `${result.rows.length} rows loaded` : '0 rows'}{result ? (busy ? ' · running' : ` · ${result.durationMS} ms`) : ''}</span><span>Read-only result grid</span></div>
                </section>}
            </div>
            {(busy || problem || !connected) && <footer className="status-bar operation-status">
                <span className={`connection-dot ${connected ? 'online' : ''}`} /><span role="status" title={message}>{message}</span>{busy && <button aria-label="Cancel operation" onClick={cancelQuery}>Cancel</button>}
            </footer>}
        </main>
    );
}


export default function App() {
    const [connectionName, setConnectionName] = useState('sequelx');
    const [nativeStates,setNativeStates]=useState<Record<string,nativefiles.SASession>>({});
    const [tabs, setTabs] = useState<string[]>([]);
    const [active, setActive] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [sidebarWidth, setSidebarWidth] = useState(100 / 6);
    async function connect(connection: database.Connection, state?:nativefiles.SASession) {
        setBusy(true); setMessage('');
        try { const id = await Connect(connection); setConnectionName(connection.host);if(state)setNativeStates({[id]:state}); setTabs([id]); setActive(id); }
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
    return <div className="desktop-root"><SAPreferences/>
        {tabs.length > 0 ? <>
            <div className={`query-tabs ${tabs.length === 1 ? 'single-session' : ''}`}><div role="tablist" aria-label="Query sessions">{tabs.map(id => <div key={id} className="query-tab"><button id={`tab-${id}`} role="tab" aria-selected={active === id} aria-controls={`pane-${id}`} onClick={() => setActive(id)} onKeyDown={e => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                e.preventDefault(); const next = tabs[(tabs.indexOf(id) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; setActive(next); document.getElementById(`tab-${next}`)?.focus();
            }}>Query {id}</button><button aria-label={`Close Query ${id}`} title="Close session; uncommitted transactions are not preserved" disabled={busy} onClick={() => void closeTab(id)}>×</button></div>)}</div><button disabled={busy || tabs.length >= 16} onClick={() => void addTab()} aria-label="New query tab">＋</button><button disabled={busy} onClick={() => { void Disconnect().then(() => { setTabs([]); setActive(''); }).catch(e => setMessage(String(e))); }}>Disconnect all</button></div>
            {tabs.map(id => <div className="tab-pane" key={id} id={`pane-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`} hidden={id !== active}><Workspace tab={id} initialState={nativeStates[id]} connectionName={connectionName} onClose={() => closeTab(id)} onNewTab={() => { if (tabs.length < 16 && !busy) void addTab(); }} /></div>)}
        </> : <div className="app-shell"><header className="main-toolbar">
                <strong className="connection-title">sequelx</strong>
                <label className="database-picker"><select aria-label="Select Database" disabled><option>Choose Database…</option></select><span>Select Database</span></label>
                <nav className="view-toolbar" aria-label="Database views">{(['structure','content','relations','triggers','info','query'] as const).map((icon, i) => <button key={icon} disabled><ToolbarIcon name={icon}/><span>{['Structure','Content','Relations','Triggers','Table Info','Query'][i]}</span></button>)}</nav>
                <div className="history-tools"><div><button disabled aria-label="Back">‹</button><button disabled aria-label="Forward">›</button></div><span>Table History</span></div>
                <button className="toolbar-item" disabled><ToolbarIcon name="users"/><span>Users</span></button><button className="toolbar-item" disabled><ToolbarIcon name="console"/><span>Console</span></button><button className="toolbar-item settings-button" aria-label="Settings" title="Settings (⌘/Ctrl+,)" onClick={openPreferences}><ToolbarIcon name="settings"/><span>Settings</span></button>
            </header><ConnectionForm busy={busy} onConnect={connect} sidebarWidth={sidebarWidth} onSidebarResize={setSidebarWidth} /></div>}
        {message && <div className="notice" role="alert">{message}</div>}
    </div>;
}
