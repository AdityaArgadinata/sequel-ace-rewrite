import {useRef, useState} from 'react';
import {ClipboardSetText} from '../wailsjs/runtime/runtime';
import {database} from '../wailsjs/go/models';
import {columnWidth, selectedRow} from './grid-navigation';

export default function ResultGrid({result, busy, selected, onSelect}: {result: database.Result | null; busy: boolean; selected?: number; onSelect?: (row: number) => void}) {
    const [selection, setSelection] = useState(-1);
    const [widths, setWidths] = useState<Record<string, number>>({});
    const [menu, setMenu] = useState<{row: number; column: number; x: number; y: number} | null>(null);
    const [copyError, setCopyError] = useState('');
    const drag = useRef<{x: number; width: number; key: string} | null>(null);
    const active = selected ?? selection;
    const keyFor = (i: number) => `${i}:${result?.columns[i].name}`;
    const widthFor = (i: number) => widths[keyFor(i)] ?? Math.max(90, Math.min(220, (result?.columns[i].name.length ?? 0) * 8 + 24));
    const choose = (row: number) => { setSelection(row); onSelect?.(row); };
    async function copy(row: boolean) {
        if (!menu || !result) return;
        const values = row ? result.rows[menu.row] : [result.rows[menu.row][menu.column]];
        try {
            if (!await ClipboardSetText(values.map(value => value.null ? 'NULL' : value.value).join('\t'))) throw new Error('Clipboard unavailable');
            setCopyError('');
        } catch { setCopyError('Could not copy to clipboard.'); }
        setMenu(null);
    }
    return <div className="results" aria-label="Query results" tabIndex={0}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(null); }}
        onKeyDown={event => {
            if (event.key === 'Escape') setMenu(null);
            if (event.target !== event.currentTarget || busy || event.altKey || event.ctrlKey || event.metaKey) return;
            const next = selectedRow(event.key, active, result?.rows.length ?? 0);
            if (next !== undefined) { event.preventDefault(); choose(next); event.currentTarget.querySelectorAll('tbody tr')[next]?.scrollIntoView({block:'nearest'}); }
        }} onClick={() => setMenu(null)}>
        {copyError && <div role="alert">{copyError}</div>}
        {result && result.columns.length ? <table style={{width:result.columns.reduce((total, _, i) => total + widthFor(i), 0)}}>
            <colgroup>{result.columns.map((_, i) => <col key={i} style={{width:widthFor(i)}} />)}</colgroup>
            <thead><tr>{result.columns.map((column, i) => <th key={i} title={column.type}>{column.name}
                <span className="column-resizer" role="separator" tabIndex={0} aria-label={`Resize ${column.name} column`} aria-orientation="vertical" aria-valuemin={48} aria-valuemax={800} aria-valuenow={widthFor(i)}
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
                    {value.null ? 'NULL' : value.value}</td>)}
            </tr>)}</tbody></table> : <div className="result-empty">{busy ? 'Loading…' : result ? 'No rows returned.' : 'Run a query to display results.'}</div>}
        {menu && <div className="grid-context-menu" role="menu" aria-label="Copy result" style={{left:menu.x,top:menu.y}} onClick={event => event.stopPropagation()}>
            <button role="menuitem" autoFocus onClick={() => void copy(false)}>Copy cell</button>
            <button role="menuitem" onClick={() => void copy(true)}>Copy row (tab separated)</button>
        </div>}
    </div>;
}
