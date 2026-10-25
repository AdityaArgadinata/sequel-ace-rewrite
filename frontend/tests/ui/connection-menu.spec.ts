import {test,expect,type Page} from '@playwright/test';
import {openContent,screenshot} from './fixture';
async function menu(page:Page){await page.getByLabel('Connection actions',{exact:true}).click();return page.locator('.sidebar-menu-content:visible');}

test('Connection menu uses Sequel Ace names and routes existing file and transfer actions',async({page},info)=>{
 await openContent(page);let actions=await menu(page);
 for(const name of ['New Connection Tab','Open…','Save Session','Save Query','Import…','Export…','Close'])await expect(actions.getByRole('button',{name,exact:true})).toBeVisible();
 await screenshot(page,info,'connection-menu');
 await actions.getByRole('button',{name:'Save Session',exact:true}).click();await expect(actions).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).savedSessions.at(-1))).toMatchObject({database:'mysql',table:'db',view:'content'});
 await page.evaluate(()=>{(window as any).fixtureOpenFile={sql:'SELECT 42;',name:'menu.sql',cancelled:false};});
 actions=await menu(page);await actions.getByRole('button',{name:'Open…',exact:true}).click();await expect(page.getByLabel('SQL query',{exact:true})).toContainText('SELECT 42;');
 actions=await menu(page);await actions.getByRole('button',{name:'Save Query',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).savedSQLFile)).toEqual({sql:'SELECT 42;',name:'menu.sql'});
 actions=await menu(page);await actions.getByRole('button',{name:'Export…',exact:true}).click();await expect(page.getByRole('dialog',{name:'Export',exact:true})).toBeVisible();await page.getByRole('dialog',{name:'Export',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();
 actions=await menu(page);await actions.getByRole('button',{name:'Import…',exact:true}).click();await expect(page.getByRole('region',{name:'Import SQL dump',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).executedSQL?.length??0)).toBe(0);
});

test('Connection menu fits a small window and Close closes the current session',async({page})=>{
 await page.setViewportSize({width:800,height:600});await openContent(page);const actions=await menu(page),box=await actions.boundingBox();
 expect(box&&box.y>=0&&box.y+box.height<=600).toBeTruthy();
 await actions.getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByRole('button',{name:'Connect',exact:true})).toBeVisible();
});
