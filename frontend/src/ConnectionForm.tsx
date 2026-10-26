import {FormEvent, useEffect, useId, useRef, useState} from 'react';
import {DeleteProfile, ListProfiles, SaveProfile, SaveCredentials, LoadCredentials, DeleteCredentials, ListFavoriteFolders, ChangeFavoriteFolder} from '../wailsjs/go/main/App';
import {credentials, database, profiles, tunnel, nativefiles,authproviders} from '../wailsjs/go/models';
import ToolbarIcon from './ToolbarIcon';
import favoriteFolderIcon from './assets/favorite-folder.png';
import Splitter from './Splitter';
import SADialog from './SADialog';
import SANativeImport from './SANativeImport';

type Props = {active?:boolean; busy: boolean; onConnect: (connection: database.Connection, state?:nativefiles.SASession) => Promise<void>; sidebarWidth: number; onSidebarResize: (value: number) => void};

const systemTimeZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
const timeZones=[...new Set(['UTC','+00:00','+07:00',systemTimeZone,...((Intl as typeof Intl & {supportedValuesOf?:(key:string)=>string[]}).supportedValuesOf?.('timeZone')??['Asia/Jakarta'])])];

export default function ConnectionForm({active=true, busy, onConnect, sidebarWidth, onSidebarResize}: Props) {
    const formID=useId();
    const [saved, setSaved] = useState<profiles.Profile[]>([]);
    const [selected, setSelected] = useState('');
 const [folders,setFolders]=useState<string[]>([]),[collapsed,setCollapsed]=useState<string[]>([]),[showFolders,setShowFolders]=useState(false);
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
 const [customTimeZone,setCustomTimeZone]=useState(false);
 const [folder,setFolder]=useState('');
 const [selectedFolder,setSelectedFolder]=useState(''),[editingFolder,setEditingFolder]=useState<string|null>(null),[folderName,setFolderName]=useState(''),[folderMenu,setFolderMenu]=useState(false);
 const [folderMenuPosition,setFolderMenuPosition]=useState<{x:number;y:number}|null>(null);
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
    const [tls, setTLS] = useState(false);
    const [caPEM, setCA] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [storageError, setStorageError] = useState('');
    const [notice, setNotice] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(() => {
        if(!active)return;
        let mounted = true;
        ListProfiles().then(list => { if (mounted) setSaved(list); })
            .catch(error => { if (mounted) setStorageError(String(error)); })
            .finally(() => { if (mounted) setLoading(false); });
        return () => { mounted = false; };
    }, [active]);

    useEffect(()=>{let active=true;ListFavoriteFolders().then(list=>{if(active)setFolders(list);}).catch(e=>{if(active)setNotice(String(e));});return()=>{active=false;};},[saved]);
    async function reloadFolders(){const list=await ListProfiles();setSaved(list);const p=list.find(p=>p.id===selected);if(p)setFolder(p.folder??'');setFolders(await ListFavoriteFolders());setStorageError('');}
    function choose(id: string) {
        const p = saved.find(profile => profile.id === id);
        setNativeState(undefined);applyProfile(p);
    }
    function applyProfile(p?:profiles.Profile){
        setAuth(p?.auth?.provider??'');setRegion(p?.auth?.region??'');setAWSProfile(p?.auth?.awsProfile??'');setVaultAddress(p?.auth?.vaultAddress??'');setVaultMount(p?.auth?.vaultMount??'database');setVaultRole(p?.auth?.vaultRole??'');setVaultNamespace(p?.auth?.vaultNamespace??'');setVaultToken('');setInitialDatabase(p?.initialDatabase ?? '');setSocket(p?.socket??'');setSocketEnabled(!!p?.socket);setTimeZone(p?.timeZone??'');setCustomTimeZone(false);setFolder(p?.folder??'');setColor(p?.color??'');setAgent(p?.ssh?.useAgent??false);setInteractive(p?.ssh?.keyboardInteractive??false);setChallenge('');
        setSelected(p?.id ?? ''); setName(p?.name ?? '');
        setHost(p?.host ?? '127.0.0.1'); setPort(String(p?.port ?? 3306));
        setUser(p?.user ?? 'root'); setTLS(p?.tls ?? false); setCA(p?.caPEM ?? '');
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
            if (remember) { await SaveCredentials(p.id, secrets()); setNotice('Connection and passwords saved in the OS credential store.'); } else { setNotice('Connection saved. Passwords were not saved.'); }
        } catch (error) { setNotice(String(error)); }
        finally { setSaving(false); }
    }

    async function remove() {
        setSaving(true); setNotice('');
        try {
            await DeleteProfile(selected);
            setSaved(previous => previous.filter(p => p.id !== selected));
            choose(''); setNotice('Connection deleted.');
        } catch (error) { setNotice(String(error)); }
        finally { setSaving(false); }
    }

    const folderActionsRef=useRef<HTMLDivElement>(null);
    useEffect(()=>{
        if(!folderMenu)return;
        function close(event:PointerEvent){if(!folderActionsRef.current?.contains(event.target as Node))setFolderMenu(false);}
        function escape(event:KeyboardEvent){if(event.key==='Escape'){setFolderMenu(false);folderActionsRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup]')?.focus();}}
        document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);
        return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};
    },[folderMenu]);
    async function changeFolder(action:string, source:string, destination='') {
        setSaving(true);setNotice('');
        try {const result=await ChangeFavoriteFolder(new profiles.FolderChange({action,folder:source,destination}));await reloadFolders();if(result.error)throw new Error(`${result.completed} of ${result.total} updates saved. ${result.error}`);setSelectedFolder(action==='remove'?'':destination||source);return true;}
        catch(error){setNotice(String(error));return false;}finally{setSaving(false);}
    }
    async function deleteFolder(){
        setShowFolders(false);setSaving(true);let completed=0;
        try{for(const p of saved.filter(p=>p.folder===selectedFolder||p.folder?.startsWith(selectedFolder+'/'))){await DeleteProfile(p.id);completed++;}const result=await ChangeFavoriteFolder(new profiles.FolderChange({action:'remove',folder:selectedFolder}));if(result.error)throw new Error(result.error);choose('');setSelectedFolder('');}
        catch(error){setNotice(`${completed} favorites deleted. ${String(error)} Reload before retrying.`);}
        finally{try{await reloadFolders();}catch(error){setNotice(String(error));}setSaving(false);}
    }
    function requestDeleteFolder(){
        if(saved.some(p=>p.folder===selectedFolder||p.folder?.startsWith(selectedFolder+'/'))||folders.some(f=>f.startsWith(selectedFolder+'/')))setShowFolders(true);else void deleteFolder();
    }
    async function newFolder(){
        setFolderMenu(false);const parent=selectedFolder?selectedFolder+'/':'';let path=parent+'New Folder',i=2;
        while(folders.includes(path))path=parent+'New Folder '+i++;
        if(await changeFolder('create',path)){setCollapsed(old=>old.filter(f=>!path.startsWith(f+'/')));setEditingFolder(path);setFolderName(path.split('/').at(-1)!);}
    }
    async function renameFolder(){
        if(editingFolder===null)return;const source=editingFolder;setEditingFolder(null);
        const destination=source.slice(0,source.lastIndexOf('/')+1)+folderName.trim();
        if(destination!==source)await changeFolder('rename',source,destination);
    }
    async function dropFavorite(event:React.DragEvent,destination:string){
        event.preventDefault();event.stopPropagation();if(busy||saving)return;
        const source=event.dataTransfer.getData('application/x-sequelx-folder');
        if(source){await changeFolder('rename',source,destination?destination+'/'+source.split('/').at(-1):source.split('/').at(-1)!);return;}
        const id=event.dataTransfer.getData('application/x-sequelx-favorite'),p=saved.find(p=>p.id===id);if(!p||p.folder===destination)return;
        setSaving(true);try{await SaveProfile(new profiles.Profile({...p,folder:destination}));await reloadFolders();}catch(error){setNotice(String(error));}finally{setSaving(false);}
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
        <aside id={formID+"-favorites-panel"} className="favorites-sidebar" aria-label="Favorites" style={{flexBasis: `${sidebarWidth}%`}}>
            <button className={`favorite quick ${!selected ? 'selected' : ''}`} disabled={busy || saving} onClick={() => {setSelectedFolder('');choose('');}}><span className="quick-symbol">ϟ</span> QUICK CONNECT</button>
            <h2>FAVORITES</h2>
            <div className="favorites-list" role="list" aria-label="Saved connections">
                <div className="favorite-tree" onDragOver={e=>e.preventDefault()} onDrop={e=>void dropFavorite(e,'')}>
                {[...new Set([...folders,...saved.map(p=>p.folder??'')])].sort().map(group=>{
                    if(collapsed.some(parent=>group!==parent&&group.startsWith(parent+'/')))return null;
                    const depth=group?group.split('/').length:0;
                    return <div key={group}>
                        {group&&<div className={`favorite-folder-row ${selectedFolder===group?'selected':''}`} style={{paddingLeft:(depth-1)*16}} draggable={!saving&&!busy&&editingFolder===null} onDragStart={e=>e.dataTransfer.setData('application/x-sequelx-folder',group)} onDragOver={e=>e.preventDefault()} onDrop={e=>void dropFavorite(e,group)} onContextMenu={e=>{e.preventDefault();if(busy||saving)return;setSelectedFolder(group);setFolderMenuPosition({x:Math.max(8,Math.min(e.clientX,window.innerWidth-220)),y:Math.max(8,Math.min(e.clientY,window.innerHeight-110))});setFolderMenu(true);}}>
                            {editingFolder===group?<input aria-label="Folder name" autoFocus value={folderName} onFocus={e=>e.target.select()} onChange={e=>setFolderName(e.target.value)} onBlur={()=>void renameFolder()} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void renameFolder();}if(e.key==='Escape'){e.preventDefault();setEditingFolder(null);}}}/>:<button className="favorite-folder-name" aria-label={`Folder ${group.split('/').at(-1)}`} aria-expanded={!collapsed.includes(group)} onClick={()=>{setSelectedFolder(group);setFolder(group);setCollapsed(old=>old.includes(group)?old.filter(f=>f!==group):[...old,group]);}} ><img src={favoriteFolderIcon} alt="" draggable={false}/><span>{group.split('/').at(-1)}</span></button>}
                        </div>}
                        {!collapsed.includes(group)&&saved.filter(p=>(p.folder??'')===group).sort((a,b)=>a.name.localeCompare(b.name)).map(p=><div role="listitem" key={p.id} style={{paddingLeft:depth*16}} draggable={!busy&&!saving} onDragStart={e=>e.dataTransfer.setData('application/x-sequelx-favorite',p.id)}><button title={`${p.host}:${p.port}`} className={`favorite ${selected===p.id&&!selectedFolder?'selected':''}`} disabled={busy||saving||loading} onClick={()=>{setSelectedFolder('');choose(p.id);}}><ToolbarIcon name="database"/><span style={{borderLeft:p.color&&p.color!=='none'?`3px solid ${p.color}`:undefined,paddingLeft:4}}>{p.name}</span></button></div>)}
                    </div>;
                })}
                </div>

            </div>
            <div className="sidebar-bottom">
                <button aria-label="New connection" title="New connection" disabled={busy || saving} onClick={() => {setSelectedFolder('');choose('');}}>＋</button>
                <button type="button" aria-label="New Folder" title="New Folder" disabled={busy||saving||!!storageError} onClick={()=>void newFolder()} className="new-favorite-folder"><img src={favoriteFolderIcon} alt=""/><span>+</span></button><div className="favorite-actions" ref={folderActionsRef}><button type="button" aria-label="Favorite actions" title="Favorite actions" aria-haspopup="menu" aria-expanded={folderMenu} disabled={busy||saving||!!storageError} onClick={()=>{setFolderMenuPosition(null);setFolderMenu(v=>!v);}}><ToolbarIcon name="more"/><svg aria-hidden="true" viewBox="0 0 12 12" className="favorite-menu-chevron"><path d="m3 4 3 3 3-3"/></svg></button>{folderMenu&&<div className="favorite-actions-menu" role="menu" style={folderMenuPosition?{position:'fixed',left:folderMenuPosition.x,top:folderMenuPosition.y,bottom:'auto'}:undefined}><button role="menuitem" onClick={()=>void newFolder()}>New Folder</button><button role="menuitem" disabled={!selectedFolder} onClick={()=>{setFolderMenu(false);setEditingFolder(selectedFolder);setFolderName(selectedFolder.split('/').at(-1)!);}}>Rename Folder</button><button role="menuitem" disabled={!selectedFolder} onClick={()=>{setFolderMenu(false);requestDeleteFolder();}}>Delete Folder…</button></div>}</div>
                <button aria-label="Delete favorite" title="Delete favorite" disabled={busy || saving || (!selected&&!selectedFolder) || !!storageError} onClick={() => selectedFolder?requestDeleteFolder():setConfirmDelete(true)}>−</button>
            </div>
        </aside>
        <Splitter label="Favorites sidebar width" controls={formID+"-favorites-panel"} axis="x" value={sidebarWidth} min={15} max={35} onChange={onSidebarResize} />
        <section className="connection-pane">
            {showFolders&&<SADialog title={`Delete folder '${selectedFolder.split('/').at(-1)}'?`} onCancel={()=>setShowFolders(false)}><p>All folders and saved connections within this folder will also be deleted. This operation cannot be undone.</p><button onClick={()=>void deleteFolder()}>Delete</button><button autoFocus data-dialog-focus onClick={()=>setShowFolders(false)}>Cancel</button></SADialog>}
            <h1>Enter connection details below, or choose a favorite</h1>

            <form onSubmit={e => void connect(e)} className="connection-form">
                <fieldset disabled={busy || saving}>
                    <legend className="connection-tabs"><button type="button" aria-pressed={!sshEnabled&&!socketEnabled} onClick={() => {setSSHEnabled(false);setSocketEnabled(false);}}>TCP/IP</button><button type="button" aria-pressed={socketEnabled} onClick={()=>{setSocketEnabled(true);setAuth('');setSSHEnabled(false);setTLS(false);setCA('');}}>Socket</button><button type="button" aria-pressed={sshEnabled} onClick={() => {setSSHEnabled(true);setSocketEnabled(false);}}>SSH</button></legend>
                    <div className="form-row"><label htmlFor={formID+"-profile-name"}>Name:</label><input id={formID+"-profile-name"} value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder="optional" /></div>
                    <div className="form-row color-row"><span /><div aria-label="Favorite colors" className="color-tags">{['none','red','orange','yellow','green','blue','purple','gray'].map(color => <button type="button" key={color} className={color} aria-label={`${color} favorite color`} aria-pressed={color===profile().color} onClick={()=>setColor(color)}>{color === 'none' ? '×' : ''}</button>)}</div></div>

 {socketEnabled&&<div className="form-row"><label htmlFor={formID+"-socket-path"}>Socket path:</label><input id={formID+"-socket-path"} required value={socket} onChange={e=>setSocket(e.target.value)} placeholder="/tmp/mysql.sock"/></div>}
 <div className="form-row"><label htmlFor={formID+"-host"}>Host:</label><input id={formID+"-host"} required value={host} onChange={e => setHost(e.target.value)} autoComplete="off" /></div>
                    <div className="form-row"><label htmlFor={formID+"-username"}>Username:</label><input id={formID+"-username"} required value={user} onChange={e => setUser(e.target.value)} autoComplete="off" /></div>
 <div className="form-row"><label htmlFor={formID+"-password"}>Password:</label><input id={formID+"-password"} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" /></div>
                    <div className="form-row"><label htmlFor={formID+"-initial-db"}>Database:</label><input id={formID+"-initial-db"} placeholder="optional" value={initialDatabase} onChange={e=>setInitialDatabase(e.target.value)}/></div>
                    <div className="form-row"><label htmlFor={formID+"-port"}>Port:</label><input id={formID+"-port"} required type="number" min="1" max="65535" value={port} onChange={e => setPort(e.target.value)} /></div>
                    <div className="form-row"><label htmlFor={formID+"-time-zone"}>Time Zone:</label><select id={formID+"-time-zone"} value={customTimeZone?"@custom":timeZone} onChange={e=>{setCustomTimeZone(e.target.value==="@custom");if(e.target.value!=="@custom")setTimeZone(e.target.value);}}><option value="">Use Server Time Zone</option><option value={systemTimeZone}>Use System Time Zone</option>{!timeZones.includes(timeZone)&&timeZone&&<option value={timeZone}>{timeZone}</option>}{timeZones.filter(zone=>zone!==systemTimeZone).map(zone=><option key={zone} value={zone}>{zone}</option>)}<option value="@custom">Custom…</option></select></div>
                    {customTimeZone&&<div className="form-row"><label htmlFor={formID+"-custom-time-zone"}>Custom time zone:</label><input id={formID+"-custom-time-zone"} value={timeZone} onChange={e=>setTimeZone(e.target.value)} placeholder="+05:45 or Asia/Jakarta"/></div>}
                    <div className="form-row"><span /><div className="connection-options">
                        <label><input type="checkbox" disabled /> Allow LOCAL_DATA_INFILE (insecure)</label>
                        <label><input type="checkbox" disabled /> Enable Cleartext plugin (insecure)</label>
                        <label><input type="checkbox" disabled={socketEnabled||!!auth} checked={tls} onChange={e => { setTLS(e.target.checked); if (!e.target.checked) setCA(''); }} /> Require SSL</label>
                        {tls && <details><summary>CA certificate (optional)</summary><label className="ca-label">CA PEM<textarea rows={4} value={caPEM} onChange={e => setCA(e.target.value)} spellCheck={false} /></label></details>}
                    </div></div>
                    {sshEnabled && <div className="ssh-settings">
                        <h3>SSH tunnel</h3><label><input type="checkbox" checked={agent} onChange={e=>setAgent(e.target.checked)}/>Use SSH agent (SSH_AUTH_SOCK)</label><label><input type="checkbox" checked={interactive} onChange={e=>setInteractive(e.target.checked)}/>Keyboard-interactive</label>{interactive&&<label>Challenge answers, in prompt order (one per line)<textarea aria-label="SSH challenge answers" value={challenge} onChange={e=>setChallenge(e.target.value)} style={{WebkitTextSecurity:'disc'} as React.CSSProperties}/></label>}
                        <div className="form-row"><label htmlFor={formID+"-ssh-host"}>SSH Host:</label><input id={formID+"-ssh-host"} required value={sshHost} onChange={e => setSSHHost(e.target.value)} /></div>
                        <div className="form-row"><label htmlFor={formID+"-ssh-port"}>SSH Port:</label><input id={formID+"-ssh-port"} required type="number" min="1" max="65535" value={sshPort} onChange={e => setSSHPort(e.target.value)} /></div>
                        <div className="form-row"><label htmlFor={formID+"-ssh-user"}>SSH User:</label><input id={formID+"-ssh-user"} required value={sshUser} onChange={e => setSSHUser(e.target.value)} /></div>
                        <div className="form-row"><label htmlFor={formID+"-ssh-password"}>SSH Password:</label><input id={formID+"-ssh-password"} type="password" value={sshPassword} onChange={e => setSSHPassword(e.target.value)} autoComplete="off" /></div>
                        <div className="form-row"><label htmlFor={formID+"-ssh-key"}>Private Key:</label><input id={formID+"-ssh-key"} placeholder="Absolute path (optional)" value={sshKey} onChange={e => setSSHKey(e.target.value)} /></div>
                        <div className="form-row"><label htmlFor={formID+"-ssh-phrase"}>Passphrase:</label><input id={formID+"-ssh-phrase"} type="password" value={keyPassphrase} onChange={e => setKeyPassphrase(e.target.value)} autoComplete="off" /></div>
                        <div className="form-row"><label htmlFor={formID+"-known-hosts"}>Known Hosts:</label><input id={formID+"-known-hosts"} placeholder="Default: ~/.ssh/known_hosts" value={knownHosts} onChange={e => setKnownHosts(e.target.value)} /></div>
                        <p className="form-note">Host keys must already be trusted in known_hosts. Database Host is reached from the SSH server.</p>
                    </div>}

                </fieldset>
                <div className="connection-actions"><button type="button" disabled={busy || saving || loading || !!storageError || !name.trim()} onClick={() => void save()}>{selected ? 'Save Changes' : 'Save Connection'}</button><button className="primary connect-button" type="submit" disabled={busy || saving}>{busy ? 'Connecting…' : 'Connect'}</button></div>
                <details className="credential-store"><summary>Password storage</summary>
                    <label className="remember-passwords"><input type="checkbox" checked={remember} disabled={!!auth || !name.trim() || busy || saving} onChange={e => setRemember(e.target.checked)} /> Save passwords in OS credential store (requires named profile)</label>
                <div className="credential-actions"><button type="button" disabled={!selected || busy || saving} onClick={() => void loadPasswords()}>Use saved passwords</button><button type="button" disabled={!selected || busy || saving} onClick={() => void forgetPasswords()}>Forget saved passwords</button></div>
                <p className="form-note">Passwords are saved only when explicitly selected, never in profile files. { !tls && 'SSL is off; use only on a trusted local connection.'}</p>
                </details>
                <details className="connection-advanced" open={auth?true:undefined}><summary>Advanced connection options</summary>
                    <div className="form-row"><label htmlFor={formID+"-favorite-folder"}>Folder:</label><input id={formID+"-favorite-folder"} value={folder} maxLength={200} onChange={e=>setFolder(e.target.value)} placeholder="optional; use / for subfolders"/></div>
                    <div className="form-row"><label htmlFor={formID+"-auth-provider"}>Authentication:</label><select id={formID+"-auth-provider"} value={auth} disabled={socketEnabled} onChange={e=>{setAuth(e.target.value);setRemember(false);setPassword('');if(e.target.value)setTLS(true);}}><option value="">Password</option><option value="aws">AWS IAM (AWS CLI)</option><option value="vault">Vault database credentials</option></select></div>
 {auth==='aws'&&<><label>AWS region<input value={region} onChange={e=>setRegion(e.target.value)}/></label><label>AWS CLI profile<input value={awsProfile} onChange={e=>setAWSProfile(e.target.value)}/></label><p>Requires an installed AWS CLI and configured credentials. A fresh token is generated for every new session.</p></>}
 {auth==='vault'&&<><label>Vault HTTPS address<input value={vaultAddress} onChange={e=>setVaultAddress(e.target.value)}/></label><label>Vault database mount<input value={vaultMount} onChange={e=>setVaultMount(e.target.value)}/></label><label>Vault role<input value={vaultRole} onChange={e=>setVaultRole(e.target.value)}/></label><label>Vault namespace<input value={vaultNamespace} onChange={e=>setVaultNamespace(e.target.value)}/></label><label>Vault token<input type="password" autoComplete="off" value={vaultToken} onChange={e=>setVaultToken(e.target.value)}/></label><p>Dynamic credentials are issued at connection time. Vault leases are managed by the server; automatic renewal and OIDC login are not included.</p></>}
<SANativeImport disabled={busy || saving} onReload={retry} onSession={state=>{applyProfile(state.profile);setNativeState(state);setInitialDatabase(state.database);setNotice(state.notice);}}/>
                </details>
                {storageError && <div role="alert" className="notice">Connections could not be loaded: {storageError}. You can still connect without a saved connection. <button type="button" disabled={loading} onClick={() => void retry()}>Retry</button></div>}
                {confirmDelete && <div className="notice" role="group" aria-label="Delete favorite confirmation">Delete this saved connection? <button type="button" disabled={saving} onClick={() => void remove()}>Delete connection</button> <button type="button" disabled={saving} onClick={() => setConfirmDelete(false)}>Cancel</button></div>}
                {notice && <p role="status" className="form-notice">{notice}</p>}
            </form>
        </section>
    </div>;
}
