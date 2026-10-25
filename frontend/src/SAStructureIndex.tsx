import {useState} from 'react';
import SADialog from './SADialog';
import type {database} from '../wailsjs/go/models';

type Item={column:string;length:string;order:string};
export default function SAStructureIndex({columns,hasPrimary,busy,onCancel,onSave}:{columns:string[];hasPrimary:boolean;busy:boolean;onCancel:()=>void;onSave:(request:Partial<database.SASchemaChange>)=>Promise<void>}){
 const [type,setType]=useState(hasPrimary?'INDEX':'PRIMARY'),[name,setName]=useState(hasPrimary?'':'PRIMARY');
 const [items,setItems]=useState<Item[]>([{column:columns[0]??'',length:'',order:''}]),[storage,setStorage]=useState('');
 const quote=(v:string)=>'`'+v.replaceAll('`','``')+'`';
 function update(i:number,change:Partial<Item>){setItems(old=>old.map((item,n)=>n===i?{...item,...change}:item));}
 return <SADialog title="Add index" onCancel={onCancel} busy={busy} wide><form className="structure-index-sheet" aria-label="Add index" onSubmit={event=>{event.preventDefault();void onSave({kind:'index',action:'add',name:type==='PRIMARY'?'PRIMARY':name,indexKind:type,definition:'('+items.map(item=>quote(item.column)+(item.length?'('+item.length+')':'')+(item.order?' '+item.order:'')).join(', ')+')'+(storage?' USING '+storage:'')});}}>
 <label>Type<select aria-label="Index type" disabled={busy} value={type} onChange={event=>{setType(event.target.value);setName(event.target.value==='PRIMARY'?'PRIMARY':name==='PRIMARY'?'':name);}}>{['PRIMARY','INDEX','UNIQUE','FULLTEXT','SPATIAL'].filter(t=>t!=='PRIMARY'||!hasPrimary).map(t=><option key={t}>{t}</option>)}</select></label>
 <label>Name<input aria-label="Index name" autoFocus disabled={busy||type==='PRIMARY'} value={name} maxLength={64} onChange={e=>setName(e.target.value)}/></label>
 <table><thead><tr><th>Column</th><th>Size</th><th>Order</th><th/></tr></thead><tbody>{items.map((item,i)=><tr key={i}><td><select aria-label={`Index column ${i+1}`} disabled={busy} value={item.column} onChange={e=>update(i,{column:e.target.value})}>{columns.map(c=><option key={c}>{c}</option>)}</select></td><td><input aria-label={`Index size ${i+1}`} disabled={busy} value={item.length} inputMode="numeric" pattern="[0-9]*" onChange={e=>update(i,{length:e.target.value})}/></td><td><select aria-label={`Index order ${i+1}`} disabled={busy} value={item.order} onChange={e=>update(i,{order:e.target.value})}><option value="">Default</option><option>ASC</option><option>DESC</option></select></td><td><button type="button" aria-label={`Remove index column ${i+1}`} disabled={busy||items.length===1} onClick={()=>setItems(old=>old.filter((_,n)=>n!==i))}>−</button><button type="button" aria-label={`Move index column ${i+1} up`} disabled={busy||i===0} onClick={()=>setItems(old=>{const next=[...old];[next[i-1],next[i]]=[next[i],next[i-1]];return next;})}>↑</button></td></tr>)}</tbody></table>
 <button type="button" disabled={busy||items.length>=columns.length} onClick={()=>setItems(old=>[...old,{column:columns.find(c=>!old.some(i=>i.column===c))??columns[0],length:'',order:''}])}>Add index column</button>
 <label>Storage<select aria-label="Index storage" disabled={busy||type==='SPATIAL'} value={storage} onChange={e=>setStorage(e.target.value)}><option value="">Default</option><option>BTREE</option><option>HASH</option></select></label>
 <div className="structure-sheet-actions"><button type="button" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" disabled={busy||!items.length||items.some(i=>!i.column)}>Add index</button></div>
 </form></SADialog>;
}
