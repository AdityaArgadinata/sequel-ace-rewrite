import {test,expect,type Page} from '@playwright/test';
import {openContent,screenshot} from './fixture';
const editor=(page:Page) => page.getByRole('textbox',{name:'SQL query',exact:true});
async function openQuery(page:Page) {
 await openContent(page);
 await page.getByRole('button',{name:'Query',exact:true}).click();
 await expect(editor(page)).toBeEditable();
 await expect(page.getByRole('button',{name:'Run Query',exact:false})).toBeEnabled();
}
const run=(page:Page) => page.getByRole('button',{name:/^Run Query/}).click();

test('SQL highlighting and table completion work',async ({page},info) => {
 await openQuery(page);
 await editor(page).fill('SELECT name FROM db WHERE id = 1;');
 await expect(editor(page).locator('span').filter({hasText:/^SELECT$/}).first()).toBeVisible();
 await editor(page).fill('SELECT * FROM d');
 await editor(page).press('Control+Space');
 await expect(page.locator('.cm-tooltip-autocomplete')).toBeVisible();
 await expect(page.locator('.cm-completionLabel').filter({hasText:/^db$/})).toBeVisible();
 await editor(page).press('Escape');
 await editor(page).fill("SELECT name, 'text; 😀' FROM db -- highlighted comment");
 await screenshot(page,info,'sql-editor');
});

test('Current and Selection send the correct execution scope and caret',async ({page}) => {
 await openQuery(page);
 const source='SELECT 1;\nSELECT 2;';
 await editor(page).fill(source);
 await page.evaluate(() => {(window as any).fixtureStatements=[{sql:'SELECT 2',from:10,to:18,line:2}];});
 await run(page);
 await expect.poll(() => page.evaluate(() => (window as any).executedSQL?.length)).toBe(1);
 expect(await page.evaluate(() => (window as any).preparedRequests.at(-1).scope)).toBe('current');
 await page.evaluate(() => {delete (window as any).fixtureStatements;});
 await editor(page).click();
 await editor(page).press('Control+End');
 await editor(page).press('Shift+Home');
 await page.getByRole('combobox',{name:'Execution scope',exact:true}).selectOption('selection');
 await run(page);
 await expect.poll(() => page.evaluate(() => (window as any).executedSQL?.length)).toBe(2);
 expect(await page.evaluate(() => (window as any).preparedRequests.at(-1).scope)).toBe('selection');
 expect(await page.evaluate(() => (window as any).executedSQL.at(-1).sql)).toBe('SELECT 2;');
});

test('Run All stops at the first error and a failed prepare never executes SQL',async ({page}) => {
 await openQuery(page);
 await editor(page).fill('SELECT 1; SELECT BAD; SELECT 3;');
 await page.evaluate(() => {
  (window as any).fixtureStatements=['SELECT 1','SELECT BAD','SELECT 3'].map((sql,index) => ({sql,from:index*10,to:index*10+8,line:index+1}));
  (window as any).failStatement='BAD';
 });
 await page.getByRole('combobox',{name:'Execution scope',exact:true}).selectOption('all');
 await run(page);
 await expect(page.locator('.script-summary')).toContainText('Stopped after 1 of 3');
 expect(await page.evaluate(() => (window as any).executedSQL.length)).toBe(2);
 await expect(page.locator('tbody')).toContainText('SELECT 1');
 await page.evaluate(() => {(window as any).prepareError='Unterminated quote';(window as any).executedSQL=[];});
 await run(page);
 await expect(page.getByRole('status').filter({hasText:'Unterminated quote'})).toBeVisible();
 expect(await page.evaluate(() => (window as any).executedSQL.length)).toBe(0);
});

test('Run All keeps the latest five results and can inspect earlier retained output',async ({page}) => {
 await openQuery(page);
 await editor(page).fill('SELECT 1;');
 await page.evaluate(() => {(window as any).fixtureStatements=Array.from({length:7},(_,i) => ({sql:`SELECT ${i+1}`,from:0,to:8,line:i+1}));});
 await page.getByRole('combobox',{name:'Execution scope',exact:true}).selectOption('all');
 await run(page);
 await expect(page.locator('.script-summary')).toContainText('Completed 7 of 7');
 await expect(page.getByRole('navigation',{name:'Statement results'}).getByRole('button')).toHaveCount(5);
 await page.getByRole('button',{name:'Statement 3 · line 3 · 1 rows',exact:true}).click();
 await expect(page.locator('tbody')).toContainText('SELECT 3');
 expect(await page.evaluate(() => (window as any).executedSQL.length)).toBe(7);
});

