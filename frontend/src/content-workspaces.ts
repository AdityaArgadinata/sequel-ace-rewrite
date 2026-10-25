export type ContentPage={database:string;table:string};
export const maxContentPages=8;
export function contentPageKey(page:ContentPage){return JSON.stringify([page.database,page.table]);}
// Only clean LRU pages may be evicted; a full set of drafts blocks a new page.
export function visitContentPage(pages:ContentPage[],page:ContentPage,drafts:ReadonlySet<string>):ContentPage[]|null{
 const key=contentPageKey(page),existing=pages.some(p=>contentPageKey(p)===key);
 const next=pages.filter(p=>contentPageKey(p)!==key);
 if(!existing && next.length>=maxContentPages){
  const index=next.findIndex(p=>!drafts.has(contentPageKey(p)));
  if(index<0)return null;
  next.splice(index,1);
 }
 return [...next,page];
}
