import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contentPageKey,visitContentPage,maxContentPages} from '../src/content-workspaces.ts';

test('workspace identities separate databases and preserve delimiter/unicode names',()=>{
 assert.notEqual(contentPageKey({database:'a:b',table:'c'}),contentPageKey({database:'a',table:'b:c'}));
 assert.notEqual(contentPageKey({database:'db',table:'same'}),contentPageKey({database:'db2',table:'same'}));
 assert.equal(contentPageKey({database:'é😀',table:'__proto__'}),'["é😀","__proto__"]');
});
test('LRU eviction only removes a clean page and never mutates the old list',()=>{
 const pages=Array.from({length:maxContentPages},(_,i)=>({database:'db',table:String(i)}));
 const drafts=new Set([contentPageKey(pages[0]),contentPageKey(pages[1])]);
 const next=visitContentPage(pages,{database:'db',table:'new'},drafts);
 assert.equal(next.length,maxContentPages);assert.equal(next.some(p=>p.table==='2'),false);assert.equal(next[0].table,'0');assert.equal(next.at(-1).table,'new');assert.equal(pages[2].table,'2');
 const touched=visitContentPage(next,pages[0],drafts);assert.equal(touched.at(-1).table,'0');assert.equal(touched.length,maxContentPages);
});
test('all pinned drafts block a new page but can still be revisited',()=>{
 const pages=Array.from({length:maxContentPages},(_,i)=>({database:'db',table:String(i)})),drafts=new Set(pages.map(contentPageKey));
 assert.equal(visitContentPage(pages,{database:'db',table:'new'},drafts),null);
 assert.equal(visitContentPage(pages,pages[0],drafts).at(-1).table,'0');assert.equal(pages.length,maxContentPages);
});
