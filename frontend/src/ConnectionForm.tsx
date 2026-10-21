import {FormEvent, useEffect, useState} from 'react';
import {DeleteProfile, ListProfiles, SaveProfile} from '../wailsjs/go/main/App';
import {database, profiles} from '../wailsjs/go/models';

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

    return <form onSubmit={connect} className="connection">
        <fieldset disabled={busy || saving}>
            <legend>Koneksi server</legend>
            <div className="profile-fields">
                <label>Profil tersimpan<select value={selected} disabled={loading || !!storageError} onChange={e => choose(e.target.value)}>
                    <option value="">Koneksi baru</option>
                    {saved.map(p => <option key={p.id} value={p.id}>{p.name} ({p.host}:{p.port})</option>)}
                </select></label>
                <label>Nama profil<input value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder="Contoh: Development" /></label>
            </div>
            {storageError && <div role="alert" className="notice">Profil tidak dapat dimuat: {storageError}. Koneksi tanpa profil tetap tersedia. <button type="button" disabled={loading} onClick={() => void retry()}>Coba lagi</button></div>}
            <div className="fields">
                <label>Host<input required value={host} onChange={e => setHost(e.target.value)} autoComplete="off" /></label>
                <label>Port<input required type="number" min="1" max="65535" value={port} onChange={e => setPort(e.target.value)} /></label>
                <label>User<input required value={user} onChange={e => setUser(e.target.value)} autoComplete="off" /></label>
                <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" /></label>
            </div>
            <label className="check"><input type="checkbox" checked={tls} onChange={e => { setTLS(e.target.checked); if (!e.target.checked) setCA(''); }} /> TLS dengan verifikasi sertifikat</label>
            {tls && <details><summary>CA khusus (opsional)</summary><label>Sertifikat CA PEM<textarea rows={4} value={caPEM} onChange={e => setCA(e.target.value)} spellCheck={false} /></label></details>}
            {!tls && <p className="notice">TLS nonaktif: koneksi tidak dienkripsi. Gunakan hanya pada lingkungan lokal yang dipercaya.</p>}
            <div className="toolbar">
                <button type="submit">Hubungkan</button>
                <button type="button" className="secondary" disabled={loading || !!storageError || !name.trim()} onClick={() => void save()}>{selected ? 'Simpan perubahan' : 'Simpan profil'}</button>
                {selected && <button type="button" className="secondary" disabled={loading || !!storageError} onClick={() => setConfirmDelete(true)}>Hapus profil</button>}
            </div>
            {confirmDelete && <div className="notice">Hapus profil tersimpan ini? <button type="button" onClick={() => void remove()}>Ya, hapus profil</button> <button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>Batal</button></div>}
            <p className="muted">Password tidak disimpan. Masukkan kembali setiap menghubungkan.</p>
            {notice && <p role="status">{notice}</p>}
        </fieldset>
    </form>;
}
