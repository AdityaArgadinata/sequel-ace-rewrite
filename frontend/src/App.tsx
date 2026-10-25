import SACellEditor from './SACellEditor';
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Cancel, Connect, Connected, Databases, Disconnect, Tables, UseDatabase, CloseTab, Transaction, TransactionStatus, WorkspaceInfo, PrepareSQL, StreamPreparedQuery, CompletionSchema, OpenSQLFile, SaveSQLFile, SaveSPF} from '../wailsjs/go/main/App';
import {database, nativefiles} from '../wailsjs/go/models';
import {EventsOn} from '../wailsjs/runtime/runtime';
import './App.css';
import ConnectionForm from './ConnectionForm';
import ToolbarIcon from './ToolbarIcon';
import Splitter from './Splitter';
import ContentBrowser from './ContentBrowser';
import StructureView from './StructureView';
import SAAdminPanel from './SAAdminPanel';
import {shortcutHint,readPreferences} from './preferences';
import SAPreferences,{openPreferences} from './SAPreferences';
import SAHelp from './SAHelp';
import HistoryPanel from './HistoryPanel';
import SAQueryEditor from './SAQueryEditor';
import SAQueryFavorites from './SAQueryFavorites';
import ResultGrid from './ResultGrid';
import SAObjectManager from './SAObjectManager';
import SADatabaseTransfer from './SADatabaseTransfer';
import SAExportDialog,{type SAExportContext} from './SAExportDialog';
import SAImportDialog from './SAImportDialog';
import {contentPageKey,visitContentPage,type ContentPage} from './content-workspaces';
import {workspaceShortcut} from './workspace-shortcuts';
import {eventShortcut} from './shortcuts';

