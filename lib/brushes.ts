import type {Key} from './i18n';
import {curvePoints,curveRing,withRails} from './curves';
import {cleanRing,regionRings,union,type Region} from './polygon';
import {fitFreehand} from './spline';
import {ropeLimits,satinLimits,type Kind,type Point,type Rails,type StitchObject} from './project';

// Brushes turn one freehand stroke into a ready-made stitch object. Like Procreate's embroidery
// brushes, but every stroke stays a real, editable object the machine can sew.
export type BrushId='running'|'bean'|'rope'|'satin'|'taper'|'fill';
type Setting={label:Key;min:number;max:number;step:number;value:number};
export const brushes:Record<BrushId,{name:Key;icon:string;hint:Key;setting:Setting}>={
  running:{name:'Running brush',icon:'brush-running',hint:'A single line of running stitches.',setting:{label:'Stitch length',min:1,max:3,step:.1,value:2}},
  bean:{name:'Bean brush',icon:'brush-bean',hint:'A bold line: every stitch is sewn three times.',setting:{label:'Stitch length',min:1.5,max:3,step:.1,value:2.5}},
  rope:{name:'Rope brush',icon:'brush-rope',hint:'A thick, braided rope line.',setting:{label:'Rope width',min:ropeLimits.width[0],max:ropeLimits.width[1],step:.1,value:.6}},
  satin:{name:'Satin brush',icon:'brush-satin',hint:'A smooth satin rope of even width.',setting:{label:'Width',min:1,max:satinLimits.width[1],step:.5,value:3}},
  taper:{name:'Tapered satin brush',icon:'brush-taper',hint:'Satin that swells in the middle and tapers to points. A pen’s pressure sets the width.',setting:{label:'Width',min:1.5,max:satinLimits.width[1],step:.5,value:5}},
  fill:{name:'Fill brush',icon:'brush-fill',hint:'Paint an area; everything the brush covers becomes one fill.',setting:{label:'Width',min:2,max:20,step:.5,value:8}},
};
export const brushIds=Object.keys(brushes) as BrushId[];
export const brushDefaults=Object.fromEntries(brushIds.map(id=>[id,brushes[id].setting.value])) as Record<BrushId,number>;
const clamp=(v:number,[lo,hi]:readonly [number,number])=>Math.max(lo,Math.min(hi,v));
export const brushSize=(id:BrushId,v:number)=>clamp(Number.isFinite(v)?v:brushDefaults[id],[brushes[id].setting.min,brushes[id].setting.max]);

// The minimum width of a satin taper, and of a stroke worth sewing.
const minWidth=.6,minLength=1;
const dist=(a:Point,b:Point)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
const lengths=(p:Point[])=>{const d=[0];for(let i=1;i<p.length;i++)d.push(d[i-1]+dist(p[i-1],p[i]));return d;};
// Evenly spaced samples (at most `step` mm apart) along an open polyline, with their arc positions.
function resample(path:Point[],step:number):{points:Point[];at:number[];total:number}{
  const d=lengths(path),total=d[d.length-1],n=Math.max(2,Math.ceil(total/step));let j=1;
  const at=Array.from({length:n+1},(_,i)=>total*i/n);
  const points=at.map(s=>{while(j<path.length-1&&d[j]<s)j++;const t=d[j]>d[j-1]?(s-d[j-1])/(d[j]-d[j-1]):0;return [path[j-1][0]+t*(path[j][0]-path[j-1][0]),path[j-1][1]+t*(path[j][1]-path[j-1][1])] as Point;});
  return {points,at,total};
}
const tangents=(p:Point[])=>p.map((_,i)=>{const a=p[Math.max(0,i-1)],b=p[Math.min(p.length-1,i+1)],l=dist(a,b)||1;return [(b[0]-a[0])/l,(b[1]-a[1])/l] as Point;});
// Local radius of curvature at each sample (Infinity on straight runs).
const radii=(p:Point[])=>p.map((q,i)=>{
  if(i===0||i===p.length-1)return Infinity;
  const a=p[i-1],b=p[i+1],cross=(q[0]-a[0])*(b[1]-a[1])-(q[1]-a[1])*(b[0]-a[0]);
  return Math.abs(cross)<1e-9?Infinity:dist(a,q)*dist(q,b)*dist(a,b)/(2*Math.abs(cross));
});
const smooth=(v:number[],passes=2)=>{let out=v;for(let k=0;k<passes;k++)out=out.map((x,i)=>i===0||i===out.length-1?x:(out[i-1]+2*x+out[i+1])/4);return out;};

