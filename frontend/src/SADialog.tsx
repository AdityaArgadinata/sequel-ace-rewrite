import {useLayoutEffect,useId,useRef,type ReactNode} from 'react';
import appIcon from '../../build/appicon.png';

export default function SADialog({title,children,onCancel,busy=false,wide=false}:{title:string;children:ReactNode;onCancel:()=>void;busy?:boolean;wide?:boolean}) {
 const heading=useId(),dialog=useRef<HTMLDialogElement>(null);
 const returnFocus=useRef(document.activeElement as HTMLElement|null);
 // Close before parent effects restore focus to an inline cell editor.
 useLayoutEffect(()=>{
  const element=dialog.current,opener=returnFocus.current;
  element?.showModal();element?.querySelector<HTMLElement>('[data-dialog-focus]')?.focus();
  return()=>{
   element?.close();
   queueMicrotask(()=>{
    if(opener?.isConnected && !document.querySelector('dialog:modal') && (document.activeElement===document.body || element?.contains(document.activeElement)))opener.focus();
   });
  };
 },[]);
 return <dialog ref={dialog} className={`insert-error-dialog${wide?' sa-dialog-wide':''}`} aria-labelledby={heading} aria-busy={busy} onKeyDown={event=>event.stopPropagation()} onCancel={event=>{event.preventDefault();if(!busy)onCancel();}}>
  <img src={appIcon} alt=""/><h2 id={heading}>{title}</h2>{children}
 </dialog>;
}

export function SAErrorDialog({title,message,onClose}:{title:string;message:string;onClose:()=>void}) {
 return <SADialog title={title} onCancel={onClose}><div role="alert"><p>{/Error \d+/.test(message)?'MySQL said:':'Details:'}</p><p className="insert-error-message">{message.replace(/^Error:\s*/,'')}</p></div><button type="button" data-dialog-focus autoFocus className="primary" onClick={onClose}>OK</button></SADialog>;
}
