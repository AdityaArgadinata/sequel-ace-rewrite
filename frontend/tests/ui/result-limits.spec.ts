import {test,expect} from '@playwright/test';
import {openContent,screenshot} from './fixture';

for(const closed of [false,true])test(`Partial query result ${closed?'requires reconnect only when the response cannot finish':'keeps the session and stops pending script statements'}`,async({page},info)=>{
 await openContent(page);await page.getByRole('button',{name:'Query',exact:true}).click();
 await page.evaluate(({closed})=>{
  const app=(window as any).go.main.App,original=app.StreamPreparedQuery;
  (window as any).fixtureStatements=[{sql:'SELECT large',from:0,to:12,line:1},{sql:'DELETE later',from:13,to:25,line:2}];
  app.Connected=async()=>!(window as any).limitClosed;
  app.StreamPreparedQuery=async(...args:any[])=>{
   const normal=await original(...args);if((window as any).limitAlreadyReturned)return normal;
   (window as any).limitAlreadyReturned=true;(window as any).limitClosed=closed;
   return {...normal,rows:Array.from({length:500},(_,i)=>[{value:String(i+1),null:false,binary:false}]),truncated:true,sessionClosed:closed,notice:closed?'Showing the first 500 rows; the result is incomplete. The response could not be completed within the safety budget; the session was closed. Reconnect before continuing.':'Showing the first 500 rows; the result is incomplete. The remaining response was read and discarded; the session remains active.'};
  };
 },{closed});
 await page.getByRole('combobox',{name:'Execution scope',exact:true}).selectOption('all');
 const run=page.getByRole('button',{name:/^Run Query/});await run.click();
 await expect(page.locator('.script-summary')).toContainText('Remaining statements were not executed');
 await expect(page.locator('.results-footer')).toContainText('Partial result');await expect(page.locator('.results tbody tr')).toHaveCount(500);
 expect(await page.evaluate(()=>(window as any).executedSQL.map((r:any)=>r.sql))).toEqual(['SELECT large']);
 if(closed){await expect(run).toBeDisabled();await expect(page.locator('.script-summary')).toContainText('Reconnect before continuing');}
 else{
  await expect(run).toBeEnabled();await expect(page.locator('.script-summary')).toContainText('session remains active');await expect(page.locator('.operation-status')).toHaveCount(0);
  await screenshot(page,info,'limited-result-session-active');
  await page.evaluate(()=>{(window as any).fixtureStatements=[{sql:'SELECT next',from:0,to:11,line:1}];});
  await run.click();await expect(page.locator('.script-summary')).toContainText('Completed 1 of 1');await expect(page.locator('.results-footer')).not.toContainText('Partial result');
  expect(await page.evaluate(()=>(window as any).executedSQL.map((r:any)=>r.sql))).toEqual(['SELECT large','SELECT next']);
 }
});

test('Content shows the display limit notice while the session remains usable',async({page})=>{
 await openContent(page);await page.evaluate(()=>{const app=(window as any).go.main.App,original=app.Browse;app.Browse=async(...args:any[])=>({...await original(...args),truncated:true,sessionClosed:false,notice:'The 4 MiB display limit was reached; the result is incomplete. The remaining response was read and discarded; the session remains active.'});});
 await page.getByRole('button',{name:'Reload content',exact:true}).click();await expect(page.locator('.content-write-status')).toContainText('session remains active');await expect(page.getByRole('button',{name:'Reload content',exact:true})).toBeEnabled();
});
