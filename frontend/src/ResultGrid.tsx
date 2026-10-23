import {useRef, useState} from 'react';
import {ClipboardSetText} from '../wailsjs/runtime/runtime';
import {database} from '../wailsjs/go/models';
import {columnWidth, gridShortcut, selectedRow} from './grid-navigation';

export default function ResultGrid({result, busy, selected, onSelect, columnLabels, initialWidths, checkboxColumns, emptyMessage}: {result: database.Result | null; busy: boolean; selected?: number; onSelect?: (row: number) => void; columnLabels?: Record<string, string>; initialWidths?: Record<string, number>; checkboxColumns?: Record<string, string>; emptyMessage?: string}) {
    const grid = useRef<HTMLDivElement>(null);
    const [selection, setSelection] = useState(-1);
    const [widths, setWidths] = useState<Record<string, number>>({});
    const [menu, setMenu] = useState<{row: number; column: number; x: number; y: number} | null>(null);
    const [copyError, setCopyError] = useState('');
    const drag = useRef<{x: number; width: number; key: string} | null>(null);
    const active = selected ?? selection;
    const keyFor = (i: number) => `${i}:${result?.columns[i].name}`;
    const widthFor = (i: number) => widths[keyFor(i)] ?? initialWidths?.[result?.columns[i].name ?? ''] ?? Math.max(90, Math.min(220, (result?.columns[i].name.length ?? 0) * 8 + 24));
    const choose = (row: number) => { setSelection(row); onSelect?.(row); };
    async function copyCells(values: database.Cell[]) {
        try {
            if (!await ClipboardSetText(values.map(value => value.null ? 'NULL' : value.value).join('\t'))) throw new Error('Clipboard unavailable');
            setCopyError('');
        } catch { setCopyError('Could not copy to clipboard.'); }
        setMenu(null);
        if (grid.current?.contains(document.activeElement)) grid.current.focus();
    }
    function copy(row: boolean) {
        if (!menu || !result?.rows[menu.row]) return;
        void copyCells(row ? result.rows[menu.row] : [result.rows[menu.row][menu.column]]);
    }
    return <div ref={grid} className="results" aria-label="Query results" tabIndex={0}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(null); }}
        onKeyDown={event => {
            if (event.key === 'Escape') { setMenu(null); return; }
            if (event.target !== event.currentTarget || busy) return;
            const command = gridShortcut(event.nativeEvent);
            if (result?.rows[active] && command === 'copy') {
                event.preventDefault(); void copyCells(result.rows[active]); return;
            }
            if (result?.rows[active] && command === 'menu') {
                event.preventDefault();
                const rect = event.currentTarget.querySelectorAll('tbody tr')[active]?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
                setMenu({row:active, column:0, x:Math.max(0, Math.min(rect.left,window.innerWidth-170)), y:Math.max(0, Math.min(rect.bottom,window.innerHeight-90))});
                return;
            }
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            const next = selectedRow(event.key, active, result?.rows.length ?? 0);
            if (next !== undefined) { event.preventDefault(); choose(next); event.currentTarget.querySelectorAll('tbody tr')[next]?.scrollIntoView({block:'nearest'}); }
        }} onClick={() => setMenu(null)}>
        {copyError && <div role="alert">{copyError}</div>}
        {result && result.columns.length ? <table style={{width:result.columns.reduce((total, _, i) => total + widthFor(i), 0)}}>
            <colgroup>{result.columns.map((_, i) => <col key={i} style={{width:widthFor(i)}} />)}</colgroup>
            <thead><tr>{result.columns.map((column, i) => <th key={i} title={column.type}>{columnLabels?.[column.name] ?? column.name}
                <span className="column-resizer" role="separator" tabIndex={0} aria-label={`Resize ${columnLabels?.[column.name] ?? column.name} column`} aria-orientation="vertical" aria-valuemin={48} aria-valuemax={800} aria-valuenow={widthFor(i)}
                    onKeyDown={event => {
                        const next = event.key === 'Home' ? 48 : event.key === 'End' ? 800 : event.key === 'ArrowLeft' ? widthFor(i)-10 : event.key === 'ArrowRight' ? widthFor(i)+10 : undefined;
                        if (next !== undefined) { event.preventDefault(); setWidths(current => ({...current, [keyFor(i)]:columnWidth(next)})); }
                    }}
                    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = {x:event.clientX, width:widthFor(i), key:keyFor(i)}; }}
                    onPointerMove={event => { const start = drag.current; if (start && event.currentTarget.hasPointerCapture(event.pointerId)) setWidths(current => ({...current, [start.key]:columnWidth(start.width + event.clientX-start.x)})); }}
                    onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); drag.current = null; }}
                    onLostPointerCapture={() => { drag.current = null; }} />
            </th>)}</tr></thead><tbody>{result.rows.map((row, r) => <tr key={r} aria-selected={active === r} className={active === r ? 'selected-row' : ''}
                onClick={event => { if (!busy) { choose(r); event.currentTarget.closest<HTMLElement>('.results')?.focus(); } }}>
                {row.map((value, c) => <td key={c} className={[value.null ? 'null' : '', /^(?:UNSIGNED )?(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL|YEAR)(\b|$)/i.test(result.columns[c]?.type ?? '') ? 'numeric' : ''].join(' ')} title={value.null ? 'NULL' : value.value}
                    onContextMenu={event => { event.preventDefault(); if (busy) return; choose(r); setMenu({row:r,column:c,x:Math.min(event.clientX,window.innerWidth-170),y:Math.min(event.clientY,window.innerHeight-90)}); }}>
                    {!value.null && checkboxColumns?.[result.columns[c].name] !== undefined && (value.value === checkboxColumns[result.columns[c].name] || value.value === "NO") ? <input type="checkbox" disabled checked={value.value === checkboxColumns[result.columns[c].name]} aria-label={`${columnLabels?.[result.columns[c].name] ?? result.columns[c].name}: ${value.value}`} /> : value.null ? 'NULL' : value.value}</td>)}
            </tr>)}</tbody></table> : <div className="result-empty">{busy ? 'Loading…' : result ? 'No rows returned.' : emptyMessage ?? 'Run a query to display results.'}</div>}
        {menu && <div className="grid-context-menu" role="menu" aria-label="Copy result" style={{left:menu.x,top:menu.y}} onClick={event => event.stopPropagation()} onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setMenu(null); grid.current?.focus(); return; }
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
            const next = selectedRow(event.key, items.indexOf(document.activeElement as HTMLButtonElement), items.length);
            if (next !== undefined) { event.preventDefault(); event.stopPropagation(); items[next]?.focus(); }
        }}>
            <button role="menuitem" autoFocus onClick={() => void copy(false)}>Copy cell</button>
            <button role="menuitem" onClick={() => void copy(true)}>Copy row (tab separated)</button>
        </div>}
    </div>;
}
