export type CellValue={value:string;null:boolean;binary:boolean};
export const maxCellBytes=4*1024*1024;
const encoder=new TextEncoder();
export function binaryColumn(type:string){return /BINARY|BLOB|BIT|GEOMETRY|POINT|LINESTRING|POLYGON/i.test(type);}
export function hexBytes(value:string):Uint8Array {
 const hex=value.replace(/[ \t\r\n]/g,'');
 if(hex.length>maxCellBytes || !/^0x(?:[\da-fA-F]{2})*$/.test(hex))throw new Error('Hex requires 0x followed by complete byte pairs, up to 4 MiB encoded data.');
 return Uint8Array.from({length:(hex.length-2)/2},(_,i)=>parseInt(hex.slice(i*2+2,i*2+4),16));
}
function bytesHex(bytes:Uint8Array){const chunks=['0x'];for(let i=0;i<bytes.length;i+=8192)chunks.push(Array.from(bytes.subarray(i,i+8192),byte=>byte.toString(16).padStart(2,'0')).join(''));return chunks.join('');}
export function editorCell(text:string,mode:'text'|'hex',isNull:boolean,binary:boolean):CellValue {
 if(isNull)return {value:'',null:true,binary};
 const bytes=mode==='hex'?hexBytes(text):encoder.encode(text);
 if(mode==='text'&&new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes)!==text)throw new Error('Text contains an incomplete Unicode character.');
 const value=mode==='hex'||binary?bytesHex(bytes):text;
 if(encoder.encode(value).length>maxCellBytes)throw new Error('Cell value exceeds 4 MiB encoded data.');
 return {value,null:false,binary:mode==='hex'||binary};
}
export function cellText(cell:CellValue,mode:'text'|'hex'){
 if(cell.null)return mode==='hex'?'0x':'';
 if(mode==='hex')return cell.binary?cell.value:bytesHex(encoder.encode(cell.value));
 if(!cell.binary)return cell.value;
 try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(hexBytes(cell.value));}
 catch{throw new Error('These bytes are not valid UTF-8. Keep Hex mode to preserve the data.');}
}
export function findCellText(text:string,query:string,from:number,backward=false){
 if(!query)return -1;
 if(backward){const index=from>0?text.lastIndexOf(query,from-1):-1;return index<0?text.lastIndexOf(query):index;}
 const index=text.indexOf(query,from);return index<0?text.indexOf(query):index;
}
// Validate JSON without serializing parsed numbers: large integers must stay exact.
export function jsonPreview(text:string){
 if(encoder.encode(text).length>64*1024)throw new Error('JSON preview is limited to 64 KiB. The full value remains in the editor.');
 JSON.parse(text);
 let output='',depth=0,inString=false,escaped=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(inString){output+=ch;if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')inString=false;continue;}
  if(ch==='"'){inString=true;output+=ch;}
  else if(ch==='{'||ch==='['){depth++;if(depth>64)throw new Error('JSON preview supports up to 64 nesting levels.');output+=ch+'\n'+'  '.repeat(depth);}
  else if(ch==='}'||ch===']'){depth--;output+='\n'+'  '.repeat(depth)+ch;}
  else if(ch===',')output+=',\n'+'  '.repeat(depth);
  else if(ch===':')output+=': ';
  else if(!/\s/.test(ch))output+=ch;
  if(output.length>128*1024)throw new Error('Formatted JSON preview exceeds 128 KiB.');
 }
 return output;
}
export function hexPreview(cell:CellValue){
 const bytes=cell.binary?hexBytes(cell.value):encoder.encode(cell.value),lines:string[]=[];
 for(let i=0;i<Math.min(bytes.length,4096);i+=16){const row=bytes.slice(i,i+16);lines.push(i.toString(16).padStart(8,'0')+'  '+Array.from(row,b=>b.toString(16).padStart(2,'0')).join(' ').padEnd(47)+'  '+Array.from(row,b=>b>=32&&b<127?String.fromCharCode(b):'.').join(''));}
 return lines.join('\n')+(bytes.length>4096?'\n… Preview limited to 4 KiB.':'');
}
export function imageType(cell:CellValue){
 if(!cell.binary||cell.null)return '';
 const h=cell.value.slice(2,34).toLowerCase();
 if(h.startsWith('89504e470d0a1a0a'))return 'image/png';
 if(h.startsWith('ffd8ff'))return 'image/jpeg';
 if(h.startsWith('474946383761')||h.startsWith('474946383961'))return 'image/gif';
 if(h.startsWith('52494646')&&h.slice(16,24)==='57454250')return 'image/webp';
 return '';
}
