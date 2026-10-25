import {test,expect} from '@playwright/test';
import {openContent} from './fixture';

test('header sorting toggles and changes the server request and row order', async ({page}) => {
 await openContent(page);
 await page.getByRole('button',{name:'id',exact:true}).click();
 await expect(page.locator('th').first()).toHaveAttribute('aria-sort','ascending');
 await expect.poll(() => page.evaluate(() => (window as any).lastBrowse.descending)).toBe(false);
 await page.locator('.column-sort').first().click();
 await expect(page.locator('th').first()).toHaveAttribute('aria-sort','descending');
 await expect(page.locator('tbody tr').first().locator('td').first()).toHaveText('9');
 await page.getByRole('button',{name:'name',exact:true}).click();
 await expect.poll(() => page.evaluate(() => (window as any).lastBrowse.descending)).toBe(false);
});

test('multiple filters apply AND, OR, NULL and removal', async ({page}) => {
 await openContent(page);
 await page.getByLabel('Filter value',{exact:true}).fill('3');
 await page.getByRole('button',{name:'Add filter rule',exact:true}).click();
 await page.getByLabel('Filter column 2',{exact:true}).selectOption('id');
 await page.getByLabel('Filter value 2',{exact:true}).fill('4');
 await page.getByRole('button',{name:'Apply Filter(s)',exact:true}).click();
 await expect(page.locator('tbody tr')).toHaveCount(0);
 await page.getByLabel('Content options',{exact:true}).click();
 await page.getByLabel('Filter match',{exact:true}).selectOption('any');
 await page.getByLabel('Content options',{exact:true}).click();
 await page.getByRole('button',{name:'Apply Filter(s)',exact:true}).click();
 await expect(page.locator('tbody tr')).toHaveCount(2);
 await page.getByLabel('Content options',{exact:true}).click();
 await page.getByLabel('Filter match',{exact:true}).selectOption('all');
 await page.getByLabel('Content options',{exact:true}).click();
 await page.getByLabel('Filter column 2',{exact:true}).selectOption('message');
 await page.getByLabel('Filter operator 2',{exact:true}).selectOption('is null');
 await page.getByRole('button',{name:'Apply Filter(s)',exact:true}).click();
 await expect(page.locator('tbody tr')).toHaveCount(1);
 await page.getByRole('button',{name:'Remove filter 2',exact:true}).click();
 await expect(page.getByLabel('Filter match',{exact:true})).toHaveCount(0);
});

test('double click selects text and edits inline without changing cell geometry', async ({page}) => {
 await openContent(page);
 const name = () => page.locator('tbody tr').first().locator('td').nth(1);
 await page.getByRole('button',{name:'Refresh databases and tables',exact:true}).click();
 await page.getByRole('button',{name:'db',exact:true}).click();
 // Catalog refresh invalidates cached rows; explicitly reload before editing.
 await page.getByRole('button',{name:'Reload content',exact:true}).click();
 const before = await name().boundingBox();
 await name().dblclick();
 await expect.poll(() => page.getByLabel('Cell value',{exact:true}).evaluate((node: HTMLTextAreaElement) => node.selectionEnd - node.selectionStart)).toBe('Sample 3'.length);
 const during = await name().boundingBox();
 expect(during!.width).toBe(before!.width);
 expect(during!.height).toBe(before!.height);
 await expect(page.getByRole('button',{name:'Save cell',exact:true})).toHaveCount(0);
 await page.getByLabel('Cell value',{exact:true}).fill('Changed');
 await page.getByLabel('Cell value',{exact:true}).press('Enter');
 await expect(name()).toHaveText('Changed');
 expect(await page.evaluate(() => Object.keys((window as any).lastMutation.values))).toEqual(['name']);
 await name().dblclick();
 await page.getByLabel('Cell value',{exact:true}).fill('Discard');
 await page.getByLabel('Cell value',{exact:true}).press('Escape');
 await expect(name()).toHaveText('Changed');
 await name().dblclick();
 await page.getByLabel('Cell value',{exact:true}).fill('Discard on blur');
 await page.locator('.content-row-count').click();
 await expect(name()).toHaveText('Changed');
 await page.locator('tbody tr').first().locator('td').nth(3).dblclick();
 await page.getByLabel('Cell value',{exact:true}).press('Enter');
 await expect(page.locator('tbody tr').first().locator('td').nth(3)).toHaveText('NULL');
 expect(await page.evaluate(() => Object.keys((window as any).lastMutation.values))).toEqual(['name']);
 await name().dblclick();
 await page.getByLabel('Cell value',{exact:true}).fill('write-error');
 await page.getByLabel('Cell value',{exact:true}).press('Enter');
 await expect(page.getByText('Write failed. Reload and verify the server before trying again.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Save cell',exact:true})).toHaveCount(0);
});

