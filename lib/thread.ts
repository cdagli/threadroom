import type {CanvasBackground} from './canvas-background';
import type {Command, Fabric} from './project';
// Canvas fallback for the thread preview (lib/thread-renderer.ts is the GPU renderer): each sewn
// stitch is a lit stroke 0.36 mm wide, broader than the real thread so that it still reads as a
// solid surface without per-pixel shading.
/** @test */ export const threadWidth=.36;
type RGB=[number,number,number];
/** @test */ export function rgb(colour:string):RGB{
  let h=colour.replace('#','');if(h.length===3)h=[...h].map(c=>c+c).join('');
  return [0,2,4].map(i=>{const v=parseInt(h.slice(i,i+2),16);return Number.isFinite(v)?v:0;}) as RGB;
}
const hex=(c:RGB)=>'#'+c.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
const mix=(a:RGB,b:RGB,t:number)=>a.map((v,i)=>v+(b[i]-v)*t) as RGB;
/** @test */ export function luminance(colour:string){const [r,g,b]=rgb(colour).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;}
// Sunken ends, dark flanks and the dyed body; dark threads get a stronger sheen.
export function threadShades(colour:string){
  const c=rgb(colour),l=luminance(colour);
  return {end:hex(mix(c,[0,0,0],.30)),mid:hex(mix(c,[0,0,0],.15)),edge:hex(mix(c,[20,14,8],l>.5?.24:.34)),body:hex(c),sheen:hex(mix(c,[255,255,255],.22+.26*(1-l)))};
}
// Squared projection across the top-left light: perpendicular axes catch the most light.
/** @test */ export function lustre(ax:number,ay:number,bx:number,by:number){const dx=bx-ax,dy=by-ay,d=dx*dx+dy*dy;return d?Math.min(1,(dx-dy)**2/(2*d)):0;}
const lustreCache=new Map<string,(ReturnType<typeof threadShades>&{groove:string})[]>();
// Cache colour strings for every direction bucket, including the cheaper three-tone distant view.
/** @test */ export function lustreShades(colour:string,steps:3|6=6){
  const key=`${colour}:${steps}`,cached=lustreCache.get(key);if(cached)return cached;
  const shade=threadShades(colour),body=rgb(shade.body),mid=rgb(shade.mid),sheen=rgb(shade.sheen),groove=`rgba(${rgb(shade.edge).join(',')},.6)`;
  const variants=Array.from({length:steps},(_,i)=>{const l=i/(steps-1),scale=.94+.10*l,c=body.map(v=>v*scale) as RGB;return {...shade,body:hex(c),mid:hex(mid.map(v=>v*scale) as RGB),sheen:hex(mix(c,sheen,.55+.45*l)),groove};});
  lustreCache.set(key,variants);return variants;
}
export type ThreadStyle={width:number;body:number;sheen:number;shadow:[number,number];detail:0|1|2};
// Sizes in mm for a zoom of pxPerMm device pixels per mm. Below ~1.4 px a thread has no visible
// cylinder shading, but keeps dark holes and a minimum 0.7 px width. No coverage-widening shadow.
export function threadStyle(pxPerMm:number):ThreadStyle{
  const px=threadWidth*pxPerMm,width=Math.max(.7,px)/pxPerMm;
  return {width,body:width*.74,sheen:width*(px>=3.5?.22:.28),shadow:[0,0],detail:px<1.4?0:px<3.5?1:2};
}
// Step into the lit body from each needle hole; long stitches cap the sunken region at 1.8 mm.
/** @test */ export function holeInset(ax:number,ay:number,bx:number,by:number,t:number):[number,number,number,number]|null{
  const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy),inset=t*Math.min(.35*len,1.8);if(len<=0||2*inset>=len)return null;
  const ux=dx/len*inset,uy=dy/len*inset;return [ax+ux,ay+uy,bx-ux,by-uy];
}
// Like holeInset, for round-capped strokes: pulled back at least the cap radius; a stitch too short
// for that becomes a dot at its centre, or nothing when shorter than the cap itself.
function roundInset(ax:number,ay:number,bx:number,by:number,t:number,r:number):[number,number,number,number]|null{
  const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy),inset=Math.max(t*Math.min(.35*len,1.8),r);
  if(2*inset<len){const ux=dx/len*inset,uy=dy/len*inset;return [ax+ux,ay+uy,bx-ux,by-uy];}
  if(len<2*r)return null;const mx=(ax+bx)/2,my=(ay+by)/2;return [mx,my,mx,my];
}
// The sheen sits on the lit side (light from the top left) and stops short of both needle holes.
/** @test */ export function sheenSegment(ax:number,ay:number,bx:number,by:number,width:number):[number,number,number,number]|null{
  const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy),s=holeInset(ax,ay,bx,by,.75);if(len<width*.9||!s)return null;
  let nx=-dy/len,ny=dx/len;if(nx+ny>0){nx=-nx;ny=-ny;}
  const o=width*.12;return [s[0]+nx*o,s[1]+ny*o,s[2]+nx*o,s[3]+ny*o];
}
// One diagonal ply groove per equal repeat; keep its stroke inside the thread and needle holes.
/** @test */ export function plyGrooves(ax:number,ay:number,bx:number,by:number,width:number,period:number):number[]{
  const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy),segs:number[]=[];if(len<=0||width<=0||period<=0)return segs;
  const n=Math.max(1,Math.round(len/period)),step=len/n,ux=dx/len,uy=dy/len,flank=width*.44,skew=Math.min(.35*width/threadWidth,step*.8)/2;
  for(let i=0;i<n;i++){const d=(i+.5)*step,x=ax+ux*d,y=ay+uy*d;segs.push(x-ux*skew-uy*flank,y-uy*skew+ux*flank,x+ux*skew+uy*flank,y+uy*skew-ux*flank);}
  return segs;
}
export type FabricPattern='linen'|'solid'|'plain'|'gauze'|'knit'|'rib'|'fleece'|'terry'|'twill';
// Light baby-fabric colours so thread stays readable; period is the texture repeat in mm.
/** @test */ export const fabricLooks:Record<Fabric,{base:string;yarn:string;pattern:FabricPattern;period:number}>={
  woven:{base:'#f7f2e6',yarn:'#d9ccb2',pattern:'plain',period:.5},
  gauze:{base:'#f4eddc',yarn:'#d3c5a6',pattern:'gauze',period:.9},
  jersey:{base:'#eef0f1',yarn:'#c4c9cf',pattern:'knit',period:.9},
  rib:{base:'#f1eef3',yarn:'#cbc3d2',pattern:'rib',period:1.6},
  fleece:{base:'#f5ebe6',yarn:'#ddc8bd',pattern:'fleece',period:3},
  terry:{base:'#f8f6ef',yarn:'#d8d1bd',pattern:'terry',period:1.2},
  denim:{base:'#b4c3d6',yarn:'#8197b4',pattern:'twill',period:.7},
};