test('Open SQL protects unsaved content; Save SQL does not execute it',async ({page}) => {
 await openQuery(page);
 await editor(page).fill('SELECT draft;');
 await page.evaluate(() => {(window as any).fixtureOpenFile={sql:"SELECT 'file; 😀';",name:'loaded.sql',cancelled:false};});
 await page.getByRole('button',{name:'Open…',exact:true}).click();
 await expect(page.getByText('Replace unsaved editor contents?',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(editor(page)).toContainText('SELECT draft;');
 await page.getByRole('button',{name:'Open…',exact:true}).click();
 await page.getByRole('button',{name:'Replace editor contents',exact:true}).click();
 await expect(editor(page)).toContainText("SELECT 'file; 😀';");
 await page.getByRole('button',{name:'Save Query',exact:true}).click();
 expect(await page.evaluate(() => (window as any).savedSQLFile)).toEqual({sql:"SELECT 'file; 😀';",name:'loaded.sql'});
 expect(await page.evaluate(() => (window as any).executedSQL?.length ?? 0)).toBe(0);
});

test('Favorites save, update, load and delete without automatic execution',async ({page}) => {
 await openQuery(page);
 await editor(page).fill('SELECT 42;');
 await page.getByRole('button',{name:'Query Favorites',exact:true}).click();
 await page.getByRole('textbox',{name:'Favorite name',exact:true}).fill('Report');
 await page.getByRole('button',{name:'Save editor as favorite',exact:true}).click();
 await expect(page.getByRole('button',{name:'Report',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close favorites',exact:true}).click();
 await editor(page).fill('SELECT 43;');
 await page.getByRole('button',{name:'Query Favorites',exact:true}).click();
 await page.getByRole('button',{name:'Report',exact:true}).click();
 await page.getByRole('button',{name:'Update favorite from editor',exact:true}).click();
 await page.getByRole('button',{name:'Load Report',exact:true}).click();
 await expect(editor(page)).toContainText('SELECT 43;');
 expect(await page.evaluate(() => (window as any).executedSQL?.length ?? 0)).toBe(0);
 await page.getByRole('button',{name:'Query Favorites',exact:true}).click();
 await page.getByRole('button',{name:'Report',exact:true}).click();
 await page.getByRole('button',{name:'Delete favorite',exact:true}).click();
 await page.getByRole('button',{name:'Confirm delete favorite',exact:true}).click();
 await expect(page.getByRole('button',{name:'Report',exact:true})).toHaveCount(0);
});

test('History SQL is explicit opt-in, loads for review and can be removed',async ({page}) => {
 await openQuery(page);
 await editor(page).fill("SELECT 'local secret';");
 await run(page);
 await expect.poll(() => page.evaluate(() => (window as any).executedSQL?.length)).toBe(1);
 expect(await page.evaluate(() => (window as any).executedSQL[0].privacy)).toBe('off');
 await page.getByRole('combobox',{name:'Query history privacy',exact:true}).selectOption('metadata');
 await run(page);
 await page.getByRole('button',{name:'History (metadata)',exact:true}).click();
 await expect(page.getByRole('region',{name:'Query history'}).locator('pre')).toHaveCount(0);
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('combobox',{name:'Query history privacy',exact:true}).selectOption('sql');
 await expect(page.getByText(/SQL text may contain secrets/)).toBeVisible();
 await run(page);
 await page.getByRole('button',{name:'History (SQL)',exact:true}).click();
 await expect(page.getByRole('region',{name:'Query history'}).locator('pre')).toContainText("SELECT 'local secret';");
 const before=await page.evaluate(() => (window as any).executedSQL.length);
 await page.getByRole('button',{name:'Load SQL into editor',exact:true}).click();
 expect(await page.evaluate(() => (window as any).executedSQL.length)).toBe(before);
 await page.getByRole('button',{name:'History (SQL)',exact:true}).click();
 await page.getByRole('button',{name:'Remove saved SQL text',exact:true}).click();
 await page.getByRole('button',{name:'Confirm remove SQL',exact:true}).click();
 await expect(page.getByRole('region',{name:'Query history'}).locator('pre')).toHaveCount(0);
});

test('Cancel prevents later script statements from being sent',async ({page}) => {
 await openQuery(page);
 await page.evaluate(() => {
  (window as any).fixtureStatements=[{sql:'SELECT 1',from:0,to:8,line:1},{sql:'SELECT 2',from:9,to:17,line:2}];
  const app=(window as any).go.main.App,original=app.StreamPreparedQuery;
  app.StreamPreparedQuery=async (...args:any[]) => {
   await new Promise(resolve => {(window as any).releaseStatement=resolve;});
   return original(...args);
  };
 });
 await page.getByRole('combobox',{name:'Execution scope',exact:true}).selectOption('all');
 await run(page);
 await expect(page.getByRole('button',{name:'Cancel query',exact:true})).toBeVisible();
 await expect.poll(() => page.evaluate(() => typeof (window as any).releaseStatement)).toBe('function');
 await page.getByRole('button',{name:'Cancel query',exact:true}).click();
 await expect(page.locator('.script-summary')).toContainText('Stopped after 1 of 2');
 expect(await page.evaluate(() => (window as any).executedSQL.length)).toBe(1);
});

test('Query tools and privacy controls fit an 800px window',async ({page},info) => {
 await page.setViewportSize({width:800,height:600});
 await openQuery(page);
 await page.getByRole('combobox',{name:'Query history privacy',exact:true}).selectOption('sql');
 await page.getByRole('button',{name:'Query Favorites',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Favorite name',exact:true})).toBeVisible();
 for (const control of ['Open…','Save Query','Refresh completion']) {
  const box=await page.getByRole('button',{name:control,exact:true}).boundingBox();
  expect(box && box.x>=0 && box.x+box.width<=800).toBeTruthy();
 }
 expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(800);
 await screenshot(page,info,'sql-editor-small');
});

test('A truncated statement result stops the rest of the script',async ({page}) => {
 await openQuery(page);
 await page.evaluate(() => {
  (window as any).fixtureStatements=[{sql:'SELECT 1',from:0,to:8,line:1},{sql:'SELECT 2',from:9,to:17,line:2}];
  const app=(window as any).go.main.App,original=app.StreamPreparedQuery;
  app.StreamPreparedQuery=async (...args:any[]) => ({...await original(...args),truncated:true});
 });
 await page.getByRole('combobox',{name:'Execution scope',exact:true}).selectOption('all');
 await run(page);
 await expect(page.locator('.script-summary')).toContainText('Remaining statements were not executed');
 expect(await page.evaluate(() => (window as any).executedSQL.length)).toBe(1);
});

async function manualRows(page:Page){
 await openQuery(page);
 await page.evaluate(()=>{const app=(window as any).go.main.App,original=app.StreamPreparedQuery;app.StreamPreparedQuery=async(...args:any[])=>{await original(...args);return {columns:[{name:'id',type:'INT'},{name:'name',type:'VARCHAR'}],rows:[['1','Alpha'],['2',null],['3','Ω'],['4','line\nbreak']].map(row=>row.map(value=>({value:value??'',null:value===null,binary:false}))),truncated:false,durationMS:1};};});
}
test('Manual query results support Cmd and Ctrl select-all and copy loaded rows',async({page})=>{
 await manualRows(page);await run(page);const grid=page.getByLabel('Query results',{exact:true});await expect(grid.locator('tbody tr')).toHaveCount(4);
 for(const modifier of ['Meta','Control']){
  await grid.locator('tbody tr').nth(1).click();await grid.press(`${modifier}+a`);await expect(grid.locator('tr[aria-selected=true]')).toHaveCount(4);await grid.press(`${modifier}+c`);await expect.poll(()=>page.evaluate(()=>(window as any).clipboard)).toBe('1\tAlpha\n2\tNULL\n3\tΩ\n4\tline\nbreak');
 }
 await grid.locator('tbody tr').first().click();await expect(grid.locator('tr[aria-selected=true]')).toHaveCount(1);
 await grid.locator('tbody tr').nth(2).click({modifiers:['Shift']});await expect(grid.locator('tr[aria-selected=true]')).toHaveCount(3);
 await run(page);await expect(grid.locator('tbody tr')).toHaveCount(4);await expect(grid.locator('tr[aria-selected=true]')).toHaveCount(0);
});
test('Switching retained manual results clears selection; context menu can select and clear all',async({page})=>{
 await manualRows(page);await page.evaluate(()=>(window as any).fixtureStatements=[{sql:'SELECT 1',from:0,to:8,line:1},{sql:'SELECT 2',from:10,to:18,line:2}]);await page.getByRole('combobox',{name:'Execution scope',exact:true}).selectOption('all');await run(page);
 const grid=page.getByLabel('Query results',{exact:true});await expect(page.getByRole('button',{name:/Statement 2 ·/})).toBeVisible();await grid.locator('td').first().click({button:'right'});await page.getByRole('menuitem',{name:'Select all rows on page',exact:true}).click();await expect(grid.locator('tr[aria-selected=true]')).toHaveCount(4);
 await page.getByRole('button',{name:/Statement 1 ·/}).click();await expect(grid.locator('tr[aria-selected=true]')).toHaveCount(0);await grid.locator('td').first().click({button:'right'});await page.getByRole('menuitem',{name:'Select all rows on page',exact:true}).click();await grid.locator('td').first().click({button:'right'});await page.getByRole('menuitem',{name:'Clear selection',exact:true}).click();await expect(grid.locator('tr[aria-selected=true]')).toHaveCount(0);
});
