import {test,expect,type Page} from '@playwright/test';
import {openContent,screenshot} from './fixture';
async function openStructure(page:Page){await openContent(page);await page.getByRole('button',{name:'Structure',exact:true}).click();await expect(page.getByRole('button',{name:'Add column',exact:true})).toBeEnabled();}
const definition=(page:Page)=>page.getByRole('textbox',{name:'Schema definition',exact:true});
const name=(page:Page)=>page.getByRole('textbox',{name:'Schema object name',exact:true});
const button=(page:Page,text:string)=>page.getByRole('button',{name:text,exact:true});
const ack=(page:Page)=>page.getByRole('checkbox',{name:'I reviewed this SQL and accept the schema/data changes.',exact:true});
async function preview(page:Page){await button(page,'Preview schema SQL').click();await expect(page.getByLabel('Schema SQL preview',{exact:true})).toBeVisible();}
async function apply(page:Page){await ack(page).check();await button(page,'Apply schema change').click();await expect(page.locator('.schema-editor')).toHaveCount(0);}

test('Column edits preserve attributes, preview before apply, and support add and drop',async({page},info)=>{
 await openStructure(page);
 await page.locator('.structure-columns tbody tr').filter({hasText:'AUTO_INCREMENT'}).dblclick();
 await expect(definition(page)).toHaveValue("INT NOT NULL AUTO_INCREMENT COMMENT 'keep all'");
 await name(page).fill('new_id');await preview(page);
 await expect(page.getByLabel('Schema SQL preview')).toContainText('CHANGE COLUMN `id` `new_id`');
 await expect(button(page,'Apply schema change')).toBeDisabled();
 expect(await page.evaluate(()=>(window as any).schemaApplies?.length ?? 0)).toBe(0);
 await definition(page).fill("BIGINT NOT NULL AUTO_INCREMENT COMMENT 'keep all'");
 await expect(page.getByLabel('Schema SQL preview')).toHaveCount(0);await preview(page);
 await screenshot(page,info,'schema-column-preview');await apply(page);
 await expect(page.locator('.structure-columns tbody')).toContainText('new_id');
 expect(await page.evaluate(()=>(window as any).schemaApplies[0].definition)).toBe("BIGINT NOT NULL AUTO_INCREMENT COMMENT 'keep all'");
 await button(page,'Add column').click();await name(page).fill('state');await definition(page).fill("ENUM('a,b','é;😀') NULL DEFAULT 'a,b'");await preview(page);await apply(page);
 await page.locator('.structure-columns tbody tr').filter({hasText:'state'}).click();await button(page,'Drop column').click();await preview(page);
 await expect(page.getByLabel('Schema SQL preview')).toContainText('DROP COLUMN `state`');await apply(page);
 await expect(page.locator('.structure-columns tbody')).not.toContainText('state');
});

test('Primary keys and composite indexes can be added, changed and dropped',async({page})=>{
 await openStructure(page);await page.locator('.structure-indexes tbody tr').first().dblclick();
 await expect(page.getByRole('combobox',{name:'Index type',exact:true})).toHaveValue('PRIMARY');await expect(name(page)).toBeDisabled();
 await definition(page).fill('(`id`, `name`)');await preview(page);await apply(page);
 expect(await page.evaluate(()=>(window as any).schemaApplies[0].original)).toBe('PRIMARY');
 await button(page,'Add index').click();await page.getByRole('combobox',{name:'Index type',exact:true}).selectOption('UNIQUE');await name(page).fill('uq_name');
 await definition(page).fill("(`name`(20), `id`) USING BTREE COMMENT 'composite'");await preview(page);await apply(page);
 await page.locator('.structure-indexes tbody tr').filter({hasText:'uq_name'}).first().dblclick();await name(page).fill('renamed_key');
 await page.getByRole('combobox',{name:'Index type',exact:true}).selectOption('INDEX');await preview(page);await apply(page);
 await page.locator('.structure-indexes tbody tr').filter({hasText:'renamed_key'}).first().click();await button(page,'Drop index').click();await preview(page);await apply(page);
 await expect(page.locator('.structure-indexes tbody')).not.toContainText('renamed_key');
});

