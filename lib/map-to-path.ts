import {curveRing,moveGeometry,openPath} from './curves';
import {designBounds} from './editor-render';
import {hoops,isFillKind,normalizeGroups,validProject,type Point,type Project,type StitchObject} from './project';
import {validPathSettings,type PathBinding,type PathSettings} from './path-binding';
export {defaultPathSettings} from './path-binding';
// A guide is one open line or one closed outline (no holes): copies repeat along it, or around it.
export const canMapPath=(o:StitchObject)=>!o.locked&&!o.text&&!o.rails&&o.rings.length===1&&o.rings[0].length>=(openPath(o)?2:3);
const fail=()=>{throw new Error('Map to path exceeds the hoop or design limits.');};
type Guide={points:Point[];lengths:number[];total:number;closed:boolean};
type Pose={d:number;x:number;y:number;c:number;s:number};
function guideOf(path:StitchObject,reverse:boolean):Guide{
  const closed=!openPath(path);let points=path.curve?curveRing(path.curve):path.rings[0];
  if(closed&&points.length&&Math.hypot(points[0][0]-points.at(-1)![0],points[0][1]-points.at(-1)![1])>1e-8)points=[...points,points[0]];
  if(reverse)points=[...points].reverse();
  points=points.filter((p,i)=>!i||Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1])>1e-8);
  if(points.length<2)return fail();
  const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  return {points,lengths,total:lengths.at(-1)!,closed};
}
// Position and unit tangent at arc length d. Closed guides wrap; open ones extend straight past their ends.
function at(g:Guide,d:number):Pose{
  if(g.closed)d=((d%g.total)+g.total)%g.total;
  let k=1;while(k<g.lengths.length-1&&g.lengths[k]<d)k++;
  const a=g.points[k-1],b=g.points[k],l=g.lengths[k]-g.lengths[k-1],dx=(b[0]-a[0])/l,dy=(b[1]-a[1])/l;
  return {d,x:a[0]+dx*(d-g.lengths[k-1]),y:a[1]+dy*(d-g.lengths[k-1]),c:dx,s:dy};
}
function poses(binding:PathBinding,g:Guide):Pose[]{
  const {settings:s,prototypes}=binding;if(!validPathSettings(s))return fail();
  const total=g.total,width=Math.max(.1,designBounds(prototypes).width);
  let distances:number[];
  if(g.closed){
    // Around a closed outline the copies are spread evenly (Fill path, Exact count) or a fixed gap apart.
    if(width>total+1e-7)return fail();
    const count=s.mode==='count'?s.count:Math.max(1,Math.floor(total/(width+s.spacing)+1e-7));
    if(count*prototypes.length>80)return fail();
    const step=s.mode==='spacing'?width+s.spacing:total/count;
    distances=Array.from({length:count},(_,i)=>s.offset+width/2+i*step);
  }else{
    const available=total-s.offset-width;
    if(available< -1e-7)return fail();
    const count=s.mode==='count'?s.count:Math.max(1,Math.floor((total-s.offset+s.spacing)/(width+s.spacing)+1e-7));
    if(count*prototypes.length>80)return fail();
    const span=s.mode==='spacing'?(count-1)*(width+s.spacing):count>1?available:0;
    const start=s.offset+width/2+(s.align==='center'?(available-span)/2:0);
    distances=Array.from({length:count},(_,i)=>start+(count>1?i*span/(count-1):0));
  }
  return distances.map(d=>{const p=at(g,d);return s.rotate||s.bend?p:{...p,c:1,s:0};});
}
const centreOf=(prototypes:StitchObject[])=>{const b=designBounds(prototypes);return [b.x+b.width/2,b.y+b.height/2] as Point;};
// Bending needs enough points to follow the guide: curves become their sampled outline, long edges are split.
const bendStep=.5;
function densify(o:StitchObject):StitchObject{
  if(o.rails||o.text||o.kind==='manual')return o;
  const rings=o.rings.map(r=>{
    const shut=r.length>2&&r[0][0]===r.at(-1)![0]&&r[0][1]===r.at(-1)![1],wrap=isFillKind(o.kind)&&!shut,ring=wrap?[...r,r[0]]:r,out:Point[]=[ring[0]];
    for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/bendStep);for(let k=1;k<=n;k++)out.push([a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n]);}
    return wrap?out.slice(0,-1):out;
  });
  const next={...o,rings};delete next.curve;return next;
}
// Rigid copies are rotated (or only moved); bent copies map x to distance along the guide and y to its normal.
function transform(o:StitchObject,pose:Pose,prototypes:StitchObject[],g:Guide,bend:boolean):StitchObject{
  const [cx,cy]=centreOf(prototypes),{x,y,c,s}=pose;
  if(!bend)return moveGeometry(o,p=>[x+c*(p[0]-cx)-s*(p[1]-cy),y+s*(p[0]-cx)+c*(p[1]-cy)]);
  return moveGeometry(densify(o),p=>{const q=at(g,pose.d+p[0]-cx),v=p[1]-cy;return [q.x-q.s*v,q.y+q.c*v];});
}
// Undoes transform for an edited copy: rigid copies exactly, bent ones by projecting each point onto the guide.
function untransform(o:StitchObject,pose:Pose,prototypes:StitchObject[],g:Guide,bend:boolean):StitchObject{
  const [cx,cy]=centreOf(prototypes),{x,y,c,s}=pose;
  if(!bend)return moveGeometry(o,p=>[cx+c*(p[0]-x)+s*(p[1]-y),cy-s*(p[0]-x)+c*(p[1]-y)]);
  return moveGeometry(o,p=>{
    let best={dist:Infinity,d:0,v:0};
    for(let k=1;k<g.points.length;k++){
      const a=g.points[k-1],b=g.points[k],l=g.lengths[k]-g.lengths[k-1],dx=(b[0]-a[0])/l,dy=(b[1]-a[1])/l;
      let t=(p[0]-a[0])*dx+(p[1]-a[1])*dy;if(g.closed||k>1)t=Math.max(0,t);if(g.closed||k<g.points.length-1)t=Math.min(l,t);
      const qx=a[0]+dx*t,qy=a[1]+dy*t,dist=Math.hypot(p[0]-qx,p[1]-qy);
      if(dist<best.dist)best={dist,d:g.lengths[k-1]+t,v:(p[0]-qx)*-dy+(p[1]-qy)*dx};
    }
    let u=best.d-pose.d;if(g.closed)u-=Math.round(u/g.total)*g.total;
    return [cx+u,cy+best.v];
  });
}
const geometryKeys=['rings','curve','rails','text','entry','exit','center','angleGuides'] as const;
const sameGeometry=(a:StitchObject,b:StitchObject)=>geometryKeys.every(k=>JSON.stringify(a[k])===JSON.stringify(b[k]));
const withGeometry=(o:StitchObject,from:StitchObject):StitchObject=>{const next={...o};for(const k of geometryKeys){if(from[k]===undefined)delete next[k];else (next as Record<string,unknown>)[k]=from[k];}return next;};
// Hidden/locked are per-copy view states: they never feed back into the prototype.
const shape=(o?:StitchObject)=>o&&JSON.stringify({...o,hidden:undefined,locked:undefined}),flags=(o:StitchObject)=>({...(o.hidden&&{hidden:true}),...(o.locked&&{locked:true})}),plain=({hidden,locked,...o}:StitchObject)=>(void hidden,void locked,o);
function clearBinding(p:Project,id:string):Project{return {...p,groups:p.groups?.map(g=>{if(g.id!==id)return g;const {pathBinding,...plain}=g;void pathBinding;return plain;})};}
export function unlinkPath(p:Project,id:string):Project{return syncPathBindings(clearBinding(p,id));}
/** Called at the editor's commit/drag boundary, so relayout shares the same undo
 * step. The previous snapshot identifies intentional edits to a placed prototype. */
