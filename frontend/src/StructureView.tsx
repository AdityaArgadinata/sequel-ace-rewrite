import {useEffect, useState} from 'react';
import {Structure} from '../wailsjs/go/main/App';
import {database} from '../wailsjs/go/models';
import ResultGrid from './ResultGrid';

type Props = {tab: string; databaseName: string; table: string; busy: boolean; operation: (work: () => Promise<void>) => Promise<void>};
export default function StructureView({tab, databaseName, table, busy, operation}: Props) {
    const [structure, setStructure] = useState<database.Structure | null>(null);
    const [section, setSection] = useState<'columns' | 'indexes' | 'foreignKeys' | 'definition'>('columns');
    const [error, setError] = useState('');
    async function load() {
        setStructure(null); setError('');
        await operation(async () => {
            try { setStructure(await Structure(tab, databaseName, table)); }
            catch (e) { setError(String(e)); throw e; }
        });
    }
    useEffect(() => { void load(); }, []);
    const result = structure?.[section] ?? null;
    return <section className="query-workspace" aria-label="Table structure">
        <div className="query-heading"><strong>{databaseName}.{table}</strong><span>Read-only structure</span><button disabled={busy} onClick={() => void load()}>Reload structure</button></div>
        <div className="structure-sections" role="group" aria-label="Structure sections">{(['columns','indexes','foreignKeys','definition'] as const).map((name, i) => <button key={name} disabled={busy} aria-pressed={section === name} onClick={() => setSection(name)}>{['Columns','Indexes / Primary key','Foreign keys','CREATE statement'][i]}</button>)}</div>
        {error && <p role="alert" className="notice">{error}</p>}
        {section === 'definition' ? <pre className="create-statement" tabIndex={0} aria-label="CREATE statement">{structure?.definition.rows[0]?.[1]?.value ?? (busy ? 'Loading…' : 'No definition available.')}</pre> : <ResultGrid result={result} busy={busy} />}
        <div className="results-footer"><span>{result?.rows.length ?? 0} metadata rows</span><span>{section === 'indexes' ? 'NON_UNIQUE = 0 means unique. Functional index expressions appear in CREATE statement.' : 'Metadata reflects the current server; reload after schema changes.'}</span></div>
    </section>;
}
