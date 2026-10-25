import {test,expect} from '@playwright/test';
import {openContent,screenshot} from './fixture';

test('Delete uses a modal, defaults to Cancel and Escape never writes',async({page},info)=>{
 await openContent(page);await page.locator('.content-grid tbody tr').first().click();
 await page.getByRole('button',{name:'Delete row',exact:true}).focus();await page.getByRole('button',{name:'Delete row',exact:true}).press('Enter');
 const dialog=page.getByRole('dialog',{name:'Delete selected row?',exact:true});
 await expect(dialog).toBeVisible();await expect(dialog).toContainText('mysql.db');await expect(dialog).toContainText('id:');
 await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
 await screenshot(page,info,'delete-confirmation-modal');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).mutations?.length??0)).toBe(0);
 await expect(page.getByRole('button',{name:'Delete row',exact:true})).toBeFocused();
});

test('Failed update shows the server error without replaying the write',async({page})=>{
 await openContent(page);await page.evaluate(()=>{(window as any).go.main.App.Mutate=async()=>{(window as any).writeAttempts=((window as any).writeAttempts??0)+1;throw new Error('Error 1062: Duplicate entry');};});
 await page.locator('.content-grid tbody tr').first().locator('td').nth(1).dblclick();
 await page.getByLabel('Cell value',{exact:true}).fill('conflict');await page.getByLabel('Cell value',{exact:true}).press('Enter');
 const dialog=page.getByRole('dialog',{name:'Unable to write row',exact:true});await expect(dialog).toContainText('Duplicate entry');await expect(dialog).toContainText('Reload and verify');
 await dialog.getByRole('button',{name:'OK',exact:true}).click();expect(await page.evaluate(()=>(window as any).writeAttempts)).toBe(1);
 await page.getByRole('button',{name:'Reload content',exact:true}).click();await expect(page.locator('.content-grid tbody tr')).toHaveCount(6);
});

test('Failed delete uses a modal and never deletes twice',async({page})=>{
 await openContent(page);await page.evaluate(()=>{(window as any).go.main.App.Mutate=async()=>{(window as any).writeAttempts=((window as any).writeAttempts??0)+1;throw new Error('Error 1451: Foreign key constraint fails');};});
 await page.locator('.content-grid tbody tr').first().click();await page.getByRole('button',{name:'Delete row',exact:true}).click();
 await page.getByRole('dialog',{name:'Delete selected row?',exact:true}).getByRole('button',{name:'Confirm delete',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Unable to delete row',exact:true});await expect(dialog).toContainText('Foreign key constraint fails');await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);expect(await page.evaluate(()=>(window as any).writeAttempts)).toBe(1);
});

test('Insert creates an inline draft; update remains modal and cancellation preserves database data',async({page})=>{
 await openContent(page);await page.getByRole('button',{name:'Insert row',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.content-grid tbody tr')).toHaveCount(7);await page.getByLabel('New row cell value',{exact:true}).press('Escape');
 await page.locator('.content-grid tbody tr').first().click();await page.getByRole('button',{name:'Edit row',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Edit row',exact:true})).toBeVisible();await page.getByLabel('Write name',{exact:true}).check();await page.getByLabel('Value name',{exact:true}).fill('cancelled');await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).mutations?.length??0)).toBe(0);
});
