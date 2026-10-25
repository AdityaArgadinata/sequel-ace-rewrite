import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newFieldValues,changedField} from '../src/structure-row.ts';
test('new fields match Sequel Ace defaults and dependent attributes reset together',()=>{
 const row=newFieldValues();assert.equal(row.type,'INT');assert.equal(row.nullable,'true');assert.equal(row.default,'NULL');assert.equal(row.name,'');
 assert.deepEqual(changedField(row,{nullable:'false'}),{nullable:'false',default:''});
 assert.deepEqual(changedField(row,{zerofill:'true'}),{zerofill:'true',unsigned:'true'});
 assert.deepEqual(changedField(row,{unsigned:'false'}),{unsigned:'false',zerofill:'false'});
 assert.deepEqual(changedField(row,{extra:'auto_increment'}),{extra:'auto_increment',nullable:'false',default:''});
 const text=changedField({...row,default:'42',length:'10',unsigned:'true'},{type:'TEXT'});
 assert.equal(text.default,'');assert.equal(text.length,'');assert.equal(text.unsigned,'false');
 assert.equal(row.default,'NULL');assert.equal(newFieldValues().name,'');
});
test('MySQL 8.4 auto-increment rules and temporal precision follow the native editor',async()=>{
 const {autoIncrementAllowed}=await import('../src/structure-row.ts');
 assert.equal(autoIncrementAllowed('FLOAT','8.4.0'),false);assert.equal(autoIncrementAllowed('BIGINT','8.4.0'),true);assert.equal(autoIncrementAllowed('FLOAT','8.0.36'),true);assert.equal(autoIncrementAllowed('FLOAT','11.4.0-MariaDB'),true);
 assert.equal(changedField({...newFieldValues(),extra:'auto_increment'},{type:'VARCHAR'},'8.4.0').extra,'None');
 const edits=changedField({...newFieldValues(),type:'DATETIME',default:'CURRENT_TIMESTAMP(3)',extra:'on update CURRENT_TIMESTAMP'},{length:'6'});
 assert.equal(edits.default,'CURRENT_TIMESTAMP(6)');assert.equal(edits.extra,'on update CURRENT_TIMESTAMP');
});
