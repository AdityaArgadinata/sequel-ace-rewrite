import {test,expect,type Page} from '@playwright/test';
import {openContent,screenshot} from './fixture';
const table=(page:Page,name:string)=>page.getByRole('button',{name,exact:true});
const inline=(page:Page)=>page.getByLabel('Cell value',{exact:true});

test('Filters, sort, page, selection and grid geometry restore without rerunning Browse',async({page},info)=>{
 await page.setViewportSize({width:800,height:600});await openContent(page);
 await page.evaluate(()=>{const app=(window as any).go.main.App,browse=app.Browse;app.Browse=async(tab:string,r:any)=>{
  ((window as any).restoreReads??=[]).push(`${r.database}.${r.table}`);const out=await browse(tab,r);
  return {...out,rows:Array.from({length:150},(_,i)=>i+1).slice(r.offset,r.offset+r.limit).map(n=>[{value:String(n),null:false,binary:false},{value:'Sample '+n,null:false,binary:false},{value:'long email '.repeat(10),null:false,binary:false},{value:'long message '.repeat(10),null:false,binary:false},{value:'2026-10-24 00:00:00',null:false,binary:false}])};
 };});
 await table(page,'Reload content').click();await page.getByLabel('Filter column',{exact:true}).selectOption('name');await page.getByLabel('Filter operator',{exact:true}).selectOption('contains');await page.getByLabel('Filter value',{exact:true}).fill('Sample');await table(page,'Apply Filter(s)').click();
 await page.getByRole('button',{name:'id',exact:true}).click();await table(page,'Next page').click();const grid=page.locator('.content-grid');await grid.locator('tbody tr').nth(2).click();await grid.locator('tbody tr').nth(4).click({modifiers:['Shift']});
 await page.getByRole('separator',{name:'Resize name column',exact:true}).press('ArrowRight');
 await grid.evaluate(e=>{e.scrollTop=350;e.scrollLeft=180;});await expect.poll(()=>grid.evaluate(e=>e.scrollTop)).toBe(350);
 const state=await grid.evaluate(e=>({top:e.scrollTop,left:e.scrollLeft,width:(e.querySelectorAll('col')[1] as HTMLElement).style.width}));const reads=await page.evaluate(()=>(window as any).restoreReads.length);
 await table(page,'column_stats').click();await table(page,'Back').click();await expect(page.locator('.content-restored')).toContainText('Workspace restored from memory');
 await expect(page.getByLabel('Filter value',{exact:true})).toHaveValue('Sample');await expect(page.getByLabel('Filter column',{exact:true})).toHaveValue('name');await expect(page.locator('.content-grid th[aria-sort=ascending]')).toContainText('id');await expect(page.locator('.content-row-count')).toContainText('3 row(s) selected');await expect(page.getByLabel('Go to page',{exact:true})).toHaveValue('2');
 await expect.poll(()=>grid.evaluate(e=>({top:e.scrollTop,left:e.scrollLeft,width:(e.querySelectorAll('col')[1] as HTMLElement).style.width}))).toEqual(state);expect(await page.evaluate(()=>(window as any).restoreReads.length)).toBe(reads+1);await screenshot(page,info,'restored-content');
});

test('An inline edit survives table/view navigation and is saved only by an explicit action',async({page})=>{
 await openContent(page);await page.locator('.content-grid tbody tr').first().locator('td').nth(1).dblclick();await inline(page).fill('unsaved workspace');await table(page,'column_stats').click();await table(page,'Back').click();await expect(inline(page)).toHaveValue('unsaved workspace');expect(await page.evaluate(()=>(window as any).mutations?.length??0)).toBe(0);
 await table(page,'Structure').click();await table(page,'Content').click();await expect(inline(page)).toHaveValue('unsaved workspace');await inline(page).press('Enter');await expect(page.locator('.content-grid tbody tr').first().locator('td').nth(1)).toHaveText('unsaved workspace');expect(await page.evaluate(()=>(window as any).mutations.length)).toBe(1);
});

test('New-row values, focused column and defaults survive leaving a table without inserting',async({page})=>{
 await openContent(page);await table(page,'Insert row').click();const value=page.getByLabel('New row cell value',{exact:true});await value.press('Tab');await value.fill('restored new row');await table(page,'column_stats').click();await table(page,'Back').click();await expect(value).toHaveValue('restored new row');await expect(value).toBeFocused();await expect(page.locator('.content-grid tbody tr')).toHaveCount(7);expect(await page.evaluate(()=>(window as any).mutations?.length??0)).toBe(0);await table(page,'Save new row').click();expect(await page.evaluate(()=>(window as any).lastMutation.action)).toBe('insert');
});

