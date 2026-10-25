import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cellText,editorCell,hexBytes,hexPreview,imageType,jsonPreview,findCellText,maxCellBytes} from '../src/cell-editor.ts';

test('text, binary, UTF-8 BOM and NULL remain distinct through representation changes',()=>{
 for(const text of ['', '\ufeffé😀\r\n\0', '18446744073709551615']){
  const cell=editorCell(text,'text',false,false);assert.equal(cell.value,text);
  const hex=editorCell(cellText(cell,'hex'),'hex',false,true);assert.equal(cellText(hex,'text'),text);
  assert.deepEqual(editorCell(cellText(hex,'text'),'text',false,true),hex);
 }
 assert.deepEqual(editorCell('ignored','text',true,false),{value:'',null:true,binary:false});
 assert.equal(editorCell('','text',false,false).null,false);
 assert.equal(editorCell('0x','hex',false,true).value,'0x');
 assert.equal(editorCell('0x00 ff\n41','hex',false,true).value,'0x00ff41');
 assert.throws(()=>cellText({value:'0xff',binary:true,null:false},'text'),/not valid UTF-8/);
 assert.throws(()=>editorCell('\ud800','text',false,false),/incomplete Unicode/);
});
test('hex, byte limits and search validate without silent coercion',()=>{
 for(const value of ['00','0x0','0xzz','0x12xx'])assert.throws(()=>hexBytes(value));
 assert.throws(()=>editorCell('é'.repeat(maxCellBytes/2+1),'text',false,false),/exceeds/);
 assert.throws(()=>editorCell('a'.repeat(maxCellBytes/2),'text',false,true),/exceeds/);
 assert.equal(findCellText('a.b a.b','a.b',0),0);assert.equal(findCellText('a.b a.b','a.b',3),4);assert.equal(findCellText('a.b a.b','a.b',7),0);assert.equal(findCellText('a.b a.b','a.b',0,true),4);assert.equal(findCellText('text','missing',0),-1);
});
test('JSON preview preserves large numbers, duplicate keys and escaped string content',()=>{
 const text='{"n":18446744073709551615,"n":1.2345678901234567890,"s":"a\\\"b\\\\c"}';
 const preview=jsonPreview(text);assert.match(preview,/18446744073709551615/);assert.match(preview,/1\.2345678901234567890/);assert.match(preview,/a\\\"b\\\\c/);
 assert.equal((preview.match(/"n"/g)||[]).length,2);assert.doesNotThrow(()=>JSON.parse(preview));
 assert.throws(()=>jsonPreview('{bad}'));assert.throws(()=>jsonPreview('['.repeat(65)+'0'+']'.repeat(65)),/nesting/);
 assert.throws(()=>jsonPreview('"'+'a'.repeat(65536)+'"'),/64 KiB/);
});
test('binary preview is bounded and image detection excludes active content',()=>{
 const c={value:'0x0041ff',binary:true,null:false};assert.match(hexPreview(c),/00 41 ff/);assert.match(hexPreview(c),/\.A\./);
 assert.match(hexPreview({...c,value:'0x'+'00'.repeat(4097)}),/limited to 4 KiB/);
 assert.equal(imageType({...c,value:'0x89504e470d0a1a0a'}),'image/png');assert.equal(imageType({...c,value:'0x3c7376673e'}),'');
});
