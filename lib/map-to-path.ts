import {curveRing,moveGeometry,openPath} from './curves';
import {designBounds} from './editor-render';
import {hoops,normalizeGroups,validProject,type Project,type StitchObject} from './project';
import {validPathSettings,type PathBinding,type PathSettings} from './path-binding';
export {defaultPathSettings} from './path-binding';
export const canMapPath=(o:StitchObject)=>!o.locked&&!o.text&&!o.rails&&o.rings.length===1&&openPath(o)&&o.rings[0].length>=2;
const fail=()=>{throw new Error('Map to path exceeds the hoop or design limits.');};
type Pose={x:number;y:number;c:number;s:number};
function poses(binding:PathBinding,path:StitchObject):Pose[]{
  const {settings:s,prototypes}=binding;if(!validPathSettings(s))return fail();
  let points=path.curve?curveRing(path.curve):path.rings[0];if(s.reverse)points=[...points].reverse();
  points=points.filter((p,i)=>!i||Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1])>1e-8);
  if(points.length<2)return fail();
  const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  const total=lengths.at(-1)!,width=Math.max(.1,designBounds(prototypes).width),available=total-s.offset-width;
  if(available< -1e-7)return fail();
  const count=s.mode==='count'?s.count:Math.max(1,Math.floor((total-s.offset+s.spacing)/(width+s.spacing)+1e-7));
  if(count*prototypes.length>80)return fail();
  const span=s.mode==='spacing'?(count-1)*(width+s.spacing):count>1?available:0;
  const start=s.offset+width/2+(s.align==='center'?(available-span)/2:0);
  return Array.from({length:count},(_,i)=>{
    const d=start+(count>1?i*span/(count-1):0);let k=1;while(k<lengths.length-1&&lengths[k]<d)k++;
    const a=points[k-1],b=points[k],l=lengths[k]-lengths[k-1],dx=(b[0]-a[0])/l,dy=(b[1]-a[1])/l;
    return {x:a[0]+dx*(d-lengths[k-1]),y:a[1]+dy*(d-lengths[k-1]),c:s.rotate?dx:1,s:s.rotate?dy:0};
  });
}
function transform(o:StitchObject,pose:Pose,prototypes:StitchObject[],inverse=false):StitchObject{
  const b=designBounds(prototypes),cx=b.x+b.width/2,cy=b.y+b.height/2,{x,y,c,s}=pose;
  return moveGeometry(o,p=>inverse?[cx+c*(p[0]-x)+s*(p[1]-y),cy-s*(p[0]-x)+c*(p[1]-y)]:[x+c*(p[0]-cx)-s*(p[1]-cy),y+s*(p[0]-cx)+c*(p[1]-cy)]);
}
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
      const oldPoses=poses(old,path),prototypes=[...binding.prototypes];
      for(let j=0;j<prototypes.length;j++)for(let i=0;i<old.members.length;i++){
        const id=old.members[i][j],o=p.objects.find(o=>o.id===id);if(o&&oldPoses[i]&&shape(o)!==shape(before.get(id))){
          const source=transform(o,oldPoses[i],old.prototypes,true);prototypes[j]={...plain(source),id:prototypes[j].id,group:undefined,layoutOnly:undefined,...flags(prototypes[j])};break;
        }
      }
      next={...binding,prototypes};
    }
    const layout=poses(next,path),objects:StitchObject[]=[],ids:string[][]=[];
    layout.forEach((pose,i)=>{ids.push([]);next.prototypes.forEach((o,j)=>{
      const id=next.members[i]?.[j]??`${group.id}:${i}:${j}`,own=p.objects.find(o=>o.id===id),placed={...plain(transform(o,pose,next.prototypes)),id,group:group.id,layoutOnly:undefined,...flags(own??o)};
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
