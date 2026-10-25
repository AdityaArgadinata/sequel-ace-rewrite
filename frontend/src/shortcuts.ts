export const shortcutDefaults={structure:'Mod+1',content:'Mod+2',relations:'Mod+3',triggers:'Mod+4',info:'Mod+5',query:'Mod+6',refresh:'Mod+R',filter:'Mod+F',run:'Mod+Enter',runAll:'Mod+Shift+Enter',preferences:'Mod+,'};
export type ShortcutAction=keyof typeof shortcutDefaults;
export type Shortcuts=Record<ShortcutAction,string>;
export const shortcutLabels:Record<ShortcutAction,string>={structure:'Structure',content:'Content',relations:'Relations',triggers:'Triggers',info:'Table Info',query:'Query',refresh:'Reload',filter:'Content filter',run:'Run current / selection',runAll:'Run all statements',preferences:'Preferences'};
export type ShortcutEvent={key:string;metaKey:boolean;ctrlKey:boolean;altKey:boolean;shiftKey:boolean;repeat:boolean;isComposing:boolean;code?:string;getModifierState?:(key:string)=>boolean};
export function normalizeShortcut(text:string){
 if(!text.trim())return '';
 const parts=text.trim().split('+').map(p=>p.trim());const key=parts.pop()??'';
 if(parts[0]!=='Mod'||parts.some(p=>!['Mod','Shift','Alt'].includes(p))||new Set(parts).size!==parts.length||!/^([a-z0-9,]|Enter)$/i.test(key))throw new Error('Use Mod+[Shift+][Alt+]letter, number, Enter or comma; leave empty to disable.');
 if(/^[acvxzyqwnosptlhm]$/i.test(key))throw new Error('This shortcut is reserved for editing or the operating system.');
 return ['Mod',...(parts.includes('Shift')?['Shift']:[]),...(parts.includes('Alt')?['Alt']:[]),key.toLowerCase()==='enter'?'Enter':key.toUpperCase()].join('+');
}
export function validateShortcuts(value:Shortcuts):Shortcuts{
 const result={...shortcutDefaults};const used=new Set<string>();
 for(const action of Object.keys(result) as ShortcutAction[]){result[action]=normalizeShortcut(value[action]);if(result[action]&&used.has(result[action]))throw new Error('Two commands cannot use the same shortcut.');if(result[action])used.add(result[action]);}
 return result;
}
export function eventShortcut(event:ShortcutEvent,mac:boolean){
 if(event.repeat||event.isComposing||event.getModifierState?.('AltGraph')||(mac?!event.metaKey||event.ctrlKey:!event.ctrlKey||event.metaKey))return '';
 const typed=/^Digit[0-9]$/.test(event.code??'')?event.code!.slice(-1):event.key;
 const key=typed==='Enter'?'Enter':typed.length===1?typed.toUpperCase():'';
 if(!key)return '';
 return ['Mod',...(event.shiftKey?['Shift']:[]),...(event.altKey?['Alt']:[]),key].join('+');
}
export function matchShortcut(event:ShortcutEvent,mac:boolean,bindings:Shortcuts){
 const key=eventShortcut(event,mac);if(!key)return;
 for(const action of Object.keys(bindings) as ShortcutAction[])if(bindings[action]===key)return action;
 if(mac&&key==='Mod+Alt+F'&&bindings.filter===shortcutDefaults.filter)return 'filter';
}
