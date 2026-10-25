import {shortcutDefaults,validateShortcuts,type Shortcuts} from './shortcuts.ts';
export const editorFonts=['ui-monospace, Menlo, Consolas, monospace','Menlo, monospace','Monaco, monospace','Consolas, monospace'];
export type Preferences={theme:string;font:string;size:number;wrap:boolean;pageSize:number;tabSize:number;shortcuts:Shortcuts};
export const defaultPreferences:Preferences={theme:'dark',font:editorFonts[0],size:13,wrap:false,pageSize:50,tabSize:4,shortcuts:shortcutDefaults};
export function normalizePreferences(value:unknown):Preferences{
 const v=(value&&typeof value==='object'?value:{}) as Partial<Preferences>;let shortcuts={...shortcutDefaults};
 try{shortcuts=validateShortcuts({...shortcutDefaults,...v.shortcuts});}catch{/* Invalid bindings must not shadow editing keys. */}
 return {theme:['dark','light','system'].includes(v.theme??'')?v.theme!:'dark',font:editorFonts.includes(v.font??'')?v.font!:editorFonts[0],size:Number.isInteger(v.size)&&v.size!>=10&&v.size!<=24?v.size!:13,wrap:v.wrap===true,pageSize:[25,50,100,200].includes(v.pageSize??0)?v.pageSize!:50,tabSize:[2,4,8].includes(v.tabSize??0)?v.tabSize!:4,shortcuts};
}
export function readPreferences():Preferences{try{return normalizePreferences(JSON.parse(localStorage.getItem('sa-preferences')??'{}'));}catch{return normalizePreferences({});}}

export function shortcutHint(action:keyof Shortcuts){
 const shortcut=readPreferences().shortcuts[action];
 return /Mac/.test(navigator.platform)
  ? shortcut.replace('Mod+','⌘').replace('Shift+','⇧').replace('Alt+','⌥').replace('Enter','↵')
  : shortcut.replace('Mod','Ctrl');
}
