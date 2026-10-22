import type {Command, Project, StitchObject} from './project';

export function selectIds(order:string[],ids:string[],id:string,mode:'replace'|'toggle'|'range',anchor:string|null):string[]{
  if(!order.includes(id))return ids;
  if(mode==='toggle')return ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];
  const a=anchor===null?-1:order.indexOf(anchor),b=order.indexOf(id);
  if(mode!=='range'||a<0)return [id];
  const range=order.slice(Math.min(a,b),Math.max(a,b)+1);return b<a?range.reverse():range;
}

// Keep original command indices so hiding layers does not change the playback clock or counts.
const visibilityCache=new WeakMap<Command[],Map<string,{commands:Command[];indices:number[]}>>();
export function visibleCommands(commands:Command[],objects:StitchObject[],excluded:ReadonlySet<string>=new Set()){
  const hidden=new Set([...excluded,...objects.filter(o=>o.hidden).flatMap(o=>[o.id,...(o.text?.border?[`${o.id}-border`]:[])])]);
  const key=JSON.stringify([...hidden].sort()),cache=visibilityCache.get(commands)??new Map<string,{commands:Command[];indices:number[]}>(),cached=cache.get(key);if(cached)return cached;
  const indices:number[]=[],visible=commands.filter((c,i)=>{
    if(c.objectId!==undefined&&hidden.has(c.objectId)||(c.type==='jump'||c.travel)&&c.fromObjectId!==undefined&&hidden.has(c.fromObjectId))return false;
    indices.push(i);return true;
  });
  const value={commands:visible.length===commands.length?commands:visible,indices};if(cache.size>=4)cache.delete(cache.keys().next().value!);cache.set(key,value);visibilityCache.set(commands,cache);return value;
}

export type LayerRow={key:string;type:'object'|'group';index:number;end:number;name:string;ids:string[];group?:string;object?:StitchObject;collapsed?:boolean};
export function layerRows(project:Project,collapsed:Set<string>):LayerRow[]{
  const rows:LayerRow[]=[];
  project.objects.forEach((o,index)=>{
    const group=o.group===undefined?undefined:project.groups?.find(g=>g.id===o.group);
    if(group&&project.objects[index-1]?.group!==group.id){
      let end=index+1;while(project.objects[end]?.group===group.id)end++;
      rows.push({key:`group:${group.id}`,type:'group',index,end,name:group.name,ids:project.objects.slice(index,end).map(o=>o.id),group:group.id,collapsed:collapsed.has(group.id)});
    }
    if(!group||!collapsed.has(group.id))rows.push({key:`object:${o.id}`,type:'object',index,end:index+1,name:o.name,ids:[o.id],group:group?.id,object:o});
  });
  return rows;
}
export function layerTarget(row:LayerRow,after:boolean,wholeGroup=false){
  const index=row.type==='group'?(after&&(wholeGroup||row.collapsed)?row.end:row.index):row.index+(after?1:0);
  return {index,group:wholeGroup?null:row.type==='group'&&!after?null:row.group??null};
}

// Locks: locked objects stay selectable from Layers but are skipped by canvas hits, Select all and edits.
export const unlockedIds=(p:Project,ids:readonly string[])=>ids.filter(id=>p.objects.some(o=>o.id===id&&!o.locked));
export const selectableIds=(p:Project)=>p.objects.filter(o=>!o.locked&&!o.hidden).map(o=>o.id);
const withLock=(o:StitchObject,locked:boolean):StitchObject=>{if(!!o.locked===locked)return o;const next={...o};delete next.locked;return locked?{...next,locked}:next;};
export function toggleLock(p:Project,ids:readonly string[]):Project{
  const chosen=p.objects.filter(o=>ids.includes(o.id));if(!chosen.length)return p;
  const locked=!chosen.every(o=>o.locked);return {...p,objects:p.objects.map(o=>ids.includes(o.id)?withLock(o,locked):o)};
}
export const unlockAll=(p:Project):Project=>p.objects.some(o=>o.locked)?{...p,objects:p.objects.map(o=>withLock(o,false))}:p;