test('Foreign keys retain composite definitions and use a new replacement name',async({page},info)=>{
 await openStructure(page);await button(page,'Foreign keys').click();await button(page,'Add foreign key').click();await name(page).fill('parent_fk');
 const sql='(`parent_id`, `id`) REFERENCES `other_db`.`parent` (`parent_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT';
 await definition(page).fill(sql);await preview(page);await apply(page);
 await page.locator('tbody tr').filter({hasText:'parent_fk'}).dblclick();await expect(definition(page)).toHaveValue(sql);await expect(name(page)).toHaveValue('parent_fk_edited');
 await definition(page).fill(sql.replace('ON DELETE CASCADE','ON DELETE SET NULL'));await preview(page);await screenshot(page,info,'schema-foreign-key-preview');await apply(page);
 await page.locator('tbody tr').filter({hasText:'parent_fk_edited'}).click();await button(page,'Drop foreign key').click();await preview(page);await apply(page);
 await expect(page.locator('tbody tr')).toHaveCount(0);
});

test('A failed preview never writes and Cancel discards the form',async({page})=>{
 await openStructure(page);await button(page,'Add column').click();await name(page).fill('blocked');
 await page.evaluate(()=>{(window as any).schemaPrepareError='finish the active or unverified transaction with COMMIT/ROLLBACK before editing schema';});
 await button(page,'Preview schema SQL').click();await expect(page.locator('.schema-editor [role=alert]')).toContainText('COMMIT/ROLLBACK');
 expect(await page.evaluate(()=>(window as any).schemaAttempts?.length ?? 0)).toBe(0);
 await button(page,'Cancel schema change').click();await expect(page.locator('.schema-editor')).toHaveCount(0);await expect(button(page,'Add column')).toBeEnabled();
});

test('A stale apply consumes its preview without automatic retry',async({page})=>{
 await openStructure(page);await button(page,'Add column').click();await name(page).fill('new');await preview(page);
 await page.evaluate(()=>{(window as any).schemaApplyError='schema changed since preview; reload structure and prepare again';});
 await ack(page).check();await button(page,'Apply schema change').click();
 await expect(page.getByRole('alert').filter({hasText:'schema changed since preview'})).toBeVisible();await expect(button(page,'Apply schema change')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).schemaAttempts.length)).toBe(1);expect(await page.evaluate(()=>(window as any).schemaApplies?.length ?? 0)).toBe(0);
});

test('DDL warnings and metadata reload failure are reported separately',async({page})=>{
 await openStructure(page);await page.evaluate(()=>{(window as any).schemaWarnings='Warning 1265: Data truncated';});
 await button(page,'Add column').click();await name(page).fill('first');await preview(page);await apply(page);await expect(page.locator('.schema-notice')).toContainText('Warning 1265');
 await page.evaluate(()=>{(window as any).schemaReloadError=true;});await button(page,'Add column').click();await name(page).fill('second');await preview(page);await apply(page);
 await expect(page.getByRole('alert').filter({hasText:'Schema change was applied, but metadata reload failed'})).toBeVisible();await expect(button(page,'Add column')).toBeDisabled();
 expect(await page.evaluate(()=>(window as any).schemaApplies.length)).toBe(2);
});

test('Read-only metadata disables schema writes and double-click editing',async({page})=>{
 await openStructure(page);await page.evaluate(()=>{(window as any).schemaReadonly=true;});await button(page,'Reload structure').click();
 await expect(button(page,'Add column')).toBeDisabled();await page.locator('.structure-columns tbody tr').first().dblclick();await expect(page.locator('.schema-editor')).toHaveCount(0);
});

test('Schema preview and confirmation fit a small window',async({page},info)=>{
 await page.setViewportSize({width:800,height:600});await openStructure(page);await button(page,'Add column').click();await name(page).fill('new_column');await preview(page);
 await ack(page).scrollIntoViewIfNeeded();await button(page,'Apply schema change').scrollIntoViewIfNeeded();const box=await button(page,'Apply schema change').boundingBox();expect(box && box.y>=0 && box.y+box.height<=600).toBeTruthy();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(800);await screenshot(page,info,'schema-small-window');
});


test('A schema change refreshes Query completion metadata on the next visit',async({page})=>{
 await openStructure(page);await button(page,'Query').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).completionCalls ?? 0)).toBeGreaterThan(0);
 const before=await page.evaluate(()=>(window as any).completionCalls);
 await button(page,'Structure').click();await expect(button(page,'Add column')).toBeEnabled();
 await button(page,'Add column').click();await name(page).fill('fresh_column');await preview(page);await apply(page);
 await button(page,'Query').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).completionCalls)).toBe(before+1);
});
