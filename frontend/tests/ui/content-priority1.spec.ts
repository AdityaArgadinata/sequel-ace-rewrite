import {test,expect} from '@playwright/test';
import {openContent} from './fixture';

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const rows = (page: any) => page.locator('tbody tr');

test('range selection, toggling and select all copy selected rows',async ({page}) => {
 await openContent(page);
 await rows(page).nth(0).click();
 await rows(page).nth(2).click({modifiers:['Shift']});
 await expect(page.locator('tr[aria-selected=true]')).toHaveCount(3);
 await rows(page).nth(1).click({modifiers:[modifier]});
 await expect(page.locator('tr[aria-selected=true]')).toHaveCount(2);
 await page.locator('.content-grid').press(`${modifier}+c`);
 expect(await page.evaluate(() => (window as any).clipboard.split('\n').length)).toBe(2);
 await page.locator('.content-grid').press(`${modifier}+a`);
 await expect(page.locator('tr[aria-selected=true]')).toHaveCount(6);
 await page.locator('.content-grid').press('Shift+F10');
 await page.getByRole('menuitem',{name:'Copy as CSV',exact:true}).click();
 expect(await page.evaluate(() => (window as any).clipboard)).toContain('"id","name"');
 await rows(page).first().locator('td').nth(1).click({button:'right'});
 await page.getByRole('menuitem',{name:'Clear selection',exact:true}).click();
 await expect(page.locator('tr[aria-selected=true]')).toHaveCount(0);
 await page.locator('.content-grid').press('ArrowDown');
 await page.locator('.content-grid').press('Shift+ArrowDown');
 await expect(page.locator('tr[aria-selected=true]')).toHaveCount(2);
});

test('duplicate opens a draft and leaves auto increment to the server',async ({page}) => {
 await openContent(page);
 await rows(page).first().click();
 await rows(page).nth(1).click({modifiers:[modifier]});
 await rows(page).nth(1).click({modifiers:[modifier]});
 await page.getByRole('button',{name:'Duplicate row',exact:true}).click();
 await expect(page.getByRole('form',{name:'Duplicate row',exact:true})).toBeVisible();
 await expect(page.getByLabel('Write id',{exact:true})).not.toBeChecked();
 await expect(page.getByLabel('Write name',{exact:true})).toBeChecked();
 await expect(page.getByLabel('Value name',{exact:true})).toHaveValue('Sample 3');
 await page.getByLabel('Value name',{exact:true}).fill('Duplicate draft');
 expect(await page.evaluate(() => (window as any).mutations?.length ?? 0)).toBe(0);
 await page.getByRole('button',{name:'Save row',exact:true}).click();
 await expect(rows(page)).toHaveCount(7);
 expect(await page.evaluate(() => (window as any).lastMutation.action)).toBe('insert');
 expect(await page.evaluate(() => Object.keys((window as any).lastMutation.values))).not.toContain('id');
 await expect(rows(page).last().locator('td').nth(1)).toHaveText('Duplicate draft');
});

test('bulk edit changes only checked fields and bulk delete requires confirmation',async ({page},info) => {
 await openContent(page);
 await rows(page).first().click();
 await rows(page).nth(2).click({modifiers:['Shift']});
 await page.getByRole('button',{name:'Edit row',exact:true}).click();
 await expect(page.getByLabel('Write id',{exact:true})).toBeDisabled();
 await page.getByLabel('Write name',{exact:true}).check();
 await page.getByLabel('Value name',{exact:true}).fill('Bulk value');
 await page.screenshot({path:info.outputPath('bulk-editor.png')});
 await page.getByRole('button',{name:'Save selected rows',exact:true}).click();
 await expect(page.getByText(/3 of 3 rows processed/)).toBeVisible();
 for (let i=0;i<3;i++) await expect(rows(page).nth(i).locator('td').nth(1)).toHaveText('Bulk value');
 expect(await page.evaluate(() => (window as any).mutations.map((r: any) => Object.keys(r.values)))).toEqual([['name'],['name'],['name']]);
 await rows(page).first().click();
 await rows(page).nth(1).click({modifiers:['Shift']});
 await page.getByRole('button',{name:'Delete row',exact:true}).click();
 await expect(rows(page)).toHaveCount(6);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(rows(page)).toHaveCount(6);
 await page.getByRole('button',{name:'Delete row',exact:true}).click();
 await page.getByRole('button',{name:'Confirm delete',exact:true}).click();
 await expect(rows(page)).toHaveCount(4);
 await expect(page.getByText(/2 of 2 rows processed/)).toBeVisible();
});

