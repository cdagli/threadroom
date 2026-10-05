import {fabrics, resolve, type Point, type Project, type Resolved, type StitchObject} from './project';
import {mergedOutline, transformText} from './text';

// Interpolating Catmull–Rom splines: the curve passes through every anchor.
// The compiler receives flattened millimetre geometry; projects retain anchors.
export function curveSegments(points: Point[], closed: boolean): Point[][] {
  if(points.length<2)return [];
  if(points.length===2)return [[...points.map(p=>[...p] as Point)]];
  const result:Point[][]=[];
  const at=(i:number)=>points[closed?(i+points.length)%points.length:Math.max(0,Math.min(points.length-1,i))];
  for(let i=0;i<(closed?points.length:points.length-1);i++) {
    const segment:Point[]=[];
    const a=at(i-1),b=at(i),c=at(i+1),d=at(i+2);
    const steps=Math.max(4,Math.ceil((Math.hypot(c[0]-b[0],c[1]-b[1])+Math.hypot(b[0]-a[0],b[1]-a[1])+Math.hypot(d[0]-c[0],d[1]-c[1]))/0.5));
    for(let j=0;j<steps;j++) {
      const t=j/steps,t2=t*t,t3=t2*t;
      segment.push([0,1].map(k=>0.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t2+(-a[k]+3*b[k]-3*c[k]+d[k])*t3)) as Point);
    }
    segment.push([...c]);result.push(segment);
  }
  return result;
}

export function curvePoints(points:Point[],closed:boolean):Point[] {
  if(points.length<3)return points.map(p=>[...p]);
  const result=curveSegments(points,closed).flatMap(s=>s.slice(0,-1));
  if(!closed)result.push([...points[points.length-1]]);
  return result;
}

export type PointInsertion={ring:number;index:number;point:Point;distance:number};
function editableSegments(o:StitchObject) {
  if(o.curve)return curveSegments(o.curve.points,o.curve.closed).map((path,i)=>({ring:0,index:i+1,path}));
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
export function insertGeometryPoint(o:StitchObject,ring:number,index:number,p:Point):StitchObject {
  const source=o.curve?o.curve.points:o.rings[ring];
  if(!source||index<0||index>source.length||!p.every(Number.isFinite))return o;
  if(o.curve&&source.length>=200)return o;
  const points=[...source.slice(0,index),[...p] as Point,...source.slice(index)];
  return o.curve?{...o,curve:{...o.curve,points},rings:[curvePoints(points,o.curve.closed)]}:{...o,rings:o.rings.map((r,ri)=>ri===ring?points:r)};
}
export function removeGeometryPoint(o:StitchObject,ring:number,index:number):StitchObject {
  const source=o.curve?o.curve.points:o.rings[ring],closed=o.curve?.closed||o.kind==='fill'||o.kind==='cross';
  if(!source||source.length<=(closed?3:2)||index<0||index>=source.length)return o;
  const points=source.filter((_,i)=>i!==index);
  return o.curve?{...o,curve:{...o.curve,points},rings:[curvePoints(points,o.curve.closed)]}:{...o,rings:o.rings.map((r,ri)=>ri===ring?points:r)};
}

export function moveGeometry(o:StitchObject, move:(p:Point,ring:number,index:number)=>Point):StitchObject {
  if(o.text)return {...o,text:transformText(o.text,p=>move(p,-1,-1)),rings:o.rings.map((r,ri)=>r.map((p,i)=>move(p,ri,i)))};
  if(o.curve){
    const points=o.curve.points.map((p,i)=>move(p,0,i));
    return {...o,curve:{...o.curve,points},rings:[curvePoints(points,o.curve.closed)]};
  }
  return {...o,rings:o.rings.map((r,ri)=>r.map((p,i)=>move(p,ri,i)))};
}

export function samplePath(points:Point[], length:number):Point[] {
  if(!Number.isFinite(length)||length<=0)throw new Error('Choose a positive stitch length.');
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

export function geometryPayload(project:Project):Omit<Project,'artwork'|'fabric'|'objects'>&{objects:Resolved[]} {
  const {artwork,fabric,...rest}=project;void artwork;
  // Smooth display tessellation is finer than running stitches. Sample along
  // the whole curve so its visual resolution does not set the stitch density.
  // Text outlines are also finely tessellated; a text border is sent as a
  // separate object sewn after the letters. Empty text is skipped.
  const line=(kind:string)=>['running','bean','backstitch','underlay','manual'].includes(kind);
  // Fabric defaults are resolved here; the compiler receives explicit values only.
  return {...rest,objects:rest.objects.filter(o=>o.rings.length).map(o=>resolve(o,fabric)).flatMap(o=>{
    if(!o.text)return [o.curve&&line(o.kind)?{...o,rings:o.rings.map(r=>samplePath(r,o.length))}:o];
    const {text,...plain}=o,closedRings=o.rings.map(r=>r.length&&Math.hypot(r[0][0]-r[r.length-1][0],r[0][1]-r[r.length-1][1])>1e-9?[...r,r[0]]:r);
    const letters:Resolved={...plain,fillRule:'nonzero',rings:line(o.kind)?closedRings.map(r=>samplePath(r,o.length)):o.rings,...(o.kind==='manual'?{kind:'running'}:{})};
    if(!text.border||!(o.kind==='fill'||o.kind==='cross'))return [letters];
    const b=text.border,outline=mergedOutline(o.rings);
    return [letters,{...plain,id:`${o.id}-border`,name:`${o.name} border`,kind:b.kind,color:b.color,satinWidth:b.width,spacing:fabrics[fabric].satin,underlay:'none',rings:b.kind==='satin'?outline:outline.map(r=>samplePath(r,o.length))}];
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
