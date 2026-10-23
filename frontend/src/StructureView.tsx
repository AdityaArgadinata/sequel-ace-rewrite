import {useEffect, useId, useState} from 'react';
import {Structure, ApplySchemaChange} from '../wailsjs/go/main/App';
import {database} from '../wailsjs/go/models';
import ResultGrid from './ResultGrid';
import Splitter from './Splitter';
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

type Props = {initialSection?:'columns'|'foreignKeys';tab: string; databaseName: string; table: string; busy: boolean; onSchemaChanged: () => void; operation: (work: () => Promise<void>, mayWrite?: boolean) => Promise<void>};
export default function StructureView({initialSection,tab, databaseName, table, busy, operation, onSchemaChanged}: Props) {
    const [structure, setStructure] = useState<database.Structure | null>(null);
    const [section, setSection] = useState<'columns' | 'foreignKeys' | 'definition'>(initialSection ?? 'columns');
    const [height, setHeight] = useState(60);
    const columnsID = useId();
    const [error, setError] = useState('');
    const [notice,setNotice]=useState('');
    const [selectedColumn,setSelectedColumn]=useState(-1),[selectedIndex,setSelectedIndex]=useState(-1),[selectedFK,setSelectedFK]=useState(-1);
    const [editor,setEditor]=useState<{kind:'column'|'index'|'foreignKey';action:'add'|'edit'|'drop';object?:database.SASchemaObject;columnEdits?:Record<string,string>;proposedName?:string}|null>(null);
    const [draft,setDraft]=useState<{row:number;edits:Record<string,string>}|null>(null);
    const [help,setHelp]=useState<{row:number;x:number;y:number}|null>(null);
    const objects=structure?.objects ?? [];
    function objectAt(kind:'column'|'index'|'foreignKey',row:number){
        const grid=kind==='column' ? structure?.columns : kind==='index' ? structure?.indexes : structure?.foreignKeys;
        const key=kind==='column' ? 'COLUMN_NAME' : kind==='index' ? 'INDEX_NAME' : 'CONSTRAINT_NAME';
        const position=grid?.columns.findIndex(c=>c.name===key) ?? -1;
        const name=grid?.rows[row]?.[position]?.value;
        return objects.find(o=>o.kind===kind && o.name===name);
    }
    function open(kind:'column'|'index'|'foreignKey',action:'add'|'edit'|'drop',row:number){
        if (!structure?.editable || busy || editor) return;
        const object=objectAt(kind,row);if(action!=='add' && !object)return;
        setError('');setNotice('');setEditor({kind,action,object});
    }
    async function apply(token:string){
        await operation(async()=>{
            try {
                const warnings=await ApplySchemaChange(tab,token);
                setEditor(null);setDraft(null);setNotice(`Schema change acknowledged by the server.${warnings ? '\n'+warnings : ''}`);
                setSelectedColumn(-1);setSelectedIndex(-1);setSelectedFK(-1);
                setStructure(null);
                try {setStructure(await Structure(tab,databaseName,table));}catch(e){throw new Error(`Schema change was applied, but metadata reload failed. Reload structure before another change. ${String(e)}`);}
            }catch(e){setError(String(e));throw e;}finally{onSchemaChanged();}
        },true);
    }
    const encodings=catalogRows(structure?.charsets), collations=catalogRows(structure?.collations);
    function editField(row:number,changes:Record<string,string>){
        if(busy || editor || !structure?.editable || (draft && draft.row!==row))return;
        setDraft(current=>({row,edits:{...current?.edits,...changes}}));setSelectedColumn(row);setError('');setNotice('');
    }
    function review(){
        if(!draft || !structure || editor)return;
        const object=objectAt('column',draft.row);if(!object)return;
        const {name,...columnEdits}=draft.edits;
        setHelp(null);setEditor({kind:'column',action:'edit',object,columnEdits,proposedName:name ?? object.name});
    }
    function renderField(row:number,column:number){
        if(!structure)return;
        const original=fieldValues(structure.columns,row);
        const values={...original,...(draft?.row===row ? draft.edits : {})};
        const key=['name','type','length','unsigned','zerofill','binary','nullable','key','default','extra','encoding','collation','comment'][column];
        const disabled=busy || !!editor || !structure.editable || !!draft && draft.row!==row;
        const generated=/GENERATED/i.test(original.extra);
        const label=columnLabels[fieldColumns[column]];
        const aria=`${label} for ${original.name}`;
        const change=(value:string)=>editField(row,{[key]:value});
        const options=collations.filter(c=>c.Charset===values.encoding);
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
        if(key==='extra')return <select aria-label={aria} disabled={disabled || generated} value={values.extra} onChange={e=>{change(e.target.value);if(e.target.value==='auto_increment')editField(row,{extra:e.target.value,nullable:'false',...(values.default==='NULL' ? {default:''} : {})});}}>
            {!extras.includes(values.extra) && <option>{values.extra}</option>}{extras.map(extra=><option key={extra}>{extra}</option>)}
        </select>;
        if(key==='encoding')return <select aria-label={aria} disabled={disabled || !stringType(values.type) || !encodings.length} value={values.encoding} onChange={e=>{const encoding=e.target.value;editField(row,{encoding,collation:encodings.find(c=>c.Charset===encoding)?.['Default collation'] ?? ''});}}>
            <option value=""/>{!encodings.some(c=>c.Charset===values.encoding) && values.encoding && <option>{values.encoding}</option>}
            {encodings.map(c=><option key={c.Charset} value={c.Charset}>{c.Description ? `${c.Description} (${c.Charset})` : c.Charset}</option>)}
        </select>;
        if(key==='collation')return <select aria-label={aria} disabled={disabled || !stringType(values.type) || !options.length} value={values.collation} onChange={e=>change(e.target.value)}>
            <option value=""/>{!options.some(c=>c.Collation===values.collation) && values.collation && <option>{values.collation}</option>}
            {options.map(c=><option key={c.Collation} value={c.Collation}>{c.Collation}{c.Default==='Yes' ? ' (Default)' : ''}</option>)}
        </select>;
        const unavailable=key==='length' ? !lengthAllowed(values.type) : key==='default' ? generated || /(TEXT|BLOB)$/.test(values.type) || ['JSON',...typeGroups[3]].includes(values.type) : false;
        return <input aria-label={aria} value={values[key]} title={values[key]} disabled={disabled || unavailable} onChange={e=>change(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();review();}if(e.key==='Escape'){e.preventDefault();setDraft(null);}}}/>;
    }
    function actions(kind:'column'|'index'|'foreignKey',row:number){
        const label=kind==='column' ? 'column' : kind==='index' ? 'index' : 'foreign key';
        const disabled=busy || !!editor || !!draft || !structure?.editable;
        const icon=(name:'add'|'remove'|'duplicate'|'refresh'|'edit'|'settings'|'more')=><ToolbarIcon name={name}/>;
        return <div className="schema-actions">
            <button disabled={disabled} title={`Add ${label}`} aria-label={`Add ${label}`} onClick={()=>open(kind,'add',row)}>{icon('add')}</button>
            <button disabled={disabled || !objectAt(kind,row)} title={`Drop ${label}`} aria-label={`Drop ${label}`} onClick={()=>open(kind,'drop',row)}>{icon('remove')}</button>
            {kind==='column' && <button disabled={disabled || !objectAt(kind,row)} title="Duplicate column" aria-label="Duplicate column" onClick={()=>{const object=objectAt(kind,row);if(object)setEditor({kind,action:'add',object,proposedName:Array.from(object.name).slice(0,59).join('')+'_copy'});}}>{icon('duplicate')}</button>}
            <button disabled={busy || !!editor || !!draft} title="Reload structure" aria-label={kind==='column' ? 'Reload structure' : `Reload ${label}s`} onClick={()=>void load()}>{icon('refresh')}</button>
            {kind==='column' && draft && <><button className="schema-review" disabled={busy || !!editor} onClick={review}>Review column changes</button><button className="schema-review" disabled={busy || !!editor} onClick={()=>setDraft(null)}>Cancel column changes</button></>}
            <span/>
            <details className="schema-options"><summary aria-label={`${label} options`} title={`${label} options`}>{icon('settings')}</summary><div className="schema-options-menu">
                <button disabled={disabled || !objectAt(kind,row)} aria-label={`Edit ${label}`} onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');open(kind,'edit',row);}}>Edit {label} SQL…</button>
            </div></details>
            {kind==='column' && <details className="schema-options"><summary aria-label="More structure options" title="More structure options">{icon('more')}⌄</summary><div className="schema-options-menu"><div className="structure-sections" role="group" aria-label="Structure sections">{(['columns','foreignKeys','definition'] as const).map((name,i)=><button key={name} disabled={busy || !!editor || !!draft} aria-pressed={section===name} onClick={event=>{setSection(name);event.currentTarget.closest('details')?.removeAttribute('open');}}>{['Columns & Indexes','Foreign keys','CREATE statement'][i]}</button>)}</div></div></details>}
        </div>;
    }
    async function load() {
        setStructure(null); setDraft(null);setHelp(null); setError(''); setSelectedColumn(-1);setSelectedIndex(-1);setSelectedFK(-1);
        await operation(async () => {
            try { setStructure(await Structure(tab, databaseName, table)); }
            catch (e) { setError(String(e)); throw e; }
        });
    }
    useEffect(() => { void load(); }, []);
    const result = structure?.[section] ?? null;
    return <section className="query-workspace structure-workspace" aria-label="Table structure" onKeyDown={event => {
        if (workspaceShortcut(event.nativeEvent, /Mac/.test(navigator.platform)) !== 'refresh') return;
        event.preventDefault(); if (!busy && !editor && !draft) void load();
    }}>
        {section!=='columns' && <div className="query-heading"><strong>{section==='definition' ? 'CREATE statement' : 'Foreign keys'}</strong><button disabled={busy || !!editor} onClick={()=>setSection('columns')}>Columns & Indexes</button></div>}
        {editor && <SASchemaEditor key={`${editor.kind}:${editor.action}:${editor.object?.name ?? ''}`} {...editor} tab={tab} databaseName={databaseName} table={table} busy={busy} operation={operation} onApply={apply} onCancel={()=>setEditor(null)}/>}
                {structure?.reason && <p className="notice">{structure.reason}</p>}
        {error && <p role="alert" className="notice">{error}</p>}
        {section === 'columns' ? <div className="structure-stack">
            <div id={columnsID} className="structure-columns" style={{flexBasis:`${height}%`}}>
                <ResultGrid result={structure ? fieldsResult(structure.columns) : null} busy={busy || !!editor} selected={selectedColumn} onSelect={setSelectedColumn} onEditCell={row=>{if(!draft)open('column','edit',row);}} columnLabels={columnLabels} initialWidths={structureWidths} renderCell={renderField} emptyMessage="No structure available." />
                {actions('column',selectedColumn)}
            </div>
            <Splitter label="Columns panel height" controls={columnsID} axis="y" value={height} min={25} max={80} onChange={setHeight} />
            <div className="structure-indexes"><div className="query-heading"><strong>INDEXES</strong></div>
                <ResultGrid result={structure ? reorderColumns({...structure.indexes,columns:structure.indexes.columns.filter(c=>indexOrder.includes(c.name)),rows:structure.indexes.rows.map(row=>row.filter((_,i)=>indexOrder.includes(structure.indexes.columns[i].name)))} as database.Result,indexOrder) : null} busy={busy || !!editor} selected={selectedIndex} onSelect={setSelectedIndex} onEditCell={row=>open('index','edit',row)} columnLabels={indexLabels} initialWidths={indexWidths} emptyMessage="No indexes available." />
                {actions('index',selectedIndex)}
            </div>
        </div> : section === 'definition' ? <pre className="create-statement" tabIndex={0} aria-label="CREATE statement">{structure?.definition.rows[0]?.[1]?.value ?? (busy ? 'Loading…' : 'No definition available.')}</pre> : <><ResultGrid result={result} busy={busy || !!editor} selected={selectedFK} onSelect={setSelectedFK} onEditCell={row=>open('foreignKey','edit',row)}/>{actions('foreignKey',selectedFK)}</>}
        {notice && <p role="status" className="schema-notice">{notice}</p>}
        {help && structure && <aside className="structure-type-info" style={{left:help.x,top:help.y}} role="tooltip"><header>Type Info</header><strong>{({...fieldValues(structure.columns,help.row),...(draft?.row===help.row ? draft.edits : {})}).type}</strong><p>{typeHelp[({...fieldValues(structure.columns,help.row),...(draft?.row===help.row ? draft.edits : {})}).type] ?? 'The server validates this column type and its attributes.'}</p></aside>}
    </section>;
}
