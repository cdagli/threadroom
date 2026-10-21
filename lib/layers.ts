import type {Command, Project, StitchObject} from './project';

export function selectIds(order:string[],ids:string[],id:string,mode:'replace'|'toggle'|'range',anchor:string|null):string[]{
  if(!order.includes(id))return ids;
  if(mode==='toggle')return ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];
  const a=anchor===null?-1:order.indexOf(anchor),b=order.indexOf(id);
  if(mode!=='range'||a<0)return [id];
  const range=order.slice(Math.min(a,b),Math.max(a,b)+1);return b<a?range.reverse():range;
}

// Keep original command indices so hiding layers does not change the playback clock or counts.
export function visibleCommands(commands:Command[],objects:StitchObject[]){
  const hidden=new Set(objects.filter(o=>o.hidden).flatMap(o=>[o.id,...(o.text?.border?[`${o.id}-border`]:[])]));
  const indices:number[]=[],visible=commands.filter((c,i)=>{
    if(c.objectId!==undefined&&hidden.has(c.objectId)||(c.type==='jump'||c.travel)&&c.fromObjectId!==undefined&&hidden.has(c.fromObjectId))return false;
    indices.push(i);return true;
  });
  return {commands:visible.length===commands.length?commands:visible,indices};
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
