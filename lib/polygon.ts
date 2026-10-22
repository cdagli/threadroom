import polygonClipping from 'polygon-clipping';
import type {Point} from './project';

// Regions are lists of polygons [outer, ...holes] with open rings (no repeated closing point).
// Outer rings have a positive shoelace area and holes a negative one, so even-odd and nonzero agree.
// Boolean operations use polygon-clipping (MIT); offsets and the knife are built on top of it.
export type Region=Point[][][];
type Pair=[number,number];type Geom=Pair[][]|Pair[][][];

export const ringArea=(r:Point[])=>{let a=0;for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length];a+=p[0]*q[1]-q[0]*p[1];}return a/2;};
const perimeter=(r:Point[])=>r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+Math.hypot(q[0]-p[0],q[1]-p[1]);},0);
export const regionArea=(g:Region)=>g.reduce((s,poly)=>s+poly.reduce((t,r,i)=>t+(i?-1:1)*Math.abs(ringArea(r)),0),0);
export const regionRings=(g:Region)=>g.flat();
const open=(r:Point[])=>r.length>1&&r[0][0]===r[r.length-1][0]&&r[0][1]===r[r.length-1][1]?r.slice(0,-1):r;

// Douglas–Peucker on an open polyline; keeps both ends.
function rdp(points:Point[],tol:number):Point[]{
  if(points.length<3)return points;
  const a=points[0],b=points[points.length-1],dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;let best=-1,index=0;
  for(let i=1;i<points.length-1;i++){const p=points[i],t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0,d=Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);if(d>best){best=d;index=i;}}
  return best<=tol?[a,b]:[...rdp(points.slice(0,index+1),tol).slice(0,-1),...rdp(points.slice(index),tol)];
}
// Drops repeated, collinear and near-collinear points (within tol mm) of a closed ring.
export function cleanRing(ring:Point[],tol=.005):Point[]{
  const r=open(ring).filter((p,i,a)=>{const q=a[(i+a.length-1)%a.length];return a.length<2||Math.hypot(p[0]-q[0],p[1]-q[1])>1e-7;});
  if(r.length<3)return r.map(p=>[p[0],p[1]]);
  let far=0,best=-1;for(let i=1;i<r.length;i++){const d=Math.hypot(r[i][0]-r[0][0],r[i][1]-r[0][1]);if(d>best){best=d;far=i;}}
  const out=[...rdp(r.slice(0,far+1),tol).slice(0,-1),...rdp([...r.slice(far),r[0]],tol).slice(0,-1)];
  // The split points themselves may be collinear with their neighbours.
  for(let i=0;out.length>3&&i<out.length;){const a=out[(i+out.length-1)%out.length],p=out[i],b=out[(i+1)%out.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(l<1e-9||Math.abs((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))/l<=tol&&(p[0]-a[0])*(b[0]-p[0])+(p[1]-a[1])*(b[1]-p[1])>=0)out.splice(i,1);else i++;}
  return out.map(p=>[p[0],p[1]]);
}
const snap=(g:Region,step:number):Geom=>g.map(poly=>poly.map(r=>r.map(p=>[Math.round(p[0]/step)*step,Math.round(p[1]/step)*step] as Pair)));
// Slivers: tiny parts, or parts whose mean width (2·area/perimeter) is a hairline.
const sliver=(r:Point[],minArea:number)=>{const a=Math.abs(ringArea(r));return r.length<3||a<minArea||2*a/perimeter(r)<.01;};
function fromGeom(m:Pair[][][],minArea:number,tol:number):Region{
  const out:Region=[];
  for(const poly of m){
    const outer=cleanRing(poly[0] as Point[],tol);if(sliver(outer,minArea))continue;
    const holes=poly.slice(1).map(r=>cleanRing(r as Point[],tol)).filter(r=>!sliver(r,minArea));
    out.push([ringArea(outer)<0?outer.reverse():outer,...holes.map(h=>ringArea(h)>0?h.reverse():h)]);
  }
  return out;
}
type Op='union'|'intersection'|'difference'|'xor';
// Inputs are snapped to a 1e-6 mm grid; a rare robustness failure retries on a coarser grid.
function run(op:Op,regions:Region[],minArea=.01,tol=.005):Region{
  if(!regions.length)return [];
  for(const step of [1e-6,1e-4,1e-3]){
    try{const [first,...rest]=regions.map(g=>snap(g,step));return fromGeom(polygonClipping[op](first,...rest) as Pair[][][],minArea,tol);}
    catch{/* Retry with a coarser grid. */}
  }
  throw new Error('Shape operation failed.');
}
export const union=(...g:Region[])=>run('union',g.filter(x=>x.length));
export const intersection=(...g:Region[])=>g.some(x=>!x.length)?[]:run('intersection',g);
export const difference=(a:Region,...b:Region[])=>!a.length?[]:run('difference',[a,...b.filter(x=>x.length)]);
// Even-odd rings (our fill model) become a normalised region: the XOR of every ring.
export function regionFromRings(rings:Point[][]):Region{
  const clean=rings.map(r=>cleanRing(r,0)).filter(r=>r.length>=3&&Math.abs(ringArea(r))>1e-9);
  return clean.length?run(clean.length===1?'union':'xor',clean.map(r=>[[r]]),1e-6,0):[];
}
export function insideRegion(g:Region,p:Point):boolean{
  let n=0;for(const r of g.flat())for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<a[0]+(p[1]-a[1])*(b[0]-a[0])/(b[1]-a[1]))n++;}return n%2===1;
}
export function regionCentroid(poly:Point[][]):Point{
  let A=0,x=0,y=0;for(const r of poly)r.forEach((a,i)=>{const b=r[(i+1)%r.length],v=a[0]*b[1]-b[0]*a[1];A+=v;x+=(a[0]+b[0])*v;y+=(a[1]+b[1])*v;});
  return Math.abs(A)>1e-12?[x/(3*A),y/(3*A)]:poly[0][0];
}

