import {useEffect,useRef,useState} from 'react';
import {OpenCellFile,SaveCellFile} from '../wailsjs/go/main/App';
import {database} from '../wailsjs/go/models';
import SADialog from './SADialog';
import {binaryColumn,cellText,editorCell,findCellText,hexBytes,hexPreview,imageType,jsonPreview,maxCellBytes,type CellValue} from './cell-editor';

type Props={name:string;type:string;value:CellValue;nullable:boolean;editable:boolean;busy:boolean;blocked?:boolean;newRow?:boolean;onSave?:(value:database.Cell)=>Promise<void>;onClose:()=>void};
export default function SACellEditor({name,type,value,nullable,editable,busy,blocked=false,newRow=false,onSave,onClose}:Props){
 const binary=value.binary||binaryColumn(type);
 const [mode,setMode]=useState<'text'|'hex'>(binary?'hex':'text');
 const [text,setText]=useState(()=>cellText(value,binary?'hex':'text'));
 const [isNull,setNull]=useState(value.null),[tab,setTab]=useState<'edit'|'preview'>('edit');
 const [query,setQuery]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pending,setPending]=useState(false);
 const [previewFormat,setPreviewFormat]=useState<'auto'|'text'|'json'|'hex'>('auto');
 const [preview,setPreview]=useState(''),[image,setImage]=useState('');
 const input=useRef<HTMLTextAreaElement>(null),search=useRef<HTMLInputElement>(null),ioPending=useRef(false);
 const locked=busy||pending;
 useEffect(()=>{if(tab==='edit'&&!locked){input.current?.focus();}},[tab,locked]);
 useEffect(()=>{
  if(tab!=='preview')return;
  let url='';setImage('');setPreview('');
  try{
   const cell=editorCell(text,mode,isNull,binary);
   if(cell.null){setPreview('NULL');return;}
   const mime=previewFormat==='auto'?imageType(cell):'';
   if(mime){url=URL.createObjectURL(new Blob([hexBytes(cell.value).buffer as ArrayBuffer],{type:mime}));setImage(url);}
   const decoded=previewFormat==='text'||previewFormat==='json'?cellText(cell,'text'):cell.value;
   const json=previewFormat==='json'||previewFormat==='auto'&&!cell.binary&&(type.toUpperCase()==='JSON'||/^[{\[]/.test(decoded.trimStart()));
   setPreview(previewFormat==='hex'||previewFormat==='auto'&&cell.binary?hexPreview(cell):json?jsonPreview(decoded):decoded.slice(0,64*1024)+(decoded.length>64*1024?'\n… Preview limited to 65,536 characters.':''));
  }catch(e){setPreview(String(e));}
  return()=>{if(url)URL.revokeObjectURL(url);};
 },[tab,text,mode,isNull,binary,type,previewFormat]);
 function switchMode(next:'text'|'hex'){
  if(next===mode)return;
  try{const converted=cellText(editorCell(text,mode,false,binary),next);editorCell(converted,next,false,binary);setText(converted);setMode(next);setError('');setNotice('');}
  catch(e){setError(String(e));}
 }
 function find(backward=false){
  const element=input.current;if(!element||!query)return;
  const index=findCellText(text,query,backward?element.selectionStart:element.selectionEnd,backward);
  if(index<0){setNotice('No matches.');return;}
  element.setSelectionRange(index,index+query.length);element.focus();setNotice(`Match at character ${index+1}.`);
 }
 async function save(){
  if(locked||ioPending.current||blocked||!editable||!onSave)return;
  try{const cell=editorCell(text,mode,isNull,binary);if(type.toUpperCase()==='JSON'&&!cell.null)JSON.parse(cellText(cell,'text'));setError('');await onSave(new database.Cell(cell));}
  catch(e){setError(String(e));}
 }
 async function transfer(importing:boolean){
  if(locked||ioPending.current)return;
  ioPending.current=true;setPending(true);setError('');setNotice('');
  try{
   if(importing){
    const file=await OpenCellFile(mode==='hex');
    if(!file.cancelled){setText(cellText(file.value,mode));setNull(false);setTab('edit');setNotice('File imported into the draft. The database has not been changed.');}
   }else{
    const saved=await SaveCellFile(new database.Cell(editorCell(text,mode,isNull,binary)));
    setNotice(saved?'Cell contents exported.':'Export cancelled.');
   }
  }catch(e){setError(String(e));}finally{ioPending.current=false;setPending(false);}
 }
 return <SADialog title={editable?'Edit cell contents':'Cell contents'} onCancel={onClose} busy={locked} wide>
  <div className="cell-detail" onKeyDown={event=>{
   if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='f'){event.preventDefault();setTab('edit');requestAnimationFrame(()=>search.current?.focus());}
   if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();void save();}
  }}>
   <p className="cell-detail-label"><strong>{name}</strong><span>{type} · {editable?'Editable':'Read-only'}</span></p>
   <div className="cell-detail-controls">
    <label>Representation<select aria-label="Cell representation" disabled={locked} value={mode} onChange={e=>switchMode(e.target.value as 'text'|'hex')}><option value="text">Text (UTF-8)</option><option value="hex">Hex (raw bytes)</option></select></label>
    <label><input type="checkbox" aria-label="Cell is NULL" checked={isNull} disabled={locked||!editable||!nullable} onChange={e=>{setNull(e.target.checked);setError('');}}/>NULL</label>
    <label>Preview format<select aria-label="Cell preview format" disabled={locked} value={previewFormat} onChange={e=>setPreviewFormat(e.target.value as typeof previewFormat)}><option value="auto">Automatic</option><option value="text">Text</option><option value="json">JSON</option><option value="hex">Hex</option></select></label>
    <button disabled={locked} aria-pressed={tab==='edit'} onClick={()=>setTab('edit')}>Editor</button><button disabled={locked} aria-pressed={tab==='preview'} onClick={()=>setTab('preview')}>Preview</button>
   </div>
   <div className="cell-detail-search"><input ref={search} type="search" aria-label="Find in cell" placeholder="Find in cell" value={query} disabled={locked||tab!=='edit'||isNull} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();find(e.shiftKey);}}}/><button disabled={locked||tab!=='edit'||!query||isNull} onClick={()=>find(true)}>Previous match</button><button disabled={locked||tab!=='edit'||!query||isNull} onClick={()=>find()}>Next match</button></div>
   {tab==='edit'?<textarea ref={input} aria-label="Cell contents value" className="cell-detail-value" spellCheck={false} maxLength={maxCellBytes} readOnly={!editable} disabled={locked||isNull} value={text} onChange={e=>{setText(e.target.value);setError('');setNotice('');}}/>:<div className="cell-detail-preview" aria-label="Cell preview">{image&&<img src={image} alt="Binary cell preview"/>}<pre>{preview}</pre></div>}
   <p className="cell-detail-help">{isNull?'NULL is different from an empty value.':`${text.length.toLocaleString()} characters · ${mode==='hex'?'0x followed by hex byte pairs':'UTF-8 text'}`} · Up to 4 MiB encoded data. Preview never changes the draft.</p>
   {blocked&&<p role="alert">The draft is preserved. Close this editor, reload and verify the server before another write.</p>}
   {error&&<p className="notice" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
   <div className="cell-detail-actions"><button disabled={locked||!editable||blocked} onClick={()=>void transfer(true)}>Import cell file</button><button disabled={locked||isNull} onClick={()=>void transfer(false)}>Export cell file</button><span/>{editable&&<button className="primary" disabled={locked||blocked} onClick={()=>void save()}>{newRow?'Apply to new row':'Save cell'}</button>}<button disabled={locked} onClick={onClose}>{editable?'Cancel':'Close'}</button></div>
  </div>
 </SADialog>;
}
