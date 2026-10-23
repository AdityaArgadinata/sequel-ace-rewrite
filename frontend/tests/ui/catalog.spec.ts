import {test,expect} from '@playwright/test';
import {openApp} from './fixture';

test('a 509-table catalog stays selectable and searchable',async ({page}) => {
 await openApp(page);
 await page.evaluate(() => {
  (window as any).go.main.App.Tables=async () => ({columns:[{name:'Tables',type:'VARCHAR'}],rows:Array.from({length:509},(_,i) => [{value:`table_${String(i).padStart(3,'0')}`,null:false,binary:false}]),truncated:false,durationMS:3});
 });
 await page.getByRole('button',{name:'Connect',exact:true}).click();
 await page.getByRole('combobox',{name:'Select Database',exact:true}).selectOption('mysql');
 await expect(page.locator('.table-name')).toHaveCount(509);
 await page.getByRole('button',{name:'table_508',exact:true}).click();
 await expect(page.locator('tbody tr')).toHaveCount(6);
 await expect(page.locator('.connection-title')).toContainText('/mysql/table_508');
 await page.getByRole('searchbox',{name:'Filter tables',exact:true}).fill('table_508');
 await expect(page.locator('.table-name')).toHaveCount(1);
 await page.getByRole('searchbox',{name:'Filter tables',exact:true}).fill('');
 await expect(page.locator('.table-name')).toHaveCount(509);
 await expect(page.getByRole('combobox',{name:'Select Database',exact:true})).toBeEnabled();
});
