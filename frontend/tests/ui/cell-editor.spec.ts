import {test,expect,type Page} from '@playwright/test';
import {openContent,screenshot} from './fixture';
const dialog=(page:Page)=>page.getByRole('dialog',{name:'Edit cell contents',exact:true});
const value=(page:Page)=>page.getByLabel('Cell contents value',{exact:true});
async function openCell(page:Page,column=1){await page.locator('.content-grid tbody tr').first().locator('td').nth(column).click({button:'right'});await page.getByRole('menuitem',{name:'Open cell editor',exact:true}).click();}

test('Large cell editor searches, previews JSON losslessly and saves against the original row',async({page},info)=>{
 await openContent(page);await openCell(page);const json='{"n":18446744073709551615,"s":"<img src=x onerror=alert(1)>","again":"needle needle"}';await value(page).fill(json);
 await page.getByRole('button',{name:'Preview',exact:true}).click();await expect(page.getByLabel('Cell preview',{exact:true})).toContainText('18446744073709551615');await expect(page.locator('.cell-detail-preview img')).toHaveCount(0);await screenshot(page,info,'json-cell-preview');
 await page.getByRole('button',{name:'Editor',exact:true}).click();const mac=await page.evaluate(()=>/Mac/.test(navigator.platform));await value(page).press(`${mac?'Meta':'Control'}+f`);await expect(page.getByLabel('Find in cell',{exact:true})).toBeFocused();await page.getByLabel('Find in cell',{exact:true}).fill('needle');await page.getByRole('button',{name:'Next match',exact:true}).click();
 expect(await value(page).evaluate((e:HTMLTextAreaElement)=>e.value.slice(e.selectionStart,e.selectionEnd))).toBe('needle');
 await page.getByRole('button',{name:'Save cell',exact:true}).click();await expect(dialog(page)).toHaveCount(0);
 const request=await page.evaluate(()=>(window as any).lastMutation);expect(request.values.name.value).toBe(json);expect(request.original[1].value).toBe('Sample 3');expect(request.columns).toHaveLength(5);
});

test('Alt+Enter expands the current inline draft and Cancel leaves server data untouched',async({page})=>{
 await openContent(page);await page.locator('.content-grid tbody tr').first().locator('td').nth(1).dblclick();await page.getByLabel('Cell value',{exact:true}).fill('unsaved inline');await page.getByLabel('Cell value',{exact:true}).press('Alt+Enter');await expect(value(page)).toHaveValue('unsaved inline');await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(page.locator('.content-grid tbody tr').first().locator('td').nth(1)).toHaveText('Sample 3');expect(await page.evaluate(()=>(window as any).mutations?.length??0)).toBe(0);
});

test('Imported UTF-8 contents preserve BOM, CRLF and NUL and remain a draft until Save',async({page})=>{
 await openContent(page);await openCell(page);const text='\ufeffé😀\r\n\u0000tail';await page.evaluate(text=>{(window as any).cellFile={cancelled:false,name:'text.txt',value:{value:text,null:false,binary:false}};},text);
 await page.getByRole('button',{name:'Import cell file',exact:true}).click();await expect(dialog(page)).toContainText('database has not been changed');expect(await page.evaluate(()=>(window as any).mutations?.length??0)).toBe(0);
 await page.getByRole('button',{name:'Export cell file',exact:true}).click();expect(await page.evaluate(()=>(window as any).cellExports[0])).toMatchObject({value:text,null:false,binary:false});await page.getByRole('button',{name:'Save cell',exact:true}).click();expect(await page.evaluate(()=>(window as any).lastMutation.values.name.value)).toBe(text);
});

