import {createT,TranslationError,type Translator} from './i18n';
import {fabrics, isFillKind, isRopeKind, profileDefault, resolve, ropeDefaults, type Kind, type Point, type Project, type Rails, type Resolved, type StitchObject} from './project';
import {splineBeziers,sampleCubic} from './spline';
import {mergedOutline, transformText} from './text';

// Interpolating Catmull–Rom splines: the curve passes through every anchor.
// The compiler receives flattened millimetre geometry; projects retain anchors.
export function curveSegments(points: Point[], closed: boolean, corners?: boolean[],spline?:'levien'): Point[][] {
  if(spline==='levien')return splineBeziers(points,closed,corners).map(c=>sampleCubic(c));
  if(points.length<2)return [];
  if(points.length===2)return [[...points.map(p=>[...p] as Point)]];
  const result:Point[][]=[];
  const at=(i:number)=>points[closed?(i+points.length)%points.length:Math.max(0,Math.min(points.length-1,i))];
  for(let i=0;i<(closed?points.length:points.length-1);i++) {
    const segment:Point[]=[];
    const b=at(i),c=at(i+1),a=corners?.[i]?b:at(i-1),d=corners?.[(i+1)%points.length]?c:at(i+2);
    const steps=Math.max(4,Math.ceil((Math.hypot(c[0]-b[0],c[1]-b[1])+Math.hypot(b[0]-a[0],b[1]-a[1])+Math.hypot(d[0]-c[0],d[1]-c[1]))/0.5));
    for(let j=0;j<steps;j++) {
      const t=j/steps,t2=t*t,t3=t2*t;
      segment.push([0,1].map(k=>0.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t2+(-a[k]+3*b[k]-3*c[k]+d[k])*t3)) as Point);
    }
    segment.push([...c]);result.push(segment);
  }
  return result;
}

export function curvePoints(points:Point[],closed:boolean,corners?:boolean[],spline?:'levien'):Point[] {
  if(points.length<3)return points.map(p=>[...p]);
  const result=curveSegments(points,closed,corners,spline).flatMap(s=>s.slice(0,-1));
  if(!closed)result.push([...points[points.length-1]]);
  return result;
}
export const curveRing=(curve:NonNullable<StitchObject['curve']>,outline=false)=>{
  const ring=curvePoints(curve.points,curve.closed,curve.corners,curve.spline);return outline&&curve.closed?reclose([ring],true)[0]:ring;
};

