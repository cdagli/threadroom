import {bounds, isFillKind, pathData, type Command, type Compiled, type Project, type StitchObject, type Point} from './project';
import {mergedOutline} from './text';
import {blockOutline} from './curves';

// Editor objects are immutable. Weak keys release cached geometry with undo history.
const geometry=new WeakMap<StitchObject,ReturnType<typeof buildGeometry>>();
function buildGeometry(o:StitchObject){
  // A satin block shows (and hit-tests) as the area between its rails.
  if(o.rails){const outline=[blockOutline(o.rails)];return {path:pathData(outline,true),bounds:bounds([{...o,rings:outline}]),border:'',guide:''};}
  return {path:pathData(o.rings,isFillKind(o.kind)||!!o.curve?.closed||!!o.text?.satin),bounds:bounds([o]),
    border:o.text?.border&&isFillKind(o.kind)?pathData(mergedOutline(o.rings),false):'',
    guide:o.text?.layout==='path'&&o.text.path?pathData([o.text.path.map(([x,y])=>{const m=o.text!.affine;return m?[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]] as Point:[x,y];})],false):''};
}
export function objectGeometry(o:StitchObject){let value=geometry.get(o);if(!value){value=buildGeometry(o);geometry.set(o,value);}return value;}
export function designBounds(objects:StitchObject[]){
  const boxes=objects.filter(o=>o.rings.some(r=>r.length)).map(o=>objectGeometry(o).bounds);
  if(!boxes.length)return {x:0,y:0,width:0,height:0};
  const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
  return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};
}
// Include deleted objects and text borders. Global sewing settings invalidate every object.
export function changedObjectIds(source:Project|null,current:Project){
  const ids=new Set<string>(),before=new Map(source?.objects.map(o=>[o.id,o]));
  const global=!source||source.fabric!==current.fabric||source.locks!==current.locks||source.trimJump!==current.trimJump||source.hoop!==current.hoop||source.machine!==current.machine;
  const orderChanged=!!source&&source.objects.length===current.objects.length&&source.objects.some((o,i)=>o.id!==current.objects[i].id);
  const after=new Map(current.objects.map(o=>[o.id,o]));
  for(const o of [...(source?.objects??[]),...current.objects])if(global||orderChanged||before.get(o.id)!==after.get(o.id)){
    ids.add(o.id);if(o.text?.border)ids.add(`${o.id}-border`);
  }
  return ids;
}
export function commandPaths(commands:Command[],blockCount:number,count:number){
  const cached=paths.get(commands);if(cached?.count===count&&cached.blockCount===blockCount)return cached.value;
  const value={blocks:Array.from({length:blockCount},()=>({stitch:'',jump:''})),travel:'',trims:[] as Point[],travelCount:0,jumpCount:0};
  for(let i=0;i<count;i++){
    const c=commands[i],b=value.blocks[c.block];if(!b)continue;const segment=`M${c.fromX} ${c.fromY}L${c.x} ${c.y}`;
    if(c.type==='jump'){b.jump+=segment;value.jumpCount++;if(c.trim)value.trims.push([c.fromX,c.fromY]);}
    else{b.stitch+=segment;if(c.travel){value.travel+=segment;value.travelCount++;}}
  }
  paths.set(commands,{count,blockCount,value});return value;
}
const paths=new WeakMap<Command[],{count:number;blockCount:number;value:{blocks:{stitch:string;jump:string}[];travel:string;trims:Point[];travelCount:number;jumpCount:number}}>();
const stitchCounts=new WeakMap<Compiled,Uint32Array>();
export function sewnStitches(compiled:Compiled,count:number){
  let prefix=stitchCounts.get(compiled);if(!prefix){prefix=new Uint32Array(compiled.commands.length+1);compiled.commands.forEach((c,i)=>{prefix![i+1]=prefix![i]+Number(c.type==='stitch');});stitchCounts.set(compiled,prefix);}
  return prefix[count];
}

