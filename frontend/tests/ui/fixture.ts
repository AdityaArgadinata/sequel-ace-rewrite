import {expect, type Page, type TestInfo} from '@playwright/test';

// Synthetic bridge only: UI checks never connect to a user's server or vault.
export async function openApp(page: Page) {
    await page.addInitScript(() => {
        const cell = (value: string | null) => ({value:value ?? '',null:value === null,binary:false});
        const columns = [['id','INT'],['name','VARCHAR'],['email','VARCHAR'],['message','TEXT'],['post_date','DATETIME']].map(([name,type]) => ({name,type}));
        const rows = [3,4,6,7,8,9].map(id => [String(id),`Sample ${id}`,'sample@example.com',null,'2024-07-05 15:36:11'].map(cell));
        const result = (columns: unknown[], rows: unknown[]) => ({columns,rows,truncated:false,durationMS:2});
        let nativeProfiles:any[]=[];let nativeFolders:string[]=[];let nativeProfileID=0;
        let objectPending:any=null;
        let currentDB='mysql';
        let catalog:Record<string,string[]>={mysql:['db','column_stats','a_table_with_a_very_long_identifier'],database_with_a_long_name:['db','column_stats','a_table_with_a_very_long_identifier']};
        let nextTab = 0;
        let transaction = 'idle';
        let savedHistory: any[]=[{time:'2026-10-23T00:00:00Z',kind:'SELECT',rows:6,durationMS:2,success:true}];
        let favorites: any[]=[];let favoriteID=0;
        let schemaObjects=[
            {kind:'column',name:'id',indexKind:'',definition:"INT NOT NULL AUTO_INCREMENT COMMENT 'keep all'"},
            {kind:'column',name:'name',indexKind:'',definition:'VARCHAR(255) NULL'},
            {kind:'index',name:'PRIMARY',indexKind:'PRIMARY',definition:'(`id`)'},
        ];
        let schemaPending:any=null;
        let adminPending:any=null;let triggers:any[]=[];
        const bridge = {
            Panel:async (_tab:string,kind:string,_db:string,_table:string,user:string)=>{
                if((window as any).panelError)throw new Error((window as any).panelError);
                if(kind==='triggers')return result(['TRIGGER_NAME','ACTION_TIMING','EVENT_MANIPULATION','ACTION_STATEMENT'].map(name=>({name,type:'TEXT'})),triggers.map(r=>[r.name,r.timing,r.event,r.body].map(cell)));
                if(kind==='info')return result(['TABLE_NAME','ENGINE','TABLE_COLLATION','TABLE_COMMENT'].map(name=>({name,type:'TEXT'})),[['db','InnoDB','utf8mb4_unicode_ci','fixture table'].map(cell)]);
                if(kind==='engines')return result([{name:'Engine',type:'TEXT'},{name:'Support',type:'TEXT'}],[['InnoDB','DEFAULT'].map(cell)]);
                if(kind==='collations')return result([{name:'Collation',type:'TEXT'}],[[cell('utf8mb4_unicode_ci')]]);
                if(kind==='users')return result([{name:'User',type:'TEXT'},{name:'Host',type:'TEXT'}],[['fixture','localhost'].map(cell)]);
                if(kind==='grants')return result([{name:'Grants',type:'TEXT'}],[[cell('GRANT SELECT ON `mysql`.* TO '+user)]]);
                if(kind==='help')return result([{name:'name',type:'TEXT'},{name:'description',type:'TEXT'}],[[cell(user),cell('Server SQL help fixture')]]);
                throw new Error('Unexpected panel '+kind);
            },
            PrepareAdmin:async (_tab:string,request:any)=>{((window as any).adminPreviews??=[]).push(request);adminPending={...request};return {token:'admin-token',sql:request.kind==='user'?'Account change; password hidden':request.kind+' '+request.action+' '+request.name};},
            ApplyAdmin:async ()=>{((window as any).adminApplies??=[]).push(adminPending);const request=adminPending;adminPending=null;if((window as any).adminError)throw new Error((window as any).adminError);if(request.kind==='trigger'){if(request.action==='create')triggers.push(request);else triggers=triggers.filter(r=>r.name!==request.name);}return '';},
            Activity:async (_tab:string,clear:boolean)=>clear?[]:[{time:'2026-10-23T00:00:00Z',operation:'SQL query',durationMS:3,success:true}],
            SavePrintView:async (snapshot:any)=>{(window as any).printedSnapshot=snapshot;return true;},

            CheckForUpdates:async(preview:boolean)=>{((window as any).updateChecks??=[]).push(preview);if((window as any).updateError)throw new Error((window as any).updateError);return (window as any).updateResult??{current:'dev',latest:'v0.2.0',available:true,development:true,url:'https://github.com/AdityaArgadinata/sequel-ace-rewrite/releases/tag/v0.2.0',preview:false};},
            SetPreferencesShortcut:async(binding:string)=>{(window as any).nativePreferencesShortcut=binding;},
            ListFavoriteFolders:async()=>{const folders=new Set([...nativeFolders,...nativeProfiles.map(p=>p.folder).filter(Boolean)]);for(const folder of [...folders]){const parts=folder.split('/');for(let i=1;i<parts.length;i++)folders.add(parts.slice(0,i).join('/'));}return [...folders].sort();},
            ChangeFavoriteFolder:async(request:any)=>{((window as any).folderChanges??=[]).push(request);if((window as any).folderOutcome)return (window as any).folderOutcome;const inside=(f:string)=>f===request.folder||f.startsWith(request.folder+'/');let changed=0;if(request.action==='create')nativeFolders.push(request.folder);else{nativeProfiles=nativeProfiles.map(p=>{if(!inside(p.folder??''))return p;changed++;return {...p,folder:request.action==='remove'?'':request.destination+(p.folder??'').slice(request.folder.length)};});nativeFolders=nativeFolders.flatMap(f=>!inside(f)?[f]:request.action==='remove'?[]:[request.destination+f.slice(request.folder.length)]);}return {completed:changed+1,total:changed+1,error:''};},
            SaveProfile:async(profile:any)=>{const saved={...profile,id:profile.id||String(++nativeProfileID)};nativeProfiles=[...nativeProfiles.filter(p=>p.id!==saved.id),saved];((window as any).profileSaves??=[]).push(saved);return saved;},
            DeleteCredentials:async(id:string)=>{((window as any).credentialDeletes??=[]).push(id);},
            ListProfiles:async () => nativeProfiles, Connect:async (connection:any) => {((window as any).connectCalls ??= []).push(connection);return String(++nextTab);}, NewTab:async () => String(++nextTab), CloseTab:async () => {},
            Connected:async () => true, TransactionStatus:async () => transaction, Transaction:async (_tab: string, action: string) => { transaction = action === 'begin' ? 'active' : 'idle'; },
            Cancel:async () => { (window as any).cancelled=true;(window as any).releaseStatement?.(); },
            CompletionSchema:async () => { (window as any).completionCalls=((window as any).completionCalls ?? 0)+1;return result([{name:'TABLE_NAME',type:'VARCHAR'},{name:'COLUMN_NAME',type:'VARCHAR'}],columns.map(c => [cell('db'),cell(c.name)])); },
            PrepareSQL:async (_tab:string,source:string,scope:string,from:number,to:number,head:number) => {
                ((window as any).preparedRequests ??= []).push({source,scope,from,to,head});
                if ((window as any).prepareError) throw new Error((window as any).prepareError);
                const text=scope==='selection' ? source.slice(from,to) : source;
                return {sqlMode:'',statements:(window as any).fixtureStatements ?? [{sql:text,from:0,to:text.length,line:1}]};
            },
            StreamPreparedQuery:async (_tab:string,_id:string,sql:string,privacy:string) => {
                ((window as any).executedSQL ??= []).push({sql,privacy});
                if ((window as any).failStatement && sql.includes((window as any).failStatement)) throw new Error('Fixture SQL error');
                if (privacy!=='off') savedHistory.unshift({time:'2026-10-23T00:00:00Z',kind:'SELECT',rows:1,durationMS:2,success:true,...(privacy==='sql' ? {sql} : {})});
                return result([{name:'value',type:'VARCHAR'}],[[cell(sql)]]);
            },
            OpenCellFile:async (binary:boolean) => { (window as any).cellImportBinary=binary;if((window as any).cellImportError)throw new Error((window as any).cellImportError);return (window as any).cellFile ?? {cancelled:true,value:cell(null),name:''}; },
            SaveCellFile:async (value:any) => { if((window as any).cellExportError)throw new Error((window as any).cellExportError);((window as any).cellExports??=[]).push(value);return true; },
            OpenSQLFile:async () => (window as any).fixtureOpenFile ?? {cancelled:true,name:'',sql:''},
            SaveSQLFile:async (sql:string,name:string) => { (window as any).savedSQLFile={sql,name};return {cancelled:false,name:name || 'query.sql',sql:''}; },
            ListQueryFavorites:async () => favorites,
            SaveQueryFavorite:async (entry:any) => { const saved={...entry,id:entry.id || `favorite-${++favoriteID}`};favorites=[...favorites.filter(f => f.id!==saved.id),saved];return saved; },
            DeleteQueryFavorite:async (id:string) => {favorites=favorites.filter(f => f.id!==id);},
            WorkspaceInfo:async () => result([{name:'VERSION()',type:'VARCHAR'},{name:'DATABASE()',type:'VARCHAR'}],[[cell('13.0.2-MariaDB'),cell(currentDB || null)]]),
            Query:async (_tab: string, sql: string) => { transaction = 'unverified'; return result([{name:'value',type:'VARCHAR'}],[[cell(sql.includes('VERSION') ? '13.0.2-MariaDB' : 'mysql')]]); },
            Databases:async () => result([{name:'Database',type:'VARCHAR'}],Object.keys(catalog).map(name=>[cell(name)])),
            UseDatabase:async (_tab:string,name:string) => {currentDB=name;}, Tables:async (_tab:string,db:string) => result([{name:'Tables',type:'VARCHAR'}],(catalog[db] ?? []).map(name => [cell(name)])),
            TableDetails:async () => ({editable:true,columns:columns.map(c => ({...c,primary:c.name==='id',nullable:c.name!=='id',generated:false,autoIncrement:c.name==='id'}))}),
            Browse:async (_tab: string, request: {column:string;operator:string;value:string;filters:{column:string;operator:string;value:string}[];match:string;sort:string;descending:boolean;offset:number;limit:number}) => {
                (window as any).lastBrowse = request;
                const rules = [...(request.column ? [{column:request.column,operator:request.operator,value:request.value}] : []), ...(request.filters ?? [])];
                if (rules.some(rule => rule.value === 'force-error')) throw new Error('Fixture request failed');
                const matches = (row: typeof rows[number], rule: typeof rules[number]) => {
                    const value = row[columns.findIndex(c => c.name === rule.column)];
                    if (rule.operator === 'is null') return value.null;
                    if (rule.operator === 'is not null') return !value.null;
                    if (rule.operator === 'contains') return value.value.includes(rule.value);
                    return !value.null && value.value === rule.value;
                };
                const output = rows.filter(row => !rules.length || (request.match === 'any' ? rules.some(rule => matches(row,rule)) : rules.every(rule => matches(row,rule))));
                if (request.sort) {
                    const i = columns.findIndex(c => c.name === request.sort);
                    output.sort((a,b) => a[i].value.localeCompare(b[i].value,undefined,{numeric:true}) * (request.descending ? -1 : 1));
                }
                return result(columns,output.slice(request.offset,request.offset+request.limit));
            },
            Mutate:async (_tab: string, request: any) => {
                if (transaction === 'unverified') throw new Error('transaction state is uncertain; use ROLLBACK before writing');
                (window as any).lastMutation = request;
                if (Object.values(request.values).some((v: any) => v.value === 'write-error')) throw new Error('Fixture write failed');
                ((window as any).mutations ??= []).push(request);
                if (request.action === 'insert') {
                    const row = columns.map(c => request.values[c.name] ?? (window as any).insertDefaults?.[c.name] ?? cell(c.name === 'id' ? String(Math.max(...rows.map(row => Number(row[0].value)))+1) : null));
                    rows.push(row); return 1;
                }
                const row = rows.find(row => row[0].value === request.original[0].value);
                if (request.action === 'delete') { if (row) rows.splice(rows.indexOf(row),1); return row ? 1 : 0; }
                if (row) for (const [name,value] of Object.entries(request.values)) row[columns.findIndex(c => c.name === name)] = value as typeof row[number];
                return 1;
            },
            Structure:async () => {
                if ((window as any).schemaReloadError && (window as any).schemaApplies?.length) throw new Error('Fixture metadata reload failed');
                const metadata={
                    charsets:result(['Charset','Description','Default collation'].map(name=>({name,type:'TEXT'})),[['utf8','UTF-8 Unicode','utf8_general_ci'],['utf8mb4','UTF-8 Unicode','utf8mb4_general_ci'],['latin1','cp1252 West European','latin1_swedish_ci']].map(row=>row.map(cell))),
                    collations:result(['Collation','Charset','Default'].map(name=>({name,type:'TEXT'})),[['utf8_general_ci','utf8','Yes'],['utf8_bin','utf8',''],['utf8mb4_general_ci','utf8mb4','Yes'],['utf8mb4_unicode_ci','utf8mb4',''],['utf8mb4_bin','utf8mb4',''],['latin1_swedish_ci','latin1','Yes'],['latin1_bin','latin1','']].map(row=>row.map(cell))),
                    columns:result(['COLUMN_NAME','COLUMN_TYPE','IS_NULLABLE','COLUMN_DEFAULT','COLUMN_KEY','EXTRA','CHARACTER_SET_NAME','COLLATION_NAME','COLUMN_COMMENT','GENERATION_EXPRESSION'].map(name=>({name,type:'VARCHAR'})),schemaObjects.filter(o=>o.kind==='column').map(o=>{
                        const type=o.definition.match(/^[A-Z]+(?:\s+PRECISION)?(?:\(.*?\))?(?:\s+UNSIGNED)?/i)?.[0] ?? 'INT';
                        const text=/^(?:VARCHAR|CHAR|ENUM|SET|.*TEXT)/.test(type);
                        return [o.name,type,o.definition.includes('NOT NULL')?'NO':'YES',null,o.name==='id'?'PRI':'',o.definition.includes('AUTO_INCREMENT')?'auto_increment':o.definition.includes('ON UPDATE')?'on update CURRENT_TIMESTAMP':'',text?'utf8mb4':null,text?'utf8mb4_general_ci':null,o.name==='id'?'keep all':'',''].map(cell);
                    })),
                    indexes:result(['INDEX_NAME','NON_UNIQUE','COLUMN_NAME','SEQ_IN_INDEX','COLLATION','CARDINALITY','SUB_PART','PACKED','COMMENT'].map(name=>({name,type:'VARCHAR'})),schemaObjects.filter(o=>o.kind==='index').flatMap(o=>[...o.definition.matchAll(/`([^`]+)`/g)].map(m=>[cell(o.name),cell(o.indexKind==='INDEX' ? '1' : '0'),cell(m[1]),cell('1'),cell('A'),cell('6'),cell(null),cell(null),cell('')]))),
                    foreignKeys:result([{name:'CONSTRAINT_NAME',type:'VARCHAR'},{name:'COLUMN_NAME',type:'VARCHAR'},{name:'REFERENCED_TABLE_NAME',type:'VARCHAR'}],schemaObjects.filter(o=>o.kind==='foreignKey').map(o=>[cell(o.name),cell('parent_id'),cell('parent')])),
                    definition:result([{name:'Table',type:'VARCHAR'},{name:'Create Table',type:'TEXT'}],[[cell('db'),cell('CREATE TABLE `db` (`id` int PRIMARY KEY)')]]),
                    objects:schemaObjects,editable:!(window as any).schemaReadonly,reason:(window as any).schemaReadonly ? 'Fixture read-only view' : '',
                };
                (window as any).schemaMetadata=metadata;
                return metadata;
            },
            PrepareSchemaChange:async (_tab:string,request:any) => {
                ((window as any).schemaPreviews ??= []).push(request);
                if ((window as any).schemaPrepareError) throw new Error((window as any).schemaPrepareError);
                if(request.columnEdits){
                    request.definition=schemaObjects.find(o=>o.kind==='column' && o.name===request.original)?.definition ?? '';
                    if(request.columnEdits.type)request.definition=request.definition.replace(/^[A-Z]+(?:\s+PRECISION)?/i,request.columnEdits.type);
                    if('length' in request.columnEdits)request.definition=request.definition.replace(/^(\w+)(?:\(.*?\))?/i,`$1${request.columnEdits.length?'('+request.columnEdits.length+')':''}`);
                }
                const prefix=`ALTER TABLE \`${request.database}\`.\`${request.table}\` `;
                let body=request.action==='drop' ? `DROP ${request.kind==='column' ? 'COLUMN' : request.kind==='index' ? 'INDEX' : 'FOREIGN KEY'} \`${request.original}\`` : request.kind==='column' ? `${request.action==='edit' ? 'CHANGE COLUMN \`'+request.original+'\`' : 'ADD COLUMN'} \`${request.name}\` ${request.definition}` : `ADD ${request.kind==='index' ? request.indexKind+' INDEX' : 'CONSTRAINT'} \`${request.name}\` ${request.definition}`;
                schemaPending={request,token:crypto.randomUUID()};
                return {token:schemaPending.token,sql:prefix+body};
            },
            ApplySchemaChange:async (_tab:string,token:string) => {
                if (!schemaPending || schemaPending.token!==token) throw new Error('schema preview expired');
                const {request}=schemaPending;schemaPending=null;
                ((window as any).schemaAttempts ??= []).push(token);
                if ((window as any).schemaApplyError) throw new Error((window as any).schemaApplyError);
                if(request.action!=='add')schemaObjects=schemaObjects.filter(o=>!(o.kind===request.kind && o.name===request.original));
                if(request.action!=='drop')schemaObjects.push({kind:request.kind,name:request.name,indexKind:request.indexKind,definition:request.definition});
                ((window as any).schemaApplies ??= []).push(request);
                return (window as any).schemaWarnings ?? '';
            },
            PrepareObjectChange:async (_tab:string,request:any) => {
                ((window as any).objectPreviews ??= []).push(request);if((window as any).objectPrepareError)throw new Error((window as any).objectPrepareError);
                objectPending={request,token:crypto.randomUUID()};return {token:objectPending.token,sql:(window as any).objectSQL ?? [request.kind==='table' && request.action==='create' ? `CREATE TABLE \`${request.database}\`.\`${request.table}\` ${request.definition}` : `${request.action.toUpperCase()} ${request.kind.toUpperCase()} \`${request.database}\`.\`${request.table || request.name}\``]};
            },
            ApplyObjectChange:async (_tab:string,token:string) => {
                if(!objectPending || objectPending.token!==token)throw new Error('preview expired');const {request:r}=objectPending;objectPending=null;((window as any).objectApplies ??= []).push(r);
                if((window as any).objectOutcome)return (window as any).objectOutcome;
                if(r.kind==='database'){if(r.action==='create')catalog[r.database]=[];if(r.action==='copy' || r.action==='rename'){catalog[r.name]=[...(catalog[r.database] ?? [])];if(r.action==='rename'){delete catalog[r.database];if(currentDB===r.database)currentDB='';}};if(r.action==='drop'){delete catalog[r.database];if(currentDB===r.database)currentDB='';}}
                else {const dest=r.destination || r.database;if(r.action==='create')catalog[r.database].push(r.table);if(r.action==='drop' || r.action==='rename')catalog[r.database]=catalog[r.database].filter(name=>name!==r.table);if(r.action==='copy' || r.action==='rename')(catalog[dest] ??= []).push(r.name);}
                return {completed:1,total:1,error:'',uncertain:false,warnings:''};
            },
            OpenCSV:async () => (window as any).csvFixture ?? {token:'csv',name:'fixture.csv',headers:['id','name'],sample:[['10','Imported']],rows:1,columns:columns.map(c=>({...c,generated:false,nullable:c.name!=='id'})),cancelled:false},
            PrepareCSVImport:async (_tab:string,token:string,mapping:any[],format:string) => {((window as any).csvPlans ??= []).push({token,mapping,format});if((window as any).csvPrepareError)throw new Error((window as any).csvPrepareError);return {token:'csv-plan',sql:'INSERT INTO `mysql`.`db` ('+mapping.map(m=>'`'+m.target+'`').join(',')+') VALUES ('+mapping.map(()=>'?').join(',')+')',rows:1};},
            ApplyCSVImport:async () => {((window as any).csvApplies ??= []).push('applied');return (window as any).csvOutcome ?? {completed:1,total:1,error:'',uncertain:false,warnings:''};},
            ExportDataFile:async (_tab:string,spec:any,snapshot:any) => {((window as any).dataExports ??= []).push({spec,snapshot});return {rows:['loaded','selection'].includes(spec.scope) ? snapshot.rows.length : 6,cancelled:false};},
            InspectDatabase:async (_tab:string,db:string)=>{if((window as any).databaseInventoryError)throw new Error((window as any).databaseInventoryError);return {database:db,fingerprint:'inventory',notice:'Visible objects only. Pause concurrent writes; DEFINER accounts and external references require review. Events restore disabled.',objects:['TABLE','VIEW','FUNCTION','PROCEDURE','TRIGGER','EVENT'].map(kind=>({kind,name:kind.toLowerCase()+'_name',dependencies:kind==='VIEW'?['mysql.base_view']:[]}))};},
            ExportDatabaseFile:async (_tab:string,db:string,fingerprint:string,data:boolean)=>{((window as any).databaseExports??=[]).push({db,fingerprint,data});if((window as any).databaseExportError)throw new Error((window as any).databaseExportError);return {rows:data?6:0,cancelled:!!(window as any).databaseExportCancelled};},
            OpenSQLImport:async () => ({token:'dump',name:'dump.sql',statements:3,preview:'CREATE TABLE test(id INT); INSERT INTO test VALUES(1); INSERT INTO test VALUES(2);',cancelled:false}),
            ApplySQLImport:async () => {((window as any).sqlImports ??= []).push('applied');return (window as any).sqlImportOutcome ?? {completed:3,total:3,error:'',uncertain:false,warnings:''};},
            OpenNativeFavorites:async () => ({token:'native',cancelled:false,candidates:[{profile:{name:'Native TCP',host:'fixture.invalid',port:3307,user:'fixture',tls:true},database:'mysql',issue:''},{profile:{name:'Unsupported socket',host:'',port:3306,user:'root',tls:false},database:'',issue:'socket requires manual setup'}]}),
            ImportNativeFavorites:async (_token:string,indexes:number[]) => {((window as any).nativeImports ??= []).push(indexes);nativeProfiles=[...nativeProfiles,{id:'native1',name:'Native TCP',host:'fixture.invalid',port:3307,user:'fixture',tls:true,initialDatabase:'mysql'}];return {completed:indexes.length,total:indexes.length,error:'',uncertain:false,warnings:''};},
            OpenSPF:async () => ({profile:{name:'SPF fixture',host:'fixture.invalid',port:3307,user:'fixture',tls:true},database:'mysql',table:'db',view:'query',sql:"SELECT 'SPF draft; 😀';",notice:'Passwords ignored; review settings.',cancelled:false}),
            SaveSPF:async (_tab:string,state:any) => {((window as any).savedSessions ??= []).push(state);return true;},
            ListHistory:async () => savedHistory,
            ClearHistory:async () => {savedHistory=[];}, ClearHistorySQL:async () => {savedHistory=savedHistory.map(entry => ({...entry,sql:undefined}));}, ExportTableCSV:async () => ({cancelled:true}),
        };
        Object.assign(window,{go:{main:{App:bridge}},runtime:{BrowserOpenURL:(url:string)=>{(window as any).openedRelease=url;},EventsOnMultiple:(name:string,callback:any) => {((window as any).nativeEvents??={})[name]=callback;return ()=>{delete (window as any).nativeEvents[name];}},EventsOff:() => {},ClipboardSetText:async (text: string) => { (window as any).clipboard = text; return true; }}});
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
