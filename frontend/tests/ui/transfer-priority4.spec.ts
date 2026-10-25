import {test,expect,type Page} from '@playwright/test';
import {openApp,openContent,screenshot} from './fixture';
const button=(page:Page,name:string)=>page.getByRole('button',{name,exact:true});
async function manager(page:Page){await button(page,'Manage tables and databases').click();await expect(page.getByRole('region',{name:'Manage tables and databases',exact:true})).toBeVisible();}
async function menu(page:Page){await page.getByLabel('Connection actions',{exact:true}).click();}
async function objectPreview(page:Page){await button(page,'Preview object SQL').click();await expect(page.getByLabel('Object SQL preview',{exact:true})).toBeVisible();}
async function objectAck(page:Page){await page.getByRole('checkbox',{name:'I accept these object/data changes.',exact:true}).check();}
async function csvOpen(page:Page){await page.getByLabel('Content options',{exact:true}).click();await button(page,'Import CSV').click();await button(page,'Open CSV file').click();await expect(page.locator('.csv-sample')).toBeVisible();}

test('Create table previews SQL and refreshes the catalog after confirmation',async({page},info)=>{
 await openContent(page);await manager(page);await page.getByRole('textbox',{name:'Object table',exact:true}).fill('new_table');
 await objectPreview(page);await expect(button(page,'Apply object change')).toBeDisabled();expect(await page.evaluate(()=>(window as any).objectApplies?.length ?? 0)).toBe(0);
 await objectAck(page);await screenshot(page,info,'objects-preview');await button(page,'Apply object change').click();
 await expect(page.getByRole('region',{name:'Manage tables and databases'})).toContainText('1 of 1 statements acknowledged');await button(page,'OK').click();await expect(button(page,'new_table')).toBeVisible();
});

test('Create database and copy options send the reviewed typed request',async({page})=>{
 await openContent(page);await manager(page);await page.getByRole('combobox',{name:'Object kind',exact:true}).selectOption('database');await page.getByRole('textbox',{name:'Object database',exact:true}).fill('created_db');await objectPreview(page);await objectAck(page);await button(page,'Apply object change').click();
 await button(page,'OK').click();await expect(page.getByRole('combobox',{name:'Select Database',exact:true}).locator('option')).toContainText(['created_db']);
 await page.getByRole('combobox',{name:'Object action',exact:true}).selectOption('copy');await page.getByRole('textbox',{name:'Object database',exact:true}).fill('mysql');await page.getByRole('textbox',{name:'Object new name',exact:true}).fill('copied_db');await page.getByRole('checkbox',{name:'Include data',exact:true}).uncheck();await objectPreview(page);await objectAck(page);await button(page,'Apply object change').click();
 expect(await page.evaluate(()=>(window as any).objectApplies.at(-1))).toMatchObject({kind:'database',action:'copy',database:'mysql',name:'copied_db',includeData:false});
});

test('Destructive object changes require the exact source name and do not retry a failed apply',async({page})=>{
 await openContent(page);await manager(page);await page.getByRole('combobox',{name:'Object action',exact:true}).selectOption('truncate');await objectPreview(page);await objectAck(page);await expect(button(page,'Apply object change')).toBeDisabled();await page.getByRole('textbox',{name:'Confirm object name',exact:true}).fill('wrong');await expect(button(page,'Apply object change')).toBeDisabled();
 await page.getByRole('textbox',{name:'Confirm object name',exact:true}).fill('mysql.db');await page.evaluate(()=>{(window as any).objectOutcome={completed:0,total:1,error:'objects changed since preview',uncertain:false,warnings:''};});await button(page,'Apply object change').click();
 await expect(page.getByRole('region',{name:'Manage tables and databases'})).toContainText('Stopped: objects changed since preview');await expect(button(page,'Apply object change')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).objectApplies.length)).toBe(1);
});

test('A partial object copy reports acknowledged steps and uncertainty',async({page})=>{
 await openContent(page);await manager(page);await page.getByRole('combobox',{name:'Object action',exact:true}).selectOption('copy');await page.getByRole('textbox',{name:'Object new name',exact:true}).fill('partial_copy');await page.evaluate(()=>{(window as any).objectOutcome={completed:1,total:3,error:'connection lost',uncertain:true,warnings:''};});await objectPreview(page);await objectAck(page);await button(page,'Apply object change').click();await expect(page.getByRole('region',{name:'Manage tables and databases'})).toContainText('1 of 3 statements acknowledged');await expect(page.getByRole('region',{name:'Manage tables and databases'})).toContainText('outcome is uncertain');
});

