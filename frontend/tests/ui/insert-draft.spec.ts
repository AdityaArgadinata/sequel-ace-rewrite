import {test,expect,type Page} from '@playwright/test';
import {openContent,screenshot} from './fixture';

async function setup(page:Page){
 await openContent(page);
 await page.evaluate(()=>{
  const app=(window as any).go.main.App,metadata=app.TableDetails;
  app.TableDetails=async(...args:any[])=>{const d=await metadata(...args);return {...d,columns:d.columns.map((c:any)=>({...c,defaultValue:c.name==='name'?{value:'New item',null:false,binary:false}:c.name==='email'?{value:'',null:false,binary:false}:null,defaultExpression:c.name==='post_date'?'CURRENT_TIMESTAMP':'',generated:c.name==='message'}))};};
  (window as any).insertDefaults={name:{value:'New item',null:false,binary:false},email:{value:'',null:false,binary:false},post_date:{value:'2026-10-24 01:00:00',null:false,binary:false}};
 });
 await page.getByRole('button',{name:'Reload content',exact:true}).click();
 await expect(page.locator('.content-grid tbody tr')).toHaveCount(6);
}
async function emptyDoubleClick(page:Page){
 const grid=page.locator('.content-grid');
 const g=await grid.boundingBox(),last=await grid.locator('tbody tr').count() ? await grid.locator('tbody tr').last().boundingBox() : null;
 const y=last?last.y+last.height+20:g!.y+80;
 await page.mouse.dblclick(g!.x+20,y);
}

