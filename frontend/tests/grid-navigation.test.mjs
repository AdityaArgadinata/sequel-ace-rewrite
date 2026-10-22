import {test} from 'node:test';
import assert from 'node:assert/strict';
import {columnWidth, selectedRow} from '../src/grid-navigation.ts';
test('grid navigation starts at first row, clamps and ignores unrelated keys', () => {
    assert.equal(selectedRow('ArrowDown', -1, 3), 0);
    assert.equal(selectedRow('ArrowUp', 0, 3), 0);
    assert.equal(selectedRow('ArrowDown', 2, 3), 2);
    assert.equal(selectedRow('Home', 2, 3), 0);
    assert.equal(selectedRow('End', 0, 3), 2);
    assert.equal(selectedRow('End', 0, 0), undefined);
    assert.equal(selectedRow('Tab', 0, 3), undefined);
});
test('column resizing preserves width within bounds', () => {
    assert.equal(columnWidth(-200), 48);
    assert.equal(columnWidth(155), 155);
    assert.equal(columnWidth(1000), 800);
});