test('CSV previews rows, maps columns and reports partial inserts without replay',async({page},info)=>{
 await openContent(page);await csvOpen(page);expect(await page.evaluate(()=>(window as any).csvApplies?.length ?? 0)).toBe(0);await page.getByRole('combobox',{name:'Map CSV column 2',exact:true}).selectOption('');await page.getByRole('combobox',{name:'CSV value format',exact:true}).selectOption('sequel-v1');await button(page,'Preview CSV insert').click();await expect(button(page,'Import CSV records')).toBeDisabled();expect(await page.evaluate(()=>(window as any).csvPlans.at(-1))).toMatchObject({mapping:[{source:0,target:'id'}],format:'sequel-v1'});
 await page.getByRole('checkbox',{name:'I reviewed the CSV mapping and accept partial writes.',exact:true}).check();await screenshot(page,info,'csv-preview');await page.evaluate(()=>{(window as any).csvOutcome={completed:1,total:3,error:'CSV record 2 duplicate key',uncertain:false,warnings:''};});await button(page,'Import CSV records').click();await expect(page.getByRole('region',{name:'Import CSV',exact:true})).toContainText('1 of 3 CSV records acknowledged');await expect(button(page,'Import CSV records')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).csvApplies.length)).toBe(1);
});

test('Filtered exports use applied filters and block dirty filter drafts',async({page})=>{
 await openContent(page);await page.getByRole('textbox',{name:'Filter value',exact:true}).fill('3');await button(page,'Apply Filter(s)').click();await page.getByLabel('Connection actions',{exact:true}).click();await button(page,'Export…').click();await page.getByRole('dialog',{name:'Export',exact:true}).getByRole('tab',{name:'XML',exact:true}).click();await button(page,'Export').click();
 const exported=await page.evaluate(()=>(window as any).dataExports.at(-1));expect(exported.spec).toMatchObject({scope:'filtered',format:'xml',browse:{database:'mysql',table:'db',filters:[{column:'id',operator:'=',value:'3'}]}});
 await page.keyboard.press('Escape');await page.getByRole('textbox',{name:'Filter value',exact:true}).fill('4');await page.getByLabel('Connection actions',{exact:true}).click();await button(page,'Export…').click();await expect(page.getByLabel('Export source').locator('option[value=filtered]')).toHaveAttribute('disabled','');
});

test('Selected SQL exports include only selected loaded rows and omit generated columns',async({page})=>{
 await openContent(page);await page.evaluate(()=>{const app=(window as any).go.main.App,original=app.TableDetails;app.TableDetails=async(...args:any[])=>{const out=await original(...args);out.columns[3].generated=true;return out;};});await button(page,'Reload content').click();await expect(page.locator('tbody tr')).toHaveCount(6);await page.locator('tbody tr').nth(0).click();await page.locator('tbody tr').nth(1).click({modifiers:['Shift']});
 await page.getByLabel('Connection actions',{exact:true}).click();await button(page,'Export…').click();await page.getByLabel('Export source').selectOption('selection');await page.getByRole('dialog',{name:'Export',exact:true}).getByRole('tab',{name:'SQL',exact:true}).click();await button(page,'Export').click();const out=await page.evaluate(()=>(window as any).dataExports.at(-1));expect(out.snapshot.rows.length).toBe(2);expect(out.snapshot.columns.map((c:any)=>c.name)).not.toContain('message');expect(out.spec).toMatchObject({scope:'selection',database:'mysql',table:'db'});
});

test('Query result export does not rerun SQL',async({page})=>{
 await openContent(page);await button(page,'Query').click();await page.getByRole('button',{name:/^Run Query/}).click();await expect.poll(()=>page.evaluate(()=>(window as any).executedSQL?.length ?? 0)).toBe(1);await page.getByLabel('Connection actions',{exact:true}).click();await button(page,'Export…').click();await button(page,'Export').click();expect(await page.evaluate(()=>(window as any).executedSQL.length)).toBe(1);expect(await page.evaluate(()=>(window as any).dataExports.at(-1).spec.scope)).toBe('loaded');
});

