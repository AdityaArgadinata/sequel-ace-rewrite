import {FormEvent, useEffect, useState} from 'react';
import {DeleteProfile, ListProfiles, SaveProfile, SaveCredentials, LoadCredentials, DeleteCredentials} from '../wailsjs/go/main/App';
import {credentials, database, profiles, tunnel, nativefiles,authproviders} from '../wailsjs/go/models';
import ToolbarIcon from './ToolbarIcon';
import Splitter from './Splitter';
import SANativeImport from './SANativeImport';

type Props = {busy: boolean; onConnect: (connection: database.Connection, state?:nativefiles.SASession) => Promise<void>; sidebarWidth: number; onSidebarResize: (value: number) => void};

export default function ConnectionForm({busy, onConnect, sidebarWidth, onSidebarResize}: Props) {
    const [saved, setSaved] = useState<profiles.Profile[]>([]);
    const [selected, setSelected] = useState('');
    const [initialDatabase,setInitialDatabase]=useState('');
    const [nativeState,setNativeState]=useState<nativefiles.SASession|undefined>();
    const [name, setName] = useState('');
    const [auth,setAuth]=useState('');
 const [region,setRegion]=useState('');
 const [awsProfile,setAWSProfile]=useState('');
 const [vaultAddress,setVaultAddress]=useState('');
 const [vaultMount,setVaultMount]=useState('database');
 const [vaultRole,setVaultRole]=useState('');
 const [vaultNamespace,setVaultNamespace]=useState('');
 const [vaultToken,setVaultToken]=useState('');
 const [socket,setSocket]=useState('');
 const [socketEnabled,setSocketEnabled]=useState(false);
 const [timeZone,setTimeZone]=useState('');
 const [folder,setFolder]=useState('');
 const [color,setColor]=useState('');
 const [agent,setAgent]=useState(false);
 const [interactive,setInteractive]=useState(false);
 const [challenge,setChallenge]=useState('');
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
        setNativeState(undefined);applyProfile(p);
    }
    function applyProfile(p?:profiles.Profile){
        setAuth(p?.auth?.provider??'');setRegion(p?.auth?.region??'');setAWSProfile(p?.auth?.awsProfile??'');setVaultAddress(p?.auth?.vaultAddress??'');setVaultMount(p?.auth?.vaultMount??'database');setVaultRole(p?.auth?.vaultRole??'');setVaultNamespace(p?.auth?.vaultNamespace??'');setVaultToken('');setInitialDatabase(p?.initialDatabase ?? '');setSocket(p?.socket??'');setSocketEnabled(!!p?.socket);setTimeZone(p?.timeZone??'');setFolder(p?.folder??'');setColor(p?.color??'');setAgent(p?.ssh?.useAgent??false);setInteractive(p?.ssh?.keyboardInteractive??false);setChallenge('');
        setSelected(p?.id ?? ''); setName(p?.name ?? '');
        setHost(p?.host ?? '127.0.0.1'); setPort(String(p?.port ?? 3306));
        setUser(p?.user ?? 'root'); setTLS(p?.tls ?? true); setCA(p?.caPEM ?? '');
        setPassword(''); setSSHPassword(''); setKeyPassphrase(''); setRemember(false);
        setSSHEnabled(!!p?.ssh); setSSHHost(p?.ssh?.host ?? ''); setSSHPort(String(p?.ssh?.port ?? 22));
        setSSHUser(p?.ssh?.user ?? ''); setSSHKey(p?.ssh?.keyFile ?? ''); setKnownHosts(p?.ssh?.knownHosts ?? '');
        setConfirmDelete(false); setNotice('');
    }

    function authSettings(){return new authproviders.SASettings({provider:auth,region,awsProfile,vaultAddress,vaultMount,vaultRole,vaultNamespace});}
 function sshSettings() { return new tunnel.Settings({host: sshHost, port: Number(sshPort), user: sshUser, keyFile: sshKey, knownHosts,useAgent:agent,keyboardInteractive:interactive}); }
    function profile() { return new profiles.Profile({id: selected, name, host, port: Number(port), user, tls, caPEM,socket:socketEnabled?socket:'',timeZone,folder,color,auth:auth?authSettings():undefined, ssh: sshEnabled ? sshSettings() : undefined,initialDatabase}); }
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
        const connection = new database.Connection({host, port: Number(port), user, password, tls, caPEM,socket:socketEnabled?socket:'',timeZone,auth:auth?new authproviders.SAOptions({settings:authSettings(),vaultToken}):undefined, ssh: sshEnabled ? new tunnel.Options({settings: sshSettings(), password: sshPassword, keyPassphrase,challengeAnswers:challenge?challenge.split('\n'):[]}) : undefined});
        if (remember) {
            setSaving(true);
            try {
                const p = await SaveProfile(profile()); setSelected(p.id);
                setSaved(old => [...old.filter(item => item.id !== p.id), p]);
                await SaveCredentials(p.id, secrets());
            } catch (error) { setNotice(`${String(error)} Uncheck Save passwords to connect without saving.`); setSaving(false); return; }
            setSaving(false);
        }
        setPassword(''); setSSHPassword(''); setKeyPassphrase('');setChallenge('');setVaultToken('');
        await onConnect(connection,new nativefiles.SASession({...nativeState,database:initialDatabase || nativeState?.database || '',profile:profile()}));
    }

    return <div className="connection-layout">
        <aside id="favorites-panel" className="favorites-sidebar" aria-label="Favorites" style={{flexBasis: `${sidebarWidth}%`}}>
            <button className={`favorite quick ${!selected ? 'selected' : ''}`} disabled={busy || saving} onClick={() => choose('')}><span className="quick-symbol">ϟ</span> QUICK CONNECT</button>
            <h2>FAVORITES</h2>
            <div className="favorites-list" role="list" aria-label="Saved connections">
                {[...saved].sort((a,b)=>(a.folder??'').localeCompare(b.folder??'')||a.name.localeCompare(b.name)).map((p,index,list) => <div role="listitem" key={p.id}>{p.folder && (index===0||list[index-1].folder!==p.folder) && <h3 className="favorite-folder">{p.folder}</h3>}<button title={`${p.host}:${p.port}`} className={`favorite ${selected === p.id ? 'selected' : ''}`} disabled={busy || saving || loading} onClick={() => choose(p.id)}><ToolbarIcon name="database" /><span style={{borderLeft:p.color&&p.color!=='none'?`3px solid ${p.color}`:undefined,paddingLeft:4}}>{p.name}</span></button></div>)}

            </div>
            <div className="sidebar-bottom">
                <button aria-label="New connection" title="New connection" disabled={busy || saving} onClick={() => choose('')}>＋</button>
                <button aria-label="Delete favorite" title="Delete favorite" disabled={busy || saving || !selected || !!storageError} onClick={() => setConfirmDelete(true)}>−</button>
            </div>
        </aside>
        <Splitter label="Favorites sidebar width" controls="favorites-panel" axis="x" value={sidebarWidth} min={15} max={35} onChange={onSidebarResize} />
        <section className="connection-pane">
            <h1>Enter connection details below, or choose a favorite</h1>
            <SANativeImport disabled={busy || saving} onReload={retry} onSession={state=>{applyProfile(state.profile);setNativeState(state);setInitialDatabase(state.database);setNotice(state.notice);}}/>
            <form onSubmit={e => void connect(e)} className="connection-form">
                <fieldset disabled={busy || saving}>
                    <legend className="connection-tabs"><button type="button" aria-pressed={!sshEnabled&&!socketEnabled} onClick={() => {setSSHEnabled(false);setSocketEnabled(false);}}>TCP/IP</button><button type="button" aria-pressed={socketEnabled} onClick={()=>{setSocketEnabled(true);setAuth('');setSSHEnabled(false);setTLS(false);setCA('');}}>Socket</button><button type="button" aria-pressed={sshEnabled} onClick={() => {setSSHEnabled(true);setSocketEnabled(false);}}>SSH</button></legend>
                    <div className="form-row"><label htmlFor="profile-name">Name:</label><input id="profile-name" value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder="optional" /></div>
                    <div className="form-row color-row"><span /><div aria-label="Favorite colors" className="color-tags">{['none','red','orange','yellow','green','blue','purple','gray'].map(color => <button type="button" key={color} className={color} aria-label={`${color} favorite color`} aria-pressed={color===profile().color} onClick={()=>setColor(color)}>{color === 'none' ? '×' : ''}</button>)}</div></div>
                    <div className="form-row"><label htmlFor="favorite-folder">Folder:</label><input id="favorite-folder" value={folder} maxLength={200} onChange={e=>setFolder(e.target.value)} placeholder="optional; use / for subfolders"/></div>
 {socketEnabled&&<div className="form-row"><label htmlFor="socket-path">Socket path:</label><input id="socket-path" required value={socket} onChange={e=>setSocket(e.target.value)} placeholder="/tmp/mysql.sock"/></div>}
 <div className="form-row"><label htmlFor="host">Host:</label><input id="host" required value={host} onChange={e => setHost(e.target.value)} autoComplete="off" /></div>
                    <div className="form-row"><label htmlFor="username">Username:</label><input id="username" required value={user} onChange={e => setUser(e.target.value)} autoComplete="off" /></div>
                    <div className="form-row"><label htmlFor="auth-provider">Authentication:</label><select id="auth-provider" value={auth} disabled={socketEnabled} onChange={e=>{setAuth(e.target.value);setRemember(false);setPassword('');if(e.target.value)setTLS(true);}}><option value="">Password</option><option value="aws">AWS IAM (AWS CLI)</option><option value="vault">Vault database credentials</option></select></div>
 {auth==='aws'&&<><label>AWS region<input value={region} onChange={e=>setRegion(e.target.value)}/></label><label>AWS CLI profile<input value={awsProfile} onChange={e=>setAWSProfile(e.target.value)}/></label><p>Requires an installed AWS CLI and configured credentials. A fresh token is generated for every new session.</p></>}
 {auth==='vault'&&<><label>Vault HTTPS address<input value={vaultAddress} onChange={e=>setVaultAddress(e.target.value)}/></label><label>Vault database mount<input value={vaultMount} onChange={e=>setVaultMount(e.target.value)}/></label><label>Vault role<input value={vaultRole} onChange={e=>setVaultRole(e.target.value)}/></label><label>Vault namespace<input value={vaultNamespace} onChange={e=>setVaultNamespace(e.target.value)}/></label><label>Vault token<input type="password" autoComplete="off" value={vaultToken} onChange={e=>setVaultToken(e.target.value)}/></label><p>Dynamic credentials are issued at connection time. Vault leases are managed by the server; automatic renewal and OIDC login are not included.</p></>}
 <div className="form-row"><label htmlFor="password">Password:</label><input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" /></div>
                    <div className="form-row"><label htmlFor="initial-db">Database:</label><input id="initial-db" placeholder="optional" value={initialDatabase} onChange={e=>setInitialDatabase(e.target.value)}/></div>
                    <div className="form-row"><label htmlFor="port">Port:</label><input id="port" required type="number" min="1" max="65535" value={port} onChange={e => setPort(e.target.value)} /></div>
                    <div className="form-row"><label htmlFor="time-zone">Time Zone:</label><input id="time-zone" value={timeZone} onChange={e=>setTimeZone(e.target.value)} placeholder="Server default, +07:00, UTC, Asia/Jakarta" list="time-zone-options"/><datalist id="time-zone-options">{['SYSTEM','+00:00','+07:00','UTC','Asia/Jakarta'].map(v=><option key={v} value={v}/>)}</datalist></div>
                    <div className="form-row"><span /><div className="connection-options">
                        <label><input type="checkbox" disabled /> Allow LOCAL_DATA_INFILE (insecure)</label>
                        <label><input type="checkbox" disabled /> Enable Cleartext plugin (insecure)</label>
                        <label><input type="checkbox" disabled={socketEnabled||!!auth} checked={tls} onChange={e => { setTLS(e.target.checked); if (!e.target.checked) setCA(''); }} /> Require SSL</label>
                        {tls && <details><summary>CA certificate (optional)</summary><label className="ca-label">CA PEM<textarea rows={4} value={caPEM} onChange={e => setCA(e.target.value)} spellCheck={false} /></label></details>}
                    </div></div>
                    {sshEnabled && <div className="ssh-settings">
                        <h3>SSH tunnel</h3><label><input type="checkbox" checked={agent} onChange={e=>setAgent(e.target.checked)}/>Use SSH agent (SSH_AUTH_SOCK)</label><label><input type="checkbox" checked={interactive} onChange={e=>setInteractive(e.target.checked)}/>Keyboard-interactive</label>{interactive&&<label>Challenge answers, in prompt order (one per line)<textarea aria-label="SSH challenge answers" value={challenge} onChange={e=>setChallenge(e.target.value)} style={{WebkitTextSecurity:'disc'} as React.CSSProperties}/></label>}
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
                    <label className="remember-passwords"><input type="checkbox" checked={remember} disabled={!!auth || !name.trim() || busy || saving} onChange={e => setRemember(e.target.checked)} /> Save passwords in OS credential store (requires named profile)</label>
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
