import {lengthAllowed,numericType,stringType,typeGroups} from './structure-fields.ts';

export const newFieldValues=()=>({name:'',type:'INT',length:'',unsigned:'false',zerofill:'false',binary:'false',nullable:'true',key:'',default:'NULL',extra:'None',encoding:'',collation:'',comment:''} as Record<string,string>);
export function autoIncrementAllowed(type:string,version:string){
 const parts=/^(\d+)\.(\d+)/.exec(version);
 const restricted=!/MariaDB/i.test(version)&&parts&&(Number(parts[1])>8||Number(parts[1])===8&&Number(parts[2])>=4);
 return !restricted||['TINYINT','SMALLINT','MEDIUMINT','INT','INTEGER','BIGINT','BOOL','BOOLEAN'].includes(type);
}
export function changedField(values:Record<string,string>,changes:Record<string,string>,version=''){
 const next={...changes};
 if('type' in changes){
  const type=changes.type.toUpperCase();next.type=type;
  if(!autoIncrementAllowed(type,version)&&['auto_increment','SERIAL DEFAULT VALUE'].includes(values.extra))next.extra='None';
  if(!lengthAllowed(type))next.length='';
  if(!numericType(type)){next.unsigned='false';next.zerofill='false';}
  if(!stringType(type)){next.encoding='';next.collation='';}
  if(/(TEXT|BLOB)$/.test(type)||['JSON','DATE','DATETIME','TIME','TIMESTAMP','INET4','INET6',...typeGroups[3]].includes(type)){next.default='';next.length='';}
 }
 if('length' in changes&&['TIMESTAMP','DATETIME'].includes(values.type)){
  if(/^CURRENT_TIMESTAMP(?:\([0-6]?\))?$/i.test(values.default))next.default='CURRENT_TIMESTAMP'+(changes.length?'('+changes.length+')':'');
  if(values.extra==='on update CURRENT_TIMESTAMP')next.extra=values.extra;
 }
 if(changes.extra==='auto_increment'){next.nullable='false';next.default='';}
 if(changes.nullable==='false' && values.default==='NULL')next.default='';
 if(changes.zerofill==='true')next.unsigned='true';
 if(changes.unsigned==='false')next.zerofill='false';
 return next;
}
