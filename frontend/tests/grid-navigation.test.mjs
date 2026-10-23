import {test} from 'node:test';
import assert from 'node:assert/strict';
import {columnWidth, gridShortcut, selectedRow} from '../src/grid-navigation.ts';
test('grid navigation starts at first row, clamps and ignores unrelated keys', () => {
    assert.equal(selectedRow('ArrowDown', -1, 3), 0);
    assert.equal(selectedRow('ArrowUp', 0, 3), 0);
    assert.equal(selectedRow('ArrowDown', 2, 3), 2);
    assert.equal(selectedRow('ArrowUp', 99, 3), 2);
    assert.equal(selectedRow('ArrowDown', -5, 3), 0);
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

test('grid copy/menu shortcuts ignore typing, composition and modifier conflicts', () => {
    const event = {key:'c',altKey:false,shiftKey:false,ctrlKey:false,metaKey:false,repeat:false,isComposing:false};
    assert.equal(gridShortcut({...event,metaKey:true}),'copy');
    assert.equal(gridShortcut({...event,key:'C',ctrlKey:true}),'copy');
    assert.equal(gridShortcut({...event,key:'F10',shiftKey:true}),'menu');
    assert.equal(gridShortcut({...event,key:'ContextMenu'}),'menu');
    assert.equal(gridShortcut(event),undefined);
    for (const extra of [{altKey:true},{shiftKey:true},{repeat:true},{isComposing:true}]) {
        assert.equal(gridShortcut({...event,metaKey:true,...extra}),undefined);
    }
    assert.equal(gridShortcut({...event,key:'F10',shiftKey:true,ctrlKey:true}),undefined);
});