test('Double-click empty space creates a default-filled inline draft and saves only on the next double-click',async({page},info)=>{
 await setup(page);await emptyDoubleClick(page);
 const rows=page.locator('.content-grid tbody tr');await expect(rows).toHaveCount(7);
 await expect(page.getByLabel('New row cell value',{exact:true})).toHaveValue('NULL');
 await expect(rows.last().locator('td').nth(1)).toHaveText('New item');await expect(rows.last().locator('td').nth(2)).toHaveText('');
 await expect(rows.last().locator('td').nth(4)).toHaveText('CURRENT_TIMESTAMP');
 expect(await page.evaluate(()=>(window as any).mutations?.length??0)).toBe(0);
 await page.getByLabel('New row cell value',{exact:true}).press('Tab');
 await page.getByLabel('New row cell value',{exact:true}).fill('Created inline');
 await page.getByLabel('New row cell value',{exact:true}).press('Tab');
 await expect(page.getByLabel('New row cell value',{exact:true})).toHaveValue('');
 await screenshot(page,info,'inline-insert-draft');await emptyDoubleClick(page);
 await expect(page.getByRole('button',{name:'Save new row',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>Object.keys((window as any).lastMutation.values))).toEqual(['name']);
 await expect(rows).toHaveCount(7);await expect(rows.last().locator('td').nth(1)).toHaveText('Created inline');
});

test('A rejected insert keeps its values and offers Edit row or Discard changes',async({page},info)=>{
 await setup(page);
 await page.evaluate(()=>{
  const app=(window as any).go.main.App,metadata=app.TableDetails,mutate=app.Mutate;
  app.TableDetails=async(...args:any[])=>{const d=await metadata(...args);return {...d,columns:d.columns.map((c:any)=>c.name==='email'?{...c,nullable:false,defaultValue:null}:c)};};
  app.Mutate=async(tab:string,request:any)=>{(window as any).draftAttempts=((window as any).draftAttempts??0)+1;if(request.values.email?.null)throw new Error("Error 1048 (23000): Column 'email' cannot be null");return mutate(tab,request);};
 });
 await page.getByRole('button',{name:'Reload content',exact:true}).click();await emptyDoubleClick(page);
 await page.getByLabel('New row cell value',{exact:true}).press('Tab');await page.getByLabel('New row cell value',{exact:true}).fill('Retained value');
 await emptyDoubleClick(page);
 const error=page.getByRole('dialog',{name:'Unable to write row',exact:true});await expect(error).toContainText("Column 'email' cannot be null");
 await expect(page.locator('.content-grid tbody tr')).toHaveCount(7);
 await screenshot(page,info,'inline-insert-error');await page.getByRole('dialog',{name:'Unable to write row',exact:true}).getByRole('button',{name:'Edit row',exact:true}).click();
 await expect(page.getByLabel('New row cell value',{exact:true})).toHaveValue('NULL');
 await expect(page.locator('.content-grid tbody tr').last().locator('td').nth(1)).toHaveText('Retained value');
 expect(await page.evaluate(()=>(window as any).draftAttempts)).toBe(1);
 await page.getByLabel('New row cell value',{exact:true}).fill('saved@example.com');await emptyDoubleClick(page);
 await expect(error).toHaveCount(0);expect(await page.evaluate(()=>(window as any).mutations.length)).toBe(1);
 await emptyDoubleClick(page);await emptyDoubleClick(page);await expect(error).toBeVisible();
 await page.getByRole('button',{name:'Discard changes',exact:true}).click();await expect(page.locator('.content-grid tbody tr')).toHaveCount(7);
});

test('Single-click empty space does not create rows; Escape cancels and generated cells are skipped',async({page})=>{
 await setup(page);
 const grid=page.locator('.content-grid');const g=await grid.boundingBox();await page.mouse.click(g!.x+10,g!.y+250);
 await expect(grid.locator('tbody tr')).toHaveCount(6);
 await emptyDoubleClick(page);await page.getByLabel('New row cell value',{exact:true}).press('Tab');await page.getByLabel('New row cell value',{exact:true}).press('Tab');await page.getByLabel('New row cell value',{exact:true}).press('Tab');
 await expect(page.getByLabel('New row cell value',{exact:true})).toHaveValue('CURRENT_TIMESTAMP');
 await page.getByLabel('New row cell value',{exact:true}).press('Escape');await expect(grid.locator('tbody tr')).toHaveCount(6);
 expect(await page.evaluate(()=>(window as any).mutations?.length??0)).toBe(0);
});

test('An uncertain insert is never retried by another double-click',async({page})=>{
 await setup(page);await page.evaluate(()=>{(window as any).go.main.App.Mutate=async()=>{(window as any).uncertainAttempts=((window as any).uncertainAttempts??0)+1;throw new Error('write commit outcome unknown; verify on the server before retrying');};});
 await emptyDoubleClick(page);await emptyDoubleClick(page);await expect(page.getByRole('dialog',{name:'Unable to write row',exact:true})).toBeVisible();
 await page.getByRole('dialog',{name:'Unable to write row',exact:true}).getByRole('button',{name:'Edit row',exact:true}).click();await expect(page.getByRole('button',{name:'Save new row',exact:true})).toBeDisabled();
 await emptyDoubleClick(page);expect(await page.evaluate(()=>(window as any).uncertainAttempts)).toBe(1);
 await page.getByRole('button',{name:'Cancel new row',exact:true}).click();await expect(page.locator('.content-grid tbody tr')).toHaveCount(6);
});

test('A successful insert followed by a failed reload never offers to insert again',async({page})=>{
 await setup(page);await page.evaluate(()=>{const app=(window as any).go.main.App,browse=app.Browse;app.Browse=async(...args:any[])=>{if((window as any).mutations?.length)throw new Error('reload unavailable');return browse(...args);};});
 await emptyDoubleClick(page);await emptyDoubleClick(page);
 await expect(page.locator('.content-write-status')).toContainText('Row saved, but refresh failed');
 await expect(page.getByRole('dialog',{name:'Unable to write row',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Save new row',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).mutations.length)).toBe(1);
});


test('An empty table accepts a draft; a read-only table never does',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{const app=(window as any).go.main.App,browse=app.Browse;app.Browse=async(...args:any[])=>({...await browse(...args),rows:[]});});
 await page.getByRole('button',{name:'Reload content',exact:true}).click();await expect(page.locator('.content-grid tbody tr')).toHaveCount(0);
 await emptyDoubleClick(page);await expect(page.locator('.content-grid tbody tr')).toHaveCount(1);
 await page.getByRole('button',{name:'Cancel new row',exact:true}).click();
 await page.evaluate(()=>{const app=(window as any).go.main.App,metadata=app.TableDetails;app.TableDetails=async(...args:any[])=>({...await metadata(...args),editable:false,reason:'View is read-only'});});
 await page.getByRole('button',{name:'Reload content',exact:true}).click();await emptyDoubleClick(page);
 await expect(page.getByRole('button',{name:'Save new row',exact:true})).toHaveCount(0);await expect(page.locator('.content-grid tbody tr')).toHaveCount(0);
});


for(const source of ['toolbar','context'])test(`Insert from ${source} appends the same default-filled draft without a modal`,async({page})=>{
 await setup(page);
 if(source==='toolbar')await page.getByRole('button',{name:'Insert row',exact:true}).click();
 else{await page.locator('.content-grid tbody tr').first().locator('td').first().click({button:'right'});await page.getByRole('menuitem',{name:'Insert row',exact:true}).click();}
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.content-grid tbody tr')).toHaveCount(7);
 await expect(page.locator('.content-grid tbody tr').last().locator('td').nth(1)).toHaveText('New item');
 await expect(page.getByLabel('New row cell value',{exact:true})).toBeFocused();await expect(page.getByRole('button',{name:'Insert row',exact:true})).toBeDisabled();
 expect(await page.evaluate(()=>(window as any).mutations?.length??0)).toBe(0);
 await page.getByLabel('New row cell value',{exact:true}).press('Tab');await page.getByLabel('New row cell value',{exact:true}).fill('Inserted from '+source);
 await page.getByRole('button',{name:'Save new row',exact:true}).click();await expect(page.getByRole('button',{name:'Save new row',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>Object.keys((window as any).lastMutation.values))).toEqual(['name']);
 await expect(page.locator('.content-grid tbody tr').last().locator('td').nth(1)).toHaveText('Inserted from '+source);
});
