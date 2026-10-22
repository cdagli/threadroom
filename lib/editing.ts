import {moveGeometry} from './curves';
import {designBounds,objectGeometry} from './editor-render';
import {hoops,normalizeGroups,validProject,type Point,type Project,type StitchObject} from './project';
import {validText} from './text';

export type Rect={x:number;y:number;width:number;height:number};
export type Matrix=[number,number,number,number,number,number];
export type ScaleHandle='nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w';
export const scaleHandles:ScaleHandle[]=['nw','n','ne','e','se','s','sw','w'];
export const translate=(x:number,y:number):Matrix=>[1,0,0,1,x,y];
export const mapPoint=(m:Matrix,[x,y]:Point):Point=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
export function around(p:Point,sx:number,sy=sx,degrees=0):Matrix{
  const r=degrees*Math.PI/180,c=Math.cos(r),s=Math.sin(r),a=c*sx,b=s*sx,d=c*sy,e=-s*sy;
  return [a,b,e,d,p[0]-a*p[0]-e*p[1],p[1]-b*p[0]-d*p[1]];
}
export const centre=(b:Rect):Point=>[b.x+b.width/2,b.y+b.height/2];
export function handlePoint(b:Rect,h:ScaleHandle):Point{return [b.x+(h.includes('w')?0:h.includes('e')?b.width:b.width/2),b.y+(h.includes('n')?0:h.includes('s')?b.height:b.height/2)];}
export function scaleGesture(b:Rect,h:ScaleHandle,p:Point,shift=false,alt=false):Matrix{
  const start=handlePoint(b,h),c=centre(b),anchor:Point=alt?c:[2*c[0]-start[0],2*c[1]-start[1]];
  let sx=start[0]===anchor[0]?1:Math.max(.001,(p[0]-anchor[0])/(start[0]-anchor[0])),sy=start[1]===anchor[1]?1:Math.max(.001,(p[1]-anchor[1])/(start[1]-anchor[1]));
  if(shift&&h.length===2)sx=sy=Math.abs(sx-1)>Math.abs(sy-1)?sx:sy;
  return around(anchor,sx,sy);
}
export function rotationGesture(b:Rect,start:Point,p:Point,shift=false,initialRotation=0):number{
  const c=centre(b),r=(Math.atan2(p[1]-c[1],p[0]-c[0])-Math.atan2(start[1]-c[1],start[0]-c[0]))*180/Math.PI;
  return shift?Math.round((r+initialRotation)/15)*15-initialRotation:r;
}
export const selectionBounds=(p:Project,ids:readonly string[])=>designBounds(p.objects.filter(o=>ids.includes(o.id)));
const outside=(o:StitchObject,h:Rect)=>{const b=objectGeometry(o).bounds;return b.x<h.x-1e-7||b.y<h.y-1e-7||b.x+b.width>h.x+h.width+1e-7||b.y+b.height>h.y+h.height+1e-7;};
// Return null for a rejected gesture. Unselected object references stay stable for memoised rendering.
export function transformSelection(p:Project,ids:readonly string[],m:Matrix,rotation=0):Project|null{
  if(!m.every(Number.isFinite)||!Number.isFinite(rotation)||Math.abs(m[0]*m[3]-m[1]*m[2])<1e-8)return null;
  if(m.every((n,i)=>Math.abs(n-([1,0,0,1,0,0][i]))<1e-10))return p;
  const h={x:0,y:0,...hoops[p.hoop]};let rejected=false;
  const objects=p.objects.map(o=>{
    if(!ids.includes(o.id))return o;
    let next=moveGeometry(o,q=>mapPoint(m,q));
    if(rotation)next={...next,rotation:(((o.rotation??o.text?.rotation??0)+rotation)%360+540)%360-180};
    if(outside(next,h)&&!outside(o,h)||next.rings.some(r=>r.some(q=>!q.every(Number.isFinite)))||next.text&&!validText(next.text))rejected=true;
    return next;
  });
  return rejected?null:{...p,objects};
}
export type Align='left'|'centre'|'right'|'top'|'middle'|'bottom'|'horizontal'|'vertical';
export function alignSelection(p:Project,ids:readonly string[],mode:Align):Project|null{
  const chosen=p.objects.filter(o=>ids.includes(o.id)),b=designBounds(chosen);if(chosen.length<2)return p;
  const horizontal=mode==='horizontal',distribute=horizontal||mode==='vertical',axis=horizontal?'x':'y',dimension=horizontal?'width':'height';
  const ordered=distribute?[...chosen].sort((a,b)=>objectGeometry(a).bounds[axis]-objectGeometry(b).bounds[axis]):chosen;
  const first=objectGeometry(ordered[0]).bounds,last=objectGeometry(ordered.at(-1)!).bounds;
  const gap=distribute?(last[axis]+last[dimension]-first[axis]-ordered.reduce((sum,o)=>sum+objectGeometry(o).bounds[dimension],0))/(ordered.length-1):0;
  let cursor=first[axis],result=p;
  for(const o of ordered){const r=objectGeometry(o).bounds;let dx=0,dy=0;
    if(distribute){if(horizontal)dx=cursor-r.x;else dy=cursor-r.y;cursor+=r[dimension]+gap;}
    else if(mode==='left')dx=b.x-r.x;else if(mode==='centre')dx=b.x+b.width/2-r.x-r.width/2;else if(mode==='right')dx=b.x+b.width-r.x-r.width;
    else if(mode==='top')dy=b.y-r.y;else if(mode==='middle')dy=b.y+b.height/2-r.y-r.height/2;else dy=b.y+b.height-r.y-r.height;
    const next=transformSelection(result,[o.id],translate(dx,dy));if(!next)return null;result=next;
  }
  return result;
}
export type SnapGuide={axis:'x'|'y';value:number};
export function snapBounds(b:Rect,others:Rect[],threshold:number,grid:number|null,objects:boolean,point=false):{delta:Point;guides:SnapGuide[]}{
  const delta:Point=[0,0],guides:SnapGuide[]=[];
  for(const [i,axis,dim] of [[0,'x','width'],[1,'y','height']] as const){
    const features=point?[b[axis]]:[b[axis],b[axis]+b[dim]/2,b[axis]+b[dim]];
    let best=threshold+1,offset=0,guide:number|undefined;
    if(objects)for(const other of others)for(const target of [other[axis],other[axis]+other[dim]/2,other[axis]+other[dim]])for(const source of features){const d=target-source;if(Math.abs(d)<=threshold&&Math.abs(d)<best){best=Math.abs(d);offset=d;guide=target;}}
    if(guide!==undefined){delta[i]=offset;guides.push({axis,value:guide});}
    else if(grid&&grid>0)delta[i]=Math.round(b[axis]/grid)*grid-b[axis];
  }
  return {delta,guides};
}