// Satin block rails: each rail is an open Levien spline through its anchors. Segment k (rung k to
// k+1) is resampled to the same count on both rails, so samples pair by index and follow the rungs.
const railCache=new WeakMap<Rails,{left:Point[];right:Point[]}[]>();
function resampleEqual(path:Point[],n:number):Point[] {
  const d=[0];for(let i=1;i<path.length;i++)d.push(d[i-1]+Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]));
  const total=d[d.length-1];let j=1;
  return Array.from({length:n+1},(_,i)=>{
    if(i===n||!total)return [...path[i===n?path.length-1:0]] as Point;
    const target=total*i/n;while(j<path.length-1&&d[j]<target)j++;
    const t=d[j]>d[j-1]?(target-d[j-1])/(d[j]-d[j-1]):0;return [path[j-1][0]+t*(path[j][0]-path[j-1][0]),path[j-1][1]+t*(path[j][1]-path[j-1][1])] as Point;
  });
}
const pathLength=(p:Point[])=>p.slice(1).reduce((s,q,i)=>s+Math.hypot(q[0]-p[i][0],q[1]-p[i][1]),0);
export function railSegments(rails:Rails):{left:Point[];right:Point[]}[] {
  const cached=railCache.get(rails);if(cached)return cached;
  const [l,r]=rails.points.map((points,i)=>curveSegments(points,false,rails.corners?.[i],'levien'));
  const value=l.map((left,k)=>{const n=Math.max(8,Math.ceil(Math.max(pathLength(left),pathLength(r[k]))/.3));return {left:resampleEqual(left,n),right:resampleEqual(r[k],n)};});
  railCache.set(rails,value);return value;
}
export function railSamples(rails:Rails):[Point[],Point[]] {
  const segments=railSegments(rails),pick=(side:'left'|'right')=>segments.flatMap((s,k)=>k?s[side].slice(1):s[side]);
  return [pick('left'),pick('right')];
}
const midpoints=(a:Point[],b:Point[])=>a.map((p,i)=>[(p[0]+b[i][0])/2,(p[1]+b[i][1])/2] as Point);
// The centre line is the block's ring: ends, routing and stitch selection treat it as an open path.
export const blockCentre=(rails:Rails)=>midpoints(...railSamples(rails));
export const blockOutline=(rails:Rails)=>{const [l,r]=railSamples(rails);return [...l,...[...r].reverse()];};
export const blockWidths=(rails:Rails)=>{const [l,r]=railSamples(rails);return l.map((p,i)=>Math.hypot(r[i][0]-p[0],r[i][1]-p[1]));};
export const withRails=(o:StitchObject,rails:Rails):StitchObject=>({...o,rails,rings:[blockCentre(rails)]});
// Drawn block clicks alternate left, right; an unpaired last click is dropped.
export function draftRails(points:Point[],corners:boolean[]):Rails|null {
  const rungs=Math.floor(points.length/2);if(rungs<2)return null;
  const side=(k:0|1)=>Array.from({length:rungs},(_,i)=>2*i+k);
  return {points:[side(0).map(i=>[...points[i]] as Point),side(1).map(i=>[...points[i]] as Point)],corners:[side(0).map(i=>corners[i]??true),side(1).map(i=>corners[i]??true)]};
}
// Draft preview: both rails as splines, the rungs, and the points of a partial rung.
export function draftBlockPaths(points:Point[],corners:boolean[]):Point[][] {
  const side=(k:number)=>points.flatMap((p,i)=>i%2===k?[p]:[]),flags=(k:number)=>corners.filter((_,i)=>i%2===k);
  const rails=[0,1].map(k=>curvePoints(side(k),false,flags(k),'levien')).filter(r=>r.length>1);
  return [...rails,...Array.from({length:Math.floor(points.length/2)},(_,k)=>[points[2*k],points[2*k+1]])];
}
export const isCorner=(o:StitchObject,ring:number,index:number)=>!!(o.rails?o.rails.corners?.[ring]?.[index]:o.curve?.corners?.[index]);

export function isClosedShape(o:StitchObject):boolean {
  if(o.text)return true;
  if(o.curve)return o.curve.closed;
  if(o.kind==='manual'||!o.rings.length)return false;
  return o.rings.every(r=>r.length>=3&&(isFillKind(o.kind)||r.length>3&&r[0][0]===r[r.length-1][0]&&r[0][1]===r[r.length-1][1]));
}
export type StitchGroup={label:string;kinds:Kind[]};
export function stitchGroups(o:StitchObject,t:Translator=createT('en')):StitchGroup[] {
  const line:Kind[]=['running','bean','backstitch','double-rope','triple-rope','satin','zigzag','e-stitch','underlay'];
  if(o.rails)return [{label:t("Blocks"),kinds:['satin-block']}];
  return isClosedShape(o)?[{label:t("Fill"),kinds:['fill','cross']},{label:t("Outline"),kinds:line}]:[{label:t("Line"),kinds:[...line,'manual']}];
}
// Text is relaid out by the editor; manual curves become their anchor stitches.
// Blocks keep their rails and kind; a rope run starts at Ember's 1.5 mm stitch length.
export function changeStitchKind(o:StitchObject,kind:Kind):StitchObject {
  if(kind===o.kind||o.rails||kind==='satin-block')return o;
  const next=switchKind(o,kind);
  return next!==o&&isRopeKind(kind)&&!isRopeKind(o.kind)?{...next,length:ropeDefaults.length}:next;
}
function switchKind(o:StitchObject,kind:Kind):StitchObject {
  if(isFillKind(kind)&&!isClosedShape(o))return o;
  if(o.text)return {...o,kind:kind==='manual'?'running':kind};
  if(o.curve&&kind==='manual'){const {curve,...plain}=o;return {...plain,kind,rings:[curve.points]};}
  if(o.curve)return {...o,kind,rings:[curveRing(o.curve,!isFillKind(kind))]};
  return {...o,kind,rings:isClosedShape(o)?reclose(o.rings,!isFillKind(kind)):o.rings};
}