// Round offset: the union of capsules around every boundary edge is added (grow) or removed (shrink).
export function offsetRegion(g:Region,d:number,tol=.02):Region{
  if(!g.length||Math.abs(d)<1e-6)return g;
  const r=Math.abs(d),n=Math.max(3,Math.min(24,Math.ceil(Math.PI/(2*Math.acos(Math.max(0,1-tol/r)))))),caps:Region[]=[];
  for(const ring of g.flat().map(x=>cleanRing(x,Math.min(tol,r/4))))for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l<1e-9)continue;
    const th=Math.atan2(b[1]-a[1],b[0]-a[0]),cap:Point[]=[];
    for(let k=0;k<=n;k++){const t=th-Math.PI/2+Math.PI*k/n;cap.push([b[0]+r*Math.cos(t),b[1]+r*Math.sin(t)]);}
    for(let k=0;k<=n;k++){const t=th+Math.PI/2+Math.PI*k/n;cap.push([a[0]+r*Math.cos(t),a[1]+r*Math.sin(t)]);}
    caps.push([[cap]]);
  }
  const band=run('union',caps,1e-6,0);
  return d>0?union(g,band):difference(g,band);
}

// Knife: a hairline strip along a→b is removed and the parts are grouped by side of the line.
// Both ends must lie outside the filled area; null when the line doesn't split the region.
export function splitRegion(g:Region,a:Point,b:Point,gap=.01):[Region,Region]|null{
  const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);if(l<1e-6||insideRegion(g,a)||insideRegion(g,b))return null;
  const nx=-dy/l*gap/2,ny=dx/l*gap/2,strip:Region=[[[[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]]]];
  const parts=difference(g,strip),left:Region=[],right:Region=[];
  for(const poly of parts){const c=regionCentroid(poly);(dx*(c[1]-a[1])-dy*(c[0]-a[0])>0?left:right).push(poly);}
  return left.length&&right.length?[left,right]:null;
}
// Splits an open polyline wherever it crosses the segment a→b; pieces shorter than minLength are dropped.
export function splitPolyline(line:Point[],a:Point,b:Point,minLength=.05):Point[][]|null{
  const pieces:Point[][]=[];let current:Point[]=[line[0]];
  const cross=(p:Point,q:Point):Point|null=>{
    const r=[q[0]-p[0],q[1]-p[1]],s=[b[0]-a[0],b[1]-a[1]],den=r[0]*s[1]-r[1]*s[0];if(Math.abs(den)<1e-12)return null;
    const t=((a[0]-p[0])*s[1]-(a[1]-p[1])*s[0])/den,u=((a[0]-p[0])*r[1]-(a[1]-p[1])*r[0])/den;
    return t>1e-9&&t<1-1e-9&&u>=0&&u<=1?[p[0]+t*r[0],p[1]+t*r[1]]:null;
  };
  for(let i=1;i<line.length;i++){const x=cross(line[i-1],line[i]);if(x){current.push(x);pieces.push(current);current=[x];}current.push(line[i]);}
  pieces.push(current);
  const length=(r:Point[])=>r.reduce((s,p,i)=>i?s+Math.hypot(p[0]-r[i-1][0],p[1]-r[i-1][1]):0,0);
  const kept=pieces.filter(r=>length(r)>=minLength);
  return kept.length>1?kept:null;
}