test('bulk operations stop on first error and report completed writes',async ({page}) => {
 await openContent(page);
 await page.evaluate(() => {
  const app = (window as any).go.main.App, original=app.Mutate;
  let calls=0;
  app.Mutate = async (...args: any[]) => { if (++calls===2) throw new Error('Simulated conflict'); return original(...args); };
 });
 await rows(page).first().click();
 await rows(page).nth(2).click({modifiers:['Shift']});
 await page.getByRole('button',{name:'Edit row',exact:true}).click();
 await page.getByLabel('Write name',{exact:true}).check();
 await page.getByLabel('Value name',{exact:true}).fill('First only');
 await page.getByRole('button',{name:'Save selected rows',exact:true}).click();
 await expect(page.getByText(/1 of 3 rows processed before an error/)).toBeVisible();
 expect(await page.evaluate(() => (window as any).mutations.length)).toBe(1);
 await expect(rows(page)).toHaveCount(0);
});

test('Tab, Shift+Tab and Enter save and move to adjacent cells',async ({page}) => {
 await openContent(page);
 await rows(page).first().locator('td').nth(1).dblclick();
 await page.getByLabel('Cell value',{exact:true}).fill('Tab saved');
 await page.getByLabel('Cell value',{exact:true}).press('Tab');
 await expect(page.getByLabel('Cell value',{exact:true})).toHaveValue('sample@example.com');
 await expect(page.getByLabel('Cell value',{exact:true})).toBeFocused();
 await page.getByLabel('Cell value',{exact:true}).press('Shift+Tab');
 await expect(page.getByLabel('Cell value',{exact:true})).toHaveValue('Tab saved');
 await page.getByLabel('Cell value',{exact:true}).fill('Enter saved');
 await page.getByLabel('Cell value',{exact:true}).press('Enter');
 await expect(page.getByLabel('Cell value',{exact:true})).toHaveValue('Sample 4');
 await expect(page.getByLabel('Cell value',{exact:true})).toBeFocused();
 await page.getByLabel('Cell value',{exact:true}).press('Escape');
 await expect(rows(page).first().locator('td').nth(1)).toHaveText('Enter saved');
});

test('context menu filters by cell and copies SQL safely',async ({page},info) => {
 await openContent(page);
 await rows(page).first().locator('td').nth(1).click({button:'right'});
 await page.screenshot({path:info.outputPath('grid-context-menu.png')});
 await page.getByRole('menuitem',{name:'Copy as SQL INSERT',exact:true}).click();
 expect(await page.evaluate(() => (window as any).clipboard)).toContain('INSERT INTO `mysql`.`db`');
 await rows(page).first().locator('td').nth(1).click({button:'right'});
 await page.getByRole('menuitem',{name:'Filter by cell',exact:true}).click();
 await expect(page.getByLabel('Filter column',{exact:true})).toHaveValue('name');
 await expect(page.getByLabel('Filter value',{exact:true})).toHaveValue('Sample 3');
 await page.getByRole('button',{name:'Apply Filter(s)',exact:true}).click();
 await expect(rows(page)).toHaveCount(1);
});

