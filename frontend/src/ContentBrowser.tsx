import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {Browse, TableDetails, Mutate, ExportTableCSV} from '../wailsjs/go/main/App';
import {database} from '../wailsjs/go/models';
import ResultGrid, {type GridView} from './ResultGrid';
import SAInsertError from './SAInsertError';
import SADialog, {SAErrorDialog} from './SADialog';
import RowEditor from './RowEditor';
import SACellEditor from './SACellEditor';
import SACSVImport from './SACSVImport';
import SADataExport from './SADataExport';
import ToolbarIcon from './ToolbarIcon';
import {selectRows, adjacentCell, newRowCells, newRowValues} from './content-grid';
import {readPreferences,shortcutHint} from './preferences';
import {workspaceShortcut} from './workspace-shortcuts';

type Props = {active:boolean;revision:number;onDraftChange:(draft:boolean)=>void;tab: string; databaseName: string; table: string; busy: boolean; operation: (work: () => Promise<void>, mayWrite?: boolean) => Promise<void>};
export default function ContentBrowser({active,revision,onDraftChange,tab, databaseName, table, busy, operation}: Props) {
    const activeRef=useRef(active);activeRef.current=active;
    const pointerTarget=useRef<EventTarget|null>(null);
    const initialized=useRef(false),previousActive=useRef(false);
    const gridView=useRef<GridView>({scrollTop:0,scrollLeft:0,widths:{}});
    const [restored,setRestored]=useState(false),[loadedRevision,setLoadedRevision]=useState(revision);
    const [confirmReload,setConfirmReload]=useState(false);
    const stale=loadedRevision!==revision;
    function leavingContent(element:HTMLElement,related:EventTarget|null){
        const target=related ?? pointerTarget.current;pointerTarget.current=null;
        if(target instanceof Element && target.closest('[data-preserve-cell-draft],dialog'))return true;
        return !activeRef.current || target instanceof Node && !element.closest('section.query-workspace')?.contains(target);
    }
    const filterControl = useRef<HTMLSelectElement>(null);
    const focusFilter = useRef(false);
    const cellInput = useRef<HTMLTextAreaElement>(null);
    const [showFilter, setShowFilter] = useState(true);
    const [details, setDetails] = useState<database.TableDetails | null>(null);
    const [selected, setSelected] = useState(-1);
    const [selectedRows, setSelectedRows] = useState<number[]>([]);
    const anchor = useRef(-1);
    const writePending = useRef(false);
    const [jumpPage, setJumpPage] = useState('1');
    const [editor, setEditor] = useState<'update' | 'duplicate' | null>(null);
    const [insertDraft,setInsertDraft]=useState<{cells:database.Cell[];changed:Record<string,database.Cell>}|null>(null);
    const [insertCell,setInsertCell]=useState(-1);
    const [insertError,setInsertError]=useState('');
    const [insertBlocked,setInsertBlocked]=useState(false);
    function discardInsert(){setInsertDraft(null);setInsertCell(-1);setInsertError('');setInsertBlocked(false);setSelected(-1);setSelectedRows([]);anchor.current=-1;}
    function select(row: number, modifiers = {toggle:false,range:false}) {
        if(insertDraft)return;
        setSelected(row);
        setSelectedRows(old => selectRows(old,anchor.current,row,result?.rows.length ?? 0,modifiers.toggle,modifiers.range));
        if (!modifiers.range || anchor.current < 0) anchor.current = row;
    }
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [showImport,setShowImport]=useState(false);
    const [writeMessage, setWriteMessage] = useState('');
    const [writeError,setWriteError]=useState<{title:string;message:string}|null>(null);
    const [result, setResult] = useState<database.Result | null>(null);
    const [columns, setColumns] = useState<database.Column[]>([]);
    const [applied, setApplied] = useState('');
    const [offset, setOffset] = useState(0);
    const [limit, setLimit] = useState(()=>readPreferences().pageSize);
    const nextFilterID = useRef(1);
    const [filters, setFilters] = useState([{id:0, enabled:false, column:'', operator:'=', value:''}]);
    function updateFilter(id: number, patch: Partial<typeof filters[number]>) {
        setFilters(old => old.map(rule => rule.id === id ? {...rule, enabled:true, ...patch} : rule));
    }
    function addFilter(index: number) {
        const id = nextFilterID.current++;
        const columnIndex = columns.findIndex(c => c.name === (filters[index].column || columns[0]?.name));
        const rule = {id, enabled:true, column:columns[(columnIndex+1)%columns.length]?.name ?? '', operator:'=', value:''};
        setFilters(old => [...old.slice(0,index+1),rule,...old.slice(index+1)]);
    }
    function removeFilter(id: number) {
        setFilters(old => old.length === 1 ? [{...old[0],enabled:false,value:''}] : old.filter(rule => rule.id !== id));
    }
    const [match, setMatch] = useState('all');
    const [cellEdit, setCellEdit] = useState<{row: number; column: number; value: database.Cell} | null>(null);
    const [fieldEdit,setFieldEdit]=useState<{row:number;column:number;name:string;type:string;value:database.Cell;nullable:boolean;editable:boolean;newRow:boolean}|null>(null);
    const [fieldBlocked,setFieldBlocked]=useState(false);
    const [sort, setSort] = useState('');
    const [descending, setDescending] = useState(false);
    const activeFilters = filters.filter(rule => rule.enabled).map(rule => ({column:rule.column || columns[0]?.name || '', operator:rule.operator, value:rule.value}));
    const requestFor = (next: number, order = sort, desc = descending) => new database.BrowseRequest({database: databaseName, table, offset: next, limit, column:'', operator:'=', value:'', filters:activeFilters, match, sort:order, descending:desc});
    const signatureFor = (order = sort, desc = descending) => JSON.stringify([limit, activeFilters, match, order, desc]);
    const signature = signatureFor();
    const dirty = signature !== applied;
    async function load(next: number, order = sort, desc = descending) {
        setConfirmReload(false);setRestored(false);gridView.current={...gridView.current,scrollTop:0,scrollLeft:0};
        setResult(null); setSelected(-1); setSelectedRows([]); setEditor(null); setCellEdit(null); setFieldEdit(null); setConfirmDelete(false); discardInsert();
        await operation(async () => {
            setDetails(await TableDetails(tab, databaseName, table));
            const output = await Browse(tab, requestFor(next, order, desc));
            setResult(output); setColumns(output.columns); setLoadedRevision(revision); setOffset(next); setJumpPage(String(Math.floor(next/limit)+1)); setApplied(signatureFor(order, desc));
        });
    }
    async function exportCSV() {
        await operation(async () => {
            setWriteMessage('');
            try {
                const output = await ExportTableCSV(tab, databaseName, table);
                setWriteMessage(output.cancelled ? 'Export cancelled.' : `Exported ${output.rows} rows from the entire table (filters and pagination are not applied).`);
            } catch (error) { setWriteMessage('Export failed; no completed export file was published.'); throw error; }
        });
    }
    const canWrite = !busy && !stale && !!details?.editable && !editor && !fieldEdit && !cellEdit && !insertDraft && !confirmDelete && !dirty;
    const canEditColumn = (column: number) => !!details?.editable && !!details.columns.find(c => c.name === result?.columns[column]?.name && !c.generated);
    function beginCell(row: number, column: number) {
        if(stale)return;
        if(insertDraft){if(row===result?.rows.length && !details?.columns[column]?.generated && !busy)setInsertCell(column);return;}
        if (!result?.rows[row] || !canEditColumn(column) || dirty) return;
        setSelected(row); setSelectedRows([row]); anchor.current = row;
        setCellEdit({row,column,value:new database.Cell(result.rows[row][column])});
    }
    function openField(row:number,column:number,value?:database.Cell){
        if(busy || editor || fieldEdit || confirmDelete || showImport || !result)return;
        const newRow=!!insertDraft && row===result.rows.length;
        const cell=value ?? (newRow ? insertDraft!.cells[column] : result.rows[row]?.[column]);
        const definition=details?.columns.find(c=>c.name===result.columns[column]?.name);
        if(!cell || !result.columns[column])return;
        setFieldBlocked(false);setFieldEdit({row,column,name:result.columns[column].name,type:definition?.type ?? result.columns[column].type,
            value:new database.Cell(cell),nullable:!!definition?.nullable,editable:canEditColumn(column) && !dirty && !stale && (!insertDraft || newRow) && !insertBlocked,newRow});
        setCellEdit(null);setInsertCell(-1);
    }
    function closeField(){const current=fieldEdit;setFieldEdit(null);if(current?.newRow && insertDraft)setInsertCell(current.column);}
    async function saveField(value:database.Cell){
        if(!fieldEdit || fieldBlocked || stale || busy)return;
        if(fieldEdit.newRow){
            const original=insertDraft?.cells[fieldEdit.column];
            if(!original || original.value!==value.value || original.null!==value.null || original.binary!==value.binary)changeInsert(fieldEdit.column,value);
            closeField();return;
        }
        const saved=await write('update',{[fieldEdit.name]:value},[fieldEdit.row]);
        if(saved)setFieldEdit(null);else setFieldBlocked(true);
    }
    function beginInsert(){
        if(!canWrite || !result || !details || showImport)return;
        const cells=newRowCells(details.columns);
        setInsertDraft({cells,changed:Object.create(null)});setInsertBlocked(false);setInsertError('');setWriteMessage('');
        setSelected(result.rows.length);setSelectedRows([result.rows.length]);anchor.current=result.rows.length;
        setInsertCell(details.columns.findIndex(column=>!column.generated));
    }
    function changeInsert(column:number,value:database.Cell){
        if(!details)return;
        setInsertDraft(current=>current ? {cells:current.cells.map((cell,i)=>i===column ? value : cell),changed:{...current.changed,[details.columns[column].name]:value}} : null);
    }
    async function saveInsert(){
        if(!insertDraft || !details || stale || busy || writePending.current || insertBlocked)return;
        const request=new database.Mutation({database:databaseName,table,action:'insert',columns:[],original:[]});
        request.values=newRowValues(details.columns,insertDraft.cells,insertDraft.changed);
        writePending.current=true;
        try {await operation(async()=>{
            let affected:number;
            try {affected=await Mutate(tab,request);} catch(error){
                const message=String(error);setInsertError(message);
                if(/outcome unknown|outcome is uncertain|unlock failed/i.test(message))setInsertBlocked(true);
                throw error;
            }
            discardInsert();
            setWriteMessage(details.engine?.toLowerCase()==='myisam' ? `${affected} row(s) affected. Changes are saved immediately (MyISAM).` : `${affected} row(s) affected. If a transaction is open, changes still need COMMIT.`);
            try {const output=await Browse(tab,requestFor(offset));setResult(output);setColumns(output.columns);setApplied(signature);}
            catch(error){setResult(null);setWriteMessage('Row saved, but refresh failed. Reload separately; do not insert the row again.');setWriteError({title:'Unable to refresh data',message:`Row saved. Reload separately; do not insert the row again.\n\n${String(error)}`});throw error;}
        },true);} finally {writePending.current=false;}
    }
    function editInsertAgain(){
        setInsertError('');
        const missing=details?.columns.findIndex((column,i)=>!column.generated && !column.autoIncrement && !column.nullable && insertDraft?.cells[i].null) ?? -1;
        setInsertCell(missing>=0 ? missing : details?.columns.findIndex(column=>!column.generated) ?? -1);
    }
    const displayResult=result && insertDraft ? {...result,rows:[...result.rows,insertDraft.cells]} as database.Result : result;
    async function saveCell(key: 'Tab' | 'Enter', reverse = false) {
        if (!cellEdit || !result || stale || busy || writePending.current) return;
        const next = adjacentCell(cellEdit.row,cellEdit.column,result.rows.length,result.columns.map((_,i) => canEditColumn(i)),key,reverse);
        const original = result.rows[cellEdit.row][cellEdit.column];
        if (original.value === cellEdit.value.value && original.null === cellEdit.value.null && original.binary === cellEdit.value.binary) {
            setCellEdit(null);
            if (next) beginCell(next.row,next.column);
            return;
        }
        await write('update',{[result.columns[cellEdit.column].name]:cellEdit.value},[cellEdit.row],next);
    }
    async function write(action: 'insert' | 'update' | 'delete', values: Record<string, database.Cell> = {}, indexes = selectedRows, next?: {row:number;column:number}) {
        if(stale){setWriteMessage('SQL, schema or transaction activity may have changed this snapshot. Reload before writing; saved drafts have not been applied.');return false;}
        if (writePending.current || (action !== 'insert' && (!result || !indexes.length))) return false;
        const snapshot = result;
        const targets = action === 'insert' ? [-1] : [...indexes].sort((a,b) => a-b);
        const destination = next && snapshot?.rows[next.row];
        writePending.current = true;
        let saved=false;
        try {
            await operation(async () => {
                setWriteMessage('');
                let completed = 0, affected = 0;
                try {
                    for (const row of targets) {
                        if (action === 'update' && Object.entries(values).every(([name,value]) => {
                            const original = snapshot!.rows[row][snapshot!.columns.findIndex(c => c.name === name)];
                            return original && original.null === value.null && original.binary === value.binary && original.value === value.value;
                        })) { completed++; continue; }
                        const request = new database.Mutation({database:databaseName,table,action,
                            columns:action === 'insert' ? [] : snapshot!.columns.map(c => c.name),
                            original:action === 'insert' ? [] : snapshot!.rows[row]});
                        // Assign directly: generated map conversion mishandles columns named map/slice.
                        request.values = values;
                        affected += await Mutate(tab,request);
                        completed++;
                    }
                    saved=true;
                    const count = targets.length > 1 ? `${completed} of ${targets.length} rows processed. ` : '';
                    setWriteMessage(count+(details?.engine?.toLowerCase() === 'myisam' ? `${affected} row(s) affected. Changes are saved immediately (MyISAM).` : `${affected} row(s) affected. If a transaction is open, changes still need COMMIT.`));
                } catch (error) {
                    setWriteError({title:action==='delete' ? 'Unable to delete row' : 'Unable to write row',message:`${String(error)}\n\n${completed} of ${targets.length} rows processed. Earlier writes may already be saved. Reload and verify the server before trying again.`});
                    setWriteMessage(targets.length > 1 ? `${completed} of ${targets.length} rows processed before an error. Earlier writes may already be saved. Reload and verify the server before retrying.` : 'Write failed. Reload and verify the server before trying again.');
                    throw error;
                } finally {
                    // Never retain a stale snapshot after a write or uncertain outcome.
                    setResult(null); setSelected(-1); setSelectedRows([]); setEditor(null); setCellEdit(null); setConfirmDelete(false);
                }
                try {
                    const output = await Browse(tab,requestFor(offset));
                    setResult(output); setColumns(output.columns); setApplied(signature);setRestored(false);
                    if (next && destination) {
                        const keys = snapshot!.columns.map((c,i) => details?.columns.find(d => d.name === c.name && (d.primary || d.identity)) ? i : -1).filter(i => i >= 0);
                        const row = keys.length ? output.rows.findIndex(candidate => keys.every(i => {
                            const name = snapshot!.columns[i].name;
                            const expected = next.row === targets[0] && values[name] ? values[name] : destination[i];
                            return candidate[i].null === expected.null && candidate[i].binary === expected.binary && candidate[i].value === expected.value;
                        })) : -1;
                        if (row >= 0) { setSelected(row); setSelectedRows([row]); anchor.current = row; setCellEdit({row,column:next.column,value:new database.Cell(output.rows[row][next.column])}); }
                    }
                } catch (error) {
                    setWriteMessage(previous => `${previous} Refresh failed; reload separately. Do not repeat the write.`);
                    setWriteError({title:'Unable to refresh data',message:`The write succeeded. Reload separately; do not repeat the write.\n\n${String(error)}`});
                    throw error;
                }
            },true);
        } finally { writePending.current = false; }
        return saved;
    }
    const rowDraft=!!insertDraft || !!cellEdit || !!fieldEdit || !!editor;
    const hasDraft=rowDraft || applied!=='' && dirty;
    useLayoutEffect(()=>{onDraftChange(hasDraft);},[hasDraft]);
    useEffect(()=>()=>onDraftChange(false),[]);
    useEffect(()=>{
        if(active){if(!initialized.current){initialized.current=true;void load(0);}else if(!previousActive.current)setRestored(true);}
        previousActive.current=active;
    },[active]);
    useEffect(()=>{
        if(!active)return;
        const record=(event:PointerEvent)=>{pointerTarget.current=event.target;};
        document.addEventListener('pointerdown',record,true);
        return()=>document.removeEventListener('pointerdown',record,true);
    },[active]);
    useEffect(() => {
        if (active && !busy && cellEdit) {cellInput.current?.focus();cellInput.current?.select();cellInput.current?.scrollIntoView({block:'nearest',inline:'nearest'});}
    },[active,busy,cellEdit?.row,cellEdit?.column]);
    useEffect(()=>{if(active && !busy && insertDraft && insertCell>=0 && !insertError){cellInput.current?.focus();cellInput.current?.select();cellInput.current?.scrollIntoView({block:'nearest',inline:'nearest'});}},[active,busy,insertCell,!!insertDraft,insertError]);
    useEffect(() => {
        if (active && showFilter && focusFilter.current) { filterControl.current?.focus(); focusFilter.current = false; }
    }, [active,showFilter]);
    if(!active)return null;
    return <section className="query-workspace" aria-label="Table content" onKeyDown={event => {
        const action = workspaceShortcut(event.nativeEvent, /Mac/.test(navigator.platform));
        if (action !== 'refresh' && action !== 'filter') return;
        event.preventDefault();
        if (busy || editor || fieldEdit || cellEdit || insertDraft || confirmDelete) return;
        if (action === 'refresh') { void load(dirty ? 0 : offset); return; }
        if (showFilter) filterControl.current?.focus();
        else { focusFilter.current = true; setShowFilter(true); }
    }}>

        <fieldset hidden={!showFilter} id={`content-filter-${tab}`} className="content-controls" disabled={!!editor || !!fieldEdit || !!cellEdit || !!insertDraft || confirmDelete}><form className="content-filter-form" onSubmit={e => { e.preventDefault(); void load(0); }}>
            {filters.map((rule, i) => <div className="content-filter" key={rule.id}>
                <input type="checkbox" aria-label={i === 0 ? 'Enable content filter' : `Enable content filter ${i+1}`} disabled={busy} checked={rule.enabled} onChange={e => updateFilter(rule.id,{enabled:e.target.checked})}/>
                <select ref={i === 0 ? filterControl : undefined} aria-label={i === 0 ? 'Filter column' : `Filter column ${i+1}`} disabled={busy} value={rule.column || columns[0]?.name || ''} onChange={e => updateFilter(rule.id,{column:e.target.value})}>{columns.map(c => <option key={c.name}>{c.name}</option>)}</select>
                <select aria-label={i === 0 ? 'Filter operator' : `Filter operator ${i+1}`} disabled={busy} value={rule.operator} onChange={e => updateFilter(rule.id,{operator:e.target.value})}>{['=','!=','<','>','<=','>=','contains','is null','is not null'].map(op => <option key={op}>{op}</option>)}</select>
                <input aria-label={i === 0 ? 'Filter value' : `Filter value ${i+1}`} disabled={busy || rule.operator.startsWith('is ')} value={rule.value} onChange={e => updateFilter(rule.id,{value:e.target.value})}/>
                <div className="filter-rule-actions">
                    <button type="button" aria-label={filters.length === 1 ? 'Disable filter' : `Remove filter ${i+1}`} disabled={busy || (filters.length === 1 && !rule.enabled)} onClick={() => removeFilter(rule.id)}><ToolbarIcon name="remove"/></button>
                    <button type="button" aria-label={i === 0 ? 'Add filter rule' : `Add filter rule ${i+1}`} disabled={busy || filters.length >= 100} onClick={() => addFilter(i)}><ToolbarIcon name="add"/></button>
                </div>
                <div className="filter-apply">{i === filters.length-1 && <button className="primary" disabled={busy}>Apply Filter(s)</button>}</div>
            </div>)}
        </form></fieldset>
        {(restored || stale) && <div className="content-restored" role="status">{stale ? 'SQL, schema or transaction activity may have changed this snapshot. Reload before writing; saved drafts have not been applied.' : 'Workspace restored from memory. Rows may have changed on the server. Reload for current data; writes are checked against the original row.'}{stale && rowDraft && <button data-preserve-cell-draft disabled={busy} onClick={()=>setConfirmReload(true)}>Discard drafts and reload</button>}</div>}
        {confirmReload && <SADialog title="Discard saved drafts?" onCancel={()=>setConfirmReload(false)} busy={busy}><p>Reload will discard unsaved changes for this table. No database write will be sent.</p><button className="danger" disabled={busy} onClick={()=>void load(offset)}>Discard and reload</button><button data-dialog-focus autoFocus disabled={busy} onClick={()=>setConfirmReload(false)}>Cancel</button></SADialog>}
        {showImport && <SACSVImport tab={tab} databaseName={databaseName} table={table} busy={busy} operation={operation} onReload={()=>load(0)} onClose={()=>setShowImport(false)}/>}
        {confirmDelete && <SADialog title={selectedRows.length===1 ? "Delete selected row?" : "Delete rows?"} onCancel={()=>setConfirmDelete(false)} busy={busy}>
            <div className="delete-confirmation">
            <p>Delete {selectedRows.length===1 ? 'the selected row' : `${selectedRows.length} selected rows`} from this table? This action cannot be undone.</p>
            <p className="dialog-object-name">{databaseName}.{table}</p>
            <p className="dialog-secondary">Related rows may be affected by triggers or foreign-key cascades. If an error occurs, earlier writes may already be saved.</p>
            <dl>{selectedRows.map(row => <div key={row}><dt>Row {row+1}</dt><dd>{details?.columns.map((c,i) => (c.primary || c.identity) ? `${c.name}: ${result?.rows[row]?.[i].null ? 'NULL' : result?.rows[row]?.[i].value}` : '').filter(Boolean).join(', ')}</dd></div>)}</dl>
            </div><button className="danger" disabled={busy} onClick={() => void write('delete')}>Confirm delete</button><button data-dialog-focus autoFocus disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button>
        </SADialog>}
        {fieldEdit && <SACellEditor key={`${fieldEdit.row}:${fieldEdit.column}`} {...fieldEdit} blocked={fieldBlocked || stale} busy={busy} onSave={saveField} onClose={closeField}/>}
        {writeError && <SAErrorDialog {...writeError} onClose={()=>setWriteError(null)}/>}
        {editor && details && <RowEditor key={`${editor}:${selectedRows.join(',')}`} details={details} row={result!.rows[selectedRows[0]]} duplicate={editor === 'duplicate'} count={editor === 'update' ? selectedRows.length : 1} busy={busy} onSave={values => void write(editor === 'update' ? 'update' : 'insert',values)} onCancel={() => setEditor(null)} />}
        <SADataExport tab={tab} databaseName={databaseName} table={table} result={result} selectedRows={selectedRows} generatedColumns={details?.columns.filter(c=>c.generated).map(c=>c.name)} request={requestFor(offset)} busy={busy} disabled={dirty || !!editor || !!fieldEdit || !!cellEdit || !!insertDraft || confirmDelete} operation={operation}/>
        <ResultGrid initialView={gridView.current} onViewChange={view=>{gridView.current=view;}} result={displayResult} busy={busy || !!editor || !!fieldEdit || !!cellEdit || confirmDelete || !!insertError} sortDisabled={!!insertDraft}
            onEmptyDoubleClick={()=>{if(insertDraft)void saveInsert();else beginInsert();}} selected={selected} selectedRows={selectedRows} onSelect={select}
            onSelectAll={() => { if (result && !insertDraft) {setSelectedRows(result.rows.map((_,i) => i)); setSelected(0); anchor.current = 0;} }}
            onClearSelection={() => {if(insertDraft)return;setSelectedRows([]);setSelected(-1);anchor.current=-1;}}
            tableName={table} databaseName={databaseName} sqlColumns={details?.columns.filter(c => !c.generated).map(c => c.name)} autoIncrementColumns={details?.columns.filter(c => c.autoIncrement).map(c => c.name)} showColumnTypes sortColumn={sort} descending={descending}
            onSort={name => { const desc = sort === name ? !descending : false; setSort(name); setDescending(desc); void load(0,name,desc); }}
            onEditCell={beginCell}
            actions={[
                {label:'Open cell editor',disabled:busy || !!editor || !!fieldEdit || showImport,run:(row,column)=>openField(row,column)},
                {label:'Edit cell',disabled:(_row,column) => !canWrite || !canEditColumn(column),run:beginCell},
                {label:'Edit selected rows',disabled:!canWrite || !selectedRows.length,run:() => setEditor('update')},
                {label:'Insert row',disabled:!canWrite || !result || showImport,run:beginInsert},
                {label:'Duplicate row',disabled:!canWrite || selectedRows.length !== 1,run:() => setEditor('duplicate')},
                {label:'Delete selected rows',disabled:!canWrite || !selectedRows.length,run:() => setConfirmDelete(true)},
                {label:'Set cell to NULL',disabled:(row,column) => (insertDraft && row===result?.rows.length ? busy || details?.columns[column].generated || !details?.columns[column].nullable : !canWrite) || !canEditColumn(column) || !details?.columns.find(c => c.name === result?.columns[column].name)?.nullable,run:(row,column) => {
                    if(insertDraft && row===result?.rows.length){changeInsert(column,new database.Cell({value:'',null:true,binary:false}));return;}
                    if (!canEditColumn(column) || !details?.columns.find(c => c.name === result?.columns[column].name)?.nullable) { setWriteMessage('This column cannot be set to NULL.'); return; }
                    void write('update',{[result!.columns[column].name]:new database.Cell({value:'',null:true,binary:false})},[row]);
                }},
                {label:'Use column default',disabled:(row,column)=>!insertDraft || row!==result?.rows.length || busy || !!details?.columns[column].generated || (!details?.columns[column].autoIncrement && !details?.columns[column].nullable && !details?.columns[column].defaultValue && !details?.columns[column].defaultExpression),run:(_row,column)=>{
                    if(!details)return;const value=newRowCells(details.columns)[column];
                    setInsertDraft(current=>{if(!current)return null;const changed={...current.changed};delete changed[details.columns[column].name];return {cells:current.cells.map((cell,i)=>i===column ? value : cell),changed};});
                    setInsertCell(column);
                }},
                {label:'Filter by cell',disabled:busy || !!cellEdit || !!editor || !!fieldEdit || !!insertDraft,run:(row,column) => {
                    const cell = result!.rows[row][column];
                    setFilters([{id:nextFilterID.current++,enabled:true,column:result!.columns[column].name,operator:cell.null ? 'is null' : '=',value:cell.value}]);setMatch('all');setShowFilter(true);
                }},
                {label:'Refresh content',disabled:busy || !!cellEdit || !!editor || !!fieldEdit || !!insertDraft,run:() => void load(dirty ? 0 : offset)},
            ]}
            cellEditor={insertDraft && insertCell>=0 && result ? {row:result.rows.length,column:insertCell,content:<textarea
                key={`insert:${insertCell}`} ref={cellInput} className="cell-editor" rows={1} autoFocus aria-label="New row cell value" title="Alt+Enter: open cell editor" disabled={busy}
                value={insertDraft.cells[insertCell].null ? 'NULL' : insertDraft.cells[insertCell].value}
                onFocus={e=>e.currentTarget.select()} onClick={e=>e.stopPropagation()} onBlur={e=>{if(!busy && !leavingContent(e.currentTarget,e.relatedTarget))setInsertCell(current=>current===insertCell?-1:current);}}
                onChange={e=>changeInsert(insertCell,new database.Cell({...insertDraft.cells[insertCell],value:e.target.value,null:false}))}
                onKeyDown={e=>{
                    if(e.nativeEvent.isComposing)return;
                    if(e.altKey && e.key==='Enter'){e.preventDefault();e.stopPropagation();openField(result.rows.length,insertCell,insertDraft.cells[insertCell]);return;}
                    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();discardInsert();}
                    if(e.key==='Enter' && !e.shiftKey){e.preventDefault();e.stopPropagation();void saveInsert();}
                    if(e.key==='Tab'){
                        e.preventDefault();e.stopPropagation();const next=adjacentCell(0,insertCell,1,details!.columns.map(c=>!c.generated),'Tab',e.shiftKey);
                        if(next)setInsertCell(next.column);else void saveInsert();
                    }
                }}/>} : cellEdit ? {row:cellEdit.row, column:cellEdit.column, content:<textarea key={`${cellEdit.row}:${cellEdit.column}`}
                ref={cellInput} className="cell-editor" rows={1} autoFocus aria-label="Cell value" title="Alt+Enter: open cell editor" disabled={busy}
                value={cellEdit.value.null ? '' : cellEdit.value.value}
                onFocus={e => e.currentTarget.select()}
                onClick={e => e.stopPropagation()}
                onBlur={e => { if (!busy && !leavingContent(e.currentTarget,e.relatedTarget))setCellEdit(current=>current?.row===cellEdit.row && current.column===cellEdit.column?null:current); }}
                onChange={e => setCellEdit({...cellEdit, value:new database.Cell({...cellEdit.value, value:e.target.value, null:false})})}
                onKeyDown={e => {
                    if (e.nativeEvent.isComposing) return;
                    if(e.altKey && e.key==='Enter'){e.preventDefault();e.stopPropagation();openField(cellEdit.row,cellEdit.column,cellEdit.value);return;}
                    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setCellEdit(null); }
                    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                        e.preventDefault(); e.stopPropagation();
                        void saveCell(e.key,e.shiftKey);
                    }
                }}
            />} : undefined} />
        {insertError && <SAInsertError message={insertError} onEdit={editInsertAgain} onDiscard={discardInsert}/>}
        {insertDraft && <div className="insert-draft-actions"><span>New row · double-click empty space to save</span><button disabled={busy || stale || insertBlocked} onClick={()=>void saveInsert()}>Save new row</button><button disabled={busy} onClick={discardInsert}>Cancel new row</button>{insertBlocked && <span>Verify the server outcome before another insert.</span>}</div>}
        {result?.notice && <p className="content-write-status" role="status">{result.notice}</p>}
        {writeMessage && <p className="content-write-status" role="status">{writeMessage}</p>}
        <div className="content-bottom-bar">
            <div className="content-actions">
                <button disabled={!canWrite || !result || showImport} onClick={beginInsert} title="Insert row" aria-label="Insert row"><ToolbarIcon name="add"/></button>
                <button disabled={busy || stale || !details?.editable || !selectedRows.length || !!editor || !!fieldEdit || !!cellEdit || !!insertDraft || confirmDelete || dirty} onClick={() => setConfirmDelete(true)} title="Delete selected row" aria-label="Delete row"><ToolbarIcon name="remove"/></button>
                <button disabled={!canWrite || selectedRows.length !== 1} aria-label="Duplicate row" title="Duplicate selected row" onClick={() => {setEditor('duplicate');setWriteMessage('');}}><ToolbarIcon name="duplicate"/></button>
                <button disabled={busy || !!editor || !!fieldEdit || !!cellEdit || !!insertDraft || confirmDelete} aria-label="Reload content" title={`Reload content (${shortcutHint('refresh') || 'shortcut disabled'})`} onClick={() => void load(dirty ? 0 : offset)}><ToolbarIcon name="refresh"/></button>
                <button disabled={busy || stale || !details?.editable || !selectedRows.length || !!editor || !!fieldEdit || !!cellEdit || !!insertDraft || confirmDelete || dirty} onClick={() => { setEditor('update'); setWriteMessage(''); }} title="Edit selected row" aria-label="Edit row"><ToolbarIcon name="edit"/></button>
                <button className="filter-toggle" title={`Filter Content (${shortcutHint('filter') || 'shortcut disabled'})`} aria-label="Toggle content filter" aria-expanded={showFilter} aria-controls={`content-filter-${tab}`} disabled={busy || !!editor || !!fieldEdit || !!cellEdit || !!insertDraft || confirmDelete} onClick={() => setShowFilter(open => !open)}><ToolbarIcon name="filter"/></button>
            </div>
            <span className="content-row-count" role="status">{result?.rows.length ?? 0} rows on page{selectedRows.length ? `; ${selectedRows.length} row(s) selected` : ''}{dirty ? ' · Filter changed' : ''}</span>
            <fieldset className="content-controls pagination" disabled={!!editor || !!fieldEdit || !!cellEdit || !!insertDraft || confirmDelete}>
                <button aria-label="Previous page" title="Previous page" disabled={busy || dirty || offset === 0} onClick={() => void load(Math.max(0, offset-limit))}><ToolbarIcon name="back"/></button>
                <details className="content-options"><summary aria-label="Content options" title="Content options"><ToolbarIcon name="more"/></summary><div className="content-options-panel">
                    {filters.length > 1 && <label>Match<select aria-label="Filter match" value={match} disabled={busy} onChange={e => setMatch(e.target.value)}><option value="all">All conditions (AND)</option><option value="any">Any condition (OR)</option></select></label>}
                    <form className="page-jump" onSubmit={e => {
                        e.preventDefault();
                        const page = Number(jumpPage), next = (page-1)*limit;
                        if (!Number.isSafeInteger(page) || page < 1 || next > 10000000) return;
                        void load(next);
                    }}><label>Go to page<input aria-label="Go to page" type="number" min="1" max={Math.floor(10000000/limit)+1} step="1" required disabled={busy || dirty} value={jumpPage} onChange={e => setJumpPage(e.target.value)}/></label><button disabled={busy || dirty}>Go to page</button></form>
                    <label>Sort column<select aria-label="Sort column" disabled={busy} value={sort} onChange={e => setSort(e.target.value)}><option value="">Server order</option>{columns.map((c, i) => <option key={i}>{c.name}</option>)}</select></label>
                    <label><input type="checkbox" disabled={busy} checked={descending} onChange={e => setDescending(e.target.checked)} /> Descending</label>
                    <label>Rows per page<select aria-label="Rows per page" disabled={busy} value={limit} onChange={e => { setLimit(Number(e.target.value)); setResult(null); setOffset(0); }}>{[25,50,100,200].map(n => <option key={n} value={n}>{n} rows</option>)}</select></label>
                    <button disabled={busy} onClick={() => void load(0)}>Apply sort / page size</button>
                    <button disabled={busy} onClick={() => void exportCSV()}>Export entire table CSV</button>
 <button disabled={busy || !!editor || !!fieldEdit || !!cellEdit || !!insertDraft} onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');setShowImport(true);}}>Import CSV</button>
                    <p>Offset {offset} · {result?.durationMS ?? 0} ms. Choose a unique sort column for stable pages. Concurrent changes can shift rows between pages.</p>
                    <p>CSV uses Sequel CSV v1. Export includes the entire table, ignoring filters. Spreadsheet apps may interpret formulas.</p>
                    {!details?.editable && <p>{details?.reason}</p>}
                </div></details>
                <button aria-label="Next page" title="Next page" disabled={busy || dirty || !result || result.rows.length < limit || offset+limit>10000000} onClick={() => void load(offset+limit)}><ToolbarIcon name="forward"/></button>
            </fieldset>
        </div>
    </section>;
}