export function backgroundLook(fabric:Fabric,background?:CanvasBackground){
  if(!background)return fabricLooks[fabric];
  const patterns:Record<CanvasBackground['textile'],{pattern:FabricPattern;period:number}>={plain:{pattern:'solid',period:1},linen:{pattern:'linen',period:8},cotton:{pattern:'plain',period:.5},gauze:{pattern:'gauze',period:.9},rib:{pattern:'rib',period:1.6},denim:{pattern:'twill',period:.7},jersey:{pattern:'knit',period:.9},felt:{pattern:'fleece',period:3},terry:{pattern:'terry',period:1.2}};
  return {...patterns[background.textile],base:background.color,yarn:hex(mix(rgb(background.color),[0,0,0],.45))};
}
// Shared tile for SVG editing and Canvas thread views; no external image requests.
export function backgroundTile(fabric:Fabric,background?:CanvasBackground){const look=backgroundLook(fabric,background);return {src:tile(look.pattern,look.yarn,128).toDataURL(),period:look.period};}

type Ctx=CanvasRenderingContext2D;
const tiles=new Map<string,HTMLCanvasElement>();
function tile(pattern:FabricPattern,yarn:string,size:number){
  const key=`${pattern}${yarn}${size}`;let t=tiles.get(key);if(t)return t;
  t=document.createElement('canvas');t.width=t.height=size;const c=t.getContext('2d')!,s=size,[r,g,b]=rgb(yarn),y=(a:number)=>`rgba(${r},${g},${b},${a})`,light='rgba(255,255,255,.55)';
  c.lineCap='round';
  if(pattern==='solid')return t;
  if(pattern==='linen'){
    // Uneven flax yarns, seeded slubs and fine fibres in a seamless 8 mm tile.
    let seed=19;const rand=()=>(seed=seed*16807%2147483647)/2147483647;
    for(let axis=0;axis<2;axis++){c.save();if(axis)c.transform(0,1,1,0,0,0);
      for(let i=0;i<32;i++){const x=i*s/32,w=s/32*(.55+rand()*.35);c.fillStyle=y(.35);c.fillRect(x,0,w,s);c.fillStyle='rgba(255,255,255,.18)';c.fillRect(x,0,w*.3,s);
        for(let j=0;j<12;j++){const yy=rand()*s;c.fillStyle=j%2?y(.18):'rgba(255,255,255,.16)';c.fillRect(x,yy,w,s*(.015+rand()*.07));}}c.restore();}
  }else if(pattern==='plain'){
    // Plain weave: each yarn passes over one and under the next, so every cell shows a short
    // rounded float, weft and warp alternating; the float dips out of sight at both ends.
    const h=s/2,yarn=(x:number,yy:number,across:boolean)=>{
      const g=across?c.createLinearGradient(0,yy,0,yy+h):c.createLinearGradient(x,0,x+h,0);
      g.addColorStop(0,y(.5));g.addColorStop(.3,'rgba(255,255,255,.5)');g.addColorStop(.55,'rgba(255,255,255,.15)');g.addColorStop(1,y(.62));
      c.fillStyle=g;c.fillRect(x,yy,h,h);
      const e=across?c.createLinearGradient(x,0,x+h,0):c.createLinearGradient(0,yy,0,yy+h);
      e.addColorStop(0,y(.5));e.addColorStop(.22,y(0));e.addColorStop(.78,y(0));e.addColorStop(1,y(.5));
      c.fillStyle=e;c.fillRect(x,yy,h,h);
    };
    for(let i=0;i<2;i++)for(let j=0;j<2;j++)yarn(i*h,j*h,(i+j)%2===0);
  }
  else if(pattern==='gauze'){c.fillStyle=y(.45);c.fillRect(0,0,s,s);c.fillStyle='rgba(255,255,255,.75)';c.fillRect(0,s*.08,s,s*.5);c.fillRect(s*.08,0,s*.5,s);}
  else if(pattern==='knit'||pattern==='rib'){
    const cols=pattern==='rib'?2:1,w=s/cols;
    for(let k=0;k<cols;k++){const x=k*w;if(pattern==='rib'&&k){c.fillStyle=y(.35);c.fillRect(x,0,w,s);}
      for(const yy of pattern==='rib'?[0,s/2]:[0]){const h=pattern==='rib'?s/2:s;c.strokeStyle=y(.6);c.lineWidth=w*.16;c.beginPath();c.moveTo(x+w*.12,yy+h*.1);c.lineTo(x+w/2,yy+h*.85);c.lineTo(x+w*.88,yy+h*.1);c.stroke();c.strokeStyle=light;c.lineWidth=w*.08;c.beginPath();c.moveTo(x+w*.18,yy+h*.12);c.lineTo(x+w/2,yy+h*.7);c.stroke();}}
  }else if(pattern==='fleece'){let seed=7;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
    for(let i=0;i<220;i++){const x=rand()*s,yy=rand()*s,rad=s*(.01+rand()*.035);c.fillStyle=i%3?y(.18):'rgba(255,255,255,.5)';for(const [ox,oy] of [[0,0],[s,0],[0,s],[s,s],[-s,0],[0,-s]]){c.beginPath();c.arc(x+ox,yy+oy,rad,0,7);c.fill();}}}
  else if(pattern==='terry'){for(const [x,yy] of [[s/4,s/4],[s*.75,s*.75],[s*.75,-s/4],[s/4,s*1.25],[-s/4,s*.75],[s*1.25,s/4]]){c.strokeStyle=y(.55);c.lineWidth=s*.07;c.beginPath();c.arc(x,yy,s*.16,0,7);c.stroke();c.strokeStyle=light;c.lineWidth=s*.04;c.beginPath();c.arc(x,yy,s*.16,3.4,4.9);c.stroke();}}
  else{c.lineWidth=s*.22;for(let i=-1;i<3;i++){c.strokeStyle=y(.5);c.beginPath();c.moveTo(i*s/2,s);c.lineTo(i*s/2+s,0);c.stroke();}c.lineWidth=s*.06;c.strokeStyle='rgba(255,255,255,.4)';for(let i=-1;i<3;i++){c.beginPath();c.moveTo(i*s/2-s*.06,s);c.lineTo(i*s/2+s-s*.06,0);c.stroke();}}
  if(tiles.size>=64)tiles.delete(tiles.keys().next().value!);
  tiles.set(key,t);return t;
}
function roundRect(c:Ctx,x:number,y:number,w:number,h:number,r:number){c.beginPath();c.roundRect(x,y,w,h,r);}
// Workspace, hoop frame and textured fabric; ctx is already in mm with pxPerMm device pixels per mm.
export function drawFabric(c:Ctx,fabric:Fabric,hoop:{width:number;height:number},pxPerMm:number,view:[number,number,number,number],background?:CanvasBackground){
  const look=backgroundLook(fabric,background),{width:w,height:h}=hoop,theme=getComputedStyle(c.canvas);
  c.fillStyle=theme.getPropertyValue('--bg-workspace').trim();c.fillRect(view[0],view[1],view[2]-view[0],view[3]-view[1]);
  c.save();c.shadowColor=theme.getPropertyValue('--hoop-shadow').trim();c.shadowBlur=1.5*pxPerMm;c.shadowOffsetY=.6*pxPerMm;roundRect(c,-2.4,-2.4,w+4.8,h+4.8,5);c.fillStyle=theme.getPropertyValue('--hoop-rim').trim();c.fill();c.restore();
  roundRect(c,0,0,w,h,3);c.fillStyle=look.base;c.fill();
  c.save();c.clip();
  drawFabricTexture(c,fabric,pxPerMm,[Math.max(0,view[0]),Math.max(0,view[1]),Math.min(w,view[2]),Math.min(h,view[3])],background);
  c.lineWidth=1.6;c.strokeStyle='rgba(90,75,50,.08)';roundRect(c,0,0,w,h,3);c.stroke();c.restore();
  c.lineWidth=.35;c.strokeStyle=theme.getPropertyValue('--hoop-border').trim();roundRect(c,0,0,w,h,3);c.stroke();
}
const segmentKey=(k:Command)=>{const a=`${Math.round(k.fromX*20)},${Math.round(k.fromY*20)}`,b=`${Math.round(k.x*20)},${Math.round(k.y*20)}`;return a<b?`${a}:${b}`:`${b}:${a}`;};
const widthCache=new WeakMap<Command[],Float32Array>(),repeatCache=new WeakMap<Command[],Uint8Array>();
// Count undirected 0.05 mm segments per colour block; collapse repeats only within a paint batch.
/** @test */ export function passWidths(commands:Command[]){
  let widths=widthCache.get(commands);if(widths)return widths;
  widths=new Float32Array(commands.length).fill(1);const repeats=new Uint8Array(commands.length),breaks=batchBreaks(commands),counts=new Map<string,number[]>(),seen=new Set<string>();let block=-1;
  const flush=()=>{for(const indices of counts.values()){const m=indices.length>=3?1.5:indices.length===2?1.3:1;for(const i of indices)widths![i]=m;}counts.clear();};
  commands.forEach((k,i)=>{if(k.type!=='stitch')return;if(k.block!==block){flush();block=k.block;}if(breaks[i])seen.clear();if(Math.hypot(k.x-k.fromX,k.y-k.fromY)<.1)return;
    const key=segmentKey(k),indices=counts.get(key);if(indices)indices.push(i);else counts.set(key,[i]);repeats[i]=seen.has(key)?1:0;seen.add(key);});
  flush();widthCache.set(commands,widths);repeatCache.set(commands,repeats);return widths;
}
const orient=(ax:number,ay:number,bx:number,by:number,cx:number,cy:number)=>(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
const opposite=(p:number,q:number)=>(p>1e-9&&q<-1e-9)||(p<-1e-9&&q>1e-9);
// Two stitches cross strictly; sharing a needle hole or running alongside is not a crossing.
/** @test */ export function crosses(ax:number,ay:number,bx:number,by:number,cx:number,cy:number,dx:number,dy:number){
  return opposite(orient(cx,cy,dx,dy,ax,ay),orient(cx,cy,dx,dy,bx,by))&&opposite(orient(ax,ay,bx,by,cx,cy),orient(ax,ay,bx,by,dx,dy));
}
// Stitches of one thread share a stroke per shading pass until one crosses
// a stitch already in the batch, e.g. satin over its centre walk: then the batch is painted first so
// the later stitch lies on top. add() returns false when the caller must flush.
/** @test */ export function stitchBatch(limit=240){
  const segs:number[]=[],box=new Float64Array(limit*4);
  return {segs,clear(){segs.length=0;},add(ax:number,ay:number,bx:number,by:number){
    const n=segs.length/4;if(n>=limit)return false;
    const x0=Math.min(ax,bx),x1=Math.max(ax,bx),y0=Math.min(ay,by),y1=Math.max(ay,by);
    for(let j=0;j<n;j++){const b=j*4;if(box[b]>x1||box[b+2]<x0||box[b+1]>y1||box[b+3]<y0)continue;if(crosses(ax,ay,bx,by,segs[b],segs[b+1],segs[b+2],segs[b+3]))return false;}
    box[n*4]=x0;box[n*4+1]=y0;box[n*4+2]=x1;box[n*4+3]=y1;segs.push(ax,ay,bx,by);return true;}};
}
// Batch starts per command (1 = paint what came before first); independent of the view, so cached.
const breakCache=new WeakMap<Command[],Uint8Array>();
/** @test */ export function batchBreaks(commands:Command[]){
  let breaks=breakCache.get(commands);if(breaks)return breaks;
  breaks=new Uint8Array(commands.length);const batch=stitchBatch();let block=-1;
  commands.forEach((k,i)=>{if(k.type!=='stitch')return;if(k.block!==block||!batch.add(k.fromX,k.fromY,k.x,k.y)){breaks![i]=1;block=k.block;batch.clear();batch.add(k.fromX,k.fromY,k.x,k.y);}});
  breakCache.set(commands,breaks);return breaks;
}
// Sews commands [from, to) in order, batch by batch; later batches paint over earlier ones, so later
// stitches lie on top. Jumps are not drawn.
export function drawThreads(c:Ctx,commands:Command[],shades:ReturnType<typeof threadShades>[],from:number,to:number,style:ThreadStyle,view:[number,number,number,number]){
  const breaks=batchBreaks(commands),widths=passWidths(commands),repeats=repeatCache.get(commands)!,levels=style.detail?6:3,buckets:number[][]=Array.from({length:3*levels},()=>[]),active:number[]=[],multipliers=[1.5,1.3,1],[x0,y0,x1,y1]=view,m=style.width*1.5;let block=-1,fresh=false;
  c.lineCap='butt';c.lineJoin='round';
  // Inner passes get round caps pulled back by half their width, so tones blend instead of banding
  // and no cap pokes past a needle hole.
  const pass=(segs:number[],colour:string,width:number,t=0)=>{const round=t>0;c.lineCap=round?'round':'butt';c.strokeStyle=colour;c.lineWidth=width;c.beginPath();for(let j=0;j<segs.length;j+=4){const s=round?roundInset(segs[j],segs[j+1],segs[j+2],segs[j+3],t,width/2):holeInset(segs[j],segs[j+1],segs[j+2],segs[j+3],t);if(s){c.moveTo(s[0],s[1]);c.lineTo(s[2],s[3]);}}c.stroke();};
  const flush=()=>{
    if(!active.length)return;const variants=shades[block]&&lustreShades(shades[block].body,levels);
    for(const b of active.sort((a,b)=>a-b)){const segs=buckets[b],scale=multipliers[Math.floor(b/levels)],width=style.width*scale,shade=variants?.[b%levels];if(shade){
      pass(segs,shade.end,style.detail?width*.86:width);
      if(!style.detail)pass(segs,shade.body,width,.5);
      else{pass(segs,shade.mid,width,.35);pass(segs,shade.edge,width,.75);pass(segs,shade.body,style.body*scale,.75);c.strokeStyle=shade.sheen;c.lineWidth=style.sheen*scale;c.beginPath();
        for(let j=0;j<segs.length;j+=4){const s=sheenSegment(segs[j],segs[j+1],segs[j+2],segs[j+3],width);if(s){c.moveTo(s[0],s[1]);c.lineTo(s[2],s[3]);}}c.stroke();
        if(style.detail===2){c.lineCap='butt';c.strokeStyle=shade.groove;c.lineWidth=width*.15;c.beginPath();
          for(let j=0;j<segs.length;j+=4){const grooves=plyGrooves(segs[j],segs[j+1],segs[j+2],segs[j+3],width,.7);for(let k=0;k<grooves.length;k+=4){c.moveTo(grooves[k],grooves[k+1]);c.lineTo(grooves[k+2],grooves[k+3]);}}c.stroke();}}}
      segs.length=0;}active.length=0;
  };
  for(let i=from;i<to;i++){
    const k=commands[i];if(k.type!=='stitch')continue;if(breaks[i])fresh=true;if(repeats[i])continue;
    if(Math.max(k.x,k.fromX)<x0-m||Math.min(k.x,k.fromX)>x1+m||Math.max(k.y,k.fromY)<y0-m||Math.min(k.y,k.fromY)>y1+m)continue;
    if(fresh||k.block!==block){flush();block=k.block;fresh=false;}
    const b=(widths[i]>1.4?0:widths[i]>1?1:2)*levels+Math.round(lustre(k.fromX,k.fromY,k.x,k.y)*(levels-1));if(!buckets[b].length)active.push(b);buckets[b].push(k.fromX,k.fromY,k.x,k.y);
  }
  flush();
}

// Fabric-only painting for mock-ups; shares the realistic view texture without the hoop frame.
export function drawFabricTexture(c:Ctx,fabric:Fabric,pxPerMm:number,view:[number,number,number,number],background?:CanvasBackground){
  const look=backgroundLook(fabric,background);c.fillStyle=look.base;c.fillRect(view[0],view[1],view[2]-view[0],view[3]-view[1]);
  const px=look.period*pxPerMm;
  if(px>=8){const size=Math.min(128,Math.max(16,Math.round(px/8)*8)),p=c.createPattern(tile(look.pattern,look.yarn,size),'repeat')!;p.setTransform(new DOMMatrix([look.period/size,0,0,look.period/size,0,0]));c.globalAlpha=Math.min(.75,(px-8)/10+.3);c.fillStyle=p;c.fillRect(view[0],view[1],view[2]-view[0],view[3]-view[1]);c.globalAlpha=1;}
}
