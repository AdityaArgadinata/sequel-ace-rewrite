import {useState} from 'react';
import {database} from '../wailsjs/go/models';

type Props = {details: database.TableDetails; row: database.Cell[] | null; busy: boolean; onSave: (values: Record<string, database.Cell>) => void; onCancel: () => void};
export default function RowEditor({details, row, busy, onSave, onCancel}: Props) {
    const [values, setValues] = useState(() => details.columns.map((_, i) => new database.Cell(row?.[i] ?? {value: '', null: false, binary: false})));
    const [included, setIncluded] = useState<boolean[]>(details.columns.map(() => false));
    function change(i: number, patch: Partial<database.Cell>) {
        setValues(old => old.map((v, index) => index === i ? new database.Cell({...v, ...patch}) : v));
        setIncluded(old => old.map((v, index) => index === i ? true : v));
    }
    return <form className="row-editor" aria-label={row ? 'Edit row' : 'Insert row'} onSubmit={e => {
        e.preventDefault(); const output: Record<string, database.Cell> = Object.create(null);
        details.columns.forEach((c, i) => { if (included[i] && !c.generated) output[c.name] = values[i]; });
        onSave(output);
    }}>
        <strong>{row ? 'Edit selected row' : 'Insert row'}</strong>
        <p>Check columns to write. Unchecked columns {row ? 'keep their values' : 'use server defaults'}. Binary values use 0x hex. NULL is separate from empty text.</p>
        <div className="row-editor-fields">{details.columns.map((c, i) => <div className="row-editor-field" key={c.name}>
            <label><input type="checkbox" aria-label={`Write ${c.name}`} disabled={busy || c.generated} checked={included[i]} onChange={e => setIncluded(old => old.map((v, index) => index === i ? e.target.checked : v))} />{c.name}{c.primary ? ' (PK)' : ''} · {c.type}{c.generated ? ' · generated' : ''}</label>
            <input aria-label={`Value ${c.name}`} disabled={busy || c.generated || !included[i] || values[i].null} value={values[i].value} onChange={e => change(i, {value: e.target.value})} />
            <label><input type="checkbox" disabled={busy || c.generated || !included[i] || !c.nullable} checked={values[i].null} onChange={e => change(i, {null: e.target.checked})} /> NULL</label>
            <label><input type="checkbox" disabled={busy || c.generated || !included[i] || values[i].null} checked={values[i].binary} onChange={e => change(i, {binary: e.target.checked})} /> Hex</label>
        </div>)}</div>
        <div><button type="submit" disabled={busy || (!!row && !included.some(Boolean))}>Save row</button> <button type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
    </form>;
}
