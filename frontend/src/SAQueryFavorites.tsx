import {useEffect,useState} from 'react';
import {ListQueryFavorites,SaveQueryFavorite,DeleteQueryFavorite} from '../wailsjs/go/main/App';
import {queryfavorites} from '../wailsjs/go/models';
export default function SAQueryFavorites({sql,busy,onLoad,onClose}:{sql:string;busy:boolean;onLoad:(sql:string) => void;onClose:() => void}) {
    const [entries,setEntries]=useState<queryfavorites.SAQueryFavorite[]>([]);
    const [id,setID]=useState(''),[name,setName]=useState(''),[error,setError]=useState('');
    const [saving,setSaving]=useState(false),[confirm,setConfirm]=useState(false);
    async function reload(){try{setEntries(await ListQueryFavorites());setError('');}catch(e){setError(String(e));}}
    useEffect(() => {void reload();},[]);
    return <section className="query-library" aria-label="Query Favorites">
        <div><strong>Query Favorites</strong> <button onClick={onClose}>Close favorites</button></div>
        <p>SQL is saved locally as plain text. Check for passwords or secrets before saving. Loading a favorite never executes it.</p>
        {error && <p role="alert">{error}</p>}
        <ol>{entries.map(entry => <li key={entry.id}><button disabled={busy || saving} onClick={() => {setID(entry.id);setName(entry.name);}}>{entry.name}</button> <button disabled={busy || saving} onClick={() => onLoad(entry.sql)}>Load {entry.name}</button></li>)}</ol>
        {id && <pre>{entries.find(entry => entry.id===id)?.sql}</pre>}
        <form onSubmit={e => {e.preventDefault();setSaving(true);void SaveQueryFavorite(new queryfavorites.SAQueryFavorite({id,name,sql})).then(entry => {setID(entry.id);return reload();}).catch(e => setError(String(e))).finally(() => setSaving(false));}}>
            <label>Favorite name<input aria-label="Favorite name" maxLength={120} value={name} disabled={busy || saving} onChange={e => setName(e.target.value)}/></label>
            <button disabled={busy || saving || !name.trim() || !sql.trim()}>{id ? 'Update favorite from editor' : 'Save editor as favorite'}</button>
            <button type="button" disabled={saving} onClick={() => {setID('');setName('');setConfirm(false);}}>New favorite</button>
            <button type="button" disabled={busy || saving || !id} onClick={() => setConfirm(true)}>Delete favorite</button>
        </form>
        {confirm && <p>Delete this saved query favorite? <button disabled={saving} onClick={() => {setSaving(true);void DeleteQueryFavorite(id).then(() => {setID('');setName('');setConfirm(false);return reload();}).catch(e => setError(String(e))).finally(() => setSaving(false));}}>Confirm delete favorite</button> <button onClick={() => setConfirm(false)}>Cancel</button></p>}
    </section>;
}