test('BLOB uses raw hex, rejects invalid conversions, and exports the exact bytes',async({page})=>{
 await openContent(page);await page.evaluate(()=>{const app=(window as any).go.main.App,metadata=app.TableDetails,browse=app.Browse;app.TableDetails=async(...args:any[])=>{const d=await metadata(...args);return {...d,columns:d.columns.map((c:any)=>c.name==='message'?{...c,type:'BLOB'}:c)};};app.Browse=async(...args:any[])=>{const r=await browse(...args);return {...r,rows:r.rows.map((row:any[])=>row.map((c:any,i:number)=>i===3?{value:'0x00ff4100',null:false,binary:true}:c))};};});await page.getByRole('button',{name:'Reload content',exact:true}).click();await openCell(page,3);
 await expect(page.getByLabel('Cell representation',{exact:true})).toHaveValue('hex');await page.getByRole('button',{name:'Preview',exact:true}).click();await expect(page.getByLabel('Cell preview',{exact:true})).toContainText('00 ff 41 00');
 await page.getByRole('button',{name:'Editor',exact:true}).click();await page.getByLabel('Cell representation',{exact:true}).selectOption('text');await expect(dialog(page)).toContainText('not valid UTF-8');await expect(page.getByLabel('Cell representation',{exact:true})).toHaveValue('hex');
 await value(page).fill('0x0');await page.getByRole('button',{name:'Save cell',exact:true}).click();await expect(dialog(page)).toContainText('complete byte pairs');expect(await page.evaluate(()=>(window as any).mutations?.length??0)).toBe(0);
 await value(page).fill('0x0001ff');await page.getByRole('button',{name:'Export cell file',exact:true}).click();expect(await page.evaluate(()=>(window as any).cellExports[0])).toMatchObject({value:'0x0001ff',binary:true,null:false});await page.getByRole('button',{name:'Save cell',exact:true}).click();expect(await page.evaluate(()=>(window as any).lastMutation.values.message)).toMatchObject({value:'0x0001ff',binary:true,null:false});
});

test('NULL differs from empty text and an expanded new-row value does not insert early',async({page})=>{
 await openContent(page);await openCell(page,3);await expect(page.getByLabel('Cell is NULL',{exact:true})).toBeChecked();await expect(page.getByRole('button',{name:'Export cell file',exact:true})).toBeDisabled();await page.getByLabel('Cell is NULL',{exact:true}).uncheck();await value(page).fill('');await page.getByRole('button',{name:'Save cell',exact:true}).click();expect(await page.evaluate(()=>(window as any).lastMutation.values.message)).toMatchObject({value:'',null:false,binary:false});
 await page.getByRole('button',{name:'Insert row',exact:true}).click();await page.getByLabel('New row cell value',{exact:true}).press('Tab');await page.getByLabel('New row cell value',{exact:true}).press('Alt+Enter');await page.getByLabel('Cell is NULL',{exact:true}).uncheck();await value(page).fill('new draft');await page.getByRole('button',{name:'Apply to new row',exact:true}).click();expect(await page.evaluate(()=>(window as any).mutations.length)).toBe(1);await expect(page.getByLabel('New row cell value',{exact:true})).toHaveValue('new draft');await page.getByRole('button',{name:'Save new row',exact:true}).click();expect(await page.evaluate(()=>(window as any).mutations.length)).toBe(2);
});

