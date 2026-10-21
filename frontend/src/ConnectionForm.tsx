import {FormEvent, useEffect, useState} from 'react';
import {DeleteProfile, ListProfiles, SaveProfile} from '../wailsjs/go/main/App';
import {database, profiles} from '../wailsjs/go/models';
import ToolbarIcon from './ToolbarIcon';

type Props = {busy: boolean; onConnect: (connection: database.Connection) => Promise<void>};

export default function ConnectionForm({busy, onConnect}: Props) {
    const [saved, setSaved] = useState<profiles.Profile[]>([]);
    const [selected, setSelected] = useState('');
    const [name, setName] = useState('');
    const [host, setHost] = useState('127.0.0.1');
    const [port, setPort] = useState('3306');
    const [user, setUser] = useState('root');
    const [password, setPassword] = useState('');
    const [tls, setTLS] = useState(true);
    const [caPEM, setCA] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [storageError, setStorageError] = useState('');
    const [notice, setNotice] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(() => {
        let active = true;
        ListProfiles().then(list => { if (active) setSaved(list); })
            .catch(error => { if (active) setStorageError(String(error)); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

    function choose(id: string) {
        const p = saved.find(profile => profile.id === id);
        setSelected(p?.id ?? ''); setName(p?.name ?? '');
        setHost(p?.host ?? '127.0.0.1'); setPort(String(p?.port ?? 3306));
        setUser(p?.user ?? 'root'); setTLS(p?.tls ?? true); setCA(p?.caPEM ?? '');
        setPassword(''); setConfirmDelete(false); setNotice('');
    }

    async function save() {
        setSaving(true); setNotice('');
        try {
            const p = await SaveProfile(new profiles.Profile({id: selected, name, host, port: Number(port), user, tls, caPEM}));
            setSelected(p.id); setName(p.name); setHost(p.host);
            setSaved(previous => [...previous.filter(item => item.id !== p.id), p].sort((a, b) => a.name.localeCompare(b.name)));
            setConfirmDelete(false);
            setNotice('Profil tersimpan. Password tidak ikut disimpan.');
        } catch (error) { setNotice(String(error)); }
        finally { setSaving(false); }
    }

    async function remove() {
        setSaving(true); setNotice('');
        try {
            await DeleteProfile(selected);
            setSaved(previous => previous.filter(p => p.id !== selected));
            choose(''); setNotice('Profil dihapus.');
        } catch (error) { setNotice(String(error)); }
        finally { setSaving(false); }
    }

    async function retry() {
        setLoading(true);
        try { setSaved(await ListProfiles()); setStorageError(''); }
        catch (error) { setStorageError(String(error)); }
        finally { setLoading(false); }
    }

    function connect(event: FormEvent) {
        event.preventDefault();
        const connection = new database.Connection({host, port: Number(port), user, password, tls, caPEM});
        setPassword('');
        void onConnect(connection);
    }

    return <div className="connection-layout">
        <aside className="favorites-sidebar" aria-label="Favorites">
            <button className={`favorite quick ${!selected ? 'selected' : ''}`} disabled={busy || saving} onClick={() => choose('')}><span className="quick-symbol">ϟ</span> QUICK CONNECT</button>
            <h2>FAVORITES</h2>
            <div className="favorites-list" role="list" aria-label="Saved connections">
                {saved.map(p => <div role="listitem" key={p.id}><button title={`${p.host}:${p.port}`} className={`favorite ${selected === p.id ? 'selected' : ''}`} disabled={busy || saving || loading} onClick={() => choose(p.id)}><ToolbarIcon name="database" /><span>{p.name}</span></button></div>)}
                {!loading && saved.length === 0 && <p className="sidebar-empty">No Favorites</p>}
            </div>
            <div className="sidebar-bottom">
                <button aria-label="New connection" title="New connection" disabled={busy || saving} onClick={() => choose('')}>＋</button>
                <button aria-label="Delete favorite" title="Delete favorite" disabled={busy || saving || !selected || !!storageError} onClick={() => setConfirmDelete(true)}>−</button>
            </div>
        </aside>
        <section className="connection-pane">
            <h1>Enter connection details below, or choose a favorite</h1>
            <form onSubmit={connect} className="connection-form">
                <fieldset disabled={busy || saving}>
                    <legend className="connection-tabs"><span aria-current="page">TCP/IP</span><button type="button" disabled title="Socket connections are not available yet">Socket</button><button type="button" disabled title="SSH connections are not available yet">SSH</button></legend>
                    <div className="form-row"><label htmlFor="profile-name">Name:</label><input id="profile-name" value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder="optional" /></div>
                    <div className="form-row color-row"><span /><div aria-label="Favorite colors (not available yet)" className="color-tags">{['none','red','orange','yellow','green','blue','purple','gray'].map(color => <button disabled type="button" key={color} className={color} aria-label={`${color} color unavailable`}>{color === 'none' ? '×' : ''}</button>)}</div></div>
                    <div className="form-row"><label htmlFor="host">Host:</label><input id="host" required value={host} onChange={e => setHost(e.target.value)} autoComplete="off" /></div>
                    <div className="form-row"><label htmlFor="username">Username:</label><input id="username" required value={user} onChange={e => setUser(e.target.value)} autoComplete="off" /></div>
                    <div className="form-row"><label htmlFor="password">Password:</label><input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" /></div>
                    <div className="form-row"><label htmlFor="initial-db">Database:</label><input id="initial-db" disabled placeholder="optional" title="Choose a database after connecting" /></div>
                    <div className="form-row"><label htmlFor="port">Port:</label><input id="port" required type="number" min="1" max="65535" value={port} onChange={e => setPort(e.target.value)} /></div>
                    <div className="form-row"><label htmlFor="time-zone">Time Zone:</label><select id="time-zone" disabled><option>Use Server Time Zone</option></select></div>
                    <div className="form-row"><span /><div className="connection-options">
                        <label><input type="checkbox" disabled /> Allow LOCAL_DATA_INFILE (insecure)</label>
                        <label><input type="checkbox" disabled /> Enable Cleartext plugin (insecure)</label>
                        <label><input type="checkbox" checked={tls} onChange={e => { setTLS(e.target.checked); if (!e.target.checked) setCA(''); }} /> Require SSL</label>
                        {tls && <details><summary>CA certificate (optional)</summary><label className="ca-label">CA PEM<textarea rows={4} value={caPEM} onChange={e => setCA(e.target.value)} spellCheck={false} /></label></details>}
                    </div></div>
                </fieldset>
                <div className="connection-actions"><button type="button" disabled={busy || saving || loading || !!storageError || !name.trim()} onClick={() => void save()}>{selected ? 'Save Changes' : 'Add to Favorites'}</button><button className="primary connect-button" type="submit" disabled={busy || saving}>{busy ? 'Connecting…' : 'Connect'}</button></div>
                <p className="form-note">Passwords are not saved. { !tls && 'SSL is off; use only on a trusted local connection.'}</p>
                {storageError && <div role="alert" className="notice">Profil tidak dapat dimuat: {storageError}. Koneksi tanpa profil tetap tersedia. <button type="button" disabled={loading} onClick={() => void retry()}>Coba lagi</button></div>}
                {confirmDelete && <div className="notice" role="group" aria-label="Delete favorite confirmation">Hapus profil tersimpan ini? <button type="button" disabled={saving} onClick={() => void remove()}>Ya, hapus profil</button> <button type="button" disabled={saving} onClick={() => setConfirmDelete(false)}>Batal</button></div>}
                {notice && <p role="status" className="form-notice">{notice}</p>}
            </form>
        </section>
    </div>;
}
