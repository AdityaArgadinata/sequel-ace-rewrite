import {useEffect, useId, useState, useLayoutEffect, useRef} from 'react';
import {Structure, PrepareSchemaChange, ApplySchemaChange} from '../wailsjs/go/main/App';
import {database} from '../wailsjs/go/models';
import ResultGrid from './ResultGrid';
import Splitter from './Splitter';
import SADialog, {SAErrorDialog} from './SADialog';
import SASchemaEditor from './SASchemaEditor';
import {workspaceShortcut} from './workspace-shortcuts';
import ToolbarIcon from './ToolbarIcon';
import {catalogRows, extras, fieldColumns, fieldsResult, fieldValues, lengthAllowed, numericType, stringType, typeGroups} from './structure-fields';
import {typeHelp} from './structure-type-help';
import {indexOrder, reorderColumns, structureWidths, indexWidths} from './structure-columns';

// Display labels match DBView.xib; metadata identifiers and values stay intact.
const columnLabels: Record<string, string> = {
    LENGTH:'Length', UNSIGNED:'Unsigned', ZEROFILL:'Zerofill', BINARY:'Binary', CARDINALITY:'Cardinality', PACKED:'Packed', COMMENT:'Comment',
    COLUMN_NAME:'Field', COLUMN_TYPE:'Type', IS_NULLABLE:'Allow Null',
    COLUMN_DEFAULT:'Default', COLUMN_KEY:'Key', EXTRA:'Extra',
    CHARACTER_SET_NAME:'Encoding', COLLATION_NAME:'Collation', COLUMN_COMMENT:'Comment',
    GENERATION_EXPRESSION:'Generation expression', INDEX_NAME:'Key_name',
    NON_UNIQUE:'Non_unique', SEQ_IN_INDEX:'Seq_in_index', COLLATION:'Collation',
    SUB_PART:'Sub_part', INDEX_TYPE:'Index type', NULLABLE:'Nullable',
};
const indexLabels = {...columnLabels, COLUMN_NAME:'Column_name'};

import SAStructureIndex from './SAStructureIndex';
import {autoIncrementAllowed,changedField,newFieldValues} from './structure-row';

