// DBView.xib table 289 order. Preserve extra metadata returned by newer servers.
export const indexOrder = ['NON_UNIQUE', 'INDEX_NAME', 'SEQ_IN_INDEX', 'COLUMN_NAME', 'COLLATION', 'CARDINALITY', 'SUB_PART', 'PACKED', 'COMMENT'];
export const structureWidths: Record<string, number> = {
    COLUMN_NAME:145, COLUMN_TYPE:145, LENGTH:102, UNSIGNED:56, ZEROFILL:48,
    BINARY:44, IS_NULLABLE:64, COLUMN_KEY:32, COLUMN_DEFAULT:115, EXTRA:145,
    CHARACTER_SET_NAME:98, COLLATION_NAME:98, COLUMN_COMMENT:130,
};
export const indexWidths: Record<string, number> = {
    NON_UNIQUE:90, INDEX_NAME:100, SEQ_IN_INDEX:92, COLUMN_NAME:140,
    COLLATION:75, CARDINALITY:90, SUB_PART:70, PACKED:70, COMMENT:150,
};

export function reorderColumns<T extends {columns: {name: string}[]; rows: unknown[][]}>(result: T, order: string[]): T {
    const rank = (name: string) => { const position = order.indexOf(name); return position < 0 ? order.length : position; };
    const positions = result.columns.map((_, i) => i).sort((a, b) => rank(result.columns[a].name) - rank(result.columns[b].name));
    return {...result, columns:positions.map(i => result.columns[i]), rows:result.rows.map(row => positions.map(i => row[i]))};
}
