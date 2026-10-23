import {useState} from 'react';
import {PrepareSchemaChange} from '../wailsjs/go/main/App';
import {database} from '../wailsjs/go/models';

type Props={tab:string;databaseName:string;table:string;kind:'column'|'index'|'foreignKey';action:'add'|'edit'|'drop';object?:database.SASchemaObject;busy:boolean;operation:(work:()=>Promise<void>,mayWrite?:boolean)=>Promise<void>;onApply:(token:string)=>Promise<void>;onCancel:()=>void};
export default function SASchemaEditor({tab,databaseName,table,kind,action,object,busy,operation,onApply,onCancel}:Props) {
 const proposed=object ? Array.from(object.name).slice(0,57).join('')+'_edited' : '';
 const [name,setName]=useState(object ? kind==='foreignKey' && action==='edit' ? proposed===object.name ? proposed.slice(0,-1)+'2' : proposed : object.name : '');
 const [indexKind,setIndexKind]=useState(object?.indexKind || 'INDEX');
 const [definition,setDefinition]=useState(object?.definition ?? (kind==='column' ? 'VARCHAR(255) NULL' : kind==='index' ? '(`column_name`)' : '(`column_name`) REFERENCES `parent_table` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT'));
 const [plan,setPlan]=useState<database.SASchemaPlan|null>(null),[error,setError]=useState(''),[ack,setAck]=useState(false);
 const label=kind==='column' ? 'column' : kind==='index' ? 'index' : 'foreign key';
 const title=`${action==='add' ? 'Add' : action==='edit' ? 'Edit' : 'Drop'} ${label}`;
 function changed(){setPlan(null);setAck(false);setError('');}
 async function prepare(){
  setPlan(null);setAck(false);setError('');
  await operation(async()=>{try{setPlan(await PrepareSchemaChange(tab,new database.SASchemaChange({database:databaseName,table,kind,action,original:object?.name ?? '',name,indexKind,definition})));}catch(e){setError(String(e));throw e;}});
 }
 return <form className="schema-editor" aria-label={title} onSubmit={e=>{e.preventDefault();void prepare();}}>
  <div className="schema-editor-heading"><strong>{title} · {databaseName}.{table}</strong><button type="button" disabled={busy} onClick={onCancel}>Cancel schema change</button></div>
  <p>Review the SQL before applying. Schema changes can lock or rebuild the table, discard data and implicitly commit. Rollback cannot undo DDL. No automatic retry.</p>
  {action==='drop' ? <p>Drop <strong>{object?.name}</strong> from this table. Removing a column also removes its data; the server enforces dependent constraints.</p> : <>
   <div className="schema-editor-fields">
    {kind==='index' && <label>Index type<select aria-label="Index type" disabled={busy} value={indexKind} onChange={e=>{changed();setIndexKind(e.target.value);if(e.target.value==='PRIMARY')setName('PRIMARY');else if(name==='PRIMARY')setName('');}}>{['INDEX','UNIQUE','PRIMARY','FULLTEXT','SPATIAL'].map(type=><option key={type}>{type}</option>)}</select></label>}
    <label>Name<input aria-label="Schema object name" autoFocus maxLength={64} disabled={busy || (kind==='index' && indexKind==='PRIMARY')} required value={name} onChange={e=>{changed();setName(e.target.value);}}/></label>
   </div>
   <label>{kind==='column' ? 'Type and attributes (SQL)' : kind==='index' ? 'Columns and index options (SQL)' : 'Columns, reference and actions (SQL)'}<textarea aria-label="Schema definition" disabled={busy} required value={definition} onChange={e=>{changed();setDefinition(e.target.value);}} spellCheck={false}/></label>
   <p>{kind==='column' ? "Keep all attributes when editing: type/length, NULL or NOT NULL, DEFAULT, AUTO_INCREMENT, CHARACTER SET/COLLATE, COMMENT, generated expression, FIRST/AFTER. Text defaults use SQL quotes." : kind==='index' ? 'Use an ordered column list, optional prefix lengths/directions and USING/COMMENT options. Example: (`name`(20), `id`) USING BTREE.' : 'Use local columns, REFERENCES database/table and matching referenced columns, with ON DELETE/ON UPDATE actions. Example: (`parent_id`) REFERENCES `parent` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT.'}</p>
   <p>One definition only; SQL comments and statement separators outside quoted text are not accepted. The server validates supported attributes and dependencies.</p>
  </>}
  {kind==='foreignKey' && action==='edit' && <p>Use a new constraint name for replacement. This supports MySQL 5.7 without disabling foreign key checks or issuing separate drop/add commands.</p>}
  {error && <p className="notice" role="alert">{error}</p>}
  <button type="submit" disabled={busy || (action!=='drop' && (!name.trim() || !definition.trim()))}>Preview schema SQL</button>
  {plan && <div className="schema-preview"><pre aria-label="Schema SQL preview">{plan.sql};</pre>
   <label><input type="checkbox" disabled={busy} checked={ack} onChange={e=>setAck(e.target.checked)}/>I reviewed this SQL and accept the schema/data changes.</label>
   <button type="button" className="primary" disabled={busy || !ack} onClick={()=>{const token=plan.token;setPlan(null);setAck(false);void onApply(token);}}>Apply schema change</button>
  </div>}
 </form>;
}