// While the stitch engine catches up, an object that was only moved, rotated, scaled or flipped
// keeps its previous stitches under the same transform. Anything else stays stale.
type Affine=[number,number,number,number,number,number];
const apply=(m:Affine,x:number,y:number):Point=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
// Fields a transform rewrites; every other sewing field must be unchanged. Name, lock and group never affect stitches.
const transformed=new Set(['rings','rails','curve','entry','exit','center','angleGuides','angle','rotation','text','name','locked','group','hidden']);
const cosmetic=new Set(['name','locked','group','hidden']);
const textTransformed=new Set(['origin','rotation','size','path','affine']);
function sameExcept(a:object,b:object,skip:Set<string>){
  const ka=Object.keys(a).filter(k=>!skip.has(k)&&(a as Record<string,unknown>)[k]!==undefined),kb=Object.keys(b).filter(k=>!skip.has(k)&&(b as Record<string,unknown>)[k]!==undefined);
  return ka.length===kb.length&&ka.every(k=>JSON.stringify((a as Record<string,unknown>)[k])===JSON.stringify((b as Record<string,unknown>)[k]));
}
function anchors(o:StitchObject){
  const lists=[...o.rings,...(o.rails?.points??[]),...(o.curve?[o.curve.points]:[]),...[o.entry,o.exit,o.center].filter(Boolean).map(p=>[p!])];
  return {shape:lists.map(l=>l.length).join(','),points:lists.flat()};
}
function solve(from:Point[],to:Point[],tolerance:number):Affine|null{
  const [p0]=from;let i1=0,i2=0,best=0;
  from.forEach((p,i)=>{const d=Math.hypot(p[0]-p0[0],p[1]-p0[1]);if(d>best){best=d;i1=i;}});
  if(best<1e-6)return null;
  const p1=from[i1],ex=p1[0]-p0[0],ey=p1[1]-p0[1];best=0;
  from.forEach((p,i)=>{const area=Math.abs(ex*(p[1]-p0[1])-ey*(p[0]-p0[0]));if(area>best){best=area;i2=i;}});
  const q0=to[0],q1=to[i1];let m:Affine;
  if(best>.05*Math.hypot(ex,ey)){
    // Map the triangle p0 p1 p2 onto q0 q1 q2.
    const p2=from[i2],q2=to[i2],fx=p2[0]-p0[0],fy=p2[1]-p0[1],det=ex*fy-ey*fx;
    const ux=q1[0]-q0[0],uy=q1[1]-q0[1],vx=q2[0]-q0[0],vy=q2[1]-q0[1];
    const a=(ux*fy-vx*ey)/det,c=(vx*ex-ux*fx)/det,b=(uy*fy-vy*ey)/det,d=(vy*ex-uy*fx)/det;
    m=[a,b,c,d,q0[0]-a*p0[0]-c*p0[1],q0[1]-b*p0[0]-d*p0[1]];
  }else{
    // Collinear anchors: the similarity that maps the segment p0 p1 onto q0 q1.
    const ux=q1[0]-q0[0],uy=q1[1]-q0[1],n=ex*ex+ey*ey,cos=(ux*ex+uy*ey)/n,sin=(uy*ex-ux*ey)/n;
    m=[cos,sin,-sin,cos,q0[0]-cos*p0[0]+sin*p0[1],q0[1]-sin*p0[0]-cos*p0[1]];
  }
  return from.every((p,i)=>{const [x,y]=apply(m,p[0],p[1]);return Math.abs(x-to[i][0])<=tolerance&&Math.abs(y-to[i][1])<=tolerance;})?m:null;
}
export function objectTransform(before:StitchObject,after:StitchObject):Affine|null{
  if(before===after)return [1,0,0,1,0,0];
  if(!sameExcept(before,after,transformed)||!!before.text!==!!after.text||before.text&&!sameExcept(before.text,after.text!,textTransformed))return null;
  const a=anchors(before),b=anchors(after);
  if(a.shape!==b.shape||a.points.length<2)return null;
  const m=solve(a.points,b.points,.02);
  if(!m)return null;
  // Three anchors fit any affine map, so a dragged point would pass; small shapes must keep their proportions.
  const similar=Math.abs(m[0]*m[0]+m[1]*m[1]-m[2]*m[2]-m[3]*m[3])<1e-6&&Math.abs(m[0]*m[2]+m[1]*m[3])<1e-6;
  if(a.points.length<=3&&!similar)return null;
  // An identity fit with other changes means a sewing setting changed (an angle or text field), so the stitches did too.
  if(Math.abs(m[0]-1)+Math.abs(m[1])+Math.abs(m[2])+Math.abs(m[3]-1)+Math.abs(m[4])+Math.abs(m[5])<1e-9&&!sameExcept(before,after,cosmetic))return null;
  return m;
}
// Commands of the last compile with transformed objects moved into place, and the ids now shown that way.
export function projectCommands(commands:Command[],source:Project|null,current:Project,stale:ReadonlySet<string>){
  const moves=new Map<string,Affine>();
  if(source&&stale.size){
    const before=new Map(source.objects.map(o=>[o.id,o]));
    for(const o of current.objects){
      if(!stale.has(o.id))continue;const old=before.get(o.id),m=old&&objectTransform(old,o);
      if(m){moves.set(o.id,m);if(o.text?.border)moves.set(`${o.id}-border`,m);}
    }
  }
  if(!moves.size)return {commands,moved:moves as ReadonlyMap<string,Affine>};
  const projected=commands.map(c=>{
    const to=c.objectId===undefined?undefined:moves.get(c.objectId),from=moves.get(c.fromObjectId??c.objectId??'');
    if(!to&&!from)return c;
    // A connector between a moved and an unmoved object would stretch across the design; hide it until the engine reroutes.
    if(!to||!from||to!==from&&to.some((v,i)=>Math.abs(v-from[i])>1e-6)){const [x,y]=to?apply(to,c.x,c.y):[c.x,c.y];return {...c,type:'jump' as const,travel:false,trim:false,x,y,fromX:x,fromY:y};}
    const [x,y]=to?apply(to,c.x,c.y):[c.x,c.y],[fromX,fromY]=from?apply(from,c.fromX,c.fromY):[c.fromX,c.fromY];
    return {...c,x,y,fromX,fromY};
  });
  return {commands:projected,moved:moves as ReadonlyMap<string,Affine>};
}
