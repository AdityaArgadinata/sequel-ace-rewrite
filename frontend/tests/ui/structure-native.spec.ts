import {test,expect,type Page} from '@playwright/test';
import {openContent,screenshot} from './fixture';
const field=(page:Page,row:number,column=0)=>page.locator(`[data-schema-cell="${row}:${column}"] input`);
const attempts=(page:Page)=>page.evaluate(()=>(window as any).schemaAttempts?.length??0);
async function open(page:Page,noAuto=false){await openContent(page);if(noAuto)await page.evaluate(()=>{(window as any).schemaNoAutoIncrement=true;});await page.getByRole('button',{name:'Structure',exact:true}).click();await expect(page.getByRole('button',{name:'Add column',exact:true})).toBeEnabled();}

test('Double-click edits in place, Enter saves the whole row with no preview modal, no-op does not write',async({page},info)=>{
 await open(page);await field(page,1).click();await expect(field(page,1)).toHaveAttribute('readonly','');
 await field(page,1).dblclick();await field(page,1).fill('display_name');await field(page,1).press('Enter');
 await expect.poll(()=>attempts(page)).toBe(1);await expect(page.getByRole('dialog')).toHaveCount(0);await expect(field(page,1)).toHaveValue('display_name');
 expect(await page.evaluate(()=>(window as any).schemaApplies[0])).toMatchObject({action:'edit',original:'name',name:'display_name'});
 await field(page,1).dblclick();await field(page,1).press('Enter');expect(await attempts(page)).toBe(1);
 await screenshot(page,info,'structure-native-inline');
});

test('Tab stays in one row; crossing its boundary saves and Shift-Tab wraps back',async({page})=>{
 await open(page);await field(page,1).dblclick();await field(page,1).fill('renamed');await field(page,1).press('Tab');
 await expect(page.getByRole('combobox',{name:'Type for name',exact:true})).toBeFocused();expect(await attempts(page)).toBe(0);
 await field(page,1,12).dblclick();await field(page,1,12).fill('comment');await field(page,1,12).press('Tab');
 await expect.poll(()=>attempts(page)).toBe(1);await expect(field(page,0)).toBeFocused();
 await field(page,0).press('Shift+Tab');await expect(field(page,1,12)).toBeFocused();expect(await attempts(page)).toBe(1);
});

test('Escape cancels all attributes, plus inserts INT after selection, duplicate clears key and Extra',async({page})=>{
 await open(page);await page.getByRole('combobox',{name:'Type for name',exact:true}).selectOption('BIGINT');await field(page,1).dblclick();await field(page,1).fill('discard');await field(page,1).press('Escape');
 await expect(field(page,1)).toHaveValue('name');await expect(page.getByRole('combobox',{name:'Type for name',exact:true})).toHaveValue('VARCHAR');expect(await attempts(page)).toBe(0);
 await field(page,0).click();await page.getByRole('button',{name:'Add column',exact:true}).click();await expect(page.locator('.structure-columns tbody tr')).toHaveCount(3);
 await expect(field(page,1)).toHaveValue('');await expect(field(page,1)).toBeFocused();await expect(page.locator('[data-schema-cell="1:1"] select')).toHaveValue('INT');await expect(page.locator('[data-schema-cell="1:6"] input')).toBeChecked();await expect(field(page,1,8)).toHaveValue('NULL');
 await field(page,1).fill('inserted');await field(page,1).press('Enter');await expect.poll(()=>attempts(page)).toBe(1);
 expect(await page.evaluate(()=>(window as any).schemaApplies[0])).toMatchObject({action:'add',after:'id',name:'inserted'});await expect(field(page,2)).toHaveValue('name');
 await field(page,0).click();await page.getByRole('button',{name:'Duplicate column',exact:true}).click();await expect(field(page,3)).toHaveValue('idCopy');await expect(page.locator('[data-schema-cell="3:9"] select')).toHaveValue('None');await expect(page.locator('[data-schema-cell="3:7"]')).toBeEmpty();
 await field(page,3).press('Escape');await expect(page.locator('.structure-columns tbody tr')).toHaveCount(3);
});

test('Selecting another row saves first; a failed write keeps selection and the draft until an explicit choice',async({page})=>{
 await open(page);await field(page,1).dblclick();await field(page,1).fill('edited');await page.evaluate(()=>{(window as any).schemaApplyError='Error 1064: invalid field definition';});
 await field(page,0).click();await expect(page.getByRole('dialog',{name:'Error changing field',exact:true})).toBeVisible();expect(await attempts(page)).toBe(1);
 await page.getByRole('button',{name:'Edit row',exact:true}).click();await expect(field(page,1)).toHaveValue('edited');await expect(field(page,1)).toBeFocused();expect(await attempts(page)).toBe(1);
 await page.evaluate(()=>{delete (window as any).schemaApplyError;});await field(page,1).press('Enter');await expect.poll(()=>attempts(page)).toBe(2);await expect(field(page,1)).toHaveValue('edited');
});