test('Native favorites require selection, skip unsupported entries and never connect during import',async({page})=>{
 await openApp(page);await page.getByText('Advanced connection options',{exact:true}).click();await button(page,'Import Sequel Ace favorites').click();const checkboxes=page.getByRole('region',{name:'Native file migration'}).getByRole('checkbox');await expect(checkboxes.nth(1)).toBeDisabled();await button(page,'Import selected favorites').click();await expect(button(page,'Native TCP')).toBeVisible();expect(await page.evaluate(()=>(window as any).connectCalls?.length ?? 0)).toBe(0);expect(await page.evaluate(()=>(window as any).nativeImports[0])).toEqual([0]);await button(page,'Native TCP').click();await expect(page.getByLabel('Host:',{exact:true})).toHaveValue('fixture.invalid');await expect(page.getByLabel('Database:',{exact:true})).toHaveValue('mysql');await expect(page.getByLabel('Password:',{exact:true})).toHaveValue('');
});

test('Opening SPF only populates connection settings; SQL loads after explicit Connect without execution',async({page})=>{
 await openApp(page);await page.getByText('Advanced connection options',{exact:true}).click();await button(page,'Open SPF session').click();await expect(page.getByLabel('Host:',{exact:true})).toHaveValue('fixture.invalid');expect(await page.evaluate(()=>(window as any).connectCalls?.length ?? 0)).toBe(0);await button(page,'Connect').click();await expect(page.getByRole('textbox',{name:'SQL query',exact:true})).toContainText("SELECT 'SPF draft; 😀';");await expect(page.getByRole('combobox',{name:'Select Database',exact:true})).toHaveValue('mysql');expect(await page.evaluate(()=>(window as any).executedSQL?.length ?? 0)).toBe(0);
});

test('Save SPF captures current view and editor state without executing SQL',async({page})=>{
 await openContent(page);await button(page,'Query').click();await page.getByRole('textbox',{name:'SQL query',exact:true}).fill("SELECT 'saved session';");await menu(page);await button(page,'Save Session').click();expect(await page.evaluate(()=>(window as any).savedSessions.at(-1))).toMatchObject({database:'mysql',table:'db',view:'query',sql:"SELECT 'saved session';"});expect(await page.evaluate(()=>(window as any).executedSQL?.length ?? 0)).toBe(0);
});

test('SQL dump import requires confirmation and reports partial execution',async({page})=>{
 await openContent(page);await menu(page);await button(page,'Import…').click();await button(page,'Open SQL dump').click();await page.getByText('SQL preview',{exact:true}).click();await expect(page.getByLabel('SQL import preview',{exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).sqlImports?.length??0)).toBe(0);await page.evaluate(()=>{(window as any).sqlImportOutcome={completed:1,total:3,error:'Statement 2 failed',uncertain:false,warnings:''};});await page.getByRole('dialog',{name:'Import',exact:true}).getByRole('button',{name:'Import',exact:true}).click();await expect(page.getByRole('region',{name:'Import SQL dump',exact:true})).toContainText('1 of 3 statements acknowledged');await expect(page.getByRole('dialog',{name:'Import',exact:true}).getByRole('button',{name:'Import',exact:true})).toHaveCount(0);expect(await page.evaluate(()=>(window as any).sqlImports.length)).toBe(1);
});

test('Object preview fits an 800px window',async({page},info)=>{
 await page.setViewportSize({width:800,height:600});await openContent(page);await manager(page);await page.getByRole('textbox',{name:'Object table',exact:true}).fill('small_table');await objectPreview(page);await objectAck(page);await button(page,'Apply object change').scrollIntoViewIfNeeded();const box=await button(page,'Apply object change').boundingBox();expect(box && box.x>=0 && box.x+box.width<=800 && box.y+box.height<=600).toBeTruthy();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(800);await screenshot(page,info,'objects-small');
});

for (const width of [800,1280]) test(`CSV panel scrolling keeps the shared toolbar in place ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:600});await openContent(page);await csvOpen(page);await page.getByRole('combobox',{name:'Map CSV column 2',exact:true}).selectOption('');await page.getByRole('combobox',{name:'CSV value format',exact:true}).selectOption('sequel-v1');await button(page,'Preview CSV insert').click();await page.getByRole('checkbox',{name:'I reviewed the CSV mapping and accept partial writes.',exact:true}).check();const box=await page.locator('.main-toolbar').boundingBox();expect(box!.y).toBeGreaterThanOrEqual(0);await screenshot(page,info,'csv-small');
});
