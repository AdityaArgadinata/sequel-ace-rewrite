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
