import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keyboardSize, pointerSize} from '../src/splitter-size.ts';

test('pointer movement uses parent size and stops at both bounds', () => {
    assert.equal(pointerSize(20, 100, 1000, 15, 35), 30);
    assert.equal(pointerSize(20, -500, 1000, 15, 35), 15);
    assert.equal(pointerSize(20, 500, 1000, 15, 35), 35);
    assert.equal(pointerSize(32, 50, 500, 20, 65), 42);
    assert.equal(pointerSize(32, 50, 0, 20, 65), 32);
});

test('keyboard follows separator axis, boundaries, Home and End', () => {
    assert.equal(keyboardSize('ArrowLeft', 'x', 20, 15, 35), 19);
    assert.equal(keyboardSize('ArrowRight', 'x', 35, 15, 35), 35);
    assert.equal(keyboardSize('ArrowUp', 'y', 20, 20, 65), 20);
    assert.equal(keyboardSize('ArrowDown', 'y', 32, 20, 65), 33);
    assert.equal(keyboardSize('Home', 'y', 32, 20, 65), 20);
    assert.equal(keyboardSize('End', 'x', 20, 15, 35), 35);
    assert.equal(keyboardSize('ArrowDown', 'x', 20, 15, 35), undefined);
    assert.equal(keyboardSize('Tab', 'y', 32, 20, 65), undefined);
});
