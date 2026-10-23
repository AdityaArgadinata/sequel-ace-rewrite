import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fieldValues,fieldsResult,stringType,numericType,lengthAllowed} from '../src/structure-fields.ts';
const metadata=(type,nullable='YES',extra='',encoding=null,collation=null)=>({
 columns:['COLUMN_NAME','COLUMN_TYPE','IS_NULLABLE','COLUMN_DEFAULT','COLUMN_KEY','EXTRA','CHARACTER_SET_NAME','COLLATION_NAME','COLUMN_COMMENT'].map(name=>({name,type:'VARCHAR'})),
 rows:[['field',type,nullable,null,'',extra,encoding,collation,''].map(value=>({value:value??'',null:value===null,binary:false}))],truncated:false,durationMS:0,
});
test('Structure separates type, length and flags without changing ENUM values or metadata',()=>{
 const input=metadata("enum('a,b','é)😀','UNSIGNED')",'YES','','utf8mb4','utf8mb4_bin');
 const values=fieldValues(input,0);assert.equal(values.type,'ENUM');assert.equal(values.length,"'a,b','é)😀','UNSIGNED'");assert.equal(values.default,'NULL');assert.equal(values.unsigned,'false');
 assert.equal(fieldsResult(input).columns.length,13);assert.equal(input.columns.length,9);
 const number=fieldValues(metadata('bigint(20) unsigned zerofill','NO'),0);
 assert.equal(number.type,'BIGINT');assert.equal(number.length,'20');assert.equal(number.unsigned,'true');assert.equal(number.zerofill,'true');assert.equal(number.default,'');
 assert.equal(numericType('BIGINT'),true);assert.equal(numericType('BIT'),false);assert.equal(stringType('VARCHAR'),true);assert.equal(stringType('JSON'),false);assert.equal(lengthAllowed('LONGTEXT'),false);
});
test('JSON metadata uses its fixed encoding and DEFAULT_GENERATED is not a generated column',()=>{
 const json=fieldValues(metadata('json'),0);assert.equal(json.encoding,'utf8mb4');assert.equal(json.binary,'true');assert.equal(json.collation,'utf8mb4_bin');
 assert.equal(fieldValues(metadata('timestamp','NO','DEFAULT_GENERATED on update CURRENT_TIMESTAMP'),0).extra,'on update CURRENT_TIMESTAMP');
 assert.equal(fieldValues(metadata('timestamp','NO','DEFAULT_GENERATED'),0).extra,'None');
 assert.equal(fieldValues(metadata('int','YES','STORED GENERATED'),0).extra,'STORED GENERATED');
});