export function syncPathBindings(input:Project,previous?:Project):Project{
  let p=input;const before=new Map(previous?.objects.map(o=>[o.id,o]));
  for(const group of p.groups??[]){
    const binding=group.pathBinding;if(!binding)continue;
    const path=p.objects.find(o=>o.id===binding.pathId),members=binding.members.flat();
    if(!path||!canMapPath({...path,locked:false})||members.some(id=>!p.objects.some(o=>o.id===id&&o.group===group.id))){p=clearBinding(p,group.id);continue;}
    const old=previous?.groups?.find(g=>g.id===group.id)?.pathBinding,oldPath=previous?.objects.find(o=>o.id===binding.pathId);
    if(old===binding&&oldPath===path&&members.every(id=>p.objects.find(o=>o.id===id)===before.get(id)))continue;
    let next=binding;
    if(old&&oldPath&&old===binding){
      // Poses on the current guide: a guide moved together with its copies (transform box) is not applied twice.
      const oldGuide=guideOf(path,old.settings.reverse),oldPoses=poses(old,oldGuide),bend=!!old.settings.bend,prototypes=[...binding.prototypes];
      for(let j=0;j<prototypes.length;j++)for(let i=0;i<old.members.length;i++){
        const id=old.members[i][j],o=p.objects.find(o=>o.id===id),was=before.get(id);if(o&&oldPoses[i]&&shape(o)!==shape(was)){
          // A bent copy whose geometry is unchanged only passes on its settings, so the prototype keeps its curves.
          const source=bend&&was&&sameGeometry(o,was)?withGeometry(o,prototypes[j]):untransform(o,oldPoses[i],old.prototypes,oldGuide,bend);
          prototypes[j]={...plain(source),id:prototypes[j].id,group:undefined,layoutOnly:undefined,...flags(prototypes[j])};break;
        }
      }
      next={...binding,prototypes};
    }
    const guide=guideOf(path,next.settings.reverse),layout=poses(next,guide),objects:StitchObject[]=[],ids:string[][]=[];
    layout.forEach((pose,i)=>{ids.push([]);next.prototypes.forEach((o,j)=>{
      const id=next.members[i]?.[j]??`${group.id}:${i}:${j}`,own=p.objects.find(o=>o.id===id),placed={...plain(transform(o,pose,next.prototypes,guide,!!next.settings.bend)),id,group:group.id,layoutOnly:undefined,...flags(own??o)};
      objects.push(placed);ids[i].push(id);
    });});
    const at=p.objects.findIndex(o=>members.includes(o.id)),rest=p.objects.filter(o=>!members.includes(o.id)),insert=p.objects.slice(0,at).filter(o=>!members.includes(o.id)).length;
    p={...p,objects:[...rest.slice(0,insert),...objects,...rest.slice(insert)],groups:p.groups?.map(g=>g.id===group.id?{...g,pathBinding:{...next,members:ids}}:g)};
  }
  const hidden=new Set(p.groups?.flatMap(g=>g.pathBinding?.settings.hidePath?[g.pathBinding.pathId]:[]));
  const objects=p.objects.map(o=>!!o.layoutOnly===hidden.has(o.id)?o:{...o,layoutOnly:hidden.has(o.id)||undefined});
  p=objects.every((o,i)=>o===p.objects[i])?p:{...p,objects};
  if(p.groups?.some(g=>g.pathBinding)){
    const h=hoops[p.hoop];if(!validProject(p)||p.objects.some(o=>o.group&&p.groups?.some(g=>g.id===o.group&&g.pathBinding)&&(()=>{const b=designBounds([o]);return b.x< -1e-6||b.y< -1e-6||b.x+b.width>h.width+1e-6||b.y+b.height>h.height+1e-6;})()))return fail();
  }
  return p;
}
export function mapToPath(p:Project,ids:readonly string[],pathId:string,settings:PathSettings,name:string,id=crypto.randomUUID()):Project{
  const path=p.objects.find(o=>o.id===pathId),chosen=p.objects.filter(o=>ids.includes(o.id)&&o.id!==pathId);
  if(!path||!canMapPath(path)||!chosen.length||chosen.some(o=>o.locked||p.groups?.some(g=>g.id===o.group&&g.pathBinding))||p.groups?.some(g=>g.pathBinding?.pathId===pathId)||chosen.some(o=>p.groups?.some(g=>g.pathBinding?.pathId===o.id)))return fail();
  const prototypes=chosen.map(o=>({...o,group:undefined,layoutOnly:undefined})),members=[chosen.map(o=>o.id)],at=p.objects.indexOf(chosen[0]),rest=p.objects.filter(o=>!ids.includes(o.id)||o.id===pathId),insert=p.objects.slice(0,at).filter(o=>!ids.includes(o.id)||o.id===pathId).length;
  return syncPathBindings(normalizeGroups({...p,objects:[...rest.slice(0,insert),...chosen.map(o=>({...o,group:id})),...rest.slice(insert)],groups:[...(p.groups??[]),{id,name,pathBinding:{pathId,prototypes,members,settings}}]}));
}
export function updatePathSettings(p:Project,id:string,settings:PathSettings):Project{
  return syncPathBindings({...p,groups:p.groups?.map(g=>g.id===id&&g.pathBinding?{...g,pathBinding:{...g.pathBinding,settings}}:g)},p);
}
