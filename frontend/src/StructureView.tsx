import {useEffect, useId, useState} from 'react';
import {Structure} from '../wailsjs/go/main/App';
import {database} from '../wailsjs/go/models';
import ResultGrid from './ResultGrid';
import Splitter from './Splitter';
import {indexOrder, reorderColumns, structureWidths, indexWidths} from './structure-columns';

// Display labels match DBView.xib; metadata identifiers and values stay intact.
const columnLabels: Record<string, string> = {
    COLUMN_NAME:'Field', COLUMN_TYPE:'Type', IS_NULLABLE:'Allow Null',
    COLUMN_DEFAULT:'Default', COLUMN_KEY:'Key', EXTRA:'Extra',
    CHARACTER_SET_NAME:'Encoding', COLLATION_NAME:'Collation', COLUMN_COMMENT:'Comment',
    GENERATION_EXPRESSION:'Generation expression', INDEX_NAME:'Key_name',
    NON_UNIQUE:'Non_unique', SEQ_IN_INDEX:'Seq_in_index', COLLATION:'Collation',
    SUB_PART:'Sub_part', INDEX_TYPE:'Index type', NULLABLE:'Nullable',
};
const indexLabels = {...columnLabels, COLUMN_NAME:'Column_name'};

type Props = {tab: string; databaseName: string; table: string; busy: boolean; operation: (work: () => Promise<void>) => Promise<void>};
export default function StructureView({tab, databaseName, table, busy, operation}: Props) {
    const [structure, setStructure] = useState<database.Structure | null>(null);
    const [section, setSection] = useState<'columns' | 'foreignKeys' | 'definition'>('columns');
    const [height, setHeight] = useState(60);
    const columnsID = useId();
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
        <div className="structure-sections" role="group" aria-label="Structure sections">{(['columns','foreignKeys','definition'] as const).map((name, i) => <button key={name} disabled={busy} aria-pressed={section === name} onClick={() => setSection(name)}>{['Columns & Indexes','Foreign keys','CREATE statement'][i]}</button>)}</div>
        {error && <p role="alert" className="notice">{error}</p>}
        {section === 'columns' ? <div className="structure-stack"><div id={columnsID} className="structure-columns" style={{flexBasis:`${height}%`}}><ResultGrid result={structure?.columns ?? null} busy={busy} columnLabels={columnLabels} initialWidths={structureWidths} checkboxColumns={{IS_NULLABLE:"YES"}} emptyMessage="No structure available." /><div className="schema-actions"><button disabled title="Schema editing is not available" aria-label="Add field unavailable">＋</button><button disabled title="Schema editing is not available" aria-label="Delete field unavailable">−</button><span>Read-only structure</span><button disabled={busy} onClick={() => void load()} aria-label="Reload structure" title="Reload structure">↻</button></div></div><Splitter label="Columns panel height" controls={columnsID} axis="y" value={height} min={25} max={80} onChange={setHeight} /><div className="structure-indexes"><div className="query-heading"><strong>INDEXES</strong><span>Read-only</span></div><ResultGrid result={structure ? reorderColumns(structure.indexes, indexOrder) : null} busy={busy} columnLabels={indexLabels} initialWidths={indexWidths} emptyMessage="No indexes available." /><div className="schema-actions"><button disabled title="Schema editing is not available" aria-label="Add index unavailable">＋</button><button disabled title="Schema editing is not available" aria-label="Delete index unavailable">−</button><span>NON_UNIQUE = 0: unique</span></div></div></div> : section === 'definition' ? <pre className="create-statement" tabIndex={0} aria-label="CREATE statement">{structure?.definition.rows[0]?.[1]?.value ?? (busy ? 'Loading…' : 'No definition available.')}</pre> : <ResultGrid result={result} busy={busy} />}
        <div className="results-footer"><span>{result?.rows.length ?? 0} metadata rows</span><span>Metadata reflects the current server; reload after schema changes.</span></div>
    </section>;
}
