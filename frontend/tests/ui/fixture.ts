import {expect, type Page, type TestInfo} from '@playwright/test';

// Synthetic bridge only: UI checks never connect to a user's server or vault.
export async function openApp(page: Page) {
    await page.addInitScript(() => {
        const cell = (value: string | null) => ({value:value ?? '',null:value === null,binary:false});
        const columns = [['id','INT'],['name','VARCHAR'],['email','VARCHAR'],['message','TEXT'],['post_date','DATETIME']].map(([name,type]) => ({name,type}));
        const rows = [3,4,6,7,8,9].map(id => [String(id),`Sample ${id}`,'sample@example.com',null,'2024-07-05 15:36:11'].map(cell));
        const result = (columns: unknown[], rows: unknown[]) => ({columns,rows,truncated:false,durationMS:2});
        let nextTab = 0;
        const bridge = {
            ListProfiles:async () => [], Connect:async () => String(++nextTab), NewTab:async () => String(++nextTab), CloseTab:async () => {},
            Connected:async () => true, TransactionStatus:async () => 'idle', Transaction:async () => {},
            Query:async (_tab: string, sql: string) => result([{name:'value',type:'VARCHAR'}],[[cell(sql.includes('VERSION') ? '13.0.2-MariaDB' : 'mysql')]]),
            Databases:async () => result([{name:'Database',type:'VARCHAR'}],[[cell('mysql')],[cell('database_with_a_long_name')]]),
            UseDatabase:async () => {}, Tables:async () => result([{name:'Tables',type:'VARCHAR'}],['db','column_stats','a_table_with_a_very_long_identifier'].map(name => [cell(name)])),
            TableDetails:async () => ({editable:true,columns:columns.map(c => ({...c,primary:c.name==='id',nullable:c.name!=='id',generated:false}))}),
            Browse:async (_tab: string, request: {column:string;value:string}) => {
                (window as any).lastBrowse = request;
                if (request.column && request.value==='force-error') throw new Error('Fixture request failed');
                return result(columns,request.column ? rows.filter(row => row[0].value===request.value) : rows);
            },
            Structure:async () => ({
                columns:result([{name:'COLUMN_NAME',type:'VARCHAR'},{name:'COLUMN_TYPE',type:'VARCHAR'},{name:'IS_NULLABLE',type:'VARCHAR'}],[[cell('id'),cell('int'),cell('NO')],[cell('name'),cell('varchar(255)'),cell('YES')]]),
                indexes:result([{name:'INDEX_NAME',type:'VARCHAR'},{name:'NON_UNIQUE',type:'INT'},{name:'COLUMN_NAME',type:'VARCHAR'}],[[cell('PRIMARY'),cell('0'),cell('id')]]),
                foreignKeys:result([],[]),definition:result([{name:'Table',type:'VARCHAR'},{name:'Create Table',type:'TEXT'}],[[cell('db'),cell('CREATE TABLE `db` (`id` int PRIMARY KEY)')]]),
            }),
            ListHistory:async () => [{time:'2026-10-23T00:00:00Z',kind:'SELECT',rows:6,durationMS:2,success:true}],
            ClearHistory:async () => {}, ExportTableCSV:async () => ({cancelled:true}),
        };
        Object.assign(window,{go:{main:{App:bridge}},runtime:{EventsOnMultiple:() => () => {},EventsOff:() => {},ClipboardSetText:async () => true}});
    });
    await page.goto('/');
    // A headless browser has no native behind-window material. Keep test text readable.
    await page.addStyleTag({content:':root.native-vibrancy { background:var(--workspace); --sidebar:#303334; }'});
    await expect(page.getByRole('button',{name:'Connect',exact:true})).toBeEnabled();
}

export async function openContent(page: Page) {
    await openApp(page);
    await page.getByRole('button',{name:'Connect',exact:true}).click();
    await page.getByRole('combobox',{name:'Select Database',exact:true}).selectOption('mysql');
    await page.getByRole('button',{name:'db',exact:true}).click();
    await expect(page.locator('tbody tr')).toHaveCount(6);
}

export async function readableSelects(page: Page) {
    for (const select of await page.locator('select:visible').all()) {
        const metrics = await select.evaluate(node => {
            const s=getComputedStyle(node), rect=node.getBoundingClientRect();
            return {appearance:s.getPropertyValue('appearance') || s.getPropertyValue('-webkit-appearance'),
                height:rect.height, available:node.clientHeight-parseFloat(s.paddingTop)-parseFloat(s.paddingBottom),
                line:parseFloat(s.lineHeight), text:s.color, background:s.backgroundColor, arrow:s.backgroundImage};
        });
        expect(metrics.appearance).toBe('none');
        expect(metrics.height).toBeGreaterThanOrEqual(24);
        expect(metrics.available).toBeGreaterThanOrEqual(metrics.line);
        expect(metrics.text).not.toBe(metrics.background);
        expect(metrics.arrow).not.toBe('none');
    }
}

export async function screenshot(page: Page, info: TestInfo, name: string) {
    const path=info.outputPath(`${name}.png`);
    await page.screenshot({path});
    await info.attach(name,{path,contentType:'image/png'});
}
