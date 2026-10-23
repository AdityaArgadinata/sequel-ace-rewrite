export function selectedRow(key: string, current: number, count: number): number | undefined {
    if (!count) return undefined;
    switch (key) {
        case 'ArrowDown': return Math.max(0, Math.min(count - 1, current + 1));
        case 'ArrowUp': return Math.min(count - 1, Math.max(0, current - 1));
        case 'Home': return 0;
        case 'End': return count - 1;
        default: return undefined;
    }
}
export function columnWidth(width: number): number { return Math.max(48, Math.min(800, width)); }

export function gridShortcut(event: Pick<KeyboardEvent, 'key' | 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'repeat' | 'isComposing'>): 'copy' | 'menu' | undefined {
    if (event.repeat || event.isComposing || event.altKey) return;
    if (!event.shiftKey && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') return 'copy';
    if (!event.ctrlKey && !event.metaKey && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) return 'menu';
}

// Size Content columns without parsing or changing database values.
export function fittedColumnWidth(column: {name: string; type: string}, cells: ReadonlyArray<{value: string; null?: boolean}>): number {
    return Math.min(260, Math.max(
        48,
        column.name.length * 6 + column.type.length * 4.5 + 26,
        /(?:VAR)?CHAR/i.test(column.type) ? 170 : /DATETIME|TIMESTAMP/i.test(column.type) ? 156 : 0,
        ...cells.map(cell => (cell.null ? 4 : cell.value.length) * 7 + 14),
    ));
}
