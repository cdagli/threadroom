import {createT,type Translator} from './i18n';
import type {Point} from './project';
import {simplifyPath} from './curves';

// Text is stored as editable settings plus flattened millimetre outlines.
// Layout is pure: callers pass already-loaded fonts (see lib/fonts.ts).
export type TextAlign='left'|'center'|'right';
export type TextLayout='straight'|'arc'|'wave'|'path';
export type FontRef={source:'catalog'|'upload';id:string;family:string;weight:number;italic:boolean;subsets:string[]};
export type TextBorder={kind:'running'|'bean'|'satin';color:string;width:number};
export type TextSpec={
  content:string; font:FontRef;
  size:number;       // capital letter height, mm
  tracking:number;   // extra letter spacing, % of size
  lineHeight:number; // baseline distance, multiple of size
  align:TextAlign; layout:TextLayout;
  bend:number;       // arc: -100…100, where ±100 wraps a full circle
  waveHeight:number; waveLength:number; // multiples of size
  path?:Point[]; offset:number; reverse:boolean; below:boolean; // follow a path
  origin:Point; rotation:number; // centre and angle for straight, arc and wave
  border?:TextBorder;
  affine?:[number,number,number,number,number,number]; // post-layout transform for stretch, shear and reflection
};

type Command={type:string;x?:number;y?:number;x1?:number;y1?:number;x2?:number;y2?:number};
export type GlyphLike={index:number;advanceWidth?:number;getPath(x:number,y:number,size:number):{commands:Command[]}};
export type FontLike={unitsPerEm:number;tables:{os2?:{sCapHeight?:number}};charToGlyph(c:string):GlyphLike;charToGlyphIndex(c:string):number;getKerningValue(a:GlyphLike,b:GlyphLike):number};

export const textLimits={content:300,size:[3,150] as const,tracking:[-30,150] as const,lineHeight:[.8,4] as const,bend:[-100,100] as const,waveHeight:[0,1.5] as const,waveLength:[1,20] as const,borderWidth:[.5,4] as const};

export function defaultText(font:FontRef,origin:Point,content:string|undefined=undefined,t:Translator=createT('en')):TextSpec {
  return {content:content??t('Your text'),font,size:12,tracking:0,lineHeight:1.6,align:'center',layout:'straight',bend:25,waveHeight:.3,waveLength:5,offset:50,reverse:false,below:false,origin,rotation:0};
}

function capHeight(font:FontLike) {
  const cap=font.tables.os2?.sCapHeight;
  if(cap&&cap>0)return cap;
  const commands=font.charToGlyph('H').getPath(0,0,font.unitsPerEm).commands;
  const top=Math.min(...commands.map(c=>c.y??0));
  return top<0?-top:font.unitsPerEm*.7;
}

// Glyph outlines in font units (y down), flattened at roughly `step` units.
function glyphRings(glyph:GlyphLike,font:FontLike,step:number):Point[][] {
  const rings:Point[][]=[];let ring:Point[]=[],at:Point=[0,0];
  const close=()=>{if(ring.length>2)rings.push(ring);ring=[];};
  const steps=(...pts:Point[])=>Math.max(1,Math.min(32,Math.ceil(pts.slice(1).reduce((d,p,i)=>d+Math.hypot(p[0]-pts[i][0],p[1]-pts[i][1]),0)/step)));
  for(const c of glyph.getPath(0,0,font.unitsPerEm).commands){
    const p:Point=[c.x??0,c.y??0];
    if(c.type==='M'){close();ring=[p];}
    else if(c.type==='L')ring.push(p);
    else if(c.type==='Q'){
      const q:Point=[c.x1!,c.y1!],n=steps(at,q,p);
      for(let i=1;i<=n;i++){const t=i/n,u=1-t;ring.push([u*u*at[0]+2*u*t*q[0]+t*t*p[0],u*u*at[1]+2*u*t*q[1]+t*t*p[1]]);}
    }else if(c.type==='C'){
      const a:Point=[c.x1!,c.y1!],b:Point=[c.x2!,c.y2!],n=steps(at,a,b,p);
      for(let i=1;i<=n;i++){const t=i/n,u=1-t;ring.push([u*u*u*at[0]+3*u*u*t*a[0]+3*u*t*t*b[0]+t*t*t*p[0],u*u*u*at[1]+3*u*u*t*a[1]+3*u*t*t*b[1]+t*t*t*p[1]]);}
    }else if(c.type==='Z'){close();continue;}
    at=p;
  }
  close();
  // Drop the duplicate closing point that many fonts emit.
  return rings.map(r=>Math.hypot(r[0][0]-r[r.length-1][0],r[0][1]-r[r.length-1][1])<1e-6?r.slice(0,-1):r);
}

