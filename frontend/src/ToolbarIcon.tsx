type Name = 'structure' | 'content' | 'relations' | 'triggers' | 'info' | 'query' | 'users' | 'console' | 'database';

// Original view-mode symbols are named in SPDatabaseDocument+ViewMode.swift.
// These portable SVG drawings are our own; Apple SF Symbols artwork is not bundled.
const paths: Record<Name, string> = {
    structure: 'M4 8 12 3l8 5-8 5-8-5zM4 12l8 5 8-5M4 16l8 5 8-5M12 13v8',
    content: 'M4 5h16M4 10h16M4 15h16M4 20h16',
    relations: 'M4 13V7a3 3 0 0 1 3-3h11M15 1l3 3-3 3M20 11v6a3 3 0 0 1-3 3H6M9 17l-3 3 3 3',
    triggers: 'M13 5 7 13h4l-1 6 7-9h-5l1-5zM22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    info: 'M12 8v.1M12 11v7M10 18h4M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    query: 'M3 4h18v16H3zM6 8l3 3-3 3M12 14h5',
    users: 'M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M7 20v-3c0-5 10-5 10 0v3H7zM5 5a2 2 0 1 0 0 4M19 5a2 2 0 1 1 0 4M4 12c-3 0-3 3-3 5h3M20 12c3 0 3 3 3 5h-3',
    console: 'M2 4h20v16H2zM5 8h1M9 8h1M13 8h1M17 8h1M5 12h1M9 12h9M5 16h13',
    database: 'M20 5c0 4-16 4-16 0s16-4 16 0M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0',
};

export default function ToolbarIcon({name}: {name: Name}) {
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
