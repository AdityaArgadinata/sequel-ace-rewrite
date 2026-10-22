import {test} from 'node:test';
import assert from 'node:assert/strict';
import {indexOrder, reorderColumns} from '../src/structure-columns.ts';
test('native index order preserves cell identity, NULL, extra columns and metadata', () => {
    const row = [{value:'PRIMARY'}, {value:'0'}, {null:true}, {value:'new server metadata'}];
    const input = {columns:[{name:'INDEX_NAME'}, {name:'NON_UNIQUE'}, {name:'COLUMN_NAME'}, {name:'EXTRA_METADATA'}], rows:[row], durationMS:17};
    const output = reorderColumns(input, indexOrder);
    assert.deepEqual(output.columns.map(c => c.name), ['NON_UNIQUE','INDEX_NAME','COLUMN_NAME','EXTRA_METADATA']);
    assert.deepEqual(output.rows[0], [row[1],row[0],row[2],row[3]]);
    assert.equal(output.rows[0][2], row[2]);
    assert.equal(output.durationMS,17);
    assert.equal(input.rows[0][0].value,'PRIMARY');
    assert.equal(input.columns[0].name,'INDEX_NAME');
    assert.deepEqual(reorderColumns({...input, rows:[]},indexOrder).rows,[]);
});
