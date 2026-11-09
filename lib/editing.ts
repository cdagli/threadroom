import {blockOutline,moveGeometry} from './curves';
import {designBounds,objectGeometry} from './editor-render';
import {hoops,isFillKind,isWideKind,normalizeGroups,validProject,type Point,type Project,type StitchObject} from './project';
import {validText} from './text';

export type Rect={x:number;y:number;width:number;height:number};
export type Matrix=[number,number,number,number,number,number];
export type ScaleHandle='nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w';
export const scaleHandles:ScaleHandle[]=['nw','n','ne','e','se','s','sw','w'];
export const translate=(x:number,y:number):Matrix=>[1,0,0,1,x,y];
/** @test */ export const mapPoint=(m:Matrix,[x,y]:Point):Point=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
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
  return JSON.parse(JSON.stringify({...p,artwork:undefined,images:undefined,groups,objects:p.objects.filter(o=>ids.includes(o.id)).map(o=>({...o,layoutOnly:undefined,group:o.group&&whole.has(o.group)?o.group:undefined}))})) as Project;
}
export function readClipboard(raw:string|null):Project|null{try{const p:unknown=JSON.parse(raw??'null');return validProject(p)?normalizeGroups(p):null;}catch{return null;}}
export function pasteSelection(p:Project,clip:Project,offset:number,id:()=>string):{project:Project;ids:string[]}|null{
  if(!clip.objects.length||p.objects.length+clip.objects.length>80)return null;
  const groups=new Map(clip.groups?.map(g=>[g.id,id()])),objects=clip.objects.map(({locked,...o})=>(void locked,{...o,id:id(),group:o.group?groups.get(o.group):undefined}));
  const ids=objects.map(o=>o.id),combined={...p,groups:[...(p.groups??[]),...(clip.groups??[]).map(g=>({...g,id:groups.get(g.id)!}))],objects:[...p.objects,...objects]};
  const project=transformSelection(combined,ids,translate(offset,offset));
  return project&&validProject(project)?{project:normalizeGroups(project),ids}:null;
}
// Marquee selection: an object is picked when its outline crosses the box, sits inside it, or (filled) encloses it.
export function marqueeIds(p:Project,box:Rect):string[]{
  const x0=Math.min(box.x,box.x+box.width),x1=Math.max(box.x,box.x+box.width),y0=Math.min(box.y,box.y+box.height),y1=Math.max(box.y,box.y+box.height);
  const inside=([x,y]:Point)=>x>=x0&&x<=x1&&y>=y0&&y<=y1;
  const cross=(a:Point,b:Point,c:Point,d:Point)=>{const o=(p:Point,q:Point,r:Point)=>Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]));return o(a,b,c)!==o(a,b,d)&&o(c,d,a)!==o(c,d,b);};
  const corners:Point[]=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],edges=corners.map((c,i)=>[c,corners[(i+1)%4]] as [Point,Point]);
  const contains=(rings:Point[][],[x,y]:Point)=>rings.reduce((n,r)=>r.reduce((m,a,i)=>{const b=r[(i+1)%r.length];return (a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]?m+1:m;},n),0)%2===1;
  return p.objects.filter(o=>{
    if(o.locked||o.hidden||o.layoutOnly)return false;
    const b=objectGeometry(o).bounds;if(b.x>x1||b.y>y1||b.x+b.width<x0||b.y+b.height<y0)return false;
    const closed=!!o.rails||isFillKind(o.kind)||!!o.curve?.closed||!!o.text?.satin,rings=(o.rails?[blockOutline(o.rails)]:o.rings).filter(r=>r.length);
    if(rings.some(r=>r.some(inside)))return true;
    if(rings.some(r=>r.some((a,i)=>(i<r.length-1||closed)&&edges.some(([c,d])=>cross(a,r[(i+1)%r.length],c,d)))))return true;
    return closed&&contains(rings,[(x0+x1)/2,(y0+y1)/2]);
  }).map(o=>o.id);
}
// Click picking: the topmost object really under the point wins (inside a fill, or on a line's stitched width);
// only when nothing is hit directly does the nearest outline within `reach` (mm) win, so halos never steal clicks.
export function pickObject(p:Project,[x,y]:Point,reach:number):string|null{
  const segment=(a:Point,b:Point)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/l)):0;return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);};
  let near:string|null=null,best=reach;
  for(let i=p.objects.length-1;i>=0;i--){
    const o=p.objects[i];if(o.locked||o.hidden||o.layoutOnly)continue;
    const b=objectGeometry(o).bounds,pad=Math.max(reach,o.satinWidth);if(x<b.x-pad||y<b.y-pad||x>b.x+b.width+pad||y>b.y+b.height+pad)continue;
    const area=!!o.rails||isFillKind(o.kind)||!!o.text?.satin,closed=area||!!o.curve?.closed,rings=(o.rails?[blockOutline(o.rails)]:o.rings).filter(r=>r.length);
    let edge=Infinity;for(const r of rings)for(let j=0;j<r.length;j++)if(j<r.length-1||closed||r.length===1)edge=Math.min(edge,segment(r[j],r[(j+1)%r.length]));
    if(area){
      let winding=0,crossings=0;
      for(const r of rings)for(let j=0;j<r.length;j++){const a=r[j],c=r[(j+1)%r.length];if((a[1]>y)!==(c[1]>y)&&x<(c[0]-a[0])*(y-a[1])/(c[1]-a[1])+a[0]){crossings++;winding+=c[1]>a[1]?1:-1;}}
      if(o.text||o.fillRule==='nonzero'?winding!==0:crossings%2===1)return o.id;
      // Text is picked anywhere in its box so the gaps between letters still select it.
      if(o.text&&x>=b.x&&y>=b.y&&x<=b.x+b.width&&y<=b.y+b.height)edge=Math.min(edge,reach/2);
    }else if(edge<=Math.max(isWideKind(o.kind)?o.satinWidth/2:.25,reach/2))return o.id;// thin lines get half the reach as a direct hit
    if(edge<best){best=edge;near=o.id;}
  }
  return near;
}