test('Same table name in another database and another query tab has independent drafts',async({page})=>{
 await openContent(page);await page.locator('.content-grid tbody tr').first().locator('td').nth(1).dblclick();await inline(page).fill('mysql draft');await page.getByRole('combobox',{name:'Select Database',exact:true}).selectOption('database_with_a_long_name');await table(page,'db').click();await expect(inline(page)).toHaveCount(0);await page.locator('.content-grid tbody tr').first().locator('td').nth(1).dblclick();await inline(page).fill('other database draft');await table(page,'Back').click();await expect(inline(page)).toHaveValue('mysql draft');
 await page.getByLabel('Connection actions',{exact:true}).click();await table(page,'New Connection Tab').click();await table(page,'Connect').click();await page.getByRole('combobox',{name:'Select Database',exact:true}).selectOption('mysql');await table(page,'db').click();await expect(inline(page)).toHaveCount(0);await page.locator('#tab-1').click();await expect(inline(page)).toHaveValue('mysql draft');
});

test('SQL activity invalidates writes but keeps the cached draft until explicit discard and reload',async({page})=>{
 await openContent(page);await page.locator('.content-grid tbody tr').first().locator('td').nth(1).dblclick();await inline(page).fill('keep after SQL');await table(page,'Query').click();await page.getByRole('button',{name:/^Run Query/}).click();await table(page,'Content').click();await expect(inline(page)).toHaveValue('keep after SQL');await expect(page.locator('.content-restored')).toContainText('Reload before writing');await inline(page).press('Enter');expect(await page.evaluate(()=>(window as any).mutations?.length??0)).toBe(0);
 await table(page,'Discard drafts and reload').click();await expect(page.getByRole('dialog',{name:'Discard saved drafts?',exact:true})).toBeVisible();await table(page,'Cancel').click();await expect(inline(page)).toHaveValue('keep after SQL');await table(page,'Discard drafts and reload').click();await table(page,'Discard and reload').click();await expect(inline(page)).toHaveCount(0);await expect(page.locator('.content-restored')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).mutations?.length??0)).toBe(0);
});

test('All eight draft workspaces are protected from LRU eviction',async({page})=>{
 await openContent(page);await page.evaluate(()=>{const app=(window as any).go.main.App;app.Tables=async()=>({columns:[{name:'Tables',type:'VARCHAR'}],rows:Array.from({length:9},(_,i)=>[{value:'table_'+i,null:false,binary:false}]),truncated:false,durationMS:0});});await page.getByLabel('Connection actions',{exact:true}).click();await table(page,'Refresh databases and tables').click();
 for(let i=0;i<8;i++){await table(page,'table_'+i).click();await table(page,'Insert row').click();await page.getByLabel('New row cell value',{exact:true}).press('Tab');await page.getByLabel('New row cell value',{exact:true}).fill('draft '+i);}
 await table(page,'table_8').click();await expect(page.locator('.operation-status')).toContainText('Eight table workspaces contain drafts');await expect(page.locator('.connection-title')).toContainText('/table_7');await table(page,'table_0').click();await expect(page.getByLabel('New row cell value',{exact:true})).toHaveValue('draft 0');expect(await page.evaluate(()=>(window as any).mutations?.length??0)).toBe(0);await table(page,'Cancel new row').click();await table(page,'table_8').click();await expect(page.locator('.connection-title')).toContainText('/table_8');
});

test('Unapplied multi-filters and the collapsed filter panel are restored without applying them',async({page})=>{
 await openContent(page);await page.getByLabel('Filter column',{exact:true}).selectOption('name');await page.getByLabel('Filter operator',{exact:true}).selectOption('contains');await page.getByLabel('Filter value',{exact:true}).fill('Sample');await table(page,'Apply Filter(s)').click();await page.getByLabel('Add filter rule',{exact:true}).click();await page.getByLabel('Filter value 2',{exact:true}).fill('unapplied rule');await table(page,'Toggle content filter').click();await table(page,'column_stats').click();await table(page,'Back').click();await expect(table(page,'Toggle content filter')).toHaveAttribute('aria-expanded','false');await table(page,'Toggle content filter').click();await expect(page.getByLabel('Filter value 2',{exact:true})).toHaveValue('unapplied rule');await expect(page.getByLabel('Enable content filter 2',{exact:true})).toBeChecked();await expect(page.locator('.content-row-count')).toContainText('Filter changed');expect(await page.evaluate(()=>(window as any).lastBrowse.table)).toBe('column_stats');
});

test('A restored edit sends its original row and a concurrent server change cannot be overwritten',async({page})=>{
 await openContent(page);await page.locator('.content-grid tbody tr').first().locator('td').nth(1).dblclick();await inline(page).fill('restored draft');await table(page,'column_stats').click();await table(page,'Back').click();await page.evaluate(()=>{(window as any).go.main.App.Mutate=async(_tab:string,request:any)=>{(window as any).restoredAttempt=request;(window as any).restoredAttempts=((window as any).restoredAttempts??0)+1;throw new Error('row changed, was deleted, or values were unchanged; reload before retrying');};});await inline(page).press('Enter');await expect(page.getByRole('dialog',{name:'Unable to write row',exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).restoredAttempt.original[1].value)).toBe('Sample 3');expect(await page.evaluate(()=>(window as any).restoredAttempt.values.name.value)).toBe('restored draft');expect(await page.evaluate(()=>(window as any).restoredAttempts)).toBe(1);
});
