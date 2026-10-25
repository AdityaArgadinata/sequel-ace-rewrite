import {test,expect} from '@playwright/test';
import {openContent,screenshot} from './fixture';

for(const platform of ['MacIntel','Win32'])test(`${platform} query controls keep labels and shortcuts inside their bounds`,async({page},info)=>{
 await page.addInitScript(platform=>Object.defineProperty(navigator,'platform',{get:()=>platform}),platform);
 await openContent(page);
 await page.getByRole('button',{name:'Query',exact:true}).click();
 const run=page.getByRole('button',{name:/^Run Query/});
 await expect(run).toBeEnabled();
 await expect(run.locator('.shortcut')).toHaveText(platform==='MacIntel'?'⌘↵':'Ctrl+Enter');
 for(const width of [1440,960,800]){
  await page.setViewportSize({width,height:900});
  const metrics=await run.evaluate(button=>{
   const box=button.getBoundingClientRect(),hint=button.querySelector('.shortcut')!.getBoundingClientRect();
   const controls=Array.from(button.closest('.query-actions')!.querySelectorAll('button,select')).map(control=>{
    const bounds=control.getBoundingClientRect();return {top:bounds.top,bottom:bounds.bottom,height:bounds.height};
   });
   return {box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom},hint:{left:hint.left,right:hint.right,top:hint.top,bottom:hint.bottom},controls,overflow:button.scrollWidth>button.clientWidth};
  });
  expect(metrics.overflow).toBe(false);
  expect(metrics.hint.top).toBeGreaterThanOrEqual(metrics.box.top);
  expect(metrics.hint.bottom).toBeLessThanOrEqual(metrics.box.bottom);
  expect(metrics.hint.right).toBeLessThanOrEqual(metrics.box.right);
  expect(metrics.box.right).toBeLessThanOrEqual(width);
  expect(metrics.controls.every(control=>control.height===24)).toBe(true);
  await screenshot(page,info,`query-toolbar-${platform}-${width}`);
 }
});