export function setCorner(o:StitchObject,index:number,corner:boolean,ring=0):StitchObject {
  if(o.rails){
    const {points,corners}=o.rails;if(!Number.isInteger(index)||index<0||index>=points[0].length||(ring!==0&&ring!==1))return o;
    return withRails(o,{points,corners:[0,1].map(r=>points[r].map((_,i)=>r===ring&&i===index?corner:corners?.[r]?.[i]??false)) as [boolean[],boolean[]]});
  }
  if(!o.curve||!Number.isInteger(index)||index<0||index>=o.curve.points.length)return o;
  const curve={...o.curve,corners:o.curve.points.map((_,i)=>i===index?corner:o.curve!.corners?.[i]??false)};
  return {...o,curve,rings:[curveRing(curve,!isFillKind(o.kind))]};
}

export type PointInsertion={ring:number;index:number;point:Point;distance:number};
function editableSegments(o:StitchObject) {
  if(o.rails)return railSegments(o.rails).map((s,i)=>({ring:0,index:i+1,path:midpoints(s.left,s.right)}));
  if(o.curve)return curveSegments(o.curve.points,o.curve.closed,o.curve.corners,o.curve.spline).map((path,i)=>({ring:0,index:i+1,path}));
  const closed=o.kind==='fill'||o.kind==='cross';
  return o.rings.flatMap((r,ri)=>Array.from({length:closed?r.length:r.length-1},(_,i)=>({ring:ri,index:i+1,path:[r[i],r[(i+1)%r.length]]})));
}
export function closestInsertion(o:StitchObject,p:Point):PointInsertion|null {
  let closest:PointInsertion|null=null;
  for(const segment of editableSegments(o))for(let i=1;i<segment.path.length;i++){
    const a=segment.path[i-1],b=segment.path[i],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;
    const point:Point=[a[0]+t*dx,a[1]+t*dy],distance=Math.hypot(point[0]-p[0],point[1]-p[1]);
    if(!closest||distance<closest.distance)closest={ring:segment.ring,index:segment.index,point,distance};
  }
  return closest;
}
export function insertionHandles(o:StitchObject):Omit<PointInsertion,'distance'>[] {
  return editableSegments(o).map(({ring,index,path})=>{
    const lengths=path.slice(1).map((p,i)=>Math.hypot(p[0]-path[i][0],p[1]-path[i][1]));
    let remaining=lengths.reduce((a,b)=>a+b,0)/2;
    for(let i=0;i<lengths.length;i++){
      if(remaining<=lengths[i]){const t=lengths[i]?remaining/lengths[i]:0,a=path[i],b=path[i+1];return{ring,index,point:[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])] as Point};}
      remaining-=lengths[i];
    }
    return{ring,index,point:path[0]};
  });
}
// On a block, index k inserts a rung between rungs k-1 and k where the centre line passes nearest p.
export function insertGeometryPoint(o:StitchObject,ring:number,index:number,p:Point,corner=false):StitchObject {
  if(o.rails){
    const {points,corners}=o.rails,segment=railSegments(o.rails)[index-1];
    if(!segment||points[0].length>=100||!p.every(Number.isFinite))return o;
    const centre=midpoints(segment.left,segment.right),j=centre.reduce((best,q,i)=>Math.hypot(q[0]-p[0],q[1]-p[1])<Math.hypot(centre[best][0]-p[0],centre[best][1]-p[1])?i:best,0);
    if(j===0||j===centre.length-1)return o;
    const add=<T,>(list:T[],value:T)=>[...list.slice(0,index),value,...list.slice(index)];
    return withRails(o,{points:[add(points[0],[...segment.left[j]] as Point),add(points[1],[...segment.right[j]] as Point)],...((corners||corner)&&{corners:[0,1].map(r=>add(points[r].map((_,i)=>corners?.[r]?.[i]??false),corner)) as [boolean[],boolean[]]})});
  }
  const source=o.curve?o.curve.points:o.rings[ring];
  if(!source||index<0||index>source.length||!p.every(Number.isFinite))return o;
  if(o.curve&&source.length>=200)return o;
  const points=[...source.slice(0,index),[...p] as Point,...source.slice(index)];
  if(o.curve){
    const corners=o.curve.corners??(corner?source.map(()=>false):undefined),curve={...o.curve,points,...(corners&&{corners:[...corners.slice(0,index),corner,...corners.slice(index)]})};
    return {...o,curve,rings:[curveRing(curve,!isFillKind(o.kind))]};
  }
  return {...o,rings:o.rings.map((r,ri)=>ri===ring?points:r)};
}
// Removing a block point removes its whole rung; a block keeps at least two rungs.
export function removeGeometryPoint(o:StitchObject,ring:number,index:number):StitchObject {
  if(o.rails){
    const {points,corners}=o.rails;if(points[0].length<=2||index<0||index>=points[0].length||(ring!==0&&ring!==1))return o;
    const drop=<T,>(list:T[])=>list.filter((_,i)=>i!==index);
    return withRails(o,{points:[drop(points[0]),drop(points[1])],...(corners&&{corners:[drop(corners[0]),drop(corners[1])]})});
  }
  const source=o.curve?o.curve.points:o.rings[ring],closed=o.curve?.closed||o.kind==='fill'||o.kind==='cross';
  if(!source||source.length<=(closed?3:2)||index<0||index>=source.length)return o;
  const points=source.filter((_,i)=>i!==index);
  if(o.curve){
    const corners=o.curve.corners,curve={...o.curve,points,...(corners&&{corners:corners.filter((_,i)=>i!==index)})};
    return {...o,curve,rings:[curveRing(curve,!isFillKind(o.kind))]};
  }
  return {...o,rings:o.rings.map((r,ri)=>ri===ring?points:r)};
}

