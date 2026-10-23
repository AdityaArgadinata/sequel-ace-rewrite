import {useState} from 'react';
import {Panel} from '../wailsjs/go/main/App';
import {database} from '../wailsjs/go/models';
import ResultGrid from './ResultGrid';
export default function SAHelp({tab,busy,operation}:{tab:string;busy:boolean;operation:(work:()=>Promise<void>)=>Promise<void>}){
 const [topic,setTopic]=useState('SELECT'),[result,setResult]=useState<database.Result|null>(null);
 return <details className="data-export"><summary>MySQL help</summary><label>SQL help topic<input maxLength={256} value={topic} onChange={e=>setTopic(e.target.value)}/></label><button disabled={busy} onClick={()=>void operation(async()=>setResult(await Panel(tab,'help','','',topic,'')))}>Look up SQL help</button><p>Uses this server's HELP tables. Some installations do not load help content.</p>{result&&<><ResultGrid result={result} busy={busy}/><pre style={{whiteSpace:'pre-wrap',maxHeight:300,overflow:'auto'}}>{result.rows.map(row=>row.map(c=>c.value).join('\n')).join('\n\n')}</pre></>}</details>;
}
