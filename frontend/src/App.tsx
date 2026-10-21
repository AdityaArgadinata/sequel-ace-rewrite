import {useState} from 'react';
import {Cancel, Connect, Connected, Databases, Disconnect, Query, StreamQuery, Tables, UseDatabase} from '../wailsjs/go/main/App';
import {database} from '../wailsjs/go/models';
import {EventsOn} from '../wailsjs/runtime/runtime';
import './App.css';
import ConnectionForm from './ConnectionForm';

export default function App() {
    const [connected, setConnected] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('Hubungkan server untuk memulai.');
    const [databases, setDatabases] = useState<string[]>([]);
    const [selectedDB, setSelectedDB] = useState('');
    const [tables, setTables] = useState<string[]>([]);
    const [sql, setSQL] = useState('SELECT VERSION(), DATABASE(), CONNECTION_ID();');
    const [result, setResult] = useState<database.Result | null>(null);

    async function operation(work: () => Promise<void>) {
        setBusy(true);
        setMessage('Memproses…');
        try {
            await work();
        } catch (error) {
            setMessage(String(error));
        } finally {
            try {
                const live = await Connected();
                setConnected(live);
                if (!live) {
                    setDatabases([]); setTables([]); setSelectedDB('');
                    setMessage(previous => `${previous} Sesi tidak aktif; hubungkan ulang. Query pengubah data yang terputus perlu diperiksa hasilnya sebelum diulang.`);
                }
            } catch {
                setConnected(false);
                setMessage('Backend tidak tersedia. Jalankan jendela desktop melalui Wails.');
            }
            setBusy(false);
        }
    }

    async function connect(connection: database.Connection) {
        setResult(null);
        await operation(async () => {
            await Connect(connection);
            const list = await Databases();
            setDatabases(list.rows.map(row => row[0].value));
            setMessage('Terhubung. Pilih database atau jalankan satu statement SQL.');
        });
    }

    async function chooseDatabase(name: string) {
        setTables([]);
        setResult(null);
        await operation(async () => {
            await UseDatabase(name);
            setSelectedDB(name);
            const list = await Tables(name);
            setTables(list.rows.map(row => row[0].value));
            setMessage(`Database aktif: ${name}`);
        });
    }

    async function refreshSchema() {
        await operation(async () => {
            const current = await Query('SELECT DATABASE()');
            const active = current.rows[0]?.[0];
            const name = active && !active.null ? active.value : '';
            setSelectedDB(name);
            const list = await Databases();
            setDatabases(list.rows.map(row => row[0].value));
            setTables(name ? (await Tables(name)).rows.map(row => row[0].value) : []);
            setMessage('Daftar database dan tabel diperbarui.');
        });
    }

    async function run() {
        setResult(null);
        await operation(async () => {
            const id = crypto.randomUUID();
            let accepting = true;
            let offset = 0;
            const stop = EventsOn('query:batch', (event: {id: string; batch: Pick<database.Result, 'columns' | 'rows'> & {offset: number}}) => {
                if (!accepting || event.id !== id || event.batch.offset !== offset) return;
                const batch = event.batch;
                offset += batch.rows.length;
                setResult(previous => new database.Result({
                    columns: batch.columns,
                    rows: [...(previous?.rows ?? []), ...batch.rows],
                    truncated: false, durationMS: 0,
                }));
                setMessage(`${offset} baris dimuat · query masih berjalan…`);
            });
            try {
                const output = await StreamQuery(id, sql);
                accepting = false;
                // The final snapshot wins even if a batch was delayed or missed.
                setResult(output);
                setMessage(`${output.rows.length} baris dimuat · ${output.durationMS} ms${output.truncated ? ' · Hasil terpotong: batas 500 baris / 4 MiB atau result set tambahan. Gunakan satu result set dan LIMIT lebih kecil.' : ''}${output.columns.length === 0 ? ' · Statement selesai tanpa result set; statement dapat mengubah data.' : ''}`);
            } catch (error) {
                // Partial rows from a failed/cancelled query are not a complete result.
                setResult(null);
                throw error;
            } finally {
                accepting = false;
                stop();
            }

        });
    }

    return (
        <main>
            <header><div><p className="eyebrow">MYSQL / MARIADB · DESKTOP</p><h1>Sequel Rewrite</h1></div><span className="badge">{connected ? 'Terhubung' : 'Offline'}</span></header>
            {!connected && <ConnectionForm busy={busy} onConnect={connect} />}
            <div className="workspace">
                <aside><h2>Database</h2>
                    <select aria-label="Database browser" value={selectedDB} disabled={!connected || busy} onChange={e => void chooseDatabase(e.target.value)}>
                        <option value="" disabled>Pilih database</option>
                        {databases.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                    <button className="secondary" disabled={!connected || busy} onClick={() => void refreshSchema()}>Segarkan daftar</button>
                    <h2>Tabel</h2><p className="muted">Klik tabel untuk menyiapkan SELECT. Setelah USE atau DDL manual, segarkan daftar.</p>
                    <ul>{tables.map(name => <li key={name}><button className="table-name" disabled={busy} onClick={() => setSQL(`SELECT * FROM \`${selectedDB.replaceAll('`', '``')}\`.\`${name.replaceAll('`', '``')}\` LIMIT 100;`)}>{name}</button></li>)}</ul>
                </aside>
                <section className="editor" aria-label="Query SQL">
                    <label htmlFor="sql">Satu statement SQL</label>
                    <textarea id="sql" rows={8} value={sql} onChange={e => setSQL(e.target.value)} spellCheck={false} disabled={busy} />
                    <div className="toolbar">
                        <button disabled={!connected || busy || !sql.trim()} onClick={() => void run()}>Jalankan SQL</button>
                        {busy && <button className="secondary" onClick={() => { void Cancel().catch(error => setMessage(String(error))); }}>Batalkan</button>}
                        <button className="secondary" disabled={!connected || busy} onClick={() => void operation(async () => { await Disconnect(); setResult(null); setMessage('Koneksi ditutup.'); })}>Putuskan</button>
                    </div>
                    <p className="muted">SQL dijalankan langsung, termasuk perubahan data. Cancel/timeout memutus sesi; tidak ada retry otomatis.</p>
                </section>
            </div>
            <p role="status" className="status">{message}</p>
            {result && <section className="results" aria-label="Hasil query"><table>
                <thead><tr>{result.columns.map((column, i) => <th key={i}>{column.name}<small>{column.type}</small></th>)}</tr></thead>
                <tbody>{result.rows.map((row, r) => <tr key={r}>{row.map((value, c) => <td key={c} className={value.null ? 'null' : ''}>{value.null ? 'NULL' : value.value === '' ? <span className="muted">(kosong)</span> : value.value}</td>)}</tr>)}</tbody>
            </table></section>}
        </main>
    );
}
