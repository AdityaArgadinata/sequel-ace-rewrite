import {FormEvent, useEffect, useState} from 'react';
import {DeleteProfile, ListProfiles, SaveProfile, SaveCredentials, LoadCredentials, DeleteCredentials} from '../wailsjs/go/main/App';
import {credentials, database, profiles, tunnel} from '../wailsjs/go/models';
import ToolbarIcon from './ToolbarIcon';
import Splitter from './Splitter';

type Props = {busy: boolean; onConnect: (connection: database.Connection) => Promise<void>; sidebarWidth: number; onSidebarResize: (value: number) => void};

export default function ConnectionForm({busy, onConnect, sidebarWidth, onSidebarResize}: Props) {
    const [saved, setSaved] = useState<profiles.Profile[]>([]);
    const [selected, setSelected] = useState('');
    const [name, setName] = useState('');
    const [host, setHost] = useState('127.0.0.1');
    const [port, setPort] = useState('3306');
    const [user, setUser] = useState('root');
    const [password, setPassword] = useState('');
    const [sshEnabled, setSSHEnabled] = useState(false);
    const [sshHost, setSSHHost] = useState('');
    const [sshPort, setSSHPort] = useState('22');
    const [sshUser, setSSHUser] = useState('');
    const [sshKey, setSSHKey] = useState('');
    const [knownHosts, setKnownHosts] = useState('');
    const [sshPassword, setSSHPassword] = useState('');
    const [keyPassphrase, setKeyPassphrase] = useState('');
    const [remember, setRemember] = useState(false);
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
        setPassword(''); setSSHPassword(''); setKeyPassphrase(''); setRemember(false);
        setSSHEnabled(!!p?.ssh); setSSHHost(p?.ssh?.host ?? ''); setSSHPort(String(p?.ssh?.port ?? 22));
        setSSHUser(p?.ssh?.user ?? ''); setSSHKey(p?.ssh?.keyFile ?? ''); setKnownHosts(p?.ssh?.knownHosts ?? '');
        setConfirmDelete(false); setNotice('');
    }

    function sshSettings() { return new tunnel.Settings({host: sshHost, port: Number(sshPort), user: sshUser, keyFile: sshKey, knownHosts}); }
    function profile() { return new profiles.Profile({id: selected, name, host, port: Number(port), user, tls, caPEM, ssh: sshEnabled ? sshSettings() : undefined}); }
    function secrets() { return new credentials.Secrets({password, sshPassword, keyPassphrase}); }
    async function loadPasswords() {
        setSaving(true); setNotice('');
        try { const stored = await LoadCredentials(selected); setPassword(stored.password); setSSHPassword(stored.sshPassword); setKeyPassphrase(stored.keyPassphrase); }
        catch (error) { setNotice(String(error)); }
        finally { setSaving(false); }
    }
    async function forgetPasswords() {
        setSaving(true);
        try { await DeleteCredentials(selected); setNotice('Saved passwords removed.'); setRemember(false); }
        catch (error) { setNotice(String(error)); }
        finally { setSaving(false); }
    }
    async function save() {
        setSaving(true); setNotice('');
        try {
            const p = await SaveProfile(profile());
            setSelected(p.id); setName(p.name); setHost(p.host);
            setSaved(previous => [...previous.filter(item => item.id !== p.id), p].sort((a, b) => a.name.localeCompare(b.name)));
            setConfirmDelete(false);
            if (remember) { await SaveCredentials(p.id, secrets()); setNotice('Profil dan password tersimpan di credential store OS.'); } else { setNotice('Profil tersimpan. Password tidak ikut disimpan.'); }
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

    async function connect(event: FormEvent) {
        event.preventDefault();
        const connection = new database.Connection({host, port: Number(port), user, password, tls, caPEM, ssh: sshEnabled ? new tunnel.Options({settings: sshSettings(), password: sshPassword, keyPassphrase}) : undefined});
        if (remember) {
            setSaving(true);
            try {
                const p = await SaveProfile(profile()); setSelected(p.id);
                setSaved(old => [...old.filter(item => item.id !== p.id), p]);
                await SaveCredentials(p.id, secrets());
            } catch (error) { setNotice(`${String(error)} Uncheck Save passwords to connect without saving.`); setSaving(false); return; }
            setSaving(false);
        }
        setPassword(''); setSSHPassword(''); setKeyPassphrase('');
        await onConnect(connection);
    }

    return <div className="connection-layout">
        <aside id="favorites-panel" className="favorites-sidebar" aria-label="Favorites" style={{flexBasis: `${sidebarWidth}%`}}>
            <button className={`favorite quick ${!selected ? 'selected' : ''}`} disabled={busy || saving} onClick={() => choose('')}><span className="quick-symbol">ϟ</span> QUICK CONNECT</button>
            <h2>FAVORITES</h2>
            <div className="favorites-list" role="list" aria-label="Saved connections">
                {saved.map(p => <div role="listitem" key={p.id}><button title={`${p.host}:${p.port}`} className={`favorite ${selected === p.id ? 'selected' : ''}`} disabled={busy || saving || loading} onClick={() => choose(p.id)}><ToolbarIcon name="database" /><span>{p.name}</span></button></div>)}

            </div>
            <div className="sidebar-bottom">
                <button aria-label="New connection" title="New connection" disabled={busy || saving} onClick={() => choose('')}>＋</button>
                <button aria-label="Delete favorite" title="Delete favorite" disabled={busy || saving || !selected || !!storageError} onClick={() => setConfirmDelete(true)}>−</button>
            </div>
        </aside>
        <Splitter label="Favorites sidebar width" controls="favorites-panel" axis="x" value={sidebarWidth} min={15} max={35} onChange={onSidebarResize} />
        <section className="connection-pane">
            <h1>Enter connection details below, or choose a favorite</h1>
            <form onSubmit={e => void connect(e)} className="connection-form">
                <fieldset disabled={busy || saving}>
                    <legend className="connection-tabs"><button type="button" aria-pressed={!sshEnabled} onClick={() => setSSHEnabled(false)}>TCP/IP</button><button type="button" disabled title="Socket connections are not available yet">Socket</button><button type="button" aria-pressed={sshEnabled} onClick={() => setSSHEnabled(true)}>SSH</button></legend>
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
                    {sshEnabled && <div className="ssh-settings">
                        <h3>SSH tunnel</h3>
                        <div className="form-row"><label htmlFor="ssh-host">SSH Host:</label><input id="ssh-host" required value={sshHost} onChange={e => setSSHHost(e.target.value)} /></div>
                        <div className="form-row"><label htmlFor="ssh-port">SSH Port:</label><input id="ssh-port" required type="number" min="1" max="65535" value={sshPort} onChange={e => setSSHPort(e.target.value)} /></div>
                        <div className="form-row"><label htmlFor="ssh-user">SSH User:</label><input id="ssh-user" required value={sshUser} onChange={e => setSSHUser(e.target.value)} /></div>
                        <div className="form-row"><label htmlFor="ssh-password">SSH Password:</label><input id="ssh-password" type="password" value={sshPassword} onChange={e => setSSHPassword(e.target.value)} autoComplete="off" /></div>
                        <div className="form-row"><label htmlFor="ssh-key">Private Key:</label><input id="ssh-key" placeholder="Absolute path (optional)" value={sshKey} onChange={e => setSSHKey(e.target.value)} /></div>
                        <div className="form-row"><label htmlFor="ssh-phrase">Passphrase:</label><input id="ssh-phrase" type="password" value={keyPassphrase} onChange={e => setKeyPassphrase(e.target.value)} autoComplete="off" /></div>
                        <div className="form-row"><label htmlFor="known-hosts">Known Hosts:</label><input id="known-hosts" placeholder="Default: ~/.ssh/known_hosts" value={knownHosts} onChange={e => setKnownHosts(e.target.value)} /></div>
                        <p className="form-note">Host keys must already be trusted in known_hosts. Database Host is reached from the SSH server.</p>
                    </div>}

                </fieldset>
                <div className="connection-actions"><button type="button" disabled={busy || saving || loading || !!storageError || !name.trim()} onClick={() => void save()}>{selected ? 'Save Changes' : 'Add to Favorites'}</button><button className="primary connect-button" type="submit" disabled={busy || saving}>{busy ? 'Connecting…' : 'Connect'}</button></div>
                <details className="credential-store"><summary>Password storage</summary>
                    <label className="remember-passwords"><input type="checkbox" checked={remember} disabled={!name.trim() || busy || saving} onChange={e => setRemember(e.target.checked)} /> Save passwords in OS credential store (requires named profile)</label>
                <div className="credential-actions"><button type="button" disabled={!selected || busy || saving} onClick={() => void loadPasswords()}>Use saved passwords</button><button type="button" disabled={!selected || busy || saving} onClick={() => void forgetPasswords()}>Forget saved passwords</button></div>
                <p className="form-note">Passwords are saved only when explicitly selected, never in profile files. { !tls && 'SSL is off; use only on a trusted local connection.'}</p>
                </details>
                {storageError && <div role="alert" className="notice">Profil tidak dapat dimuat: {storageError}. Koneksi tanpa profil tetap tersedia. <button type="button" disabled={loading} onClick={() => void retry()}>Coba lagi</button></div>}
                {confirmDelete && <div className="notice" role="group" aria-label="Delete favorite confirmation">Hapus profil tersimpan ini? <button type="button" disabled={saving} onClick={() => void remove()}>Ya, hapus profil</button> <button type="button" disabled={saving} onClick={() => setConfirmDelete(false)}>Batal</button></div>}
                {notice && <p role="status" className="form-notice">{notice}</p>}
            </form>
        </section>
    </div>;
}
