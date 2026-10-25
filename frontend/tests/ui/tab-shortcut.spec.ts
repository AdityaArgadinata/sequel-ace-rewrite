import {test,expect,type Page} from '@playwright/test';
import {openApp,openContent,screenshot} from './fixture';
async function modifier(page:Page){return await page.evaluate(()=>/Mac/.test(navigator.platform))?'Meta':'Control';}
async function track(page:Page){await page.evaluate(()=>{const app=(window as any).go.main.App,open=app.NewTab;app.NewTab=async()=>{(window as any).newTabCalls=((window as any).newTabCalls??0)+1;return open();};});}
for(const [platform,key] of [['MacIntel','Meta'],['Win32','Control']])test(`${platform} new-tab shortcut works while the SQL editor has focus`,async({page})=>{
 await page.addInitScript(platform=>Object.defineProperty(navigator,'platform',{get:()=>platform}),platform);await openContent(page);await track(page);
 await page.getByRole('button',{name:'Query',exact:true}).click();await page.getByLabel('SQL query',{exact:true}).fill('SELECT unsaved_draft;');await page.keyboard.press(key+'+t');
 await expect(page.getByRole('tab',{name:'New Connection',exact:true})).toHaveAttribute('aria-selected','true');expect(await page.evaluate(()=>(window as any).newTabCalls??0)).toBe(0);
 await page.locator('#tab-1').click();await expect(page.locator('.tab-pane:not([hidden])').getByLabel('SQL query',{exact:true})).toContainText('SELECT unsaved_draft;');expect(await page.evaluate(()=>(window as any).executedSQL?.length??0)).toBe(0);
});

