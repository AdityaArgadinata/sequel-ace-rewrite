import {test,expect} from '@playwright/test';
import {openContent} from './fixture';

test('row heights and empty zebra stay aligned before and during editing',async ({page},info) => {
 await openContent(page);
 const grid=page.locator('.content-grid');
 const heights=await grid.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
 expect(heights.every(height => height===22)).toBe(true);
 const header=await grid.locator('thead').evaluate(node => node.getBoundingClientRect().height);
 expect(await grid.evaluate(node => parseFloat(getComputedStyle(node).backgroundPositionY))).toBeCloseTo(header,3);
 await grid.locator('tbody tr').first().locator('td').nth(1).dblclick();
 await page.getByLabel('Cell value',{exact:true}).fill('Text with emojis 😀 and\nmultiple lines\nand another line');
 const editing=await grid.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
 expect(editing).toEqual(heights);
 await page.getByLabel('Cell value',{exact:true}).press('Escape');
 await page.screenshot({path:info.outputPath('rows-and-empty-zebra.png')});
});

test('zebra follows real header height and row scroll offset',async ({page}) => {
 await openContent(page);
 await page.evaluate(() => {
  const app=(window as any).go.main.App, browse=app.Browse;
  app.Browse=async (...args: any[]) => {
   const result=await browse(...args);
   return {...result,rows:Array.from({length:100},(_,i) => result.rows[i%result.rows.length])};
  };
 });
 await page.getByRole('button',{name:'Reload content',exact:true}).click();
 const grid=page.locator('.content-grid');
 await grid.evaluate(node => {node.scrollTop=73;});
 await expect.poll(() => grid.evaluate(node => parseFloat(getComputedStyle(node).backgroundPositionY)+node.scrollTop)).toBeCloseTo(await grid.locator('thead').evaluate(node => node.getBoundingClientRect().height),3);
 expect(await grid.locator('tbody tr').evaluateAll(rows => rows.every(row => row.getBoundingClientRect().height===22))).toBe(true);
});