// The internal clipboard is a validated, independent project snapshot, with only complete groups.
export function copySelection(p:Project,ids:readonly string[]):Project{
  const groups=p.groups?.filter(g=>p.objects.filter(o=>o.group===g.id).every(o=>ids.includes(o.id)))?.map(({pathBinding,...g})=>(void pathBinding,g)),whole=new Set(groups?.map(g=>g.id));
  return JSON.parse(JSON.stringify({...p,artwork:undefined,groups,objects:p.objects.filter(o=>ids.includes(o.id)).map(o=>({...o,layoutOnly:undefined,group:o.group&&whole.has(o.group)?o.group:undefined}))})) as Project;
}
export function readClipboard(raw:string|null):Project|null{try{const p:unknown=JSON.parse(raw??'null');return validProject(p)?normalizeGroups(p):null;}catch{return null;}}
export function pasteSelection(p:Project,clip:Project,offset:number,id:()=>string):{project:Project;ids:string[]}|null{
  if(!clip.objects.length||p.objects.length+clip.objects.length>80)return null;
  const groups=new Map(clip.groups?.map(g=>[g.id,id()])),objects=clip.objects.map(({locked,...o})=>(void locked,{...o,id:id(),group:o.group?groups.get(o.group):undefined}));
  const ids=objects.map(o=>o.id),combined={...p,groups:[...(p.groups??[]),...(clip.groups??[]).map(g=>({...g,id:groups.get(g.id)!}))],objects:[...p.objects,...objects]};
  const project=transformSelection(combined,ids,translate(offset,offset));
  return project&&validProject(project)?{project:normalizeGroups(project),ids}:null;
}