// Entry/exit points and text specs move as ring -1, so dragging one anchor leaves them in place.
export function moveGeometry(o:StitchObject, move:(p:Point,ring:number,index:number)=>Point):StitchObject {
  const ends={...(o.entry&&{entry:move(o.entry,-1,-1)}),...(o.exit&&{exit:move(o.exit,-1,-1)}),...(o.center&&{center:move(o.center,-1,-1)})};
  if(o.rails)return {...withRails(o,{...o.rails,points:o.rails.points.map((rail,ri)=>rail.map((p,i)=>move(p,ri,i))) as [Point[],Point[]]}),...ends};
  if(o.text)return {...o,...ends,text:transformText(o.text,p=>move(p,-1,-1)),rings:o.rings.map((r,ri)=>r.map((p,i)=>move(p,ri,i)))};
  if(o.curve){
    const curve={...o.curve,points:o.curve.points.map((p,i)=>move(p,0,i))};
    return {...o,...ends,curve,rings:[curveRing(curve,!isFillKind(o.kind))]};
  }
  return {...o,...ends,rings:o.rings.map((r,ri)=>r.map((p,i)=>move(p,ri,i)))};
}

// Entry and exit sit on the outline; on open line paths only at an end, where they set the direction.
const closedRing=(o:StitchObject,r:Point[])=>!!o.curve?.closed||isFillKind(o.kind)||r.length>3&&Math.hypot(r[0][0]-r[r.length-1][0],r[0][1]-r[r.length-1][1])<1e-6;
export const openPath=(o:StitchObject)=>o.rings.length>0&&o.rings.every(r=>!closedRing(o,r));
export function snapEnd(o:StitchObject,p:Point):Point|null {
  let best:Point|null=null,distance=Infinity;
  const consider=(q:Point)=>{const d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<distance){distance=d;best=[q[0],q[1]];}};
  for(const r of o.rings){
    if(!r.length)continue;
    if(!closedRing(o,r)){consider(r[0]);consider(r[r.length-1]);continue;}
    for(let i=0;i<r.length;i++){
      const a=r[i],b=r[(i+1)%r.length],dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;
      const t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;consider([a[0]+t*dx,a[1]+t*dy]);
    }
  }
  return best;
}
// Satin underlay passes alternate direction, so an even pass count ends where it started.
function passes(o:Resolved){
  if((o.kind!=='satin'&&o.kind!=='satin-block')||o.underlay==='none')return 1;
  return ((o.rails?meanWidth(o.rails):o.satinWidth)<1.5?1:({center:1,edge:2,zigzag:1,'edge-zigzag':3} as Record<string,number>)[o.underlay]??0)+1;
}
// The compiler's narrow-block rule uses the mean sampled width, as here.
const meanWidth=(rails:Rails)=>{const w=blockWidths(rails);return w.reduce((a,b)=>a+b,0)/w.length;};
const centre=(o:StitchObject)=>{const pts=o.rings.flat();return pts.reduce((c,p)=>[c[0]+p[0]/pts.length,c[1]+p[1]/pts.length],[0,0]) as Point;};
// Marker positions: explicit points snapped, otherwise an estimate of the compiler's automatic
// choice (start nearest the previous object, end nearest the next one).
export function routeEnds(project:Project,id:string){
  const i=project.objects.findIndex(o=>o.id===id),o=project.objects[i];
  if(!o||!o.rings.length)return null;
  const prev=project.objects[i-1],next=project.objects[i+1];
  const nextStart=next&&next.rings.length?next.entry??(()=>{const c=centre(o),line=!isFillKind(next.kind);
    return next.rings.flatMap(r=>line&&!closedRing(next,r)?[r[0],r[r.length-1]]:r).reduce((a,b)=>Math.hypot(b[0]-c[0],b[1]-c[1])<Math.hypot(a[0]-c[0],a[1]-c[1])?b:a);})():undefined;
  let entry=o.entry&&snapEnd(o,o.entry),exit=o.exit&&snapEnd(o,o.exit);
  const open=openPath(o)&&o.rings.length===1,ring=o.rings[0],even=passes(resolve(o,project.fabric,project.locks))%2===0;
  const other=(p:Point)=>even?p:Math.hypot(p[0]-ring[0][0],p[1]-ring[0][1])<1e-6?ring[ring.length-1]:ring[0];
  if(open&&!entry&&exit)entry=other(exit);
  entry??=snapEnd(o,prev?.rings.length?prev.exit??centre(prev):o.rings[0][0]);
  if(open)exit??=other(entry!);
  if(!exit&&openPath(o)){
    // Several open paths: the compiler ends on another path, at its end nearest the next object.
    const near=(p:Point,q:Point)=>Math.hypot(p[0]-q[0],p[1]-q[1])<1e-6,rest=o.rings.filter(r=>!near(r[0],entry!)&&!near(r[r.length-1],entry!));
    exit=snapEnd({...o,rings:rest.length?rest:o.rings},nextStart??entry!);
  }
  exit??=snapEnd(o,nextStart??o.rings[o.rings.length-1][o.rings[o.rings.length-1].length-1]);
  return entry&&exit?{entry,exit,auto:{entry:!o.entry,exit:!o.exit}}:null;
}
// Explicit ends for the compiler, snapped; on a single open path one end sets the direction.
export function withEnd(o:StitchObject,key:'entry'|'exit',p:Point|undefined):StitchObject {
  const next={...o};delete next[key];
  const point=p&&snapEnd(o,p);if(point)next[key]=point;
  if(point&&openPath(o)&&o.rings.length===1)delete next[key==='entry'?'exit':'entry'];
  return next;
}

