import {normalizeGroups, withGroup, type Command, type Compiled, type Project, type StitchObject} from './project';
import type {Thread} from './threads';

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
function layerRows(project:Project,collapsed:Set<string>):LayerRow[]{
  const rows:LayerRow[]=[];
  project.objects.forEach((o,index)=>{
    if(o.layoutOnly)return;
    const group=o.group===undefined?undefined:project.groups?.find(g=>g.id===o.group);
    if(group&&project.objects[index-1]?.group!==group.id){
      let end=index+1;while(project.objects[end]?.group===group.id)end++;
      rows.push({key:`group:${group.id}`,type:'group',index,end,name:group.name,ids:project.objects.slice(index,end).map(o=>o.id),group:group.id,collapsed:collapsed.has(group.id)});
    }
    if(!group||!collapsed.has(group.id))rows.push({key:`object:${o.id}`,type:'object',index,end:index+1,name:o.name,ids:[o.id],group:group?.id,object:o});
  });
  return rows;
}
// Layers panel order: the top of the list is the object on top of the stack (sewn last), like canvas layers.
// Group headers stay above their members.
export function stackRows(project:Project,collapsed:Set<string>):LayerRow[]{
  const blocks:LayerRow[][]=[];
  for(const row of layerRows(project,collapsed)){
    if(row.type==='object'&&row.group!==undefined&&blocks.at(-1)?.[0].group===row.group)blocks.at(-1)!.push(row);else blocks.push([row]);
  }
  return blocks.reverse().flatMap(([first,...rest])=>[first,...rest.reverse()]);
}
// Drop target for a stackRows row; below means under the row on screen, i.e. earlier in sew order.
export function stackTarget(row:LayerRow,below:boolean,wholeGroup=false){
  if(row.type==='object')return {index:row.index+(below?0:1),group:wholeGroup?null:row.group??null};
  if(!below)return {index:row.end,group:null};
  if(wholeGroup)return {index:row.index,group:null};
  return row.collapsed?{index:row.index,group:row.group??null}:{index:row.end,group:row.group??null};
}

// Locks: locked objects stay selectable from Layers but are skipped by canvas hits, Select all and edits.
export const unlockedIds=(p:Project,ids:readonly string[])=>ids.filter(id=>p.objects.some(o=>o.id===id&&!o.locked));
export const selectableIds=(p:Project)=>p.objects.filter(o=>!o.locked&&!o.hidden&&!o.layoutOnly).map(o=>o.id);
const withLock=(o:StitchObject,locked:boolean):StitchObject=>{if(!!o.locked===locked)return o;const next={...o};delete next.locked;return locked?{...next,locked}:next;};
export function toggleLock(p:Project,ids:readonly string[]):Project{
  const chosen=p.objects.filter(o=>ids.includes(o.id));if(!chosen.length)return p;
  const locked=!chosen.every(o=>o.locked);return {...p,objects:p.objects.map(o=>ids.includes(o.id)?withLock(o,locked):o)};
}
export const unlockAll=(p:Project):Project=>p.objects.some(o=>o.locked)?{...p,objects:p.objects.map(o=>withLock(o,false))}:p;

// Colour runs: consecutive objects sewn with the same thread merge into one row (one PES colour block).
export type ColourRun={key:string;color:string;thread?:Thread;ids:string[];index:number;end:number;stitches:number|null};
const runKey=(o:StitchObject)=>`${o.color.toLowerCase()}|${o.thread?`${o.thread.brand}/${o.thread.code}`:''}`;
const stitchCache=new WeakMap<Command[],Map<string,number>>();
function objectStitches(commands:Command[]){
  let counts=stitchCache.get(commands);if(counts)return counts;counts=new Map();
  for(const c of commands)if(c.type==='stitch'&&c.objectId!==undefined)counts.set(c.objectId,(counts.get(c.objectId)??0)+1);
  stitchCache.set(commands,counts);return counts;
}
export function colourRuns(p:Project,compiled:Pick<Compiled,'commands'>|null):ColourRun[]{
  const runs:ColourRun[]=[],counts=compiled?objectStitches(compiled.commands):null;
  p.objects.forEach((o,index)=>{
    if(o.layoutOnly)return;
    const last=runs.at(-1),stitches=counts?counts.get(o.id)??0:null;
    if(last&&runKey(p.objects[last.end-1])===runKey(o)){last.ids.push(o.id);last.end++;if(last.stitches!==null)last.stitches+=stitches!;}
    else runs.push({key:`run:${o.id}`,color:o.color,...(o.thread&&{thread:o.thread}),ids:[o.id],index,end:index+1,stitches});
  });
  return runs;
}
// Move a block to an original-order index, keeping groups intact: a block dropped inside a group joins
// it; otherwise members keep their group only when it moves whole or stays next to its other members.
export function placeObjects(p:Project,ids:readonly string[],index:number):Project{
  const selected=new Set(ids),block=p.objects.filter(o=>selected.has(o.id));if(!block.length)return p;
  const rest=p.objects.filter(o=>!selected.has(o.id)),at=p.objects.slice(0,Math.max(0,Math.min(p.objects.length,index))).filter(o=>!selected.has(o.id)).length;
  const prev=rest[at-1],next=rest[at],inside=prev?.group!==undefined&&prev.group===next?.group?prev.group:undefined;
  const keep=(g:string)=>p.objects.every(o=>o.group!==g||selected.has(o.id))||prev?.group===g||next?.group===g;
  const placed=block.map(o=>withGroup(o,inside??(o.group!==undefined&&keep(o.group)?o.group:undefined)));
  const objects=[...rest.slice(0,at),...placed,...rest.slice(at)];
  return objects.every((o,i)=>o===p.objects[i])?p:normalizeGroups({...p,objects});
}
// Typed sew-order position (1-based, clamped) as a placeObjects index.
export function positionIndex(p:Project,id:string,position:number){
  const from=p.objects.findIndex(o=>o.id===id),to=Math.max(0,Math.min(p.objects.length-1,Math.round(position)-1));
  return to>from?to+1:to;
}
