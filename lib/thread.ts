import type {Command, Fabric} from './project';
// Thread preview: each sewn stitch is a lit cylinder about 0.4 mm wide (40 wt embroidery thread).
export const threadWidth=.4;
type RGB=[number,number,number];
export function rgb(colour:string):RGB{
  let h=colour.replace('#','');if(h.length===3)h=[...h].map(c=>c+c).join('');
  return [0,2,4].map(i=>{const v=parseInt(h.slice(i,i+2),16);return Number.isFinite(v)?v:0;}) as RGB;
}
const hex=(c:RGB)=>'#'+c.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
const mix=(a:RGB,b:RGB,t:number)=>a.map((v,i)=>v+(b[i]-v)*t) as RGB;
export function luminance(colour:string){const [r,g,b]=rgb(colour).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;}
// Dark flanks (edge), the dyed body and a specular sheen along the thread; dark threads get a stronger sheen.
export function threadShades(colour:string){
  const c=rgb(colour),l=luminance(colour);
  return {edge:hex(mix(c,[20,14,8],l>.5?.24:.34)),body:hex(c),sheen:hex(mix(c,[255,255,255],.22+.26*(1-l)))};
}
export type ThreadStyle={width:number;body:number;sheen:number;shadow:[number,number];detail:0|1|2};
// Sizes in mm for a zoom of pxPerMm device pixels per mm. Below ~1.4 px a thread has no visible
// shading, so detail drops to a flat stroke at least 0.7 px wide; shadows stay at least 0.6 px.
export function threadStyle(pxPerMm:number):ThreadStyle{
  const px=threadWidth*pxPerMm,width=Math.max(.7,px)/pxPerMm,off=Math.max(.06,.6/pxPerMm);
  return {width,body:width*.74,sheen:width*(px>=3.5?.22:.28),shadow:[off*.7,off],detail:px<1.4?0:px<3.5?1:2};
}
// The sheen sits on the lit side (light from the top left) and stops short of both needle holes.
export function sheenSegment(ax:number,ay:number,bx:number,by:number,width:number):[number,number,number,number]|null{
  const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);if(len<width*.9)return null;
  let nx=-dy/len,ny=dx/len;if(nx+ny>0){nx=-nx;ny=-ny;}
  const inset=Math.min(len*.3,width*.55),ux=dx/len*inset,uy=dy/len*inset,o=width*.12;
  return [ax+ux+nx*o,ay+uy+ny*o,bx-ux+nx*o,by-uy+ny*o];
}
export type FabricPattern='plain'|'gauze'|'knit'|'rib'|'fleece'|'terry'|'twill';
// Light baby-fabric colours so thread stays readable; period is the texture repeat in mm.
export const fabricLooks:Record<Fabric,{base:string;yarn:string;pattern:FabricPattern;period:number}>={
  woven:{base:'#f7f2e6',yarn:'#d9ccb2',pattern:'plain',period:.5},
  gauze:{base:'#f4eddc',yarn:'#d3c5a6',pattern:'gauze',period:.9},
  jersey:{base:'#eef0f1',yarn:'#c4c9cf',pattern:'knit',period:.9},
  rib:{base:'#f1eef3',yarn:'#cbc3d2',pattern:'rib',period:1.6},
  fleece:{base:'#f5ebe6',yarn:'#ddc8bd',pattern:'fleece',period:3},
  terry:{base:'#f8f6ef',yarn:'#d8d1bd',pattern:'terry',period:1.2},
  denim:{base:'#b4c3d6',yarn:'#8197b4',pattern:'twill',period:.7},
};

