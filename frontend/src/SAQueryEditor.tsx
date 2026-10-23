import {useEffect, useRef} from 'react';
import {basicSetup} from 'codemirror';
import {Compartment, EditorState} from '@codemirror/state';
import {EditorView, keymap} from '@codemirror/view';
import {sql, MySQL, MariaSQL} from '@codemirror/lang-sql';
import {oneDark} from '@codemirror/theme-one-dark';

type Props = {
    value:string; disabled:boolean; schema:Record<string,string[]>; databaseName:string; table:string; mariaDB:boolean;
    onChange:(sql:string) => void; onSelection:(range:{from:number;to:number;head:number}) => void;
    onRun:(scope:'current'|'selection'|'all') => void;
};
export default function SAQueryEditor(props:Props) {
    const root=useRef<HTMLDivElement>(null);
    const editor=useRef<EditorView|null>(null);
    const callbacks=useRef(props); callbacks.current=props;
    const external=useRef(false);
    const appearance=useRef(new Compartment());
    const wrapping=useRef(new Compartment());
    const language=useRef(new Compartment());
    const editable=useRef(new Compartment());
    const config=() => sql({dialect:callbacks.current.mariaDB ? MariaSQL : MySQL,schema:{[callbacks.current.databaseName]:callbacks.current.schema},defaultSchema:callbacks.current.databaseName,defaultTable:callbacks.current.table || undefined,upperCaseKeywords:true});
    useEffect(() => {
        if (!root.current) return;
        const view=new EditorView({parent:root.current,state:EditorState.create({doc:callbacks.current.value,extensions:[
            keymap.of([
                {key:'Mod-Enter',run:view => {callbacks.current.onRun(view.state.selection.main.empty ? 'current' : 'selection');return true;}},
                {key:'Mod-Shift-Enter',run:() => {callbacks.current.onRun('all');return true;}},
            ]),
            basicSetup,appearance.current.of(document.documentElement.dataset.theme==='light'?[]:oneDark),wrapping.current.of(document.documentElement.dataset.wrap==='true'?EditorView.lineWrapping:[]),
            EditorView.contentAttributes.of({'aria-label':'SQL query','aria-multiline':'true'}),
            EditorView.theme({'&':{height:'100%',backgroundColor:'var(--field)'},'.cm-scroller':{overflow:'auto',fontFamily:'var(--editor-font, ui-monospace, Menlo, Consolas, monospace)',fontSize:'var(--editor-size,13px)',lineHeight:'20px'},'.cm-gutters':{backgroundColor:'var(--surface)',borderRight:'1px solid var(--separator)'}}),
            language.current.of(config()),
            editable.current.of([EditorState.readOnly.of(callbacks.current.disabled),EditorView.editable.of(!callbacks.current.disabled)]),
            EditorView.updateListener.of(update => {
                if (update.docChanged && !external.current) callbacks.current.onChange(update.state.doc.toString());
                if (update.selectionSet || update.docChanged) {const {from,to,head}=update.state.selection.main;callbacks.current.onSelection({from,to,head});}
            }),
        ]})});
        const preferences=()=>view.dispatch({effects:[appearance.current.reconfigure(document.documentElement.dataset.theme==='light'?[]:oneDark),wrapping.current.reconfigure(document.documentElement.dataset.wrap==='true'?EditorView.lineWrapping:[])]});window.addEventListener('sa-preferences',preferences);
        editor.current=view;
        callbacks.current.onSelection({from:0,to:0,head:0});
        return () => {window.removeEventListener('sa-preferences',preferences);view.destroy();editor.current=null;};
    },[]);
    useEffect(() => {
        const view=editor.current;
        if (view && view.state.doc.toString()!==props.value) {
            external.current=true;
            try {view.dispatch({changes:{from:0,to:view.state.doc.length,insert:props.value},selection:{anchor:0}});} finally {external.current=false;}
        }
    },[props.value]);
    useEffect(() => {editor.current?.dispatch({effects:editable.current.reconfigure([EditorState.readOnly.of(props.disabled),EditorView.editable.of(!props.disabled)])});},[props.disabled]);
    useEffect(() => {editor.current?.dispatch({effects:language.current.reconfigure(config())});},[props.schema,props.databaseName,props.table,props.mariaDB]);
    return <div className="sa-sql-editor" ref={root}/>;
}
