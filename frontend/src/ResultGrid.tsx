import {type ReactNode, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {ClipboardSetText} from '../wailsjs/runtime/runtime';
import {database} from '../wailsjs/go/models';
import {copyRows, selectRows} from './content-grid';
import {columnWidth, fittedColumnWidth, gridShortcut, selectedRow} from './grid-navigation';

export type GridView={scrollTop:number;scrollLeft:number;widths:Record<string,number>};

export default function ResultGrid({initialView,onViewChange,result, busy, selected, onSelect, columnLabels, initialWidths, checkboxColumns, emptyMessage, showColumnTypes = false, sortColumn, descending, onSort, onEditCell, cellEditor, renderCell, onEmptyDoubleClick, sortDisabled, selectedRows, onSelectAll, onClearSelection, tableName, databaseName, sqlColumns, autoIncrementColumns = [], actions = []}: {initialView?:GridView;onViewChange?:(view:GridView)=>void;result: database.Result | null; busy: boolean; selected?: number; onSelect?: (row: number, modifiers?: {toggle: boolean; range: boolean}) => void; selectedRows?: number[]; onSelectAll?: () => void; onClearSelection?: () => void; tableName?: string; databaseName?: string; sqlColumns?: string[]; autoIncrementColumns?: string[]; actions?: {label: string; disabled?: boolean | ((row: number, column: number) => boolean); run: (row: number, column: number) => void}[]; columnLabels?: Record<string, string>; initialWidths?: Record<string, number>; checkboxColumns?: Record<string, string>; emptyMessage?: string; showColumnTypes?: boolean; sortColumn?: string; descending?: boolean; onSort?: (column: string) => void; onEditCell?: (row: number, column: number) => void; onEmptyDoubleClick?: () => void; sortDisabled?: boolean; renderCell?: (row:number,column:number) => ReactNode | undefined; cellEditor?: {row: number; column: number; content: ReactNode}}) {
    const grid = useRef<HTMLDivElement>(null);
    const [selection, setSelection] = useState(-1);
    const [localRows,setLocalRows]=useState<number[]>([]);
    const anchor=useRef(-1);
    const localSelection=selected===undefined && selectedRows===undefined && !onSelect;
    const [widths, setWidths] = useState<Record<string, number>>(()=>({...initialView?.widths}));
    const [menu, setMenu] = useState<{row: number; column: number; x: number; y: number} | null>(null);
    const [copyError, setCopyError] = useState('');
    useLayoutEffect(()=>{if(grid.current && initialView){grid.current.scrollTop=initialView.scrollTop;grid.current.scrollLeft=initialView.scrollLeft;}},[]);
    useLayoutEffect(()=>{if(grid.current)onViewChange?.({widths,scrollTop:grid.current.scrollTop,scrollLeft:grid.current.scrollLeft});},[widths]);
    const drag = useRef<{x: number; width: number; key: string} | null>(null);
    useLayoutEffect(() => {
        if(localSelection){setSelection(-1);setLocalRows([]);anchor.current=-1;setMenu(null);}
        const element = grid.current;
        const header = element?.querySelector('thead');
        if (!element) return;
        const measure = () => {
            element.style.setProperty('--grid-header-height',`${header?.getBoundingClientRect().height ?? 0}px`);
            element.style.setProperty('--grid-scroll-top',`${element.scrollTop}px`);
        };
        measure();
        if (!header) return;
        const observer = new ResizeObserver(measure);
        observer.observe(header);
        return () => observer.disconnect();
    },[result,localSelection]);
    const active = selected ?? selection;
    const chosen = selectedRows ?? (localSelection ? localRows : active >= 0 ? [active] : []);
    const selectAll = onSelectAll ?? (localSelection ? () => {setLocalRows(result?.rows.map((_,i)=>i) ?? []);setSelection(result?.rows.length ? 0 : -1);anchor.current=result?.rows.length ? 0 : -1;} : undefined);
    const clearSelection = onClearSelection ?? (localSelection ? () => {setLocalRows([]);setSelection(-1);anchor.current=-1;} : undefined);
    const keyFor = (i: number) => `${i}:${result?.columns[i].name}`;
    const fittedWidths = useMemo(() => showColumnTypes ? result?.columns.map((column, i) =>
        fittedColumnWidth(column, result.rows.map(row => row[i])),
    ) ?? [] : [], [result, showColumnTypes]);
    const widthFor = (i: number) => (
        widths[keyFor(i)] ?? initialWidths?.[result?.columns[i].name ?? ''] ?? (showColumnTypes ? fittedWidths[i] : Math.max(90, Math.min(220, (result?.columns[i].name.length ?? 0) * 8 + 24))));
    const choose = (row: number, modifiers: {toggle: boolean; range: boolean} = {toggle:false,range:false}) => {
        setSelection(row);
        if(localSelection){setLocalRows(old=>selectRows(old,anchor.current,row,result?.rows.length ?? 0,modifiers.toggle,modifiers.range));if(!modifiers.range || anchor.current<0)anchor.current=row;}
        onSelect?.(row,modifiers);
    };
    async function copyText(value: string) {
        try {
            if (!await ClipboardSetText(value)) throw new Error('Clipboard unavailable');
            setCopyError('');
        } catch { setCopyError('Could not copy to clipboard.'); }
        setMenu(null);
        if (grid.current?.contains(document.activeElement)) grid.current.focus();
    }
    function copySelection(format: 'tsv' | 'headers' | 'csv' | 'sql', withoutAutoIncrement = false) {
        if (!result) return;
        const indexes = result.columns.map((_,i) => i).filter(i => format !== 'sql' || ((!sqlColumns || sqlColumns.includes(result.columns[i].name)) && (!withoutAutoIncrement || !autoIncrementColumns.includes(result.columns[i].name))));
        void copyText(copyRows(indexes.map(i => result.columns[i]),chosen.filter(r => result.rows[r]).map(r => indexes.map(i => result.rows[r][i])),format,tableName,databaseName));
    }
    function copy(row: boolean) {
        if (!menu || !result?.rows[menu.row]) return;
        const cells = row ? result.rows[menu.row] : [result.rows[menu.row][menu.column]];
        void copyText(cells.map(cell => cell.null ? 'NULL' : cell.value).join('\t'));
    }
    return <div ref={grid} className={`results ${showColumnTypes ? 'content-grid' : ''}`} aria-label="Query results" tabIndex={0}
        onDoubleClick={event=>{
            if(busy || !onEmptyDoubleClick || !result?.columns.length || (event.target as HTMLElement).closest('tr,button,input,textarea,select,[role=menu]'))return;
            const rows=event.currentTarget.querySelectorAll('tbody tr');
            const bottom=(rows.length ? rows[rows.length-1] : event.currentTarget.querySelector('thead'))?.getBoundingClientRect().bottom ?? event.currentTarget.getBoundingClientRect().top;
            if(event.clientY>=bottom){event.preventDefault();onEmptyDoubleClick();}
        }}
        onScroll={event => {event.currentTarget.style.setProperty('--grid-scroll-top',`${event.currentTarget.scrollTop}px`);onViewChange?.({widths,scrollTop:event.currentTarget.scrollTop,scrollLeft:event.currentTarget.scrollLeft});}}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(null); }}
        onKeyDown={event => {
            if (event.key === 'Escape') { setMenu(null); return; }
            if (event.target !== event.currentTarget || busy) return;
            if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && !event.nativeEvent.isComposing && !event.repeat && event.key.toLowerCase() === 'a' && selectAll) { event.preventDefault(); selectAll(); return; }
            const command = gridShortcut(event.nativeEvent);
            if (result?.rows[active] && command === 'copy') {
                event.preventDefault(); copySelection('tsv'); return;
            }
            if (result?.rows[active] && command === 'menu') {
                event.preventDefault();
                const rect = event.currentTarget.querySelectorAll('tbody tr')[active]?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
                setMenu({row:active, column:0, x:Math.max(0, Math.min(rect.left,window.innerWidth-240)), y:Math.max(0, Math.min(rect.bottom,window.innerHeight-90))});
                return;
            }
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            const next = selectedRow(event.key, active, result?.rows.length ?? 0);
            if (next !== undefined) { event.preventDefault(); choose(next,{toggle:false,range:event.shiftKey}); event.currentTarget.querySelectorAll('tbody tr')[next]?.scrollIntoView({block:'nearest'}); }
        }} onClick={() => setMenu(null)}>
        {copyError && <div role="alert">{copyError}</div>}
        {result && result.columns.length ? <table style={{width:result.columns.reduce((total, _, i) => total + widthFor(i), 0)}}>
            <colgroup>{result.columns.map((_, i) => <col key={i} style={{width:widthFor(i)}} />)}{showColumnTypes && <col />}</colgroup>
            <thead><tr>{result.columns.map((column, i) => <th key={i} title={column.type} aria-sort={onSort ? (sortColumn === column.name ? descending ? 'descending' : 'ascending' : 'none') : undefined}>{onSort ? <button className="column-sort" disabled={busy || sortDisabled} onClick={() => onSort(column.name)}>{columnLabels?.[column.name] ?? column.name}{sortColumn === column.name ? descending ? ' ▾' : ' ▴' : ''}</button> : columnLabels?.[column.name] ?? column.name}{showColumnTypes && <small className="column-type">{column.type}</small>}
                <span className="column-resizer" role="separator" tabIndex={0} aria-label={`Resize ${columnLabels?.[column.name] ?? column.name} column`} aria-orientation="vertical" aria-valuemin={48} aria-valuemax={800} aria-valuenow={widthFor(i)}
                    onKeyDown={event => {
                        const next = event.key === 'Home' ? 48 : event.key === 'End' ? 800 : event.key === 'ArrowLeft' ? widthFor(i)-10 : event.key === 'ArrowRight' ? widthFor(i)+10 : undefined;
                        if (next !== undefined) { event.preventDefault(); setWidths(current => ({...current, [keyFor(i)]:columnWidth(next)})); }
                    }}
                    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = {x:event.clientX, width:widthFor(i), key:keyFor(i)}; }}
                    onPointerMove={event => { const start = drag.current; if (start && event.currentTarget.hasPointerCapture(event.pointerId)) setWidths(current => ({...current, [start.key]:columnWidth(start.width + event.clientX-start.x)})); }}
                    onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); drag.current = null; }}
                    onLostPointerCapture={() => { drag.current = null; }} />
            </th>)}{showColumnTypes && <th className="grid-filler" aria-hidden="true" />}</tr></thead><tbody>{result.rows.map((row, r) => <tr key={r} aria-selected={chosen.includes(r)} className={chosen.includes(r) ? 'selected-row' : ''}
                onClick={event => { if (!busy) { choose(r,{toggle:event.metaKey || event.ctrlKey,range:event.shiftKey}); if (!(event.target as HTMLElement).closest('input,select,textarea,button')) event.currentTarget.closest<HTMLElement>('.results')?.focus(); } }}>
                {row.map((value, c) => <td key={c} className={[value.null ? 'null' : '', /^(?:UNSIGNED )?(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL|YEAR)(\b|$)/i.test(result.columns[c]?.type ?? '') ? 'numeric' : ''].join(' ')} title={value.null ? 'NULL' : value.value}
                    onDoubleClick={event => { if (!busy && !(event.target as HTMLElement).closest("input,select,textarea,button")) onEditCell?.(r, c); }}
                    onContextMenu={event => { event.preventDefault(); if (busy) return; if (!chosen.includes(r)) choose(r); setMenu({row:r,column:c,x:Math.max(4,Math.min(event.clientX,window.innerWidth-240)),y:Math.max(0,Math.min(event.clientY,window.innerHeight-300))}); }}>
                    {cellEditor?.row === r && cellEditor.column === c ? cellEditor.content : renderCell?.(r,c) ?? (!value.null && checkboxColumns?.[result.columns[c].name] !== undefined && (value.value === checkboxColumns[result.columns[c].name] || value.value === "NO") ? <input type="checkbox" disabled checked={value.value === checkboxColumns[result.columns[c].name]} aria-label={`${columnLabels?.[result.columns[c].name] ?? result.columns[c].name}: ${value.value}`} /> : value.null ? 'NULL' : value.value)}</td>)}{showColumnTypes && <td className="grid-filler" aria-hidden="true" />}
            </tr>)}</tbody></table> : <div className="result-empty">{busy ? 'Loading…' : result ? 'No rows returned.' : emptyMessage ?? 'Run a query to display results.'}</div>}
        {menu && <div className="grid-context-menu" role="menu" aria-label="Copy result" style={{left:menu.x,top:menu.y,maxHeight:Math.max(80,window.innerHeight-menu.y-8)}} onClick={event => event.stopPropagation()} onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setMenu(null); grid.current?.focus(); return; }
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
            const next = selectedRow(event.key, items.indexOf(document.activeElement as HTMLButtonElement), items.length);
            if (next !== undefined) { event.preventDefault(); event.stopPropagation(); items[next]?.focus(); }
        }}>
            <button role="menuitem" autoFocus onClick={() => void copy(false)}>Copy cell</button>
            <button role="menuitem" onClick={() => void copy(true)}>Copy row (tab separated)</button>
            <button role="menuitem" onClick={() => copySelection('tsv')}>Copy selected rows</button>
            <button role="menuitem" onClick={() => copySelection('headers')}>Copy with column names</button>
            <button role="menuitem" onClick={() => copySelection('csv')}>Copy as CSV</button>
            {tableName && <><button role="menuitem" onClick={() => copySelection('sql')}>Copy as SQL INSERT</button><button role="menuitem" onClick={() => copySelection('sql',true)}>Copy as SQL INSERT (no auto_inc)</button></>}
            {selectAll && <button role="menuitem" onClick={() => { selectAll(); setMenu(null); }}>Select all rows on page</button>}
            {clearSelection && <button role="menuitem" onClick={() => { clearSelection(); setMenu(null); }}>Clear selection</button>}
            {actions.map(action => <button key={action.label} role="menuitem" disabled={typeof action.disabled === 'function' ? action.disabled(menu.row,menu.column) : action.disabled} onClick={() => { setMenu(null); action.run(menu.row,menu.column); }}>{action.label}</button>)}
        </div>}
    </div>;
}
