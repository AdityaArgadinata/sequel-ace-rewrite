import {useEffect, useState} from 'react';
import {ClearHistory,ClearHistorySQL,ListHistory} from '../wailsjs/go/main/App';
import {history} from '../wailsjs/go/models';
export default function HistoryPanel({onClose,onLoadSQL,busy=false}: {onClose:() => void;onLoadSQL?:(sql:string) => void;busy?:boolean}) {
    const [entries,setEntries]=useState<history.Entry[]>([]),[error,setError]=useState('');
    const [confirm,setConfirm]=useState<'all'|'sql'|null>(null);
    async function reload(){try{setEntries(await ListHistory());setError('');}catch(e){setError(String(e));}}
    useEffect(() => {void reload();},[]);
    return <section className="history-panel" aria-label="Query history">
        <div><strong>Query history</strong> <button onClick={() => void reload()}>Refresh</button> <button onClick={() => setConfirm('all')}>Clear history</button> <button onClick={() => setConfirm('sql')}>Remove saved SQL text</button> <button onClick={onClose}>Close</button></div>
        <p>Last 100 executions. SQL is saved only when Include SQL text is selected. SQL can contain secrets and is stored locally as plain text. Statements over 32 KiB keep metadata only. Loading SQL does not execute it; review it and press Run to replay.</p>
        {confirm && <p>{confirm==='all' ? 'Delete all saved history?' : 'Remove SQL text from saved history, keeping metadata?'} <button onClick={() => {void (confirm==='all' ? ClearHistory() : ClearHistorySQL()).then(() => {setConfirm(null);return reload();}).catch(e => setError(String(e)));}}>{confirm==='all' ? 'Delete history' : 'Confirm remove SQL'}</button> <button onClick={() => setConfirm(null)}>Cancel</button></p>}
        {error && <p role="alert">{error}</p>}
        <ol>{entries.map((entry,i) => <li key={i}>{entry.time} · {entry.kind} · {entry.rows} rows · {entry.durationMS} ms · {entry.success ? 'Completed' : 'Failed / cancelled'}{entry.sql && <><pre>{entry.sql}</pre><button disabled={busy} onClick={() => onLoadSQL?.(entry.sql!)}>Load SQL into editor</button></>}</li>)}</ol>
    </section>;
}