type Ctx=CanvasRenderingContext2D;
const tiles=new Map<string,HTMLCanvasElement>();
function tile(pattern:FabricPattern,yarn:string,size:number){
  const key=`${pattern}${yarn}${size}`;let t=tiles.get(key);if(t)return t;
  t=document.createElement('canvas');t.width=t.height=size;const c=t.getContext('2d')!,s=size,[r,g,b]=rgb(yarn),y=(a:number)=>`rgba(${r},${g},${b},${a})`,light='rgba(255,255,255,.55)';
  c.lineCap='round';
  if(pattern==='plain'){for(let i=0;i<2;i++)for(let j=0;j<2;j++){const x=i*s/2,yy=j*s/2,h=(i+j)%2===0;c.fillStyle=y(.35);c.fillRect(x+(h?0:s/8),yy+(h?s/8:0),h?s/2:s/4,h?s/4:s/2);c.fillStyle=light;c.fillRect(x+(h?s/16:s/8),yy+(h?s/8:s/16),h?s*.36:s/12,h?s/12:s*.36);}}
  else if(pattern==='gauze'){c.fillStyle=y(.45);c.fillRect(0,0,s,s);c.fillStyle='rgba(255,255,255,.75)';c.fillRect(0,s*.08,s,s*.5);c.fillRect(s*.08,0,s*.5,s);}
  else if(pattern==='knit'||pattern==='rib'){
    const cols=pattern==='rib'?2:1,w=s/cols;
    for(let k=0;k<cols;k++){const x=k*w;if(pattern==='rib'&&k){c.fillStyle=y(.35);c.fillRect(x,0,w,s);}
      for(const yy of pattern==='rib'?[0,s/2]:[0]){const h=pattern==='rib'?s/2:s;c.strokeStyle=y(.6);c.lineWidth=w*.16;c.beginPath();c.moveTo(x+w*.12,yy+h*.1);c.lineTo(x+w/2,yy+h*.85);c.lineTo(x+w*.88,yy+h*.1);c.stroke();c.strokeStyle=light;c.lineWidth=w*.08;c.beginPath();c.moveTo(x+w*.18,yy+h*.12);c.lineTo(x+w/2,yy+h*.7);c.stroke();}}
  }else if(pattern==='fleece'){let seed=7;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
    for(let i=0;i<220;i++){const x=rand()*s,yy=rand()*s,rad=s*(.01+rand()*.035);c.fillStyle=i%3?y(.18):'rgba(255,255,255,.5)';for(const [ox,oy] of [[0,0],[s,0],[0,s],[s,s],[-s,0],[0,-s]]){c.beginPath();c.arc(x+ox,yy+oy,rad,0,7);c.fill();}}}
  else if(pattern==='terry'){for(const [x,yy] of [[s/4,s/4],[s*.75,s*.75],[s*.75,-s/4],[s/4,s*1.25],[-s/4,s*.75],[s*1.25,s/4]]){c.strokeStyle=y(.55);c.lineWidth=s*.07;c.beginPath();c.arc(x,yy,s*.16,0,7);c.stroke();c.strokeStyle=light;c.lineWidth=s*.04;c.beginPath();c.arc(x,yy,s*.16,3.4,4.9);c.stroke();}}
  else{c.lineWidth=s*.22;for(let i=-1;i<3;i++){c.strokeStyle=y(.5);c.beginPath();c.moveTo(i*s/2,s);c.lineTo(i*s/2+s,0);c.stroke();}c.lineWidth=s*.06;c.strokeStyle='rgba(255,255,255,.4)';for(let i=-1;i<3;i++){c.beginPath();c.moveTo(i*s/2-s*.06,s);c.lineTo(i*s/2+s-s*.06,0);c.stroke();}}
  tiles.set(key,t);return t;
}
function roundRect(c:Ctx,x:number,y:number,w:number,h:number,r:number){c.beginPath();c.roundRect(x,y,w,h,r);}
// Workspace, hoop frame and textured fabric; ctx is already in mm with pxPerMm device pixels per mm.
export function drawFabric(c:Ctx,fabric:Fabric,hoop:{width:number;height:number},pxPerMm:number,view:[number,number,number,number]){
  const look=fabricLooks[fabric],{width:w,height:h}=hoop,theme=getComputedStyle(c.canvas);
  c.fillStyle=theme.getPropertyValue('--bg-workspace').trim();c.fillRect(view[0],view[1],view[2]-view[0],view[3]-view[1]);
  c.save();c.shadowColor=theme.getPropertyValue('--hoop-shadow').trim();c.shadowBlur=1.5*pxPerMm;c.shadowOffsetY=.6*pxPerMm;roundRect(c,-2.4,-2.4,w+4.8,h+4.8,5);c.fillStyle=theme.getPropertyValue('--hoop-rim').trim();c.fill();c.restore();
  roundRect(c,0,0,w,h,3);c.fillStyle=look.base;c.fill();
  c.save();c.clip();
  drawFabricTexture(c,fabric,pxPerMm,[Math.max(0,view[0]),Math.max(0,view[1]),Math.min(w,view[2]),Math.min(h,view[3])]);
  c.lineWidth=1.6;c.strokeStyle='rgba(90,75,50,.08)';roundRect(c,0,0,w,h,3);c.stroke();c.restore();
  c.lineWidth=.35;c.strokeStyle=theme.getPropertyValue('--hoop-border').trim();roundRect(c,0,0,w,h,3);c.stroke();
}
const orient=(ax:number,ay:number,bx:number,by:number,cx:number,cy:number)=>(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
const opposite=(p:number,q:number)=>(p>1e-9&&q<-1e-9)||(p<-1e-9&&q>1e-9);
// Two stitches cross strictly; sharing a needle hole or running alongside is not a crossing.
export function crosses(ax:number,ay:number,bx:number,by:number,cx:number,cy:number,dx:number,dy:number){
  return opposite(orient(cx,cy,dx,dy,ax,ay),orient(cx,cy,dx,dy,bx,by))&&opposite(orient(ax,ay,bx,by,cx,cy),orient(ax,ay,bx,by,dx,dy));
}
// Stitches of one thread share a stroke per shading pass (shadow, edge, body, sheen) until one crosses
// a stitch already in the batch, e.g. satin over its centre walk: then the batch is painted first so
// the later stitch lies on top. add() returns false when the caller must flush.
export function stitchBatch(limit=240){
  const segs:number[]=[],box=new Float64Array(limit*4);
  return {segs,clear(){segs.length=0;},add(ax:number,ay:number,bx:number,by:number){
    const n=segs.length/4;if(n>=limit)return false;
    const x0=Math.min(ax,bx),x1=Math.max(ax,bx),y0=Math.min(ay,by),y1=Math.max(ay,by);
    for(let j=0;j<n;j++){const b=j*4;if(box[b]>x1||box[b+2]<x0||box[b+1]>y1||box[b+3]<y0)continue;if(crosses(ax,ay,bx,by,segs[b],segs[b+1],segs[b+2],segs[b+3]))return false;}
    box[n*4]=x0;box[n*4+1]=y0;box[n*4+2]=x1;box[n*4+3]=y1;segs.push(ax,ay,bx,by);return true;}};
}
// Batch starts per command (1 = paint what came before first); independent of the view, so cached.
const breakCache=new WeakMap<Command[],Uint8Array>();
export function batchBreaks(commands:Command[]){
  let breaks=breakCache.get(commands);if(breaks)return breaks;
  breaks=new Uint8Array(commands.length);const batch=stitchBatch();let block=-1;
  commands.forEach((k,i)=>{if(k.type!=='stitch')return;if(k.block!==block||!batch.add(k.fromX,k.fromY,k.x,k.y)){breaks![i]=1;block=k.block;batch.clear();batch.add(k.fromX,k.fromY,k.x,k.y);}});
  breakCache.set(commands,breaks);return breaks;
}
// Sews commands [from, to) in order, batch by batch; later batches paint over earlier ones, so later
// stitches lie on top. Jumps are not drawn.
export function drawThreads(c:Ctx,commands:Command[],shades:ReturnType<typeof threadShades>[],from:number,to:number,style:ThreadStyle,view:[number,number,number,number]){
  const breaks=batchBreaks(commands),segs:number[]=[],[x0,y0,x1,y1]=view,m=style.width;let block=-1,fresh=false;
  c.lineCap='round';c.lineJoin='round';
  const pass=(colour:string,width:number,dx=0,dy=0)=>{c.strokeStyle=colour;c.lineWidth=width;c.beginPath();for(let j=0;j<segs.length;j+=4){c.moveTo(segs[j]+dx,segs[j+1]+dy);c.lineTo(segs[j+2]+dx,segs[j+3]+dy);}c.stroke();};
  const flush=()=>{
    const shade=shades[block];if(segs.length&&shade){
      pass('rgba(50,38,24,.22)',style.width*1.1,...style.shadow);
      if(!style.detail)pass(shade.body,style.width);
      else{pass(shade.edge,style.width);pass(shade.body,style.body);c.strokeStyle=shade.sheen;c.lineWidth=style.sheen;c.beginPath();
        for(let j=0;j<segs.length;j+=4){const s=sheenSegment(segs[j],segs[j+1],segs[j+2],segs[j+3],style.width);if(s){c.moveTo(s[0],s[1]);c.lineTo(s[2],s[3]);}}c.stroke();}}
    segs.length=0;
  };
  for(let i=from;i<to;i++){
    const k=commands[i];if(k.type!=='stitch')continue;if(breaks[i])fresh=true;
    if(Math.max(k.x,k.fromX)<x0-m||Math.min(k.x,k.fromX)>x1+m||Math.max(k.y,k.fromY)<y0-m||Math.min(k.y,k.fromY)>y1+m)continue;
    if(fresh||k.block!==block){flush();block=k.block;fresh=false;}
    segs.push(k.fromX,k.fromY,k.x,k.y);
  }
  flush();
}

// Fabric-only painting for mock-ups; shares the realistic view texture without the hoop frame.
export function drawFabricTexture(c:Ctx,fabric:Fabric,pxPerMm:number,view:[number,number,number,number]){
  const look=fabricLooks[fabric];c.fillStyle=look.base;c.fillRect(view[0],view[1],view[2]-view[0],view[3]-view[1]);
  const px=look.period*pxPerMm;
  if(px>=8){const size=Math.min(128,Math.max(16,Math.round(px/8)*8)),p=c.createPattern(tile(look.pattern,look.yarn,size),'repeat')!;p.setTransform(new DOMMatrix([look.period/size,0,0,look.period/size,0,0]));c.globalAlpha=Math.min(.75,(px-8)/10+.3);c.fillStyle=p;c.fillRect(view[0],view[1],view[2]-view[0],view[3]-view[1]);c.globalAlpha=1;}
}