test('non-nullable cells and generated/read-only tables stay protected', async ({page}) => {
 await openContent(page);
 await page.locator('tbody tr').first().locator('td').first().dblclick();
 await page.getByLabel('Cell value',{exact:true}).press('Escape');
 await page.evaluate(() => {
  const app = (window as any).go.main.App;
  const original = app.TableDetails;
  app.TableDetails = async (...args: unknown[]) => {
   const details = await original(...args);
   details.columns[1].generated = true;
   return details;
  };
 });
 await page.locator('.column-sort').first().click();
 await page.locator('tbody tr').first().locator('td').nth(1).dblclick();
 await expect(page.getByLabel('Cell value',{exact:true})).toHaveCount(0);
 await page.evaluate(() => {
  const app = (window as any).go.main.App;
  const original = app.TableDetails;
  app.TableDetails = async (...args: unknown[]) => ({...await original(...args),editable:false});
 });
 await page.locator('.column-sort').first().click();
 await page.locator('tbody tr').first().locator('td').first().dblclick();
 await expect(page.getByLabel('Cell value',{exact:true})).toHaveCount(0);
});

test('empty grid space does not select table text and cell editing remains selectable', async ({page}) => {
 await openContent(page);
 const grid = page.locator('.content-grid');
 const bounds = (await grid.boundingBox())!;
 const row = (await page.locator('tbody tr').last().boundingBox())!;
 const blank = {x:bounds.x+30,y:Math.min(bounds.y+bounds.height-20,row.y+row.height+50)};
 await page.mouse.click(blank.x,blank.y,{clickCount:3});
 expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
 await expect(page.getByRole('button',{name:'Cancel new row',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Cancel new row',exact:true}).click();
 await page.mouse.move(bounds.x+15,row.y+10);
 await page.mouse.down();
 await page.mouse.move(blank.x,blank.y,{steps:8});
 await page.mouse.up();
 expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
 await page.locator('tbody tr').first().locator('td').nth(1).dblclick();
 await expect.poll(() => page.getByLabel('Cell value',{exact:true}).evaluate((node: HTMLTextAreaElement) => node.selectionEnd-node.selectionStart)).toBe('Sample 3'.length);
 await page.getByLabel('Cell value',{exact:true}).press('Escape');
});


test('MyISAM cells can be edited and show immediate save status', async ({page}) => {
 await openContent(page);
 await page.evaluate(() => {
  const app = (window as any).go.main.App;
  const original = app.TableDetails;
  app.TableDetails = async (...args: unknown[]) => ({...await original(...args),engine:'MyISAM'});
 });
 await page.locator('.column-sort').first().click();
 await page.locator('tbody tr').first().locator('td').nth(1).dblclick();
 await page.getByLabel('Cell value',{exact:true}).fill('MyISAM value');
 await page.getByLabel('Cell value',{exact:true}).press('Enter');
 await expect(page.getByText('1 row(s) affected. Changes are saved immediately (MyISAM).',{exact:true})).toBeVisible();
 await expect(page.locator('tbody tr').first().locator('td').nth(1)).toHaveText('MyISAM value');
});


test('filter rows align, each checkbox is independent and Apply follows the last row', async ({page},info) => {
 await page.setViewportSize({width:1408,height:900});
 await openContent(page);
 await page.getByLabel('Filter value',{exact:true}).fill('3');
 await page.getByRole('button',{name:'Add filter rule',exact:true}).click();
 await page.getByRole('button',{name:'Add filter rule 2',exact:true}).click();
 await page.getByLabel('Filter operator 2',{exact:true}).selectOption('contains');
 await page.getByLabel('Filter value 2',{exact:true}).fill('Sample');
 await page.getByLabel('Filter operator 3',{exact:true}).selectOption('is not null');
 const fields = await page.locator('.content-filter input:not([type=checkbox])').all();
 const boxes = await Promise.all(fields.map(field => field.boundingBox()));
 for (const box of boxes) { expect(box!.x).toBe(boxes[0]!.x); expect(box!.width).toBe(boxes[0]!.width); }
 await expect(page.locator('.content-filter')).toHaveCount(3);
 await expect(page.locator('.content-filter').last().getByRole('button',{name:'Apply Filter(s)',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Apply Filter(s)',exact:true})).toHaveCount(1);
 await page.screenshot({path:info.outputPath('filters-three-rows.png')});
 await page.getByRole('button',{name:'Apply Filter(s)',exact:true}).click();
 await expect(page.locator('tbody tr')).toHaveCount(1);
 await page.getByLabel('Enable content filter',{exact:true}).uncheck();
 await page.getByRole('button',{name:'Apply Filter(s)',exact:true}).click();
 await expect(page.locator('tbody tr')).toHaveCount(6);
 await page.getByRole('button',{name:'Remove filter 1',exact:true}).click();
 await expect(page.getByLabel('Filter column',{exact:true})).toHaveValue('name');
 await page.getByRole('button',{name:'Add filter rule',exact:true}).click();
 await expect(page.getByLabel('Filter column 2',{exact:true})).toHaveValue('email');
});