function Workspace({tab, active:workspaceActive, connectionName, onClose, onNewTab, initialState, registerSchemaGuard,registerBusy,registerDatabase}: {tab: string; active:boolean; connectionName: string; initialState?:nativefiles.SASession; onClose: () => Promise<void>; onNewTab: () => void; registerSchemaGuard:(tab:string,guard:(()=>Promise<boolean>)|null)=>void;registerBusy:(tab:string,busy:boolean)=>void;registerDatabase:(tab:string,database:string)=>void}) {
    const [sidebarWidth, setSidebarWidth] = useState(20.5);
 const [,setPreferences]=useState(readPreferences);
 useEffect(()=>{const reload=()=>setPreferences(readPreferences());window.addEventListener('sa-preferences',reload);return()=>window.removeEventListener('sa-preferences',reload);},[]);
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
 const [showDatabaseTransfer,setShowDatabaseTransfer]=useState(false);
 const [showLegacyTransfer,setShowLegacyTransfer]=useState(false);
 const contentExport=useRef<SAExportContext|null>(null);
    const [showObjects,setShowObjects]=useState(false);
    const [catalogEpoch,setCatalogEpoch]=useState(0);
    const [contentRevision,setContentRevision]=useState(0);
    const [contentPages,setContentPages]=useState<ContentPage[]>([]);
    const contentPagesRef=useRef<ContentPage[]>([]),draftPages=useRef(new Set<string>());
    function rememberContent(database:string,table:string){
        const next=visitContentPage(contentPagesRef.current,{database,table},draftPages.current);
        if(!next){setProblem(true);setMessage('Eight table workspaces contain drafts. Finish or cancel a draft before opening another table.');return false;}
        contentPagesRef.current=next;setContentPages(next);return true;
    }
    const [historyNotice,setHistoryNotice] = useState('');
    const [transaction, setTransaction] = useState('idle');
    const [connected, setConnected] = useState(true);
    const [serverVersion, setServerVersion] = useState('');
    const [problem, setProblem] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('Connect to a server to get started.');
    const [databases, setDatabases] = useState<string[]>([]);
    const [selectedDB, setSelectedDB] = useState('');
    useLayoutEffect(()=>registerDatabase(tab,selectedDB),[tab,selectedDB,registerDatabase]);
    const [tables, setTables] = useState<string[]>([]);
    const [sql, setSQL] = useState('SELECT VERSION(), DATABASE(), CONNECTION_ID();');
    const [tableFilter, setTableFilter] = useState('');
    const [selectedTable, setSelectedTable] = useState('');
    const [tableHistory, setTableHistory] = useState<{database:string; table:string; view:'content'|'structure'}[]>([]);
    const [tableHistoryIndex, setTableHistoryIndex] = useState(-1);
    const [view, setView] = useState<'query' | 'content' | 'structure' | 'relations' | 'triggers' | 'info' | 'users' | 'console'>('content');
    const [showHistory, setShowHistory] = useState(false);
    const [historyPrivacy,setHistoryPrivacy] = useState<'off'|'metadata'|'sql'>('off');
    const [result, setResult] = useState<database.Result | null>(null);
    const [queryCell,setQueryCell]=useState<{name:string;type:string;value:database.Cell}|null>(null);
    function inspectQueryCell(row:number,column:number){if(!busy && result?.rows[row]?.[column])setQueryCell({name:result.columns[column].name,type:result.columns[column].type,value:result.rows[row][column]});}

    const schemaGuard=useRef<(()=>Promise<boolean>)|null>(null);
    async function leaveStructure(){return schemaGuard.current ? await schemaGuard.current() : true;}
    async function schemaAction(action:()=>void){if(await leaveStructure())action();}
    async function changeView(next:typeof view){
        if(next===view || !await leaveStructure())return;
        if(next==='content' && selectedTable && !rememberContent(selectedDB,selectedTable))return;
        setView(next);
    }
    useEffect(()=>{if(connected && view==='content' && selectedTable && !contentPagesRef.current.some(p=>p.database===selectedDB && p.table===selectedTable))rememberContent(selectedDB,selectedTable);},[connected,view,selectedDB,selectedTable]);
    async function operation(work: () => Promise<void>, mayWrite = false) {
        setBusy(true);
        setProblem(false);
        setMessage('Working…');
        try {
            await work();
            setMessage(previous => previous === 'Working…' ? 'Done.' : previous);
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
                    setMessage(previous => `${previous} This tab’s session is inactive. Close the tab and reconnect.${mayWrite ? " Check the outcome of data changes before retrying. Changes are not retried automatically." : ""}`);
                }
            } catch {
                setConnected(false); setTransaction('disconnected'); setProblem(true);
                setMessage('Backend unavailable. Open the desktop app through Wails.');
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
                if(initialState.sql || initialState.view==='query')setView('query');
                if(initialState.sql){setSQL(initialState.sql);setEditorDirty(true);}
                if(initialState.database){await UseDatabase(tab,initialState.database);setSelectedDB(initialState.database);const tables=await Tables(tab,initialState.database);setTables(tables.rows.map(r=>r[0].value));if(initialState.table && tables.rows.some(r=>r[0].value===initialState.table)){setSelectedTable(initialState.table);setView(initialState.view==='structure' ? 'structure' : initialState.view==='content' ? 'content' : 'query');}}
            }
            setMessage('Connected. Each tab uses a separate database session.');
        });
        return EventsOn('history:error', (message: string) => setHistoryNotice(message));
    }, [tab]);

    async function chooseDatabase(name: string) {
        if(!await leaveStructure())return;
        setSelectedTable('');
        setTables([]);
        setResult(null);
        await operation(async () => {
            await UseDatabase(tab, name);
            setSelectedDB(name);
            const list = await Tables(tab, name);
            setTables(list.rows.map(row => row[0].value));
            setMessage(`Active database: ${name}`);
        });
    }

    async function visitTable(name: string, historyIndex?: number) {
        if (busy || !connected || (historyIndex===undefined && name===selectedTable) || !await leaveStructure()) return;
        const entry = historyIndex === undefined ? {database:selectedDB,table:name,view:view === 'structure' ? 'structure' as const : 'content' as const} : tableHistory[historyIndex];
        if (!entry) return;
        if(entry.view==='content' && !rememberContent(entry.database,entry.table))return;
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
            setMessage('Database and table lists refreshed.');setContentRevision(v=>v+1);
        });
    }

    async function reloadObjects(){
        const list=await Databases(tab);setDatabases(list.rows.map(r=>r[0].value));
        const info=await WorkspaceInfo(tab);const active=info.rows[0]?.[1];const db=active && !active.null ? active.value : '';
        setSelectedDB(db);const names=db ? (await Tables(tab,db)).rows.map(r=>r[0].value) : [];setTables(names);
        if(!names.includes(selectedTable)){setSelectedTable('');setView('query');}
        setTableHistory([]);setTableHistoryIndex(-1);setCompletionAttempt('');setCatalogEpoch(v=>v+1);setContentRevision(v=>v+1);
    }
    async function transactionAction(action: 'begin' | 'commit' | 'rollback') {
        await operation(async () => {
            await Transaction(tab, action);
            setMessage(action === 'begin' ? 'Transaction active. Use Commit or Rollback to finish.' : `${action.toUpperCase()} acknowledged by the server. Reload Content to view the latest data. Changes to nontransactional tables cannot be rolled back.`);
            setResult(null);
        }, true);
        if(action!=='begin')setContentRevision(v=>v+1);
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
    async function applySQL(text:string,name='') {
        if(view!=='query' && !await leaveStructure())return;
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
        let executed=false;
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
                        executed=true;
                        const output=await StreamPreparedQuery(tab,id,statement.sql,historyPrivacy,plan.sqlMode);
                        accepting=false;completed++;
                        complete.push({index:index+1,line:statement.line,result:output});if (complete.length>5) complete.shift();
                        setQueryResults([...complete]);setResult(output);
                        if (output.truncated) {
                            const notice=output.notice || (output.sessionClosed ? 'Partial result; the session was closed. Reconnect before continuing.' : 'Partial result; check the connection status before continuing.');
                            const remaining=index<plan.statements.length-1;
                            const message=`${remaining ? 'Stopped after' : 'Completed'} ${completed} of ${plan.statements.length} statements. ${notice}${remaining ? ' Remaining statements were not executed.' : ''} Earlier changes may require COMMIT in an open transaction.`;
                            setRunSummary(message);setMessage(message);return;
                        }
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
        if(executed)setContentRevision(v=>v+1);
    }

    useLayoutEffect(()=>{registerBusy(tab,busy);return()=>registerBusy(tab,false);},[tab,busy,registerBusy]);
    const workspaceRoot=useRef<HTMLElement>(null);
    useEffect(()=>{
        const handler=(event:KeyboardEvent)=>{
            if(event.defaultPrevented || !workspaceRoot.current || workspaceRoot.current.closest('[hidden]'))return;
            const action=workspaceShortcut(event,/Mac/.test(navigator.platform));
            if(!action||action==='refresh'||action==='filter')return;
            event.preventDefault();
            if(!busy&&connected&&(action==='query'||selectedTable))changeView(action);
        };
        window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
    },[busy,connected,selectedTable,view]);
    return (
        <main className="app-shell" ref={workspaceRoot}>
            <header className="main-toolbar">
                <strong className="connection-title" title={connectionName}>{connected ? `${serverVersion ? `(${serverVersion.includes('MariaDB') ? 'MariaDB' : 'MySQL'} ${serverVersion}) ` : ''}${connectionName}${selectedDB ? `/${selectedDB}` : ''}${selectedTable ? `/${selectedTable}` : ''}` : 'sequelx'}</strong>
                <label className="database-picker"><select aria-label="Select Database" value={selectedDB} disabled={!connected || busy} onChange={e => void chooseDatabase(e.target.value)}><option value="" disabled>Choose Database…</option>{databases.map(name => <option key={name} value={name}>{name}</option>)}</select><span>Select Database</span></label>
                <nav className="view-toolbar" aria-label="Database views">
                    {(['structure', 'content', 'relations', 'triggers', 'info', 'query'] as const).map((icon, i) => <button key={icon} disabled={!connected || busy || (icon !== 'query' && icon !== 'content' && !selectedTable)} aria-current={icon === view && connected ? 'page' : undefined} title={`${['Structure','Content','Relations','Triggers','Table Info','Query'][i]} (${shortcutHint(icon) || 'shortcut disabled'})`} onClick={() => changeView(icon)}><ToolbarIcon name={icon} /><span>{['Structure','Content','Relations','Triggers','Table Info','Query'][i]}</span></button>)}
                </nav>
                <div className="history-tools"><div><button disabled={busy || !connected || tableHistoryIndex <= 0} aria-label="Back" onClick={() => void visitTable('',tableHistoryIndex-1)}>‹</button><button disabled={busy || !connected || tableHistoryIndex >= tableHistory.length-1} aria-label="Forward" onClick={() => void visitTable('',tableHistoryIndex+1)}>›</button></div><span>Table History</span></div>
                <button className="toolbar-item" disabled={!connected || busy} onClick={()=>void changeView('users')}><ToolbarIcon name="users"/><span>Users</span></button>
                <button className="toolbar-item" disabled={!connected || busy} onClick={()=>void changeView('console')}><ToolbarIcon name="console"/><span>Console</span></button><button className="toolbar-item settings-button" aria-label="Settings" title={`Settings (${shortcutHint('preferences') || 'shortcut disabled'})`} onClick={openPreferences}><ToolbarIcon name="settings"/><span>Settings</span></button>
            </header>
            {showLegacyTransfer && <SADatabaseTransfer tab={tab} databaseName={selectedDB} busy={busy} operation={operation} onClose={()=>setShowLegacyTransfer(false)} onImport={()=>{setShowLegacyTransfer(false);setShowSQLImport(true);}}/>}
            {showSQLImport && <SAImportDialog tab={tab} databaseName={selectedDB} table={selectedTable} tables={tables} busy={busy} operation={operation} onRefresh={reloadObjects} onClose={()=>setShowSQLImport(false)}/>}
            {showDatabaseTransfer && <SAExportDialog tab={tab} databaseName={selectedDB} table={selectedTable} query={view==='query'} context={view==='query'?{result}:view==='content'?contentExport.current:null} busy={busy} operation={operation} onClose={()=>setShowDatabaseTransfer(false)} onBackup={()=>{setShowDatabaseTransfer(false);setShowLegacyTransfer(true);}}/>}
            {showObjects && <SAObjectManager tab={tab} databaseName={selectedDB} table={selectedTable} busy={busy} operation={operation} onRefresh={reloadObjects} onClose={()=>setShowObjects(false)}/>}
            {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} busy={busy} onLoadSQL={text => requestSQL(text)} />}
            {showFavorites && <SAQueryFavorites sql={sql} busy={busy} onLoad={text => requestSQL(text)} onClose={() => setShowFavorites(false)}/>}
            {pendingSQL && <div className="notice" role="alert">Replace unsaved editor contents? <button disabled={busy} onClick={() => applySQL(pendingSQL.sql,pendingSQL.name)}>Replace editor contents</button> <button onClick={() => setPendingSQL(null)}>Cancel</button></div>}
            <div className="workspace">
                <aside id={`tables-panel-${tab}`} className="tables-sidebar" aria-label="Tables" style={{flexBasis: `${sidebarWidth}%`}}>
                    <label className="table-search-field"><ToolbarIcon name="search"/><input className="table-search" type="search" aria-label="Filter tables" placeholder="Filter" value={tableFilter} onChange={e => setTableFilter(e.target.value)} /></label>
                    {!selectedDB&&<h2>TABLES</h2>}
                    <div className="table-list">{tables.filter(name => name.toLowerCase().includes(tableFilter.toLowerCase())).map(name => <button key={name} className={`table-name ${selectedTable === name ? 'selected' : ''}`} disabled={busy} onClick={() => void visitTable(name)}><ToolbarIcon name="table"/><span>{name}</span></button>)}</div>
                    <div className="sidebar-bottom">
                        <button disabled={busy} aria-label="Manage tables and databases" onClick={()=>void schemaAction(()=>setShowObjects(true))}><ToolbarIcon name="add"/></button>
                        <details className="sidebar-menu"><summary aria-label="Connection actions" title="Connection actions"><ToolbarIcon name="more"/><span className="menu-chevron">⌄</span></summary><div className="sidebar-menu-content" onClick={event=>{const target=event.target as HTMLElement;if(target.closest('button')&&!target.closest('.transaction-controls'))event.currentTarget.closest('details')?.removeAttribute('open');}}>
                            <button disabled={busy} title="New Connection Tab (⌘/Ctrl+T)" onClick={onNewTab}>New Connection Tab <span className="menu-shortcut" aria-hidden="true">⌘/Ctrl+T</span></button>
                            <hr/>
                            <button disabled={busy} onClick={()=>void openSQL()}>Open…</button>
                            <hr/>
                            <button disabled={busy} onClick={()=>void operation(async()=>{const saved=await SaveSPF(tab,new nativefiles.SASession({database:selectedDB,table:selectedTable,view,sql,profile:{}}));setMessage(saved ? 'Password-free SPF saved. SQL text can contain secrets; review before sharing.' : 'Session save cancelled.');})}>Save Session</button>
                            <button disabled={busy} onClick={()=>void saveSQL()}>Save Query</button>
                            <hr/>
 <button disabled={busy} onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');void schemaAction(()=>{setShowSQLImport(false);setShowObjects(true);});}}>Manage tables/databases</button>
 <button disabled={busy} onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');void schemaAction(()=>{setShowObjects(false);setShowDatabaseTransfer(false);setShowSQLImport(true);});}}>Import…</button>
 <button disabled={busy} onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');void schemaAction(()=>{setShowObjects(false);setShowSQLImport(false);setShowDatabaseTransfer(true);});}}>Export…</button>
                            <button disabled={busy} onClick={() => void onClose()}>Close</button>
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
                        <button disabled={!connected||busy||!selectedTable} aria-label="Open table information" onClick={()=>void changeView('info')}><ToolbarIcon name="eye"/></button>
                        <span className="sidebar-grip" aria-hidden="true">Ⅲ</span>
                    </div>
                </aside>
                <Splitter label="Tables sidebar width" controls={`tables-panel-${tab}`} axis="x" value={sidebarWidth} min={15} max={35} onChange={setSidebarWidth} />
                {contentPages.map(page=><ContentBrowser onExportContext={context=>{contentExport.current=context;}} key={contentPageKey(page)} tab={tab} databaseName={page.database} table={page.table} active={workspaceActive && view==='content' && connected && selectedDB===page.database && selectedTable===page.table} revision={contentRevision} busy={busy} operation={operation} onDraftChange={draft=>{const key=contentPageKey(page);if(draft)draftPages.current.add(key);else draftPages.current.delete(key);}}/>)}
                {(['triggers','info','users','console'] as string[]).includes(view) && connected ? <SAAdminPanel key={`${view}:${catalogEpoch}:${selectedDB}:${selectedTable}`} kind={view as 'triggers'|'info'|'users'|'console'} tab={tab} databaseName={selectedDB} table={selectedTable} busy={busy} operation={operation} onChanged={()=>{setCompletionAttempt('');setContentRevision(v=>v+1);}}/> : (view === 'structure' || view === 'relations') && connected && selectedTable ? <StructureView serverVersion={serverVersion} initialSection={view==='relations'?'foreignKeys':'columns'} key={`${view}:${catalogEpoch}:${selectedDB}:${selectedTable}`} tab={tab} databaseName={selectedDB} table={selectedTable} busy={busy} operation={operation} onLeaveGuard={guard=>{schemaGuard.current=guard;registerSchemaGuard(tab,guard);}} onSchemaChanged={()=>{setCompletionAttempt('');setContentRevision(v=>v+1);}} />  : view === 'content' && connected ? selectedTable ? null : <section className="content-empty-workspace" aria-label="Content">
                    <div className="empty-content-toolbar"><button disabled>Add Filter</button></div>
                    <div className="empty-content-header" aria-hidden="true"/>
                    <ResultGrid result={null} busy={false} emptyMessage=""/>
                    <div className="content-bottom-bar"><div className="content-actions">{(['add','remove','duplicate','refresh','edit','filter'] as const).map((icon,index)=><button key={icon} disabled aria-label={['Insert row','Delete rows','Duplicate row','Reload content','Edit row','Toggle content filter'][index]}><ToolbarIcon name={icon}/></button>)}</div><span className="content-row-count"/><div className="content-controls pagination">{(['back','more','forward'] as const).map((icon,index)=><button key={icon} disabled aria-label={['Previous page','Content options','Next page'][index]}><ToolbarIcon name={icon}/></button>)}</div></div>
                </section> : <section className="query-workspace" aria-label="Query">

                    <SAHelp tab={tab} busy={busy} operation={operation}/><div className="sql-file-tools">
                        <button disabled={busy} onClick={() => void openSQL()}>Open…</button><button disabled={busy} onClick={() => void saveSQL()}>Save Query</button>
                        <span>{fileName || 'Untitled SQL'}{editorDirty ? ' •' : ''}</span>
                        <button disabled={busy || !selectedDB} onClick={() => setCompletionAttempt('')}>Refresh completion</button>
                    </div>
                    <div id={`editor-panel-${tab}`} className="sql-editor" style={{flexBasis:`${editorHeight}%`}}><SAQueryEditor value={sql} disabled={busy} schema={completionSchema} databaseName={selectedDB} table={selectedTable} mariaDB={serverVersion.includes('MariaDB')} onChange={text => {setSQL(text);setEditorDirty(true);}} onSelection={setSelection} onRun={runScope => void run(runScope)}/></div>
                    <Splitter label="SQL editor height" controls={`editor-panel-${tab}`} axis="y" value={editorHeight} min={20} max={65} onChange={setEditorHeight} />
                    <div className="query-actions">
                        <div className="query-tools"><button disabled={busy} onClick={() => setShowFavorites(v => !v)}>Query Favorites</button><button onClick={() => setShowHistory(v => !v)}>{historyPrivacy==='sql' ? 'History (SQL)' : 'History (metadata)'}</button>
                            <label>History<select aria-label="Query history privacy" disabled={busy} value={historyPrivacy} onChange={e => setHistoryPrivacy(e.target.value as typeof historyPrivacy)}><option value="off">Off</option><option value="metadata">Metadata only</option><option value="sql">Include SQL text (local)</option></select></label>
                        </div>
                        <div className="query-execution"><select aria-label="Execution scope" disabled={busy} value={scope} onChange={e => setScope(e.target.value as typeof scope)}><option value="current">Current statement</option><option value="selection">Selection</option><option value="all">All statements</option></select>
                            {busy && <button aria-label="Cancel query" onClick={cancelQuery}>Cancel</button>}
                            <button className="primary" disabled={busy || !connected || !sql.trim() || (scope==='selection' && selection.from===selection.to)} onClick={() => void run()}>Run Query <span className="shortcut">{shortcutHint('run')}</span></button>
                        </div>
                    </div>
                    {historyPrivacy==='sql' && <p className="query-privacy-note">SQL text may contain secrets. Executed SQL is saved locally as plain text. Choose Off or Metadata only to stop saving SQL; remove existing text in History.</p>}
                    {completion.limited && <p className="query-privacy-note">Column completion is limited to the first 2,000 columns. All listed table names remain available.</p>}
                    {historyNotice && <p role="alert">{historyNotice}</p>}
                    {runSummary && <p className="script-summary" role="status">{runSummary}</p>}
                    {queryResults.length>0 && <nav className="sql-result-tabs" aria-label="Statement results">{queryResults.map(entry => <button key={entry.index} disabled={busy} aria-pressed={result===entry.result} onClick={() => setResult(entry.result)}>Statement {entry.index} · line {entry.line} · {entry.result.rows.length} rows</button>)}<span>Latest 5 results retained.</span></nav>}
                    <ResultGrid result={result} busy={busy} onEditCell={inspectQueryCell} actions={[{label:'Open cell viewer',disabled:busy,run:inspectQueryCell}]} />
                    {queryCell && <SACellEditor {...queryCell} nullable={queryCell.value.null} editable={false} busy={busy} onClose={()=>setQueryCell(null)}/>}
                    <div className="results-footer"><span>{result?.truncated ? 'Partial result · ' : ''}{result ? `${result.rows.length} rows loaded` : '0 rows'}{result ? (busy ? ' · running' : ` · ${result.durationMS} ms`) : ''}</span><span>Read-only result grid</span></div>
                </section>}
            </div>
            {(busy || problem || !connected) && <footer className="status-bar operation-status">
                <span className={`connection-dot ${connected ? 'online' : ''}`} /><span role="status" title={message}>{message}</span>{busy && <button aria-label="Cancel operation" onClick={cancelQuery}>Cancel</button>}
            </footer>}
        </main>
    );
}