test('Native menu opens a connection chooser without connecting',async({page})=>{
 await openContent(page);await track(page);
 await page.evaluate(()=>(window as any).nativeEvents['sequelx:new-connection-tab']());
 await expect(page.getByRole('tab',{name:'New Connection',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('button',{name:'Connect',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).connectCalls.length)).toBe(1);
 expect(await page.evaluate(()=>(window as any).newTabCalls??0)).toBe(0);
});

test('Shortcut saves a Structure draft and a failed save blocks creating a tab',async({page})=>{
 await openContent(page);await track(page);await page.getByRole('button',{name:'Structure',exact:true}).click();const field=page.locator('[data-schema-cell="1:0"] input');
 await field.dblclick();await field.fill('saved_before_tab');await page.keyboard.press((await modifier(page))+'+t');await expect(page.getByRole('tab',{name:'New Connection',exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).schemaApplies[0].name)).toBe('saved_before_tab');
 await page.locator('#tab-1').click();await field.dblclick();await field.fill('failed_draft');await page.evaluate(()=>{(window as any).schemaApplyError='Error 1064: invalid field';});await page.keyboard.press((await modifier(page))+'+t');
 await expect(page.getByRole('dialog',{name:'Error changing field',exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).newTabCalls??0)).toBe(0);await page.getByRole('button',{name:'Edit row',exact:true}).click();await expect(field).toHaveValue('failed_draft');
});

test('New tab is ignored while a modal or query operation is active',async({page})=>{
 await openContent(page);await track(page);await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press((await modifier(page))+'+t');await page.evaluate(()=>(window as any).nativeEvents['sequelx:new-connection-tab']());expect(await page.evaluate(()=>(window as any).newTabCalls??0)).toBe(0);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Query',exact:true}).click();await page.evaluate(()=>{const app=(window as any).go.main.App,run=app.StreamPreparedQuery;app.StreamPreparedQuery=async(...args:any[])=>{await new Promise(resolve=>{(window as any).releaseQuery=resolve;});return run(...args);};});await page.getByRole('button',{name:/^Run Query/}).click();await expect.poll(()=>page.evaluate(()=>typeof (window as any).releaseQuery)).toBe('function');
 await page.keyboard.press((await modifier(page))+'+t');await page.evaluate(()=>(window as any).nativeEvents['sequelx:new-connection-tab']());expect(await page.evaluate(()=>(window as any).newTabCalls??0)).toBe(0);await page.evaluate(()=>(window as any).releaseQuery());
});

test('New-tab shortcut can open a connection chooser before connecting',async({page})=>{
 await openApp(page);await track(page);await page.keyboard.press((await modifier(page))+'+t');
 await expect(page.getByRole('tab',{name:'New Connection',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Connect',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).connectCalls?.length??0)).toBe(0);
});

 test('Saved connections can be reused in another tab and failed connections preserve both tabs',async({page},info)=>{
 await openApp(page);
 await page.getByLabel('Name:',{exact:true}).fill('Local saved');
 await page.getByLabel('Host:',{exact:true}).fill('first.example');
 await page.getByRole('button',{name:'Save Connection',exact:true}).click();
 await expect(page.getByRole('button',{name:'Local saved',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Connect',exact:true}).click();
 await expect(page.getByRole('tab',{name:'Query 1',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Query',exact:true}).click();
 await page.getByLabel('SQL query',{exact:true}).fill('SELECT first_tab_draft;');
 await page.getByRole('button',{name:'New connection tab',exact:true}).click();
 await page.getByRole('button',{name:'Local saved',exact:true}).click();
 await expect(page.getByLabel('Host:',{exact:true})).toHaveValue('first.example');
 await page.getByLabel('Host:',{exact:true}).fill('second.example');
 await screenshot(page,info,'new-connection-home');
 await page.evaluate(()=>{const app=(window as any).go.main.App,connect=app.Connect;app.Connect=async(connection:any)=>{if(!(window as any).retryConnect)throw new Error('Connection refused');return connect(connection);};});
 await page.getByRole('button',{name:'Connect',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Connection refused'})).toBeVisible();
 await expect(page.getByLabel('Host:',{exact:true})).toHaveValue('second.example');
 await page.evaluate(()=>(window as any).retryConnect=true);
 await page.getByRole('button',{name:'Connect',exact:true}).click();
 await expect(page.getByRole('tab',{name:'Query 2',exact:true})).toHaveAttribute('aria-selected','true');
 expect(await page.evaluate(()=>(window as any).connectCalls.map((c:any)=>c.host))).toEqual(['first.example','second.example']);
 await page.locator('#tab-1').click();
 await expect(page.locator('.tab-pane:not([hidden])').getByLabel('SQL query',{exact:true})).toContainText('SELECT first_tab_draft;');
});

test('Unconnected tabs preserve form drafts and close without a backend session',async({page})=>{
 await openContent(page);await page.getByRole('button',{name:'New connection tab',exact:true}).click();
 await page.getByLabel('Host:',{exact:true}).fill('draft.example');
 await page.getByRole('button',{name:'New connection tab',exact:true}).click();
 const homes=page.getByRole('tab',{name:'New Connection',exact:true});await homes.first().click();
 await expect(page.locator('.tab-pane:not([hidden])').getByLabel('Host:',{exact:true})).toHaveValue('draft.example');
 await page.evaluate(()=>{(window as any).go.main.App.CloseTab=async()=>{throw new Error('No session should be closed');};});
 await page.getByRole('button',{name:'Close New Connection 1',exact:true}).click();
 await expect(homes).toHaveCount(1);
 await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Connection forms count toward the sixteen-tab limit',async({page})=>{
 await openContent(page);
 for(let count=2;count<=16;count++){
  await page.getByRole('button',{name:'New connection tab',exact:true}).click();
  await expect(page.getByRole('tab')).toHaveCount(count);
 }
 await expect(page.getByRole('button',{name:'New connection tab',exact:true})).toBeDisabled();
 await page.keyboard.press((await modifier(page))+'+t');
 await expect(page.getByRole('tab')).toHaveCount(16);
 expect(await page.evaluate(()=>(window as any).connectCalls.length)).toBe(1);
});


test('Tab titles follow each selected database and identical names retain separate sessions',async({page})=>{
 await openContent(page);
 await expect(page.locator('#tab-1')).toHaveText('mysql');
 await page.getByRole('button',{name:'New connection tab',exact:true}).click();
 await page.getByRole('button',{name:'Connect',exact:true}).click();
 await expect(page.locator('#tab-2')).toHaveText('Query 2');
 await page.getByRole('combobox',{name:'Select Database',exact:true}).selectOption('database_with_a_long_name');
 await expect(page.locator('#tab-2')).toHaveText('database_with_a_long_name');
 await expect(page.locator('#tab-1')).toHaveText('mysql');
 await page.locator('#tab-1').click();
 await page.getByRole('combobox',{name:'Select Database',exact:true}).selectOption('database_with_a_long_name');
 await expect(page.getByRole('tab',{name:'database_with_a_long_name',exact:true})).toHaveCount(2);
 await page.locator('#tab-2').click();
 await expect(page.locator('#tab-2')).toHaveAttribute('aria-selected','true');
 await page.locator('#tab-1').locator('..').getByRole('button',{name:'Close database_with_a_long_name',exact:true}).click();
 await expect(page.locator('#tab-1')).toHaveCount(0);
 await expect(page.locator('#tab-2')).toHaveAttribute('aria-selected','true');
});