// Pressure at each fraction (0–1) of the stroke, matched by arc position along the raw samples;
// null when the stroke has no real pressure (a mouse reports a constant 0.5).
function pressureAt(raw:Point[],pressures:number[]|undefined,fractions:number[]):number[]|null{
  if(!pressures||pressures.length!==raw.length||!pressures.every(Number.isFinite)||pressures.every(p=>Math.abs(p-pressures[0])<.02))return null;
  const d=lengths(raw),total=d[d.length-1]||1;let j=1;
  return smooth(fractions.map(f=>{const target=f*total;while(j<d.length-1&&d[j]<target)j++;const t=d[j]>d[j-1]?(target-d[j-1])/(d[j]-d[j-1]):0;return pressures[j-1]+t*(pressures[j]-pressures[j-1]);}),3);
}

export type BrushResult={kind:Kind;rings:Point[][];patch:Partial<StitchObject>;rails?:Rails};
// Converts a raw stroke (mm) into a stitch object description, or null when the stroke is too short.
export function brushStroke(id:BrushId,raw:Point[],size:number,pressures?:number[]):BrushResult|null{
  size=brushSize(id,size);
  const fit=fitFreehand(raw);
  if(fit.points.length<2)return null;
  const curve:NonNullable<StitchObject['curve']>={points:fit.points,closed:fit.closed,corners:fit.corners,spline:'levien'};
  const centre=curveRing(curve,true);
  if(lengths(centre).at(-1)!<minLength)return null;
  if(id==='running')return {kind:'running',rings:[centre],patch:{curve,length:size}};
  if(id==='bean')return {kind:'bean',rings:[centre],patch:{curve,length:size}};
  if(id==='rope')return {kind:'triple-rope',rings:[centre],patch:{curve,ropeWidth:size}};
  if(id==='satin')return {kind:'satin',rings:[centre],patch:{curve,satinWidth:size}};
  // Tapers and fills work on an open centre line, so closed loops are opened at their start.
  const line=curvePoints(fit.points,false,fit.corners,'levien');
  if(fit.closed)line.push([...line[0]]);
  if(id==='taper')return taper(line,size,raw,pressures);
  return fillBand(line,size);
}

// Satin between two rails offset either side of the stroke. Width follows pen pressure, or swells
// towards the middle with a mouse; it never exceeds what the local curvature allows.
function taper(line:Point[],size:number,raw:Point[],pressures?:number[]):BrushResult|null{
  const {points,at,total}=resample(line,.5),n=points.length,tan=tangents(points),r=radii(points);
  const pressure=pressureAt(raw,pressures,at.map(s=>s/total));
  const ends=(s:number)=>Math.min(1,Math.min(s,total-s)/Math.max(1.5,Math.min(total*.25,size*1.5)));
  const shaped=at.map((s,i)=>{
    const shape=pressure?Math.max(.15,Math.min(1,pressure[i]*1.4))*Math.sqrt(ends(s)):Math.sin(Math.PI*s/total)**.6;
    return Math.max(minWidth,Math.min(size*shape,1.6*r[i]));
  });
  const width=smooth(shaped,3);
  // Rungs every few millimetres keep the rails smooth and editable.
  const rungs=Math.max(2,Math.min(60,Math.round(total/Math.max(1.5,Math.min(4,size*.6)))));
  const picks=Array.from({length:rungs+1},(_,k)=>Math.round(k*(n-1)/rungs));
  const side=(sign:number)=>picks.map(i=>{const t=tan[i],w=width[i]/2;return [points[i][0]-sign*t[1]*w,points[i][1]+sign*t[0]*w] as Point;});
  const rails:Rails={points:[side(1),side(-1)],corners:[picks.map(()=>false),picks.map(()=>false)]};
  return {kind:'satin-block',rings:[],rails,patch:{}};
}

// Fills the painted area: the round-capped band the stroke covers, scribbles and overlaps merged
// into one region, sewn as ordinary tatami at the object's angle.
function fillBand(line:Point[],size:number):BrushResult|null{
  const {points}=resample(line,Math.max(.5,size/6)),half=size/2;
  const circle=(c:Point):Region=>[[Array.from({length:20},(_,k)=>[c[0]+half*Math.cos(k*Math.PI/10),c[1]+half*Math.sin(k*Math.PI/10)] as Point)]];
  const quads=points.slice(1).map((b,i)=>{const a=points[i],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1,nx=-dy/l*half,ny=dx/l*half;
    return [[[[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]]]] as Region;});
  let band:Region;
  try{band=union(...quads,...points.map(circle));}catch{return null;}
  const rings=regionRings(band).map(r=>cleanRing(r,.03)).filter(r=>r.length>=3);
  if(!rings.length)return null;
  return {kind:'fill',rings,patch:{fillPattern:'tatami'}};
}

// Builds the final object from a brush result and a blank object of the same name and colour.
export function brushObject(blank:StitchObject,result:BrushResult):StitchObject{
  const o:StitchObject={...blank,kind:result.kind,rings:result.rings,...result.patch};
  return result.rails?withRails(o,result.rails):o;
}