export default function App() {
 const [,setPreferences]=useState(readPreferences);
 useEffect(()=>{const reload=()=>setPreferences(readPreferences());window.addEventListener('sa-preferences',reload);return()=>window.removeEventListener('sa-preferences',reload);},[]);
    const [connectionNames, setConnectionNames] = useState<Record<string,string>>({});
    const [tabDatabases,setTabDatabases]=useState<Record<string,string>>({});
    const registerDatabase=useCallback((tab:string,database:string)=>setTabDatabases(old=>old[tab]===database?old:{...old,[tab]:database}),[]);
    const nextDraft=useRef(0);
    const isDraft=(id:string)=>id.startsWith('new-');
    const schemaGuards=useRef<Record<string,()=>Promise<boolean>>>({});
 const workspaceBusy=useRef<Record<string,boolean>>({}),openingTab=useRef(false);
    async function selectTab(id:string){if(id===active)return;if(schemaGuards.current[active]&&!await schemaGuards.current[active]())return;setActive(id);}
    async function disconnectAll(){for(const [id,guard] of Object.entries(schemaGuards.current)){if(!await guard()){setActive(id);return;}}await Disconnect();setTabs([]);setActive('');}
    const [nativeStates,setNativeStates]=useState<Record<string,nativefiles.SASession>>({});
    const [tabs, setTabs] = useState<string[]>([]);
    const [active, setActive] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [sidebarWidth, setSidebarWidth] = useState(20.5);
    async function connect(connection: database.Connection, state?:nativefiles.SASession, target?:string) {
        setBusy(true); setMessage('');
        try { const id = await Connect(connection); setConnectionNames(old=>({...old,[id]:connection.host}));if(state)setNativeStates(old=>({...old,[id]:state})); setTabs(old=>target ? old.map(tab=>tab===target?id:tab) : [...old,id]); setActive(id); }
        catch (error) { setMessage(String(error)); }
        finally { setBusy(false); }
    }
    async function addTab() {
        if(openingTab.current||busy||workspaceBusy.current[active]||tabs.length>=16||document.querySelector('dialog[open]'))return;
        openingTab.current=true;
        try {
            if(schemaGuards.current[active]&&!await schemaGuards.current[active]())return;
            setMessage('');
            const id=`new-${++nextDraft.current}`;setTabs(old=>[...old,id]);setActive(id);
        } catch(error){setMessage(String(error));}
        finally {openingTab.current=false;setBusy(false);}
    }
    useEffect(()=>{
        const keydown=(event:KeyboardEvent)=>{
            if(event.defaultPrevented||eventShortcut(event,/Mac/.test(navigator.platform))!=='Mod+T')return;
            event.preventDefault();void addTab();
        };
        window.addEventListener('keydown',keydown,true);
        const stop=EventsOn('sequelx:new-connection-tab',()=>void addTab());
        return()=>{window.removeEventListener('keydown',keydown,true);stop();};
    },[active,busy,tabs]);
    async function closeTab(id: string) {
        if(schemaGuards.current[id]&&!await schemaGuards.current[id]()){setActive(id);return;}
        try {
            if(!isDraft(id))await CloseTab(id);
            const remaining = tabs.filter(item => item !== id);
            setTabs(remaining); if (active === id) setActive(remaining.at(-1) ?? '');
        } catch (error) { setMessage(String(error)); }
    }
    function renderHome(target?:string,homeActive=false){return <div className="app-shell"><header className="main-toolbar">
                <strong className="connection-title">sequelx</strong>
                <label className="database-picker"><select aria-label="Select Database" disabled><option>Choose Database…</option></select><span>Select Database</span></label>
                <nav className="view-toolbar" aria-label="Database views">{(['structure','content','relations','triggers','info','query'] as const).map((icon, i) => <button key={icon} disabled><ToolbarIcon name={icon}/><span>{['Structure','Content','Relations','Triggers','Table Info','Query'][i]}</span></button>)}</nav>
                <div className="history-tools"><div><button disabled aria-label="Back">‹</button><button disabled aria-label="Forward">›</button></div><span>Table History</span></div>
                <button className="toolbar-item" disabled><ToolbarIcon name="users"/><span>Users</span></button><button className="toolbar-item" disabled><ToolbarIcon name="console"/><span>Console</span></button><button className="toolbar-item settings-button" aria-label="Settings" title={`Settings (${shortcutHint('preferences') || 'shortcut disabled'})`} onClick={openPreferences}><ToolbarIcon name="settings"/><span>Settings</span></button>
            </header><ConnectionForm busy={busy} active={homeActive} onConnect={(connection,state)=>connect(connection,state,target)} sidebarWidth={sidebarWidth} onSidebarResize={setSidebarWidth} /></div>;}
    return <div className="desktop-root"><SAPreferences/>
        {tabs.length > 0 ? <>
            <div className="query-tabs"><div role="tablist" aria-label="Query sessions">{tabs.map(id => <div key={id} className="query-tab"><button id={`tab-${id}`} role="tab" title={isDraft(id)?undefined:[tabDatabases[id],connectionNames[id]].filter(Boolean).join(" — ")} aria-selected={active === id} aria-controls={`pane-${id}`} onClick={() => void selectTab(id)} onKeyDown={e => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                e.preventDefault(); const next = tabs[(tabs.indexOf(id) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; void selectTab(next); document.getElementById(`tab-${next}`)?.focus();
            }}>{isDraft(id)?'New Connection':tabDatabases[id]||`Query ${id}`}</button><button aria-label={isDraft(id)?`Close New Connection ${id.slice(4)}`:`Close ${tabDatabases[id]||`Query ${id}`}`} title="Close session; uncommitted transactions are not preserved" disabled={busy} onClick={() => void closeTab(id)}>×</button></div>)}</div><button disabled={busy || tabs.length >= 16} onClick={() => void addTab()} aria-label="New connection tab" title="New Connection Tab (⌘/Ctrl+T)">＋</button><button disabled={busy} onClick={() => { void disconnectAll().catch(e => setMessage(String(e))); }}>Disconnect all</button></div>
            {tabs.map(id => <div className="tab-pane" key={id} id={`pane-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`} hidden={id !== active}>{isDraft(id)?renderHome(id,id===active):<Workspace tab={id} registerDatabase={registerDatabase} active={id===active} initialState={nativeStates[id]} registerBusy={(tab,value)=>{workspaceBusy.current[tab]=value;}} registerSchemaGuard={(tab,guard)=>{if(guard)schemaGuards.current[tab]=guard;else delete schemaGuards.current[tab];}} connectionName={connectionNames[id]??'sequelx'} onClose={() => closeTab(id)} onNewTab={() => { if (tabs.length < 16 && !busy) void addTab(); }} />}</div>)}
        </> : renderHome(undefined,true)}
        {message && <div className="notice" role="alert">{message}</div>}
    </div>;
}