// Line kinds need each outline closed (first point repeated); fills don't.
export const reclose=(rings:Point[][],closed:boolean)=>rings.map(r=>{const shut=r.length>1&&r[0][0]===r[r.length-1][0]&&r[0][1]===r[r.length-1][1];return closed&&!shut?[...r,r[0]]:!closed&&shut?r.slice(0,-1):r;});

export function samplePath(points:Point[], length:number,t:Translator=createT('en')):Point[] {
  if(!Number.isFinite(length)||length<=0)throw new TranslationError(t,'Choose a positive stitch length.');
  if(points.length<2)return points;
  const result:Point[]=[[...points[0]]];let remaining=length;
  for(let i=1;i<points.length;i++){
    let a=points[i-1];const b=points[i];let distance=Math.hypot(b[0]-a[0],b[1]-a[1]);
    while(distance>=remaining&&distance>1e-9){
      const t=remaining/distance;
      a=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];result.push(a);
      distance=Math.hypot(b[0]-a[0],b[1]-a[1]);remaining=length;
    }
    remaining-=distance;
  }
  const last=points[points.length-1];
  if(Math.hypot(last[0]-result[result.length-1][0],last[1]-result[result.length-1][1])>1e-6)result.push([...last]);
  return result;
}

export function geometryPayload(project:Project):Omit<Project,'artwork'|'images'|'fabric'|'locks'|'objects'>&{objects:Resolved[]} {
  const {artwork,images,fabric,locks,...rest}=project;void artwork;void images;
  // Smooth display tessellation is finer than running stitches. Sample along
  // the whole curve so its visual resolution does not set the stitch density.
  // Text outlines are also finely tessellated; a text border is sent as a
  // separate object sewn after the letters. Empty text is skipped.
  const line=(kind:string)=>['running','bean','backstitch','underlay','manual'].includes(kind);
  const tolerant=(o:StitchObject)=>o.tolerance!==undefined&&['running','bean','backstitch'].includes(o.kind);
  // Fabric defaults are resolved here; the compiler receives explicit values only.
  const ends=(o:Resolved):Resolved=>({...o,entry:o.entry&&snapEnd(o,o.entry)||undefined,exit:o.exit&&snapEnd(o,o.exit)||undefined});
  return {...rest,objects:rest.objects.filter(o=>o.rings.length&&!o.layoutOnly).map(o=>ends(resolve(o,fabric,locks))).flatMap(o=>{
    if(o.rails)return [{...o,rings:[blockCentre(o.rails)],railPaths:railSamples(o.rails)}];
    if(!o.text){const rings=o.curve?[curveRing(o.curve,!isFillKind(o.kind))]:o.rings;return [o.curve&&line(o.kind)&&!tolerant(o)?{...o,rings:rings.map(r=>samplePath(r,o.length))}:rings!==o.rings?{...o,rings}:o];}
    const {text,...plain}=o,closedRings=o.rings.map(r=>r.length&&Math.hypot(r[0][0]-r[r.length-1][0],r[0][1]-r[r.length-1][1])>1e-9?[...r,r[0]]:r);
    const letters:Resolved={...plain,fillRule:'nonzero',rings:line(o.kind)?tolerant(o)?closedRings:closedRings.map(r=>samplePath(r,o.length)):o.rings,...(o.kind==='manual'?{kind:'running'}:{})};
    if(!text.border||!(o.kind==='fill'||o.kind==='cross'))return [letters];
    const b=text.border,outline=mergedOutline(o.rings);
    return [letters,{...plain,tolerance:undefined,entry:undefined,exit:undefined,id:`${o.id}-border`,name:`${o.name} border`,kind:b.kind,color:b.color,thread:b.thread??(b.color.toLowerCase()===o.color.toLowerCase()?o.thread:undefined),satinWidth:b.width,spacing:fabrics[fabric].satin,underlay:'none',splitLength:Number(profileDefault(b.kind,fabric,'splitLength')??0),shortStitches:profileDefault(b.kind,fabric,'shortStitches')===true,rings:b.kind==='satin'?outline:outline.map(r=>samplePath(r,o.length))}];
  })};
}

// Ramer–Douglas–Peucker reduction makes hand-drawn paths easy to edit without
// visibly changing the stroke. Does not modify manually placed stitch points.
export function simplifyPath(points:Point[], tolerance=0.25):Point[] {
  if(points.length<=2)return points.map(p=>[...p]);
  const first=points[0],last=points[points.length-1],dx=last[0]-first[0],dy=last[1]-first[1],length=dx*dx+dy*dy;
  let best=tolerance*tolerance,index=-1;
  for(let i=1;i<points.length-1;i++){
    const p=points[i],t=length?Math.max(0,Math.min(1,((p[0]-first[0])*dx+(p[1]-first[1])*dy)/length)):0;
    const distance=(p[0]-first[0]-t*dx)**2+(p[1]-first[1]-t*dy)**2;
    if(distance>best){best=distance;index=i;}
  }
  if(index<0)return [[...first],[...last]];
  return [...simplifyPath(points.slice(0,index+1),tolerance).slice(0,-1),...simplifyPath(points.slice(index),tolerance)];
}
