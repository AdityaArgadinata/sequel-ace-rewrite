import type {database} from '../wailsjs/go/models';

// Same ordering as SPTableStructure's typeSuggestions and extraFieldSuggestions.
export const typeGroups = [
 ['TINYINT','SMALLINT','MEDIUMINT','INT','BIGINT','FLOAT','DOUBLE','DOUBLE PRECISION','REAL','DECIMAL','BIT','SERIAL','BOOL','BOOLEAN','DEC','FIXED','NUMERIC'],
 ['CHAR','VARCHAR','TINYTEXT','TEXT','MEDIUMTEXT','LONGTEXT','TINYBLOB','MEDIUMBLOB','BLOB','LONGBLOB','BINARY','VARBINARY','JSON','ENUM','SET'],
 ['DATE','DATETIME','TIMESTAMP','TIME','YEAR'],
 ['GEOMETRY','POINT','LINESTRING','POLYGON','MULTIPOINT','MULTILINESTRING','MULTIPOLYGON','GEOMETRYCOLLECTION'],
 ['INET4','INET6'],
];
export const extras=['None','auto_increment','on update CURRENT_TIMESTAMP','SERIAL DEFAULT VALUE'];
export const fieldColumns=['COLUMN_NAME','COLUMN_TYPE','LENGTH','UNSIGNED','ZEROFILL','BINARY','IS_NULLABLE','COLUMN_KEY','COLUMN_DEFAULT','EXTRA','CHARACTER_SET_NAME','COLLATION_NAME','COLUMN_COMMENT'];
export const numericType=(type:string)=>typeGroups[0].includes(type) && type!=='BIT';
export const stringType=(type:string)=>['CHAR','VARCHAR','TINYTEXT','TEXT','MEDIUMTEXT','LONGTEXT','ENUM','SET'].includes(type);
export const lengthAllowed=(type:string)=>!/(TEXT|BLOB)$/.test(type) && !['JSON','DATE','INET4','INET6',...typeGroups[3]].includes(type);
export function fieldValues(result:database.Result,row:number):Record<string,string> {
 const get=(name:string)=>{const cell=result.rows[row]?.[result.columns.findIndex(c=>c.name===name)];return cell?.null ? '' : cell?.value ?? '';};
 const match=/^([A-Z]+(?:\s+PRECISION)?)(?:\((.*)\))?/is.exec(get('COLUMN_TYPE'));
 const type=match?.[1].toUpperCase() ?? get('COLUMN_TYPE').toUpperCase();
 const attributes=get('COLUMN_TYPE').slice(match?.[0].length ?? 0);
 const extra=get('EXTRA').replace(/\bDEFAULT_GENERATED\b/ig,'').trim();
 return {name:get('COLUMN_NAME'),type,length:match?.[2] ?? '',unsigned:String(/\bunsigned\b/i.test(attributes)),zerofill:String(/\bzerofill\b/i.test(attributes)),binary:String(type==='JSON' || get('COLLATION_NAME').endsWith('_bin')),nullable:String(get('IS_NULLABLE')==='YES'),key:get('COLUMN_KEY'),default:get('COLUMN_DEFAULT') || (result.rows[row]?.[result.columns.findIndex(c=>c.name==='COLUMN_DEFAULT')]?.null && get('IS_NULLABLE')==='YES' ? 'NULL' : ''),extra:extras.find(e=>e!=='None' && extra.toLowerCase().includes(e.toLowerCase())) ?? (extra || 'None'),encoding:type==='JSON' ? 'utf8mb4' : get('CHARACTER_SET_NAME'),collation:type==='JSON' ? 'utf8mb4_bin' : get('COLLATION_NAME'),comment:get('COLUMN_COMMENT')};
}
export function fieldsResult(result:database.Result):database.Result {
 return {...result,columns:fieldColumns.map(name=>({name,type:'VARCHAR'})),rows:result.rows.map((_,r)=>{const v=fieldValues(result,r);return ['name','type','length','unsigned','zerofill','binary','nullable','key','default','extra','encoding','collation','comment'].map(key=>({value:v[key],null:false,binary:false}));})} as database.Result;
}
export function catalogRows(result:database.Result|undefined):Record<string,string>[] {
 return result?.rows.map(row=>Object.fromEntries(result.columns.map((column,i)=>[column.name,row[i]?.value ?? '']))) ?? [];
}
