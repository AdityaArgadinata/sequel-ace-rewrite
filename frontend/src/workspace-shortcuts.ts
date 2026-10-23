type ShortcutEvent = {key:string; metaKey:boolean; ctrlKey:boolean; altKey:boolean; shiftKey:boolean; repeat:boolean; isComposing:boolean};
export function workspaceShortcut(event: ShortcutEvent, mac: boolean): 'structure' | 'content' | 'relations' | 'triggers' | 'info' | 'query' | 'refresh' | 'filter' | undefined {
    if (event.repeat || event.isComposing || event.shiftKey) return;
    if (mac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    // Cmd+F is available in Content; the native menu also provides Option+Cmd+F.
    if (key === 'f' && (!event.altKey || mac)) return 'filter';
    if (event.altKey) return;
    switch (key) {
        case '1': return 'structure';
        case '2': return 'content';
        case '3': return 'relations';
        case '4': return 'triggers';
        case '5': return 'info';
        case '6': return 'query';
        case 'r': return 'refresh';
    }
}
