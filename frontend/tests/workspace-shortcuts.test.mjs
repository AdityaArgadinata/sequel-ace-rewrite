import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceShortcut} from '../src/workspace-shortcuts.ts';
const base = {key:'',metaKey:false,ctrlKey:false,altKey:false,shiftKey:false,repeat:false,isComposing:false};
test('native view commands map to Command on Mac and Control elsewhere', () => {
    for (const [key,action] of [['1','structure'],['2','content'],['3','relations'],['4','triggers'],['5','info'],['6','query'],['R','refresh'],['f','filter']]) {
        assert.equal(workspaceShortcut({...base,key,metaKey:true},true),action);
        assert.equal(workspaceShortcut({...base,key,ctrlKey:true},false),action);
        assert.equal(workspaceShortcut({...base,key},true),undefined);
    }
    assert.equal(workspaceShortcut({...base,key:'f',metaKey:true,altKey:true},true),'filter');
});
test('typing, composition, repeats, unavailable modes and extra modifiers are untouched', () => {
    const command = {...base,key:'1',metaKey:true};
    for (const extra of [{repeat:true},{isComposing:true},{shiftKey:true},{altKey:true},{ctrlKey:true}]) {
        assert.equal(workspaceShortcut({...command,...extra},true),undefined);
    }
    assert.equal(workspaceShortcut({...base,key:'f',ctrlKey:true,altKey:true},false),undefined);
    assert.equal(workspaceShortcut(command,false),undefined);
});
