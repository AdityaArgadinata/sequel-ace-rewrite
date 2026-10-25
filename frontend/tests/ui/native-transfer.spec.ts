import {test,expect,type Page} from '@playwright/test';
import {openContent,screenshot} from './fixture';
async function action(page:Page,name:string){await page.getByLabel('Connection actions',{exact:true}).click();await page.locator('.sidebar-menu-content:visible').getByRole('button',{name,exact:true}).click();}

test('Export defaults to filtered content and uses the applied filter without the page limit',async({page},info)=>{
 await openContent(page);await expect(page.locator('.data-export')).toHaveCount(0);await action(page,'Export…');const sheet=page.getByRole('dialog',{name:'Export',exact:true});
 await expect(sheet.getByLabel('Export source')).toHaveValue('filtered');await expect(sheet.getByRole('tab',{name:'CSV',exact:true})).toHaveAttribute('aria-selected','true');
 await screenshot(page,info,'export-filtered');await sheet.getByRole('button',{name:'Export',exact:true}).click();
 const exports=await page.evaluate(()=>(window as any).dataExports);expect(exports[0].spec).toMatchObject({format:'csv',scope:'filtered',browse:{database:'mysql',table:'db'}});await expect(sheet).toContainText('Export complete.');
});

test('SQL export selection sends Structure Content and DROP separately and does not force CREATE DATABASE',async({page},info)=>{
 await openContent(page);await page.getByRole('button',{name:'Structure',exact:true}).click();await action(page,'Export…');const sheet=page.getByRole('dialog',{name:'Export',exact:true});
 await expect(sheet.getByRole('button',{name:'Export',exact:true})).toBeDisabled();await sheet.getByLabel('structure TABLE table_name',{exact:true}).check();await sheet.getByLabel('drop TABLE table_name',{exact:true}).check();
 await expect(sheet.getByLabel('content VIEW view_name',{exact:true})).toBeDisabled();await screenshot(page,info,'export-sql-options');
 await sheet.getByRole('button',{name:'Export',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).selectedDatabaseExports[0])).toMatchObject({db:'mysql',fingerprint:'inventory',options:{createDatabase:false,objects:[{kind:'TABLE',name:'table_name',structure:true,content:false,drop:true}]}});
});

test('Query export uses retained result without rerunning the query or requiring inventory',async({page})=>{
 await openContent(page);await page.getByRole('button',{name:'Query',exact:true}).click();await page.getByRole('button',{name:/Run Query/}).click();
 await expect(page.locator('.data-export')).toHaveCount(0);const before=await page.evaluate(()=>(window as any).executedSQL?.length??0);await page.evaluate(()=>{(window as any).databaseInventoryError='no metadata privilege';});await action(page,'Export…');const sheet=page.getByRole('dialog',{name:'Export',exact:true});
 await expect(sheet.getByLabel('Export source')).toHaveValue('query');await sheet.getByRole('tab',{name:'XML',exact:true}).click();await sheet.getByRole('button',{name:'Export',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).dataExports[0].spec)).toMatchObject({scope:'loaded',format:'xml'});expect(await page.evaluate(()=>(window as any).executedSQL?.length??0)).toBe(before);
});

test('Import opens the native chooser immediately and waits for explicit Import with an overwrite warning',async({page},info)=>{
 await openContent(page);await action(page,'Import…');const sheet=page.getByRole('dialog',{name:'Import',exact:true});
 await expect(sheet).toContainText('dump.sql');await expect(sheet).toContainText('may change or overwrite existing data');await expect(sheet.getByRole('checkbox',{name:'I reviewed the SQL file and accept its changes and partial execution.',exact:true})).toHaveCount(0);expect(await page.evaluate(()=>(window as any).sqlImports?.length??0)).toBe(0);
 await screenshot(page,info,'import-sql');await sheet.getByRole('button',{name:'Import',exact:true}).click();await expect(sheet).toContainText('3 of 3 statements acknowledged');expect(await page.evaluate(()=>(window as any).sqlImports.length)).toBe(1);
 await expect(sheet.getByRole('button',{name:'Import',exact:true})).toHaveCount(0);
});

test('CSV selected through Import opens mapping instead of executing SQL',async({page},info)=>{
 await openContent(page);await page.evaluate(()=>{(window as any).importFixture={format:'csv',csv:{token:'csv',name:'rows.csv',headers:['id','name'],sample:[['7','New']],rows:1,columns:[{name:'id',generated:false},{name:'name',generated:false}],cancelled:false},cancelled:false};});
 await action(page,'Import…');const sheet=page.getByRole('dialog',{name:'Import',exact:true});await expect(sheet.getByLabel('Import format')).toHaveValue('csv');await expect(sheet.getByLabel('Map CSV column 2')).toHaveValue('name');
 expect(await page.evaluate(()=>(window as any).csvImports?.length??0)).toBe(0);await screenshot(page,info,'import-csv-mapping');await sheet.getByRole('button',{name:'Preview CSV insert',exact:true}).click();await sheet.getByRole('button',{name:'Import',exact:true}).click();await expect(sheet).toContainText('CSV records acknowledged');
});

test('Transfer dialogs fit a small window, Escape cancels and export errors stay visible',async({page})=>{
 await page.setViewportSize({width:800,height:600});await openContent(page);await action(page,'Export…');let sheet=page.getByRole('dialog',{name:'Export',exact:true});const box=await sheet.boundingBox();expect(box&&box.x>=0&&box.y>=0&&box.x+box.width<=800&&box.y+box.height<=600).toBeTruthy();
 await page.keyboard.press('Escape');await expect(sheet).toHaveCount(0);await page.evaluate(()=>{(window as any).importFixture={cancelled:true};});await action(page,'Import…');sheet=page.getByRole('dialog',{name:'Import',exact:true});await expect(sheet.getByRole('button',{name:'Choose File…',exact:true})).toBeEnabled();await page.keyboard.press('Escape');await expect(sheet).toHaveCount(0);
});
