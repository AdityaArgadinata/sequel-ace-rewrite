import {test,expect} from '@playwright/test';
import {openApp,openContent,screenshot} from './fixture';

for(const viewport of [{width:1408,height:996},{width:800,height:600}])test(`Connection home matches the reference proportions at ${viewport.width}x${viewport.height}`,async({page},info)=>{
 await page.setViewportSize(viewport);await openApp(page);
 await expect(page.getByLabel('Time Zone:',{exact:true})).toHaveValue('');
 await expect(page.getByRole('option',{name:'Use Server Time Zone',exact:true})).toHaveCount(1);
 await expect(page.getByLabel('Folder:',{exact:true})).toBeHidden();
 await expect(page.getByLabel('Authentication:',{exact:true})).toBeHidden();
 await expect(page.getByRole('button',{name:'Import Sequel Ace favorites',exact:true})).toBeHidden();
 await expect(page.getByRole('combobox',{name:'Filter favorite folder',exact:true})).toHaveCount(0);
 const field=await page.locator('.connection-form>fieldset').boundingBox(),pane=await page.locator('.connection-pane').boundingBox();
 expect(Math.abs(field!.x+field!.width/2-(pane!.x+pane!.width/2))).toBeLessThan(2);
 expect(field!.width).toBe(425);
 if(viewport.height>900)expect(field!.y).toBeGreaterThan(viewport.height*.3);
 await page.getByRole('button',{name:'Connect',exact:true}).scrollIntoViewIfNeeded();
 const connect=await page.getByRole('button',{name:'Connect',exact:true}).boundingBox();
 expect(connect!.y+connect!.height).toBeLessThanOrEqual(viewport.height);
 await screenshot(page,info,'connection-home');
});

test('Time zone menu preserves custom offsets when saving and connecting',async({page})=>{
 await openApp(page);
 await page.getByLabel('Name:',{exact:true}).fill('Custom zone');
 await page.getByLabel('Time Zone:',{exact:true}).selectOption('Asia/Jakarta');
 await page.getByLabel('Time Zone:',{exact:true}).selectOption('@custom');
 await page.getByLabel('Custom time zone:',{exact:true}).fill('+05:45');
 await page.getByRole('button',{name:'Save Connection',exact:true}).click();
 await expect(page.getByRole('button',{name:'Custom zone',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).profileSaves.at(-1).timeZone)).toBe('+05:45');
 await page.getByRole('button',{name:'Connect',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).connectCalls.at(-1).timeZone)).toBe('+05:45');
});

test('Fresh connections open an empty striped Content workspace until a table is selected',async({page},info)=>{
 await page.setViewportSize({width:1408,height:996});await openApp(page);
 await page.getByRole('button',{name:'Connect',exact:true}).click();
 await expect(page.getByRole('button',{name:'Content',exact:true})).toHaveAttribute('aria-current','page');
 await expect(page.getByRole('combobox',{name:'Select Database',exact:true})).toHaveValue('');
 await expect(page.getByLabel('SQL query',{exact:true})).toHaveCount(0);
 await expect(page.locator('.table-list button')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Add Filter',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Insert row',exact:true})).toBeDisabled();
 expect(await page.locator('.content-empty-workspace .results').evaluate(node=>getComputedStyle(node).backgroundImage)).not.toBe('none');
 await page.locator('.content-empty-workspace .results').dblclick();
 expect(await page.evaluate(()=>(window as any).lastBrowse)).toBeUndefined();
 expect(await page.evaluate(()=>(window as any).executedSQL?.length??0)).toBe(0);
 await screenshot(page,info,'connected-empty-content');
 await page.getByRole('button',{name:'Query',exact:true}).click();
 await expect(page.getByLabel('SQL query',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Content',exact:true}).click();
 await expect(page.locator('.content-empty-workspace')).toBeVisible();
 await page.getByRole('combobox',{name:'Select Database',exact:true}).selectOption('mysql');
 await expect(page.locator('.content-empty-workspace')).toBeVisible();
 await page.getByRole('button',{name:'db',exact:true}).click();
 await expect(page.locator('tbody tr')).toHaveCount(6);
});

test('A new connection starts empty while the original tab keeps its loaded table',async({page})=>{
 await openContent(page);
 await page.getByRole('button',{name:'New connection tab',exact:true}).click();
 await page.getByRole('button',{name:'Connect',exact:true}).click();
 await expect(page.locator('.content-empty-workspace:visible')).toBeVisible();
 await expect(page.getByRole('combobox',{name:'Select Database',exact:true})).toHaveValue('');
 await page.locator('#tab-1').click();
 await expect(page.getByRole('combobox',{name:'Select Database',exact:true})).toHaveValue('mysql');
 await expect(page.locator('tbody tr:visible')).toHaveCount(6);
});
