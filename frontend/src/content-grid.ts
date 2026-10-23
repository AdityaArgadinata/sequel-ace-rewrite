import type {database} from '../wailsjs/go/models';

export function selectRows(current: number[], anchor: number, row: number, count: number, toggle = false, range = false): number[] {
    if (row < 0 || row >= count) return [];
    if (range && anchor >= 0 && anchor < count) {
        const start = Math.min(anchor,row), end = Math.max(anchor,row);
        const rows = Array.from({length:end-start+1},(_,i) => start+i);
        return toggle ? [...new Set([...current,...rows])].sort((a,b) => a-b) : rows;
    }
    return toggle ? (current.includes(row) ? current.filter(r => r !== row) : [...current,row].sort((a,b) => a-b)) : [row];
}

export function adjacentCell(row: number, column: number, rows: number, editable: boolean[], key: 'Tab' | 'Enter', reverse = false): {row: number; column: number} | undefined {
    const step = reverse ? -1 : 1;
    if (key === 'Enter') {
        const next = row+step;
        return next >= 0 && next < rows && editable[column] ? {row:next,column} : undefined;
    }
    for (let i = row*editable.length+column+step; i >= 0 && i < rows*editable.length; i += step) {
        if (editable[i%editable.length]) return {row:Math.floor(i/editable.length),column:i%editable.length};
    }
}

const identifier = (name: string) => '`'+name.replaceAll('`','``')+'`';
export function copyRows(columns: database.Column[], rows: database.Cell[][], format: 'tsv' | 'headers' | 'csv' | 'sql', table = '', databaseName = ''): string {
    if (format === 'sql') {
        const literal = (cell: database.Cell) => {
            if (cell.null) return 'NULL';
            if (cell.binary && /^0x(?:[0-9a-f]{2})*$/i.test(cell.value)) return cell.value.length > 2 ? cell.value : "X''";
            const hex = [...new TextEncoder().encode(cell.value)].map(byte => byte.toString(16).padStart(2,'0')).join('');
            return hex ? `CONVERT(0x${hex} USING utf8mb4)` : "''";
        };
        return rows.map(row => `INSERT INTO ${identifier(databaseName)}.${identifier(table)} (${columns.map(c => identifier(c.name)).join(', ')}) VALUES (${row.map(literal).join(', ')});`).join('\n');
    }
    const csv = (value: string) => '"'+value.replaceAll('"','""')+'"';
    const lines = rows.map(row => row.map(cell => cell.null ? (format === 'csv' ? '\\N' : 'NULL') : format === 'csv' ? csv(cell.value) : cell.value).join(format === 'csv' ? ',' : '\t'));
    if (format === 'headers' || format === 'csv') lines.unshift(columns.map(c => format === 'csv' ? csv(c.name) : c.name).join(format === 'csv' ? ',' : '\t'));
    return lines.join(format === 'csv' ? '\r\n' : '\n');
}
