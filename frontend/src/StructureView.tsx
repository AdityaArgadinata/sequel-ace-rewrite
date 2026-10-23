import {useEffect, useId, useState} from 'react';
import {Structure, ApplySchemaChange} from '../wailsjs/go/main/App';
import {database} from '../wailsjs/go/models';
import ResultGrid from './ResultGrid';
import Splitter from './Splitter';
import SASchemaEditor from './SASchemaEditor';
import {workspaceShortcut} from './workspace-shortcuts';
import {indexOrder, reorderColumns, structureWidths, indexWidths} from './structure-columns';

// Display labels match DBView.xib; metadata identifiers and values stay intact.
const columnLabels: Record<string, string> = {
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
    const [editor,setEditor]=useState<{kind:'column'|'index'|'foreignKey';action:'add'|'edit'|'drop';object?:database.SASchemaObject}|null>(null);
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
                setEditor(null);setNotice(`Schema change acknowledged by the server.${warnings ? '\n'+warnings : ''}`);
                setSelectedColumn(-1);setSelectedIndex(-1);setSelectedFK(-1);
                setStructure(null);
                try {setStructure(await Structure(tab,databaseName,table));}catch(e){throw new Error(`Schema change was applied, but metadata reload failed. Reload structure before another change. ${String(e)}`);}
            }catch(e){setError(String(e));throw e;}finally{onSchemaChanged();}
        },true);
    }
    function actions(kind:'column'|'index'|'foreignKey',row:number){
        const label=kind==='column' ? 'column' : kind==='index' ? 'index' : 'foreign key';
        const disabled=busy || !!editor || !structure?.editable;
        return <div className="schema-actions"><button disabled={disabled} aria-label={`Add ${label}`} onClick={()=>open(kind,'add',row)}>＋</button><button disabled={disabled || !objectAt(kind,row)} aria-label={`Edit ${label}`} onClick={()=>open(kind,'edit',row)}>Edit</button><button disabled={disabled || !objectAt(kind,row)} aria-label={`Drop ${label}`} onClick={()=>open(kind,'drop',row)}>−</button><span>{kind==='index' ? 'NON_UNIQUE = 0: unique' : 'Select a row to edit; double-click to open.'}</span></div>;
    }
    async function load() {
        setStructure(null); setError(''); setSelectedColumn(-1);setSelectedIndex(-1);setSelectedFK(-1);
        await operation(async () => {
            try { setStructure(await Structure(tab, databaseName, table)); }
            catch (e) { setError(String(e)); throw e; }
        });
    }
    useEffect(() => { void load(); }, []);
    const result = structure?.[section] ?? null;
    return <section className="query-workspace" aria-label="Table structure" onKeyDown={event => {
        if (workspaceShortcut(event.nativeEvent, /Mac/.test(navigator.platform)) !== 'refresh') return;
        event.preventDefault(); if (!busy && !editor) void load();
    }}>
        <div className="query-heading"><strong>{databaseName}.{table}</strong><span>{structure?.editable ? 'Schema editor' : 'Read-only structure'}</span><button disabled={busy || !!editor} onClick={() => void load()}>Reload structure</button></div>
        <div className="structure-sections" role="group" aria-label="Structure sections">{(['columns','foreignKeys','definition'] as const).map((name, i) => <button key={name} disabled={busy || !!editor} aria-pressed={section === name} onClick={() => setSection(name)}>{['Columns & Indexes','Foreign keys','CREATE statement'][i]}</button>)}</div>
        {editor && <SASchemaEditor key={`${editor.kind}:${editor.action}:${editor.object?.name ?? ''}`} {...editor} tab={tab} databaseName={databaseName} table={table} busy={busy} operation={operation} onApply={apply} onCancel={()=>setEditor(null)}/>}
        {notice && <p role="status" className="schema-notice">{notice}</p>}
        {structure?.reason && <p className="notice">{structure.reason}</p>}
        {error && <p role="alert" className="notice">{error}</p>}
        {section === 'columns' ? <div className="structure-stack">
            <div id={columnsID} className="structure-columns" style={{flexBasis:`${height}%`}}>
                <ResultGrid result={structure?.columns ?? null} busy={busy || !!editor} selected={selectedColumn} onSelect={setSelectedColumn} onEditCell={row=>open('column','edit',row)} columnLabels={columnLabels} initialWidths={structureWidths} checkboxColumns={{IS_NULLABLE:"YES"}} emptyMessage="No structure available." />
                {actions('column',selectedColumn)}
            </div>
            <Splitter label="Columns panel height" controls={columnsID} axis="y" value={height} min={25} max={80} onChange={setHeight} />
            <div className="structure-indexes"><div className="query-heading"><strong>INDEXES</strong></div>
                <ResultGrid result={structure ? reorderColumns(structure.indexes,indexOrder) : null} busy={busy || !!editor} selected={selectedIndex} onSelect={setSelectedIndex} onEditCell={row=>open('index','edit',row)} columnLabels={indexLabels} initialWidths={indexWidths} emptyMessage="No indexes available." />
                {actions('index',selectedIndex)}
            </div>
        </div> : section === 'definition' ? <pre className="create-statement" tabIndex={0} aria-label="CREATE statement">{structure?.definition.rows[0]?.[1]?.value ?? (busy ? 'Loading…' : 'No definition available.')}</pre> : <><ResultGrid result={result} busy={busy || !!editor} selected={selectedFK} onSelect={setSelectedFK} onEditCell={row=>open('foreignKey','edit',row)}/>{actions('foreignKey',selectedFK)}</>}
        <div className="results-footer"><span>{result?.rows.length ?? 0} metadata rows</span><span>Metadata reflects the current server; reload after schema changes.</span></div>
    </section>;
}