type Pose={p:Point;t:Point};
function pathPose(path:Point[],lengths:number[],s:number):Pose {
  const total=lengths[lengths.length-1];
  let lo=1,hi=path.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(lengths[mid]<s)lo=mid+1;else hi=mid;}
  const i=s<0?1:s>total?path.length-1:lo;
  const a=path[i-1],b=path[i],d=Math.hypot(b[0]-a[0],b[1]-a[1])||1,t:Point=[(b[0]-a[0])/d,(b[1]-a[1])/d];
  const along=s-lengths[i-1];
  return {p:[a[0]+t[0]*along,a[1]+t[1]*along],t};
}

export type TextResult={rings:Point[][];missing:string[];width:number};
export function layoutText(spec:TextSpec,fonts:FontLike[],closed=false):TextResult {
  const missing=new Set<string>(),primary=fonts[0];
  if(!primary)return {rings:[],missing:[],width:0};
  const unit=spec.size/capHeight(primary),tracking=spec.tracking/100*spec.size,lineGap=spec.lineHeight*spec.size;
  const lines=spec.content.replace(/\r/g,'').split('\n').map(text=>{
    const glyphs:{glyph:GlyphLike;font:FontLike;x:number;advance:number;scale:number}[]=[];
    let x=0,previous=null as {glyph:GlyphLike;font:FontLike}|null;
    for(const ch of text){
      const font=fonts.find(f=>f.charToGlyphIndex(ch)>0)||(/\s/.test(ch)?primary:null);
      if(!font){missing.add(ch);continue;}
      const glyph=font.charToGlyph(ch),scale=unit*primary.unitsPerEm/font.unitsPerEm;
      if(previous?.font===font)x+=font.getKerningValue(previous.glyph,glyph)*scale;
      const advance=(glyph.advanceWidth||0)*scale;
      glyphs.push({glyph,font,x,advance,scale});x+=advance+tracking;previous={glyph,font};
    }
    return {glyphs,width:glyphs.length?x-tracking:0};
  });
  const maxWidth=Math.max(0,...lines.map(l=>l.width));
  const onPath=spec.layout==='path'&&!!spec.path&&spec.path.length>=2;
  const path=onPath?(spec.reverse?[...spec.path!].reverse():spec.path!):[];
  const lengths=path.reduce<number[]>((acc,p,i)=>{acc.push(i?acc[i-1]+Math.hypot(p[0]-path[i-1][0],p[1]-path[i-1][1]):0);return acc;},[]);
  const angle=spec.layout==='arc'?spec.bend/100*Math.PI*2:0;
  const radius=Math.abs(angle)>1e-3&&maxWidth>0?maxWidth/Math.abs(angle):0;
  const centre=((lines.length-1)*lineGap-spec.size)/2;
  const rot=spec.rotation*Math.PI/180,cos=Math.cos(rot),sin=Math.sin(rot);

  function pose(x:number,y:number):Pose {
    if(onPath){const {p,t}=pathPose(path,lengths,spec.offset/100*lengths[lengths.length-1]+x);return {p:[p[0]-t[1]*y,p[1]+t[0]*y],t};}
    if(spec.layout==='wave'&&spec.waveHeight>0){
      const amp=spec.waveHeight*spec.size,k=Math.PI*2/(spec.waveLength*spec.size),slope=amp*k*Math.cos(k*x),d=Math.hypot(1,slope);
      return {p:[x,y+amp*Math.sin(k*x)],t:[1/d,slope/d]};
    }
    if(radius){
      // Rainbow (bend > 0) centres the circle below; smile (bend < 0) above.
      if(angle>0){const r=Math.max(.1,radius-y),phi=x/r;return {p:[r*Math.sin(phi),radius-r*Math.cos(phi)],t:[Math.cos(phi),Math.sin(phi)]};}
      const r=Math.max(.1,radius+y),phi=x/r;return {p:[r*Math.sin(phi),-radius+r*Math.cos(phi)],t:[Math.cos(phi),-Math.sin(phi)]};
    }
    return {p:[x,y],t:[1,0]};
  }

  const rings:Point[][]=[];
  lines.forEach((line,li)=>{
    const shift=onPath?(spec.align==='left'?0:spec.align==='right'?-line.width:-line.width/2)
      :(spec.align==='left'?-maxWidth/2:spec.align==='right'?maxWidth/2-line.width:-line.width/2);
    const baseline=onPath?li*lineGap+(spec.below?spec.size*1.2:0):li*lineGap-centre;
    for(const g of line.glyphs){
      for(const outline of glyphRings(g.glyph,g.font,.2/g.scale)){
        // Each point is bent onto the baseline curve (not the whole glyph
        // rotated), so joined script letters stay connected on arcs and paths.
        let ring=outline.map(([gx,gy])=>{
          const {p,t}=pose(shift+g.x+gx*g.scale,baseline),dy=gy*g.scale;
          let x=p[0]-t[1]*dy,y=p[1]+t[0]*dy;
          if(!onPath){const rx=x*cos-y*sin,ry=x*sin+y*cos;x=rx+spec.origin[0];y=ry+spec.origin[1];}
          if(spec.affine){const [a,b,c,d,e,f]=spec.affine,px=x;x=a*px+c*y+e;y=b*px+d*y+f;}
          return [Math.round(x*1000)/1000,Math.round(y*1000)/1000] as Point;
        });
        ring=simplifyPath([...ring,ring[0]],.02).slice(0,-1);
        const area=ring.reduce((a,q,i)=>{const r=ring[(i+1)%ring.length];return a+q[0]*r[1]-r[0]*q[1];},0)/2;
        if(ring.length<3||Math.abs(area)<.004)continue;
        rings.push(closed?[...ring,[...ring[0]] as Point]:ring);
      }
    }
  });
  return {rings,missing:[...missing],width:maxWidth};
}

