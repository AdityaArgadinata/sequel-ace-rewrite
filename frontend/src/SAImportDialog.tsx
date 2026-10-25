import {useEffect,useState} from 'react';
import {OpenImportFile,Cancel} from '../wailsjs/go/main/App';
import {database} from '../wailsjs/go/models';
import SADialog from './SADialog';
import {EventsOn} from '../wailsjs/runtime/runtime';
import SASQLImport from './SASQLImport';
import SACSVImport from './SACSVImport';
type Props={tab:string;databaseName:string;table:string;tables:string[];busy:boolean;operation:(work:()=>Promise<void>,mayWrite?:boolean)=>Promise<void>;onRefresh:()=>Promise<void>;onClose:()=>void};
export default function SAImportDialog({tab,databaseName,table,tables,busy,operation,onRefresh,onClose}:Props){
 const [format,setFormat]=useState('sql'),[target,setTarget]=useState(table),[file,setFile]=useState<{sql?:database.SASQLImportPreview;csv?:database.SACSVPreview}>({}),[error,setError]=useState(''),[version,setVersion]=useState(0);
 const [progress,setProgress]=useState<{completed:number;total:number}|null>(null);
 useEffect(()=>EventsOn('transfer:progress',(event:{tab:string;completed:number;total:number})=>{if(event.tab===tab)setProgress(event);}),[tab]);
 async function choose(){setError('');setProgress(null);await operation(async()=>{try{const out=await OpenImportFile(tab,databaseName,target);if(!out.cancelled){setFormat(out.format);setFile(out);setVersion(v=>v+1);}}catch(e){setError(String(e));}});}
 useEffect(()=>{void choose();},[]);
 return <SADialog title="Import" wide className="sa-transfer-dialog" busy={busy} onCancel={onClose}><div className="sa-import-sheet">
 <div className="sa-import-file"><label>Format:<select aria-label="Import format" value={format} disabled={busy} onChange={e=>{setFormat(e.target.value);setFile({});setVersion(v=>v+1);}}><option value="sql">SQL</option><option value="csv">CSV</option></select></label><button disabled={busy} onClick={()=>void choose()}>Choose File…</button></div>
 {format==='csv'&&<label>Import into:<select aria-label="Import destination table" value={target} disabled={busy} onChange={e=>{setTarget(e.target.value);setFile({});setVersion(v=>v+1);}}><option value="">Choose table…</option>{tables.map(name=><option key={name}>{name}</option>)}</select></label>}
 <p className="sa-import-encoding">Encoding: UTF-8 · {databaseName}</p>
 {format==='sql'?<SASQLImport key={'sql'+version} initial={file.sql} compact tab={tab} busy={busy} operation={operation} onRefresh={onRefresh} onClose={onClose}/>:target?<SACSVImport key={'csv'+version} initial={file.csv} compact tab={tab} databaseName={databaseName} table={target} busy={busy} operation={operation} onReload={onRefresh} onClose={onClose}/>:<p>Choose the destination table before opening a CSV file.</p>}
 {busy&&<div role="status"><p>{progress?`Importing… ${progress.completed} of ${progress.total}`:'Reading file…'}</p>{progress?<progress aria-label="Import progress" value={progress.completed} max={Math.max(1,progress.total)}/>:<progress aria-label="Import progress"/>}</div>}
 {error&&<p role="alert">{error}</p>}
 <div className="sa-transfer-actions"><button onClick={()=>{if(busy)void Cancel(tab).catch(e=>setError(String(e)));else onClose();}}>{busy?'Cancel Import':'Close'}</button></div>
 </div></SADialog>;
}
