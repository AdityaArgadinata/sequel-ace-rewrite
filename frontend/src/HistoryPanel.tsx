import {useEffect, useState} from 'react';
import {ClearHistory, ListHistory} from '../wailsjs/go/main/App';
import {history} from '../wailsjs/go/models';
export default function HistoryPanel({onClose}: {onClose: () => void}) {
    const [entries, setEntries] = useState<history.Entry[]>([]);
    const [error, setError] = useState('');
    const [confirm, setConfirm] = useState(false);
    async function reload() { try { setEntries(await ListHistory()); setError(''); } catch (e) { setError(String(e)); } }
    useEffect(() => { void reload(); }, []);
    return <section className="history-panel" aria-label="Query history"><div><strong>Query history</strong> <button onClick={() => void reload()}>Refresh</button> <button onClick={() => setConfirm(true)}>Clear history</button> <button onClick={onClose}>Close</button></div><p>Opt-in, last 100 executions. Only time, statement kind, row count, duration and success are saved. SQL text, values and errors are never saved.</p>{confirm && <p>Delete all saved history? <button onClick={() => { void ClearHistory().then(() => { setConfirm(false); return reload(); }).catch(e => setError(String(e))); }}>Delete history</button> <button onClick={() => setConfirm(false)}>Cancel</button></p>}{error && <p role="alert">{error}</p>}<ol>{entries.map((e, i) => <li key={i}>{e.time} · {e.kind} · {e.rows} rows · {e.durationMS} ms · {e.success ? 'Completed' : 'Failed / cancelled'}</li>)}</ol></section>;
}