// Moves, scales or rotates the editable settings to match a geometry change.
export function transformText(spec:TextSpec,move:(p:Point)=>Point):TextSpec {
  const z=move([0,0]),x=move([1,0]),y=move([0,1]),a=x[0]-z[0],b=x[1]-z[1],c=y[0]-z[0],d=y[1]-z[1];
  // Similarities retain the familiar size/rotation settings. General affine changes are composed
  // after layout so a later content/font edit preserves the exact stretched or mirrored outlines.
  if(spec.affine||Math.abs(a*c+b*d)>1e-8||Math.abs(a*a+b*b-c*c-d*d)>1e-8||a*d-b*c<0){
    const m=spec.affine??[1,0,0,1,0,0],affine:NonNullable<TextSpec['affine']>=[a*m[0]+c*m[1],b*m[0]+d*m[1],a*m[2]+c*m[3],b*m[2]+d*m[3],a*m[4]+c*m[5]+z[0],b*m[4]+d*m[5]+z[1]];
    return {...spec,affine};
  }
  const origin=move(spec.origin),rot=spec.rotation*Math.PI/180;
  const ref=move([spec.origin[0]+Math.cos(rot),spec.origin[1]+Math.sin(rot)]);
  const scale=Math.hypot(ref[0]-origin[0],ref[1]-origin[1]);
  const rotation=Math.atan2(ref[1]-origin[1],ref[0]-origin[0])*180/Math.PI;
  return {...spec,origin,rotation:Math.abs(rotation-spec.rotation)<1e-9?spec.rotation:Math.round(rotation*100)/100,
    size:Math.abs(scale-1)<1e-9?spec.size:spec.size*scale,path:spec.path?.map(move)};
}

// New guide paths are drawn in world coordinates; affine text lays out in its source space.
export function textSourcePoint(spec:TextSpec,p:Point):Point{
  if(!spec.affine)return [...p];const [a,b,c,d,e,f]=spec.affine,det=a*d-b*c,x=p[0]-e,y=p[1]-f;
  return [(d*x-c*y)/det,(a*y-b*x)/det];
}

