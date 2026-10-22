// DBView.xib table 289 order. Preserve extra metadata returned by newer servers.
export const indexOrder = ['NON_UNIQUE', 'INDEX_NAME', 'SEQ_IN_INDEX', 'COLUMN_NAME', 'COLLATION', 'CARDINALITY', 'SUB_PART', 'PACKED', 'COMMENT'];
export const structureWidths: Record<string, number> = {
    COLUMN_NAME:54.5, COLUMN_TYPE:69.5, IS_NULLABLE:57, COLUMN_KEY:48,
    COLUMN_DEFAULT:48, EXTRA:65, CHARACTER_SET_NAME:48.5,
    COLLATION_NAME:54.5, COLUMN_COMMENT:48, GENERATION_EXPRESSION:160,
};
export const indexWidths: Record<string, number> = {
    NON_UNIQUE:73.5, INDEX_NAME:64.5, SEQ_IN_INDEX:77, COLUMN_NAME:85,
    COLLATION:55.5, CARDINALITY:65.5, SUB_PART:56, PACKED:48, COMMENT:106,
};

export function reorderColumns<T extends {columns: {name: string}[]; rows: unknown[][]}>(result: T, order: string[]): T {
    const rank = (name: string) => { const position = order.indexOf(name); return position < 0 ? order.length : position; };
    const positions = result.columns.map((_, i) => i).sort((a, b) => rank(result.columns[a].name) - rank(result.columns[b].name));
    return {...result, columns:positions.map(i => result.columns[i]), rows:result.rows.map(row => positions.map(i => row[i]))};
}
