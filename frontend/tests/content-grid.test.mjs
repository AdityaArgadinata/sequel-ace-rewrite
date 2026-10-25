import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectRows,adjacentCell,copyRows} from '../src/content-grid.ts';

test('row selection supports toggle, range, reverse and invalid anchors', () => {
 assert.deepEqual(selectRows([1],1,3,6),[3]);
 assert.deepEqual(selectRows([1],1,3,6,true),[1,3]);
 assert.deepEqual(selectRows([1,3],1,1,6,true),[3]);
 assert.deepEqual(selectRows([1],1,4,6,false,true),[1,2,3,4]);
 assert.deepEqual(selectRows([5],4,2,6,true,true),[2,3,4,5]);
 assert.deepEqual(selectRows([],10,2,6,false,true),[2]);
 assert.deepEqual(selectRows([1],1,-1,6),[]);
});
test('editing navigation skips generated columns and stops at page edges', () => {
 const editable=[true,false,true];
 assert.deepEqual(adjacentCell(0,0,2,editable,'Tab'),{row:0,column:2});
 assert.deepEqual(adjacentCell(0,2,2,editable,'Tab'),{row:1,column:0});
 assert.deepEqual(adjacentCell(1,0,2,editable,'Tab',true),{row:0,column:2});
 assert.deepEqual(adjacentCell(0,2,2,editable,'Enter'),{row:1,column:2});
 assert.equal(adjacentCell(1,2,2,editable,'Tab'),undefined);
 assert.equal(adjacentCell(0,0,2,editable,'Tab',true),undefined);
 assert.equal(adjacentCell(1,0,2,editable,'Enter'),undefined);
 assert.equal(adjacentCell(0,0,2,[false,false],'Tab'),undefined);
});
test('copy encodes CSV and SQL without treating user values as SQL', () => {
 const columns=[{name:'key`',type:'TEXT'},{name:'bytes',type:'BLOB'},{name:'null',type:'TEXT'}];
 const rows=[[{value:'é\n"quoted"',null:false,binary:false},{value:'0x00ff',null:false,binary:true},{value:'',null:true,binary:false}]];
 assert.equal(copyRows(columns,rows,'csv'),'"key`","bytes","null"\r\n"é\n""quoted""","0x00ff",\\N');
 assert.equal(copyRows(columns,rows,'sql','t`','db'),'INSERT INTO `db`.`t``` (`key```, `bytes`, `null`) VALUES (CONVERT(0xc3a90a2271756f74656422 USING utf8mb4), 0x00ff, NULL);');
 assert.match(copyRows(columns,rows,'headers'),/^key`\tbytes\tnull\n/);
 assert.equal(copyRows(columns,[],'tsv'),'');
});

test('new rows preview defaults without writing expressions, generated or automatic values',async()=>{
 const {newRowCells,newRowValues}=await import('../src/content-grid.ts');
 const columns=[
  {name:'id',autoIncrement:true},
  {name:'count',defaultValue:{value:'0',null:false,binary:false}},
  {name:'name',defaultValue:{value:'',null:false,binary:false}},
  {name:'required',nullable:false},
  {name:'optional',nullable:true},
  {name:'created',defaultExpression:'CURRENT_TIMESTAMP'},
  {name:'computed',generated:true},
 ];
 const cells=newRowCells(columns);
 assert.equal(cells[0].null,true);assert.equal(cells[1].value,'0');assert.equal(cells[2].null,false);assert.equal(cells[2].value,'');assert.equal(cells[3].null,true);assert.equal(cells[5].value,'CURRENT_TIMESTAMP');
 assert.deepEqual(Object.keys(newRowValues(columns,cells,{})),['required']);
 cells[2]={value:'edited',null:false,binary:false};cells[3]={value:'42',null:false,binary:false};
 const values=newRowValues(columns,cells,{name:cells[2],required:cells[3]});
 assert.deepEqual(Object.keys(values),['name','required']);assert.equal(values.name.value,'edited');
 assert.equal(columns[2].defaultValue.value,'');
});
