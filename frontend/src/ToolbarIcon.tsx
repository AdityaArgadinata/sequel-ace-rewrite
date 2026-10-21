type Name = 'structure' | 'content' | 'relations' | 'triggers' | 'info' | 'query' | 'users' | 'console' | 'database';

const paths: Record<Name, string> = {
    structure: 'M12 3v6M5 19v-5l7-5 7 5v5M5 14h14M9 3h6v4H9zM2 19h6v3H2zM16 19h6v3h-6z',
    content: 'M4 5h16M4 10h16M4 15h16M4 20h16',
    relations: 'M3 7h14l-3-3m3 3-3 3M21 17H7l3 3m-3-3 3-3M3 7v10M21 7v10',
    triggers: 'M13 2 5 14h6l-1 8 9-13h-7z',
    info: 'M12 8v.1M12 11v7M10 18h4M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    query: 'M3 4h18v16H3zM6 8l3 3-3 3M12 14h5',
    users: 'M10 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M20 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M2 20v-4c0-4 10-4 10 0v4zM13 12c5-2 9 0 9 4v4h-7',
    console: 'M2 4h20v16H2zM5 8h1M9 8h1M13 8h1M17 8h1M5 12h1M9 12h9M5 16h13',
    database: 'M20 5c0 4-16 4-16 0s16-4 16 0M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0',
};

export default function ToolbarIcon({name}: {name: Name}) {
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