test('A failed add does not navigate; discard cancels the new row without executing it twice',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Add column',exact:true}).click();await field(page,2).fill('invalid');await page.evaluate(()=>{(window as any).schemaApplyError='Error 1060: duplicate column';});
 await page.getByRole('button',{name:'Query',exact:true}).click();await expect(page.getByRole('dialog',{name:'Error adding field',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Structure',exact:true})).toHaveAttribute('aria-current','page');
 await page.getByRole('button',{name:'Discard changes',exact:true}).click();await expect(page.locator('.structure-columns tbody tr')).toHaveCount(2);expect(await attempts(page)).toBe(1);
});

test('Navigation saves schema drafts before switching views/tables/sessions and does not silently discard them',async({page})=>{
 await open(page);await field(page,1).dblclick();await field(page,1).fill('before_query');await page.getByRole('button',{name:'Query',exact:true}).click();await expect.poll(()=>attempts(page)).toBe(1);await expect(page.getByLabel('SQL query')).toBeVisible();
 await page.getByRole('button',{name:'Structure',exact:true}).click();await expect(field(page,1)).toHaveValue('before_query');await field(page,1).dblclick();await field(page,1).fill('before_table');await page.getByRole('button',{name:'column_stats',exact:true}).click();await expect.poll(()=>attempts(page)).toBe(2);
 await field(page,1).dblclick();await field(page,1).fill('before_tab');await page.getByLabel('Connection actions',{exact:true}).click();await page.getByRole('button',{name:'New Connection Tab',exact:true}).click();await expect.poll(()=>attempts(page)).toBe(3);
});

test('A successful write followed by reload failure cannot be submitted again',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Add column',exact:true}).click();await field(page,2).fill('created');await page.evaluate(()=>{(window as any).schemaReloadError=true;});await field(page,2).press('Enter');
 await expect(page.getByRole('dialog',{name:'Unable to change structure',exact:true})).toContainText('was applied, but metadata reload failed');await page.getByRole('button',{name:'OK',exact:true}).click();await expect(page.getByRole('button',{name:'Add column',exact:true})).toBeDisabled();expect(await attempts(page)).toBe(1);
});

test('AUTO_INCREMENT requests an index and saves the field and key in one operation',async({page})=>{
 await open(page,true);await page.getByRole('button',{name:'Add column',exact:true}).click();await field(page,2).fill('sequence');await page.locator('[data-schema-cell="2:9"] select').selectOption('auto_increment');await expect(page.getByRole('dialog',{name:'Choose an index',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Choose index',exact:true}).click();await expect(page.locator('[data-schema-cell="2:6"] input')).not.toBeChecked();await field(page,2).dblclick();await field(page,2).press('Enter');await expect.poll(()=>attempts(page)).toBe(1);
 expect(await page.evaluate(()=>(window as any).schemaApplies[0])).toMatchObject({autoIndex:'INDEX',columnEdits:{extra:'auto_increment',nullable:'false',default:''}});
});

test('Delete confirms once, defaults to Cancel; index plus opens a native-style column list',async({page},info)=>{
 await open(page);await field(page,1).click();await page.getByRole('button',{name:'Drop column',exact:true}).click();await expect(page.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();await page.keyboard.press('Escape');expect(await attempts(page)).toBe(0);
 await page.getByRole('button',{name:'Add index',exact:true}).click();await expect(page.getByRole('textbox',{name:'Index name',exact:true})).toBeVisible();await expect(page.getByRole('textbox',{name:'Schema definition',exact:true})).toHaveCount(0);
 await page.getByRole('textbox',{name:'Index name',exact:true}).fill('idx_name');await page.getByLabel('Index column 1',{exact:true}).selectOption('name');await screenshot(page,info,'structure-native-index-sheet');await page.getByRole('dialog').getByRole('button',{name:'Add index',exact:true}).click();await expect.poll(()=>attempts(page)).toBe(1);
});

test('Double-click empty space adds a field; the next double-click saves it and starts another draft',async({page})=>{
 await open(page);const grid=page.locator('.structure-columns .results');const box=await grid.boundingBox();
 await grid.dblclick({position:{x:20,y:Math.min(box!.height-10,140)}});await expect(field(page,2)).toBeFocused();await field(page,2).fill('from_blank');
 await grid.dblclick({position:{x:20,y:Math.min(box!.height-10,170)}});await expect.poll(()=>attempts(page)).toBe(1);await expect(field(page,3)).toHaveValue('');await expect(field(page,3)).toBeFocused();await field(page,3).press('Escape');await expect(page.locator('.structure-columns tbody tr')).toHaveCount(3);
});

test('Single-click empty space saves and deselects existing and new fields; a failure retains the draft',async({page})=>{
 await open(page);const grid=page.locator('.structure-columns .results');
 const blank=async()=>{const box=await grid.boundingBox();await grid.click({position:{x:20,y:box!.height-10}});};
 await field(page,1).dblclick();await field(page,1).fill('blank_saved');await blank();
 await expect.poll(()=>attempts(page)).toBe(1);await expect(field(page,1)).toHaveValue('blank_saved');await expect(grid.locator('tr[aria-selected="true"]')).toHaveCount(0);
 await blank();expect(await attempts(page)).toBe(1);
 await page.getByRole('button',{name:'Add column',exact:true}).click();await field(page,2).fill('new_blank_saved');await blank();
 await expect.poll(()=>attempts(page)).toBe(2);await expect(field(page,2)).toHaveValue('new_blank_saved');await expect(grid.locator('tr[aria-selected="true"]')).toHaveCount(0);
 await field(page,1).dblclick();await field(page,1).fill('retain_draft');await page.evaluate(()=>{(window as any).schemaApplyError='Error 1064: invalid field definition';});await blank();
 await expect(page.getByRole('dialog',{name:'Error changing field',exact:true})).toBeVisible();expect(await attempts(page)).toBe(3);
 await page.getByRole('button',{name:'Edit row',exact:true}).click();await expect(field(page,1)).toHaveValue('retain_draft');await expect(field(page,1)).toBeFocused();
});

test('Double-click waits for a slow blank-space save before appending another field',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Add column',exact:true}).click();await field(page,2).fill('slow_saved');
 await page.evaluate(()=>{const api=(window as any).go.main.App,apply=api.ApplySchemaChange;api.ApplySchemaChange=async(...args:any[])=>{await new Promise(resolve=>setTimeout(resolve,350));return apply(...args);};});
 const grid=page.locator('.structure-columns .results'),box=await grid.boundingBox();await grid.dblclick({position:{x:20,y:box!.height-10}});
 await expect.poll(()=>attempts(page)).toBe(1);await expect(field(page,3)).toBeFocused();await expect(field(page,2)).toHaveValue('slow_saved');await expect(field(page,3)).toHaveValue('');
});

test('Dragging a field moves it with a position-only change and preserves its definition',async({page})=>{
 await open(page);const source=page.locator('[data-schema-cell="1:0"]'),target=page.locator('[data-schema-cell="0:0"]');
 await source.dragTo(target,{sourcePosition:{x:10,y:10},targetPosition:{x:10,y:1}});await expect.poll(()=>attempts(page)).toBe(1);
 expect(await page.evaluate(()=>(window as any).schemaApplies[0])).toMatchObject({action:'edit',original:'name',name:'name',columnEdits:{},first:true});await expect(field(page,0)).toHaveValue('name');
});

test('Index sheet stays within a small window and Escape cancels without any write',async({page},info)=>{
 await page.setViewportSize({width:800,height:600});await open(page);await page.getByRole('button',{name:'Add index',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();const box=await page.getByRole('dialog').boundingBox();expect(box&&box.x>=0&&box.y>=0&&box.x+box.width<=800&&box.y+box.height<=600).toBeTruthy();await screenshot(page,info,'structure-index-800');await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);expect(await attempts(page)).toBe(0);
});

test('An acknowledged DDL with unreadable warning metadata clears the draft and requires reload',async({page})=>{
 await open(page);await field(page,1).dblclick();await field(page,1).fill('acknowledged');await page.evaluate(()=>{(window as any).schemaApplyError='schema change was acknowledged, but warnings could not be read';});await field(page,1).press('Enter');
 await expect(page.getByRole('dialog',{name:'Unable to change structure',exact:true})).toContainText('acknowledged');await page.getByRole('button',{name:'OK',exact:true}).click();await expect(page.getByRole('button',{name:'Add column',exact:true})).toBeDisabled();expect(await attempts(page)).toBe(1);await expect(page.getByRole('button',{name:'Edit row',exact:true})).toHaveCount(0);
});

test('Duplicate and drop first save the current field and use its new name and attributes',async({page})=>{
 await open(page);await field(page,1).dblclick();await field(page,1).fill('fresh');await page.getByRole('button',{name:'Duplicate column',exact:true}).click();await expect.poll(()=>attempts(page)).toBe(1);await expect(field(page,2)).toHaveValue('freshCopy');await field(page,2).press('Escape');
 await field(page,1).dblclick();await field(page,1).fill('fresh_again');await page.getByRole('button',{name:'Drop column',exact:true}).click();await expect(page.getByRole('dialog')).toHaveAccessibleName('Delete field “fresh_again”?');await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(await attempts(page)).toBe(2);
});

test('Related foreign keys are listed before field removal and included only after confirmation',async({page})=>{
 await openContent(page);await page.evaluate(()=>{(window as any).schemaRelatedFK=true;});await page.getByRole('button',{name:'Structure',exact:true}).click();await expect(page.getByRole('button',{name:'Add column',exact:true})).toBeEnabled();
 await field(page,1).click();await page.getByRole('button',{name:'Drop column',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Related foreign keys will also be deleted: fk_name.');expect(await attempts(page)).toBe(0);
 await page.getByRole('button',{name:'Delete',exact:true}).click();await expect.poll(()=>attempts(page)).toBe(1);expect(await page.evaluate(()=>(window as any).schemaApplies[0])).toMatchObject({action:'drop',original:'name',dropForeignKeys:['fk_name']});await expect(page.locator('.structure-columns tbody tr')).toHaveCount(1);await expect(page.getByRole('button',{name:'Drop column',exact:true})).toBeDisabled();
});