test('page jump validates input and uses the requested offset',async ({page}) => {
 await openContent(page);
 await page.getByLabel('Content options',{exact:true}).click();
 await page.getByRole('spinbutton',{name:'Go to page',exact:true}).fill('3');
 await page.getByRole('button',{name:'Go to page',exact:true}).click();
 await expect.poll(() => page.evaluate(() => (window as any).lastBrowse.offset)).toBe(100);
 await expect(rows(page)).toHaveCount(0);
 await page.getByRole('spinbutton',{name:'Go to page',exact:true}).fill('0');
 await page.getByRole('button',{name:'Go to page',exact:true}).click();
 expect(await page.evaluate(() => (window as any).lastBrowse.offset)).toBe(100);
 await page.getByRole('spinbutton',{name:'Go to page',exact:true}).fill('1');
 await page.getByRole('button',{name:'Go to page',exact:true}).click();
 await expect(rows(page)).toHaveCount(6);
});

test('table history supports back/forward and trims the forward branch',async ({page}) => {
 await openContent(page);
 await page.getByRole('button',{name:'column_stats',exact:true}).click();
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await expect(page.locator('.connection-title')).toContainText('/db');
 await expect(page.getByRole('button',{name:'Forward',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Forward',exact:true}).click();
 await expect(page.locator('.connection-title')).toContainText('/column_stats');
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await page.getByRole('button',{name:'a_table_with_a_very_long_identifier',exact:true}).click();
 await expect(page.getByRole('button',{name:'Forward',exact:true})).toBeDisabled();
});

test('bulk update skips unchanged rows and SQL copy can omit generated/auto columns',async ({page}) => {
 await openContent(page);
 await rows(page).first().click();
 await rows(page).nth(1).click({modifiers:['Shift']});
 await page.getByRole('button',{name:'Edit row',exact:true}).click();
 await page.getByLabel('Write name',{exact:true}).check();
 await page.getByLabel('Value name',{exact:true}).fill('Sample 3');
 await page.getByRole('button',{name:'Save selected rows',exact:true}).click();
 await expect(page.getByText(/2 of 2 rows processed. 1 row/)).toBeVisible();
 expect(await page.evaluate(() => (window as any).mutations.length)).toBe(1);
 await page.evaluate(() => {
  const app=(window as any).go.main.App, original=app.TableDetails;
  app.TableDetails=async (...args: any[]) => {const details=await original(...args);details.columns[2].generated=true;return details;};
 });
 await page.getByRole('button',{name:'Reload content',exact:true}).click();
 await rows(page).first().locator('td').nth(1).click({button:'right'});
 await page.getByRole('menuitem',{name:'Copy as SQL INSERT (no auto_inc)',exact:true}).click();
 const sql=await page.evaluate(() => (window as any).clipboard);
 expect(sql.split(' VALUES')[0]).not.toContain('`id`');
 expect(sql.split(' VALUES')[0]).not.toContain('`email`');
 expect(sql).toContain('`name`');
});

test('Tab follows the same row identity after sorting moves the saved row',async ({page}) => {
 await openContent(page);
 await page.getByRole('button',{name:'name',exact:true}).click();
 await rows(page).first().locator('td').nth(1).dblclick();
 await page.getByLabel('Cell value',{exact:true}).fill('Z last');
 await page.getByLabel('Cell value',{exact:true}).press('Tab');
 await expect(rows(page).last().locator('td').nth(1)).toHaveText('Z last');
 await expect(rows(page).last()).toHaveAttribute('aria-selected','true');
 await expect(page.getByLabel('Cell value',{exact:true})).toHaveValue('sample@example.com');
 await expect(page.getByLabel('Cell value',{exact:true})).toBeFocused();
});

test('table history restores the database before loading its table',async ({page}) => {
 await openContent(page);
 await page.getByRole('combobox',{name:'Select Database',exact:true}).selectOption('database_with_a_long_name');
 await page.getByRole('button',{name:'column_stats',exact:true}).click();
 await expect(page.locator('.connection-title')).toContainText('/database_with_a_long_name/column_stats');
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Select Database',exact:true})).toHaveValue('mysql');
 await expect(page.locator('.connection-title')).toContainText('/mysql/db');
 await page.getByRole('button',{name:'Forward',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Select Database',exact:true})).toHaveValue('database_with_a_long_name');
 await expect(page.locator('.connection-title')).toContainText('/database_with_a_long_name/column_stats');
});