const finite=(n:unknown,[min,max]:readonly [number,number])=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const point=(p:unknown)=>Array.isArray(p)&&p.length===2&&p.every(n=>finite(n,[-1000,1000]));
export function validText(value:unknown):value is TextSpec {
  if(!value||typeof value!=='object')return false;
  const t=value as TextSpec,f=t.font;
  if(t.affine!==undefined&&(!Array.isArray(t.affine)||t.affine.length!==6||!t.affine.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=10000)||Math.abs(t.affine[0]*t.affine[3]-t.affine[1]*t.affine[2])<1e-8))return false;
  if(typeof t.content!=='string'||t.content.length>textLimits.content)return false;
  if(!f||!['catalog','upload'].includes(f.source)||typeof f.id!=='string'||!/^[a-z0-9-]{1,80}$/.test(f.id)||typeof f.family!=='string'||!finite(f.weight,[100,1000])||typeof f.italic!=='boolean'||!Array.isArray(f.subsets)||f.subsets.some(s=>typeof s!=='string'))return false;
  if(!finite(t.size,textLimits.size)||!finite(t.tracking,textLimits.tracking)||!finite(t.lineHeight,textLimits.lineHeight)||!finite(t.bend,textLimits.bend)||!finite(t.waveHeight,textLimits.waveHeight)||!finite(t.waveLength,textLimits.waveLength)||!finite(t.offset,[0,100])||!finite(t.rotation,[-360,360]))return false;
  if(!['left','center','right'].includes(t.align)||!['straight','arc','wave','path'].includes(t.layout)||typeof t.reverse!=='boolean'||typeof t.below!=='boolean'||!point(t.origin))return false;
  if(t.path!==undefined&&(!Array.isArray(t.path)||t.path.length<2||t.path.length>4000||!t.path.every(point)))return false;
  if(t.border!==undefined&&(!['running','bean','satin'].includes(t.border.kind)||!/^#[0-9a-f]{6}$/i.test(t.border.color)||!finite(t.border.width,textLimits.borderWidth)))return false;
  return true;
}

// Outer outline of all letters merged (nonzero union), for text borders. Script
// letters overlap; tracing each contour would sew border lines inside letters.
// Rasterises at `cell` mm and traces with marching squares.
const outlineCache=new WeakMap<Point[][],Point[][]>();
export function mergedOutline(rings:Point[][],cell=.08):Point[][] {
  const cached=outlineCache.get(rings);if(cached)return cached;
  const pts=rings.flat();if(!pts.length)return [];
  const minX=Math.min(...pts.map(p=>p[0]))-2*cell,minY=Math.min(...pts.map(p=>p[1]))-2*cell;
  const W=Math.ceil((Math.max(...pts.map(p=>p[0]))-minX)/cell)+3,H=Math.ceil((Math.max(...pts.map(p=>p[1]))-minY)/cell)+3;
  if(W*H>4_000_000)return rings.map(r=>[...r,r[0]]);
  const grid=new Uint8Array(W*H);
  for(let j=0;j<H;j++){
    const y=minY+(j+.5)*cell,hits:[number,number][]=[];
    for(const r of rings)for(let i=0;i<r.length;i++){
      const a=r[i],b=r[(i+1)%r.length];
      if((a[1]<=y&&y<b[1])||(b[1]<=y&&y<a[1]))hits.push([a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]),b[1]>a[1]?1:-1]);
    }
    hits.sort((p,q)=>p[0]-q[0]);
    let winding=0,start=0;
    for(const [x,d] of hits){
      if(!winding)start=x;
      winding+=d;
      if(!winding)for(let i=Math.max(0,Math.ceil((start-minX)/cell-.5));i<=Math.min(W-1,Math.floor((x-minX)/cell-.5));i++)grid[j*W+i]=1;
    }
  }
  const at=(i:number,j:number)=>grid[j*W+i];
  const coord=(key:string):Point=>{const [i,j]=key.slice(1).split(',').map(Number);return key[0]==='h'?[minX+(i+1)*cell,minY+(j+.5)*cell]:[minX+(i+.5)*cell,minY+(j+1)*cell];};
  const links=new Map<string,string[]>(),link=(a:string,b:string)=>{for(const [p,q] of [[a,b],[b,a]]){const l=links.get(p);if(l)l.push(q);else links.set(p,[q]);}};
  for(let j=0;j<H-1;j++)for(let i=0;i<W-1;i++){
    const a=at(i,j),b=at(i+1,j),c=at(i+1,j+1),d=at(i,j+1);if(a===b&&b===c&&c===d)continue;
    const top=`h${i},${j}`,right=`v${i+1},${j}`,bottom=`h${i},${j+1}`,left=`v${i},${j}`;
    const crossing=[a!==b&&top,b!==c&&right,d!==c&&bottom,a!==d&&left].filter((e):e is string=>!!e);
    if(crossing.length===2)link(crossing[0],crossing[1]);
    else if(a){link(top,left);link(right,bottom);}else{link(top,right);link(bottom,left);}
  }
  const seen=new Set<string>(),result:Point[][]=[];
  for(const first of links.keys()){
    if(seen.has(first))continue;
    const loop:Point[]=[];let previous='',key=first;
    while(!seen.has(key)){seen.add(key);loop.push(coord(key));const next=links.get(key)!.find(k=>k!==previous&&!seen.has(k));if(!next)break;previous=key;key=next;}
    const ring=simplifyPath([...loop,loop[0]],cell*.6);
    const area=ring.reduce((s,p,i)=>i?s+ring[i-1][0]*p[1]-p[0]*ring[i-1][1]:s,0)/2;
    if(ring.length>3&&Math.abs(area)>cell*cell*4)result.push(ring);
  }
  outlineCache.set(rings,result);
  return result;
}
