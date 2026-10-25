import SADialog from './SADialog';

export default function SAInsertError({message,onEdit,onDiscard}:{message:string;onEdit:()=>void;onDiscard:()=>void}) {
 return <SADialog title="Unable to write row" onCancel={onEdit}>
  <p>{/Error \d+/.test(message) ? 'MySQL said:' : 'Details:'}</p>
  <p className="insert-error-message">{message.replace(/^Error:\s*/,'')}</p>
  <button data-dialog-focus autoFocus className="primary" onClick={onEdit}>Edit row</button>
  <button onClick={onDiscard}>Discard changes</button>
 </SADialog>;
}