test('A conflict retains the draft for export and never retries the failed write',async({page})=>{
 await openContent(page);await openCell(page);await value(page).fill('retained after conflict');await page.evaluate(()=>{(window as any).go.main.App.Mutate=async()=>{(window as any).cellAttempts=((window as any).cellAttempts??0)+1;throw new Error('row changed; reload before retrying');};});await page.getByRole('button',{name:'Save cell',exact:true}).click();await page.getByRole('dialog',{name:'Unable to write row',exact:true}).getByRole('button',{name:'OK',exact:true}).click();
 await expect(value(page)).toHaveValue('retained after conflict');await expect(page.getByRole('button',{name:'Save cell',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Export cell file',exact:true}).click();expect(await page.evaluate(()=>(window as any).cellExports[0].value)).toBe('retained after conflict');expect(await page.evaluate(()=>(window as any).cellAttempts)).toBe(1);
});

test('Manual query viewer is read-only; import failures and cancellations keep a content draft',async({page})=>{
 await openContent(page);await openCell(page);await value(page).fill('keep me');await page.getByRole('button',{name:'Import cell file',exact:true}).click();await expect(value(page)).toHaveValue('keep me');await page.evaluate(()=>{(window as any).cellImportError='not valid UTF-8';});await page.getByRole('button',{name:'Import cell file',exact:true}).click();await expect(dialog(page)).toContainText('not valid UTF-8');await expect(value(page)).toHaveValue('keep me');await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Query',exact:true}).click();await page.getByRole('button',{name:/^Run Query/}).click();await page.locator('.results tbody tr').first().locator('td').first().dblclick();const viewer=page.getByRole('dialog',{name:'Cell contents',exact:true});await expect(viewer).toBeVisible();await expect(value(page)).toHaveAttribute('readonly','');await expect(viewer.getByRole('button',{name:'Import cell file',exact:true})).toBeDisabled();await expect(viewer.getByRole('button',{name:'Save cell',exact:true})).toHaveCount(0);await viewer.getByRole('button',{name:'Export cell file',exact:true}).click();expect(await page.evaluate(()=>(window as any).mutations?.length??0)).toBe(0);
});

for(const width of [800,1280])test(`Cell editor actions fit ${width}px window`,async({page},info)=>{
 await page.setViewportSize({width,height:600});await openContent(page);await openCell(page);await value(page).fill('Long text\n'.repeat(200));const save=page.getByRole('button',{name:'Save cell',exact:true});await save.scrollIntoViewIfNeeded();const box=await save.boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(600);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);await screenshot(page,info,'cell-editor-layout');
});

test('Generated cells stay read-only and a PNG BLOB previews locally with URL cleanup',async({page})=>{
 await openContent(page);await page.evaluate(()=>{
  const app=(window as any).go.main.App,metadata=app.TableDetails,browse=app.Browse;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
  const bytes=atob(canvas.toDataURL('image/png').split(',')[1]);
  const hex='0x'+Array.from(bytes,c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('');
  app.TableDetails=async(...args:any[])=>{const d=await metadata(...args);return {...d,columns:d.columns.map((c:any)=>c.name==='message'?{...c,type:'BLOB',generated:true}:c)};};
  app.Browse=async(...args:any[])=>{const r=await browse(...args);return {...r,rows:r.rows.map((row:any[])=>row.map((c:any,i:number)=>i===3?{value:hex,null:false,binary:true}:c))};};
  const revoke=URL.revokeObjectURL;URL.revokeObjectURL=(url:string)=>{((window as any).revokedCells??=[]).push(url);revoke(url);};
 });
 await page.getByRole('button',{name:'Reload content',exact:true}).click();await openCell(page,3);const viewer=page.getByRole('dialog',{name:'Cell contents',exact:true});await expect(viewer.getByRole('button',{name:'Save cell',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Preview',exact:true}).click();const img=page.getByAltText('Binary cell preview',{exact:true});await expect(img).toHaveJSProperty('naturalWidth',1);const url=await img.getAttribute('src');expect(url).toMatch(/^blob:/);await viewer.getByRole('button',{name:'Close',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).revokedCells)).toContain(url);expect(await page.evaluate(()=>(window as any).mutations?.length??0)).toBe(0);
});

test('JSON column validation rejects malformed input without changing numeric literals',async({page})=>{
 await openContent(page);await page.evaluate(()=>{const app=(window as any).go.main.App,metadata=app.TableDetails;app.TableDetails=async(...args:any[])=>{const d=await metadata(...args);return {...d,columns:d.columns.map((c:any)=>c.name==='name'?{...c,type:'JSON'}:c)};};});await page.getByRole('button',{name:'Reload content',exact:true}).click();await openCell(page);await value(page).fill('{broken');await page.getByRole('button',{name:'Save cell',exact:true}).click();await expect(dialog(page).getByRole('alert')).toBeVisible();expect(await page.evaluate(()=>(window as any).mutations?.length??0)).toBe(0);await value(page).fill('{"n":18446744073709551615}');await page.getByRole('button',{name:'Save cell',exact:true}).click();expect(await page.evaluate(()=>(window as any).lastMutation.values.name.value)).toBe('{"n":18446744073709551615}');
});
