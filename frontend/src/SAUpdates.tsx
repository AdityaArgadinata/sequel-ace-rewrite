import {useState} from 'react';
import {CheckForUpdates} from '../wailsjs/go/main/App';
import {BrowserOpenURL} from '../wailsjs/runtime/runtime';
import {updates} from '../wailsjs/go/models';
export default function SAUpdates(){
 const [preview,setPreview]=useState(false),[busy,setBusy]=useState(false),[result,setResult]=useState<updates.Result|null>(null),[error,setError]=useState('');
 async function check(){setBusy(true);setError('');setResult(null);try{setResult(await CheckForUpdates(preview));}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <section className="update-settings" aria-label="Application updates"><strong>Application updates</strong><p>Check published GitHub release metadata only when requested. Downloads and installation are manual; existing sessions and drafts stay open. Up to 100 recent releases are compared.</p><label><input type="checkbox" checked={preview} disabled={busy} onChange={e=>{setPreview(e.target.checked);setResult(null);}}/>Include prereleases</label><button disabled={busy} onClick={()=>void check()}>{busy?'Checking updates…':'Check for updates'}</button>{error&&<p role="alert">{error}</p>}{result&&<><p role="status">Current build: {result.current}. {result.development?'Development build; compare release notes before replacing it. ':''}{!result.latest?'No published release found for this channel.':result.available?`Release available: ${result.latest}.`:`No newer release found. Latest checked: ${result.latest}.`}</p>{result.latest&&<button onClick={()=>BrowserOpenURL(result.url)}>Open release downloads</button>}<p>Verify package checksums and publisher signatures before installing. The app does not replace itself.</p></>}</section>;
}
