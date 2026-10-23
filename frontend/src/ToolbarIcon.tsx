type Name = 'structure' | 'content' | 'relations' | 'triggers' | 'info' | 'query' | 'users' | 'console' | 'database' | 'table' | 'search' | 'add' | 'remove' | 'refresh' | 'eye' | 'more' | 'filter' | 'duplicate' | 'back' | 'forward' | 'edit' | 'settings';

// Original view-mode symbols are named in SPDatabaseDocument+ViewMode.swift.
// These portable SVG drawings are our own; Apple SF Symbols artwork is not bundled.
const paths: Record<Name, string> = {
    settings: 'M19.39 8.94L21.78 9.92L21.78 14.08L19.39 15.06L19.39 15.06L20.39 17.45L17.45 20.39L15.06 19.39L15.06 19.39L14.08 21.78L9.92 21.78L8.94 19.39L8.94 19.39L6.55 20.39L3.61 17.45L4.61 15.06L4.61 15.06L2.22 14.08L2.22 9.92L4.61 8.94L4.61 8.94L3.61 6.55L6.55 3.61L8.94 4.61L8.94 4.61L9.92 2.22L14.08 2.22L15.06 4.61L15.06 4.61L17.45 3.61L20.39 6.55L19.39 8.94zM8.5 12a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0',
    structure: 'M12 6v7M12 13 5 18M12 13l7 5M10 3a2 2 0 1 0 4 0 2 2 0 0 0-4 0M3 20a2 2 0 1 0 4 0 2 2 0 0 0-4 0M17 20a2 2 0 1 0 4 0 2 2 0 0 0-4 0',
    content: 'M4 5h16M4 10h16M4 15h16M4 20h16',
    relations: 'M4 13V7a3 3 0 0 1 3-3h11M15 1l3 3-3 3M20 11v6a3 3 0 0 1-3 3H6M9 17l-3 3 3 3',
    triggers: 'M13 5 7 13h4l-1 6 7-9h-5l1-5zM22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    info: 'M12 8v.1M12 11v7M10 18h4M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    query: 'M3 4h18v16H3zM6 8l3 3-3 3M12 14h5',
    users: 'M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M7 20v-3c0-5 10-5 10 0v3H7zM5 5a2 2 0 1 0 0 4M19 5a2 2 0 1 1 0 4M4 12c-3 0-3 3-3 5h3M20 12c3 0 3 3 3 5h-3',
    console: 'M2 4h20v16H2zM5 8h1M9 8h1M13 8h1M17 8h1M5 12h1M9 12h9M5 16h13',
    table: 'M2 3h20v18H2zM2 9h20M2 15h20M8 3v18M15 3v18',
    search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6',
    add: 'M12 4v16M4 12h16',
    remove: 'M4 12h16',
    refresh: 'M17 6a8 8 0 1 0 3 7M12 2l5 4-5 4',
    eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0',
    more: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M7 12h.1M12 12h.1M17 12h.1',
    filter: 'M3 4h18l-7 8v8l-4-2v-6z',
    duplicate: 'M5 8h11v13H5zM9 8V3h11v13h-4',
    back: 'M15 5l-7 7 7 7',
    forward: 'M9 5l7 7-7 7',
    edit: 'M4 16 16 4l4 4L8 20H4v-4zM13 7l4 4',
    database: 'M20 5c0 4-16 4-16 0s16-4 16 0M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0',
};

export default function ToolbarIcon({name}: {name: Name}) {
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'table' ? "1" : "1.5"} strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