type Props = {serverVersion?:string;initialSection?:'columns'|'foreignKeys';tab:string;databaseName:string;table:string;busy:boolean;onSchemaChanged:()=>void;onLeaveGuard?:(guard:(()=>Promise<boolean>)|null)=>void;operation:(work:()=>Promise<void>,mayWrite?:boolean)=>Promise<void>};
type Draft={row:number;edits:Record<string,string>;isNew?:boolean;base?:Record<string,string>;definition?:string};
export default function StructureView({initialSection,tab,databaseName,table,busy,operation,onSchemaChanged,onLeaveGuard,serverVersion=''}:Props){
 const [structure,setStructureState]=useState<database.Structure|null>(null),[section,setSection]=useState<'columns'|'foreignKeys'|'definition'>(initialSection??'columns');
 const [height,setHeight]=useState(60),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [selectedColumn,setSelectedColumn]=useState(-1),[selectedIndex,setSelectedIndex]=useState(-1),[selectedFK,setSelectedFK]=useState(-1);
 const [editor,setEditor]=useState<{kind:'column'|'index'|'foreignKey';action:'add'|'edit'|'drop';object?:database.SASchemaObject;proposedName?:string}|null>(null);
 const [draft,setDraftState]=useState<Draft|null>(null),draftRef=useRef<Draft|null>(null);
 const [editingCell,setEditingCell]=useState<{row:number;column:number}|null>(null),[focus,setFocus]=useState<{row:number;column:number;id:number}|null>(null);
 const [help,setHelp]=useState<{row:number;x:number;y:number}|null>(null);
 const [failure,setFailure]=useState<{title:string;message:string;sql:string}|null>(null);
 const [drop,setDrop]=useState<{kind:'column'|'index';object:database.SASchemaObject;foreignKeys:string[]}|null>(null),[indexSheet,setIndexSheet]=useState(false);
 const [keySheet,setKeySheet]=useState<{row:number;kind:string}|null>(null),[dragOver,setDragOver]=useState(-1);
 const root=useRef<HTMLElement>(null),saving=useRef(false),dragRow=useRef<number|null>(null),columnsID=useId();
 const latestStructure=useRef<database.Structure|null>(null);
 function setStructure(value:database.Structure|null){latestStructure.current=value;setStructureState(value);}
 const objects=structure?.objects??[];
 const encodings=catalogRows(structure?.charsets),collations=catalogRows(structure?.collations);
 function setDraft(value:Draft|null){draftRef.current=value;setDraftState(value);}
 function sourceRow(row:number){return row-(draft?.isNew&&row>draft.row?1:0);}
 function valuesAt(row:number){return draft?.isNew&&row===draft.row?draft.base!:fieldValues(structure!.columns,sourceRow(row));}
 function objectAt(kind:'column'|'index'|'foreignKey',row:number){
  if(kind==='column'&&draft?.isNew&&row===draft.row)return;
  const grid=kind==='column'?structure?.columns:kind==='index'?structure?.indexes:structure?.foreignKeys;
  const key=kind==='column'?'COLUMN_NAME':kind==='index'?'INDEX_NAME':'CONSTRAINT_NAME';
  const name=grid?.rows[kind==='column'?sourceRow(row):row]?.[grid.columns.findIndex(c=>c.name===key)]?.value;
  return objects.find(o=>o.kind===kind&&o.name===name);
 }
 function focusCell(row:number,column:number){setSelectedColumn(row);setEditingCell({row,column});setFocus({row,column,id:Date.now()});}
 useLayoutEffect(()=>{if(!focus||busy)return;const control=root.current?.querySelector<HTMLInputElement|HTMLSelectElement>(`[data-schema-cell="${focus.row}:${focus.column}"] input:not(:disabled),[data-schema-cell="${focus.row}:${focus.column}"] select:not(:disabled)`);control?.focus();if(control instanceof HTMLInputElement&&control.type!=='checkbox')control.select();},[focus,busy]);
 function cancelDraft(){const current=draftRef.current;setDraft(null);setFailure(null);setKeySheet(null);setEditingCell(null);setHelp(null);if(current?.isNew)setSelectedColumn(Math.min(current.row-1,(structure?.columns.rows.length??0)-1));queueMicrotask(()=>root.current?.querySelector<HTMLElement>('.structure-columns .results')?.focus());}
 function editField(row:number,changes:Record<string,string>){
  if(busy||saving.current||editor||drop||indexSheet||!structure?.editable)return;
  const current=draftRef.current;if(current&&current.row!==row)return;
  const original=valuesAt(row),edits={...current?.edits,...changedField({...original,...current?.edits},changes,serverVersion)};
  if(edits.extra && edits.extra!=='auto_increment')delete edits.autoIndex;
  if(!current?.isNew)for(const key of Object.keys(edits))if(edits[key]===original[key])delete edits[key];
  setDraft(!current?.isNew&&!Object.keys(edits).length?null:{...current,row,edits});setSelectedColumn(row);setError(changes.type&&!autoIncrementAllowed(changes.type,serverVersion)&&['auto_increment','SERIAL DEFAULT VALUE'].includes(original.extra)?'AUTO_INCREMENT requires an integer field type on MySQL 8.4 or later.':'');setNotice('');
 }
 async function execute(request:Partial<database.SASchemaChange>,retainDraft=false):Promise<boolean>{
  if(saving.current)return false;saving.current=true;let success=false,sql='',applied=false;
  setHelp(null);setEditingCell(null);
  await operation(async()=>{try{
   const plan=await PrepareSchemaChange(tab,new database.SASchemaChange({database:databaseName,table,...request}));sql=plan.sql;
   const warnings=await ApplySchemaChange(tab,plan.token);applied=true;setDraft(null);setDrop(null);setIndexSheet(false);setEditor(null);setSelectedIndex(-1);setSelectedFK(-1);
   setNotice(warnings||'');onSchemaChanged();
   try{setStructure(await Structure(tab,databaseName,table));success=true;}catch(e){setStructure(null);throw new Error(`Schema change was applied, but metadata reload failed. Reload structure before another change. ${String(e)}`);}
  }catch(e){
   if(String(e).includes('schema change was acknowledged')){applied=true;setDraft(null);setStructure(null);setDrop(null);setIndexSheet(false);setEditor(null);onSchemaChanged();setError(String(e)+' Reload structure before another change.');}
   else if(retainDraft&&!applied)setFailure({title:request.action==='add'?'Error adding field':'Error changing field',message:String(e),sql});
   else setError(String(e));throw e;
  }finally{if(!applied)onSchemaChanged();}},true);
  saving.current=false;return success;
 }
 async function saveDraft():Promise<boolean>{
  const current=draftRef.current;if(!current)return !saving.current;if(failure||keySheet||saving.current||!structure)return false;
  const original=objectAt('column',current.row);const {name,autoIndex,...edits}=current.edits;
  const request:Partial<database.SASchemaChange>={kind:'column',action:current.isNew?'add':'edit',original:original?.name??'',name:name??current.base?.name??original?.name??'',definition:current.definition??'',columnEdits:edits};
  if(current.isNew){const previous=structure.columns.rows[current.row-1];request.first=current.row===0;request.after=previous?.[structure.columns.columns.findIndex(c=>c.name==='COLUMN_NAME')]?.value??'';}
  if(autoIndex)request.autoIndex=autoIndex;
  const ok=await execute(request,true);if(ok)setSelectedColumn(current.row);return ok;
 }
 useLayoutEffect(()=>{onLeaveGuard?.(async()=>!editor&&!drop&&!indexSheet&&!keySheet&&!failure&&!error&&await saveDraft());return()=>onLeaveGuard?.(null);});
 async function deselectColumn(){if(!await saveDraft())return false;setSelectedColumn(-1);setEditingCell(null);return true;}
 async function selectColumn(row:number){if(draftRef.current&&draftRef.current.row!==row&&!await saveDraft())return;setSelectedColumn(row);}
 async function addField(duplicate=false,atEnd=false){
  const selected=objectAt('column',selectedColumn);
  const copiedName=draftRef.current?.row===selectedColumn ? draftRef.current.edits.name??selected?.name : selected?.name;
  if(!structure?.editable||busy||editor||drop||indexSheet||!await saveDraft())return;
  const latest=latestStructure.current!;
  const copied=duplicate?latest.objects.find(o=>o.kind==='column'&&o.name===copiedName):undefined;
  const copyRow=latest.columns.rows.findIndex(row=>row[latest.columns.columns.findIndex(c=>c.name==='COLUMN_NAME')]?.value===copiedName);
  const source=duplicate&&copied?fieldValues(latest.columns,copyRow):null;
  const row=duplicate||atEnd||selectedColumn<0?latest.columns.rows.length:selectedColumn+1;
  const base=source?{...source,name:Array.from(source.name).slice(0,60).join('')+'Copy',key:'',extra:'None'}:newFieldValues();
  const {name,key,binary,...attrs}=base;
  setDraft({row,isNew:true,base,definition:copied?.definition??'INT NULL',edits:source?{name,extra:'None'}:{name,...attrs}});
  focusCell(row,0);
 }
 async function open(kind:'column'|'index'|'foreignKey',action:'add'|'edit'|'drop',row:number){
  let object=objectAt(kind,row);const chosenName=kind==='column'&&draftRef.current?.row===row?draftRef.current.edits.name??object?.name:object?.name;
  if(!structure?.editable||busy||editor||(action!=='add'&&!object)||!await saveDraft())return;
  if(object)object=latestStructure.current?.objects.find(o=>o.kind===kind&&o.name===chosenName);
  if(action==='drop'&&(kind==='column'||kind==='index')){const keys=kind==='column'&&latestStructure.current?catalogRows(latestStructure.current.foreignKeys).filter(f=>f.COLUMN_NAME===object!.name).map(f=>f.CONSTRAINT_NAME):[];setDrop({kind,object:object!,foreignKeys:[...new Set(keys)]});return;}
  if(kind==='column'&&action==='add'){void addField();return;}
  if(kind==='index'&&action==='add'){setIndexSheet(true);return;}
  setEditor({kind,action,object});
 }
 async function apply(token:string){await operation(async()=>{try{const warning=await ApplySchemaChange(tab,token);setEditor(null);setDraft(null);setNotice(warning||'');setStructure(null);try{setStructure(await Structure(tab,databaseName,table));}catch(e){throw new Error(`Schema change was applied, but metadata reload failed. Reload structure before another change. ${String(e)}`);}}catch(e){setError(String(e));throw e;}finally{onSchemaChanged();}},true);}
 async function load(){if(!await saveDraft())return;setHelp(null);setError('');await operation(async()=>{try{setStructure(await Structure(tab,databaseName,table));}catch(e){setError(String(e));throw e;}});}
 useEffect(()=>{void load();},[]);
 function actions(kind:'column'|'index'|'foreignKey',row:number){
  const label=kind==='foreignKey'?'foreign key':kind;const disabled=busy||!!editor||!!drop||indexSheet||!!keySheet||!!failure||!structure?.editable;
  return <div className="schema-actions">
   <button disabled={disabled} title={`Add ${label}`} aria-label={`Add ${label}`} onClick={()=>void(kind==='column'?addField():open(kind,'add',row))}><ToolbarIcon name="add"/></button>
   <button disabled={disabled||!objectAt(kind,row)||(kind==='column'&&structure?.columns.rows.length===1)} title={`Drop ${label}`} aria-label={`Drop ${label}`} onClick={()=>void open(kind,'drop',row)}><ToolbarIcon name="remove"/></button>
   {kind==='column'&&<button disabled={disabled||!objectAt(kind,row)} title="Duplicate column" aria-label="Duplicate column" onClick={()=>void addField(true)}><ToolbarIcon name="duplicate"/></button>}
   <button disabled={busy||!!editor||!!drop||indexSheet||!!keySheet||!!failure} title="Reload structure" aria-label={kind==='column'?'Reload structure':`Reload ${label}s`} onClick={()=>void load()}><ToolbarIcon name="refresh"/></button>
   <span/>
   <details className="schema-options"><summary aria-label={`${label} options`} title={`${label} options`}><ToolbarIcon name="settings"/></summary><div className="schema-options-menu"><button disabled={disabled||!objectAt(kind,row)} aria-label={`Edit ${label}`} onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');void open(kind,'edit',row);}}>Edit {label} SQL…</button>{kind==='column'&&<button disabled={disabled} onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');void saveDraft().then(ok=>{if(ok)setEditor({kind:'column',action:'add'});});}}>Add column SQL…</button>}</div></details>
   {kind==='column'&&<details className="schema-options"><summary aria-label="More structure options" title="More structure options"><ToolbarIcon name="more"/>⌄</summary><div className="schema-options-menu"><div className="structure-sections" role="group" aria-label="Structure sections">{(['columns','foreignKeys','definition'] as const).map((name,i)=><button key={name} disabled={disabled} aria-pressed={section===name} onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');void(async()=>{if(await saveDraft())setSection(name);})();}}>{['Columns & Indexes','Foreign keys','CREATE statement'][i]}</button>)}</div></div></details>}
  </div>;
 }
 function keyDown(event:React.KeyboardEvent){
  if(event.nativeEvent.isComposing||event.repeat)return;
  const cell=(event.target as HTMLElement).closest<HTMLElement>('[data-schema-cell]');
  if(event.key==='Escape'&&draftRef.current&&!busy&&!failure&&!keySheet){event.preventDefault();event.stopPropagation();cancelDraft();return;}
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void saveDraft();return;}
  if(!cell)return;
  const [row,column]=cell.dataset.schemaCell!.split(':').map(Number);
  if(event.key==='Enter'&&event.target instanceof HTMLInputElement&&event.target.type!=='checkbox'){
   event.preventDefault();event.stopPropagation();if(event.target.readOnly)focusCell(row,column);else{setEditingCell(null);void saveDraft().then(ok=>{if(ok)root.current?.querySelector<HTMLElement>('.structure-columns .results')?.focus();});}return;
  }
  if(event.key==='Tab'){
   event.preventDefault();event.stopPropagation();
   const controls=Array.from(root.current?.querySelectorAll<HTMLElement>(`[data-schema-cell^="${row}:"] input:not(:disabled),[data-schema-cell^="${row}:"] select:not(:disabled)`)??[]);
   const at=controls.indexOf(event.target as HTMLElement),next=controls[at+(event.shiftKey?-1:1)];
   if(next){const [r,c]=next.closest<HTMLElement>('[data-schema-cell]')!.dataset.schemaCell!.split(':').map(Number);focusCell(r,c);}
   else {const count=(structure?.columns.rows.length??0)+(draftRef.current?.isNew?1:0);void saveDraft().then(ok=>{if(!ok)return;const nextRow=(row+(event.shiftKey?-1:1)+count)%count;focusCell(nextRow,event.shiftKey?12:0);});}
  }
 }
    function renderField(row:number,column:number){
        if(!structure)return;
        const original=valuesAt(row);
        const values={...original,...(draft?.row===row ? draft.edits : {})};
        const key=['name','type','length','unsigned','zerofill','binary','nullable','key','default','extra','encoding','collation','comment'][column];
        const disabled=busy || !!editor || !!drop || !!indexSheet || !!keySheet || !structure.editable;
        const generated=/GENERATED/i.test(original.extra);
        const label=columnLabels[fieldColumns[column]];
        const aria=`${label} for ${original.name}`;
        const change=(value:string)=>editField(row,{[key]:value});
        const options=collations.filter(c=>c.Charset===values.encoding);
        const otherAuto=structure.columns.rows.some((_,i)=>(draft?.isNew&&draft.row===row||i!==sourceRow(row))&&fieldValues(structure.columns,i).extra==='auto_increment');
        const availableExtras=extras.filter(extra=>(extra!=='auto_increment'||!otherAuto||values.extra==='auto_increment')&&(!['auto_increment','SERIAL DEFAULT VALUE'].includes(extra)||autoIncrementAllowed(values.type,serverVersion)));
        if(key==='key')return values.key;
        if(['unsigned','zerofill','binary','nullable'].includes(key)){
            const binary=options.find(c=>c.Collation.endsWith('_bin'));
            const unavailable=key==='nullable' ? values.key==='PRI' || values.extra==='auto_increment' : key==='binary' ? !stringType(values.type) || ['ENUM','SET'].includes(values.type) || !binary : !numericType(values.type);
            return <input aria-label={aria} type="checkbox" disabled={disabled || unavailable} checked={key==='binary' ? values.collation.endsWith('_bin') : values[key]==='true'} onChange={event=>{
                if(key==='binary'){const collation=event.target.checked ? binary?.Collation : encodings.find(c=>c.Charset===values.encoding)?.['Default collation'];if(collation)editField(row,{collation});}
                else editField(row,{[key]:String(event.target.checked),...(key==='zerofill' && event.target.checked ? {unsigned:'true'} : {}),...(key==='unsigned' && !event.target.checked ? {zerofill:'false'} : {}),...(key==='nullable' && !event.target.checked && values.default==='NULL' ? {default:''} : {})});
            }}/>;
        }
        if(key==='type')return <select aria-label={aria} title={typeHelp[values.type] ?? values.type} disabled={disabled} value={values.type} onFocus={event=>{const rect=event.currentTarget.getBoundingClientRect();setHelp({row,x:Math.min(rect.right+12,window.innerWidth-350),y:Math.min(rect.bottom,window.innerHeight-200)});}} onBlur={()=>setHelp(null)} onChange={event=>{
            const type=event.target.value;editField(row,{type,...(!lengthAllowed(type)?{length:''}:{}),...(!numericType(type)?{unsigned:'false',zerofill:'false'}:{}),...(!stringType(type)?{encoding:'',collation:''}:{})});
        }}>
            {!typeGroups.flat().includes(values.type) && <option>{values.type}</option>}
            {typeGroups.map((group,i)=><optgroup key={i} label={['Numeric','String','Date & Time','Spatial','Network'][i]}>{group.map(type=><option key={type}>{type}</option>)}</optgroup>)}
        </select>;
        if(key==='extra')return <select aria-label={aria} disabled={disabled || generated} value={values.extra} onChange={e=>{const extra=e.target.value;change(extra);if(extra==='auto_increment' && !values.key)setKeySheet({row,kind:objects.some(o=>o.kind==='index'&&o.name==='PRIMARY')?'INDEX':'PRIMARY'});}}>
            {!availableExtras.includes(values.extra) && <option>{values.extra}</option>}{availableExtras.map(extra=><option key={extra}>{extra}</option>)}
        </select>;
        if(key==='encoding')return <select aria-label={aria} disabled={disabled || !stringType(values.type) || !encodings.length} value={values.encoding} onChange={e=>{const encoding=e.target.value;editField(row,{encoding,collation:encodings.find(c=>c.Charset===encoding)?.['Default collation'] ?? ''});}}>
            <option value=""/>{!encodings.some(c=>c.Charset===values.encoding) && values.encoding && <option>{values.encoding}</option>}
            {encodings.map(c=><option key={c.Charset} value={c.Charset}>{c.Description ? `${c.Description} (${c.Charset})` : c.Charset}</option>)}
        </select>;
        if(key==='collation')return <select aria-label={aria} disabled={disabled || !stringType(values.type) || values.collation.endsWith('_bin') || !options.length} value={values.collation} onChange={e=>change(e.target.value)}>
            <option value=""/>{!options.some(c=>c.Collation===values.collation) && values.collation && <option>{values.collation}</option>}
            {options.map(c=><option key={c.Collation} value={c.Collation}>{c.Collation}{c.Default==='Yes' ? ' (Default)' : ''}</option>)}
        </select>;
        const unavailable=key==='length' ? !lengthAllowed(values.type) : key==='default' ? generated : false;
        return <input draggable={key==='name' && !draft && editingCell?.row!==row} aria-label={aria} value={values[key]} title={values[key]} disabled={disabled || unavailable} onChange={e=>change(e.target.value)} readOnly={editingCell?.row!==row || editingCell.column!==column} onDoubleClick={()=>focusCell(row,column)} />;
    }
 async function moveField(from:number,to:number){
  const object=objectAt('column',from),after=to>0?objectAt('column',to-1)?.name:undefined;
  if(!object||from===to||from+1===to||!await saveDraft())return;
  if(await execute({kind:'column',action:'edit',original:object.name,name:object.name,columnEdits:{},first:to===0,after:after??''}))setSelectedColumn(to-(from<to?1:0));
 }
 const displayed=structure?fieldsResult(structure.columns):null;
 if(displayed&&draft?.isNew){const v={...draft.base,...draft.edits};displayed.rows.splice(draft.row,0,['name','type','length','unsigned','zerofill','binary','nullable','key','default','extra','encoding','collation','comment'].map(key=>({value:v[key]??'',null:false,binary:false}) as database.Cell));}
 const modal=!!editor||!!drop||indexSheet||!!failure||!!keySheet;
 return <section ref={root} className="query-workspace structure-workspace" aria-label="Table structure" onKeyDown={event=>{if(workspaceShortcut(event.nativeEvent,/Mac/.test(navigator.platform))==='refresh'){event.preventDefault();if(!busy&&!modal)void load();}}}>
  {section!=='columns'&&<div className="query-heading"><strong>{section==='definition'?'CREATE statement':'Foreign keys'}</strong><button disabled={busy||modal} onClick={()=>setSection('columns')}>Columns & Indexes</button></div>}
  {editor&&<SASchemaEditor key={`${editor.kind}:${editor.action}:${editor.object?.name??''}`} {...editor} tab={tab} databaseName={databaseName} table={table} busy={busy} operation={operation} onApply={apply} onCancel={()=>setEditor(null)}/>}
  {indexSheet&&structure&&<SAStructureIndex columns={objects.filter(o=>o.kind==='column').map(o=>o.name)} hasPrimary={objects.some(o=>o.kind==='index'&&o.name==='PRIMARY')} busy={busy} onCancel={()=>setIndexSheet(false)} onSave={async request=>{await execute(request);}}/>}
  {drop&&<SADialog title={`Delete ${drop.kind==='column'?'field':'index'} “${drop.object.name}”?`} busy={busy} onCancel={()=>setDrop(null)}><p>{drop.kind==='column'?'This field and its data will be deleted.':'This index will be deleted.'} This action cannot be undone.</p>{!!drop.foreignKeys.length&&<p>Related foreign keys will also be deleted: {drop.foreignKeys.join(', ')}.</p>}<button className="danger" disabled={busy} onClick={()=>void execute({kind:drop.kind,action:'drop',original:drop.object.name,dropForeignKeys:drop.foreignKeys})}>Delete</button><button data-dialog-focus autoFocus disabled={busy} onClick={()=>setDrop(null)}>Cancel</button></SADialog>}
  {failure&&<SADialog title={failure.title} onCancel={cancelDraft}><div role="alert"><p>MySQL said:</p><p className="insert-error-message">{failure.message.replace(/^Error:\s*/,'')}</p>{failure.sql&&<details><summary>SQL</summary><pre>{failure.sql}</pre></details>}</div><button className="primary" data-dialog-focus autoFocus onClick={()=>{setFailure(null);if(draft)focusCell(draft.row,0);}}>Edit row</button><button onClick={cancelDraft}>Discard changes</button></SADialog>}
  {keySheet&&<SADialog title="Choose an index" onCancel={()=>{editField(keySheet.row,{extra:'None'});setKeySheet(null);}}><p>An AUTO_INCREMENT field must be indexed.</p><select aria-label="AUTO_INCREMENT index type" value={keySheet.kind} onChange={e=>setKeySheet({...keySheet,kind:e.target.value})}>{['PRIMARY','INDEX','UNIQUE'].filter(k=>k!=='PRIMARY'||!objects.some(o=>o.kind==='index'&&o.name==='PRIMARY')).map(k=><option key={k}>{k}</option>)}</select><button className="primary" data-dialog-focus onClick={()=>{editField(keySheet.row,{autoIndex:keySheet.kind,...(keySheet.kind==='PRIMARY'?{unsigned:'true'}:{})});setKeySheet(null);}}>Choose index</button><button onClick={()=>{editField(keySheet.row,{extra:'None'});setKeySheet(null);}}>Cancel</button></SADialog>}
  {structure?.reason&&<p className="notice">{structure.reason}</p>}
  {error&&<SAErrorDialog title="Unable to change structure" message={error} onClose={()=>setError('')}/>}
  {section==='columns'?<div className="structure-stack"><div id={columnsID} className="structure-columns" style={{flexBasis:`${height}%`}} onKeyDownCapture={keyDown}
   onPointerDownCapture={event=>{const cell=(event.target as HTMLElement).closest<HTMLElement>('[data-schema-cell]');if(!cell)return;const [row,column]=cell.dataset.schemaCell!.split(':').map(Number);if(draftRef.current&&draftRef.current.row!==row){event.preventDefault();event.stopPropagation();void selectColumn(row).then(()=>{if(!draftRef.current)focusCell(row,column);});}else setSelectedColumn(row);}}
   onDragStart={event=>{const cell=(event.target as HTMLElement).closest<HTMLElement>('[data-schema-cell]');if(!cell||busy||modal||draft){event.preventDefault();return;}dragRow.current=Number(cell.dataset.schemaCell!.split(':')[0]);event.dataTransfer.setData('application/x-sequelx-schema-row',String(dragRow.current));event.dataTransfer.effectAllowed='move';}}
   onDragOver={event=>{if(dragRow.current===null)return;event.preventDefault();const tr=(event.target as HTMLElement).closest('tbody tr');const rows=Array.from(root.current?.querySelectorAll('.structure-columns tbody tr')??[]);setDragOver(tr?rows.indexOf(tr)+(event.clientY>tr.getBoundingClientRect().top+tr.getBoundingClientRect().height/2?1:0):rows.length);}}
   onDrop={event=>{event.preventDefault();const from=dragRow.current,tr=(event.target as HTMLElement).closest('tbody tr'),rows=Array.from(root.current?.querySelectorAll('.structure-columns tbody tr')??[]),to=tr?rows.indexOf(tr)+(event.clientY>tr.getBoundingClientRect().top+tr.getBoundingClientRect().height/2?1:0):rows.length;dragRow.current=null;setDragOver(-1);if(from!==null&&to>=0)void moveField(from,to);}} onDragEnd={()=>{dragRow.current=null;setDragOver(-1);}}>
   <ResultGrid result={displayed} busy={busy||modal} selected={selectedColumn} onSelect={row=>void selectColumn(row)} columnLabels={columnLabels} initialWidths={structureWidths} renderCell={(row,column)=><span className={`schema-cell ${dragOver===row?'schema-drop-before':''}`} data-schema-cell={`${row}:${column}`} draggable={column===0&&!draft&&!!structure?.editable&&!busy} onDoubleClick={()=>{if(column===7)return;focusCell(row,column);}}>{renderField(row,column)}</span>} onEmptyClick={deselectColumn} onEmptyDoubleClick={()=>void addField(false,true)} emptyMessage="No structure available."/>
   {actions('column',selectedColumn)}
  </div><Splitter label="Columns panel height" controls={columnsID} axis="y" value={height} min={25} max={80} onChange={setHeight}/><div className="structure-indexes"><div className="query-heading"><strong>INDEXES</strong></div><ResultGrid result={structure?reorderColumns({...structure.indexes,columns:structure.indexes.columns.filter(c=>indexOrder.includes(c.name)),rows:structure.indexes.rows.map(row=>row.filter((_,i)=>indexOrder.includes(structure.indexes.columns[i].name)))} as database.Result,indexOrder):null} busy={busy||modal} selected={selectedIndex} onSelect={setSelectedIndex} onEditCell={row=>void open('index','edit',row)} onEmptyDoubleClick={()=>void open('index','add',-1)} columnLabels={indexLabels} initialWidths={indexWidths} emptyMessage="No indexes available."/>{actions('index',selectedIndex)}</div></div>:section==='definition'?<pre className="create-statement" tabIndex={0} aria-label="CREATE statement">{structure?.definition.rows[0]?.[1]?.value??'No definition available.'}</pre>:<><ResultGrid result={structure?.foreignKeys??null} busy={busy||modal} selected={selectedFK} onSelect={setSelectedFK} onEditCell={row=>void open('foreignKey','edit',row)}/>{actions('foreignKey',selectedFK)}</>}
  {(notice||draft)&&<p role="status" className="schema-notice">{notice||'Editing field · Enter to save · Esc to cancel'}</p>}
  {help&&structure&&<aside className="structure-type-info" style={{left:help.x,top:help.y}} role="tooltip"><header>Type Info</header><strong>{({...valuesAt(help.row),...(draft?.row===help.row?draft.edits:{})}).type}</strong><p>{typeHelp[({...valuesAt(help.row),...(draft?.row===help.row?draft.edits:{})}).type]??'The server validates this column type and its attributes.'}</p></aside>}
 </section>;
}
