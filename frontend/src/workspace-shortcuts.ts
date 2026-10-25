import {readPreferences} from './preferences.ts';
import {matchShortcut,type ShortcutEvent} from './shortcuts.ts';
export function workspaceShortcut(event:ShortcutEvent,mac:boolean){
 if(!event.metaKey&&!event.ctrlKey)return;
 const action=matchShortcut(event,mac,readPreferences().shortcuts);
 if(action==='run'||action==='runAll'||action==='preferences')return;
 return action;
}
