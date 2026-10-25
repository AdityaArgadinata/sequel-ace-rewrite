import {test} from 'node:test';import assert from 'node:assert/strict';
import {defaultPreferences,normalizePreferences} from '../src/preferences.ts';
import {shortcutDefaults,validateShortcuts,matchShortcut} from '../src/shortcuts.ts';
const base={key:'',metaKey:false,ctrlKey:false,altKey:false,shiftKey:false,repeat:false,isComposing:false};
test('legacy preferences survive extension; invalid or reserved bindings never take over editing',()=>{
 assert.deepEqual(normalizePreferences(null),defaultPreferences);
 assert.deepEqual(normalizePreferences({theme:'light',size:16,wrap:true}),{...defaultPreferences,theme:'light',size:16,wrap:true});
 const bad=normalizePreferences({size:12.5,pageSize:999,tabSize:99,shortcuts:{run:'Mod+A'}});assert.equal(bad.size,13);assert.equal(bad.pageSize,50);assert.deepEqual(bad.shortcuts,shortcutDefaults);
});
test('remapping rejects duplicates/reserved keys and supports disable, shifted digits and both platforms',()=>{
 for(const binding of ['Mod+A','Mod+Q','Mod+S','Mod+H','Mod+M','Enter','Alt+Enter','Mod+Shift+Shift+1'])assert.throws(()=>validateShortcuts({...shortcutDefaults,run:binding}));
 assert.throws(()=>validateShortcuts({...shortcutDefaults,run:'Mod+1'}));
 const settings=validateShortcuts({...shortcutDefaults,query:'Mod+Shift+7',run:'Mod+Alt+Enter',runAll:''});
 assert.equal(matchShortcut({...base,key:'&',code:'Digit7',metaKey:true,shiftKey:true},true,settings),'query');
 assert.equal(matchShortcut({...base,key:'Enter',ctrlKey:true,altKey:true},false,settings),'run');
 assert.equal(matchShortcut({...base,key:'Enter',ctrlKey:true,altKey:true,getModifierState:key=>key==='AltGraph'},false,settings),undefined);
 assert.equal(matchShortcut({...base,key:'Enter',metaKey:true},true,settings),undefined);
 assert.equal(matchShortcut({...base,key:'Enter',ctrlKey:true,shiftKey:true},false,settings),undefined);
 for(const patch of [{repeat:true},{isComposing:true}])assert.equal(matchShortcut({...base,key:'Enter',ctrlKey:true,altKey:true,...patch},false,settings),undefined);
});
