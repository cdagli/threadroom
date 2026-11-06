import type {Point, RefImage} from './project';
import {imageToWorld} from './images';

// Click to stitch (Ember's guided digitizing): flood-fill the clicked colour of a reference image's
// original pixels at a working resolution, trace the region's pixel boundary (holes kept), simplify it
// and map it to millimetres. Pure maths on RGBA buffers; the studio supplies decoded pixels.
export type Pixels={width:number;height:number;data:ArrayLike<number>};
export type Region={mask:Uint8Array;width:number;height:number;count:number;box:[number,number,number,number];color:string};
export const workingSize=480;
export const toleranceLimits=[1,60] as const,defaultTolerance=12;

// Box-average down to at most maxSide pixels on the long side. RGB is alpha-weighted so transparent
// pixels don't darken edges; images already small enough are returned as they are.
export function downsample(src:Pixels,maxSide=workingSize):Pixels{
  const {width:w,height:h,data}=src,f=Math.max(w,h)/maxSide;if(f<=1)return src;
  const W=Math.max(1,Math.round(w/f)),H=Math.max(1,Math.round(h/f)),out=new Uint8ClampedArray(W*H*4);
  for(let Y=0;Y<H;Y++){const y0=Math.floor(Y*h/H),y1=Math.max(y0+1,Math.floor((Y+1)*h/H));
    for(let X=0;X<W;X++){const x0=Math.floor(X*w/W),x1=Math.max(x0+1,Math.floor((X+1)*w/W));let r=0,g=0,b=0,a=0,n=0;
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*w+x)*4,al=data[i+3];r+=data[i]*al;g+=data[i+1]*al;b+=data[i+2]*al;a+=al;n++;}
      const o=(Y*W+X)*4;if(a){out[o]=r/a;out[o+1]=g/a;out[o+2]=b/a;}out[o+3]=a/n;}}
  return {width:W,height:H,data:out};
}
const hex=(r:number,g:number,b:number)=>'#'+[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
// 4-connected pixels within tolerance (0–100 % of the RGB cube diagonal) of the seed colour: the
// clicked pixel averaged with its 3 × 3 neighbours that are themselves within tolerance (noise, not
// edges). Pixels under half alpha never join. Null on a transparent seed.
export function floodRegion(px:Pixels,x:number,y:number,tolerance:number):Region|null{
  const {width:w,height:h,data}=px;x=Math.floor(x);y=Math.floor(y);if(!(x>=0&&y>=0&&x<w&&y<h))return null;
  const limit=(Math.max(0,tolerance)/100*441.673)**2,c=(y*w+x)*4;if(data[c+3]<128)return null;
  let sr=0,sg=0,sb=0,n=0;
  for(let j=Math.max(0,y-1);j<=Math.min(h-1,y+1);j++)for(let i=Math.max(0,x-1);i<=Math.min(w-1,x+1);i++){const k=(j*w+i)*4;if(data[k+3]<128||(data[k]-data[c])**2+(data[k+1]-data[c+1])**2+(data[k+2]-data[c+2])**2>limit)continue;sr+=data[k];sg+=data[k+1];sb+=data[k+2];n++;}
  sr/=n;sg/=n;sb/=n;
  const mask=new Uint8Array(w*h),queue=new Int32Array(w*h);
  const near=(i:number)=>{const k=i*4;if(data[k+3]<128)return false;const dr=data[k]-sr,dg=data[k+1]-sg,db=data[k+2]-sb;return dr*dr+dg*dg+db*db<=limit;};
  let head=0,tail=0,count=0,x0=x,y0=y,x1=x,y1=y,r=0,g=0,b=0;const seed=y*w+x;
  // The seed itself always belongs, even when it differs from its neighbourhood average.
  mask[seed]=1;queue[tail++]=seed;
  while(head<tail){
    const i=queue[head++],cx=i%w,cy=(i-cx)/w,k=i*4;count++;r+=data[k];g+=data[k+1];b+=data[k+2];
    if(cx<x0)x0=cx;if(cx>x1)x1=cx;if(cy<y0)y0=cy;if(cy>y1)y1=cy;
    if(cx>0&&!mask[i-1]&&near(i-1)){mask[i-1]=1;queue[tail++]=i-1;}
    if(cx<w-1&&!mask[i+1]&&near(i+1)){mask[i+1]=1;queue[tail++]=i+1;}
    if(cy>0&&!mask[i-w]&&near(i-w)){mask[i-w]=1;queue[tail++]=i-w;}
    if(cy<h-1&&!mask[i+w]&&near(i+w)){mask[i+w]=1;queue[tail++]=i+w;}
  }
  return {mask,width:w,height:h,count,box:[x0,y0,x1,y1],color:hex(r/count,g/count,b/count)};
}
// Fills enclosed holes smaller than maxArea pixels (JPEG speckle, anti-aliased dots); returns how many.
export function fillSmallHoles(region:Region,maxArea:number):number{
  const {mask,width:w,box:[x0,y0,x1,y1]}=region,seen=new Uint8Array(mask.length),queue:number[]=[];let filled=0;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const start=y*w+x;if(mask[start]||seen[start])continue;
    queue.length=0;queue.push(start);seen[start]=1;let edge=false;
    for(let h=0;h<queue.length;h++){const i=queue[h],cx=i%w,cy=(i-cx)/w;if(cx===x0||cx===x1||cy===y0||cy===y1)edge=true;
      const visit=(j:number)=>{if(!mask[j]&&!seen[j]){seen[j]=1;queue.push(j);}};
      if(cx>x0)visit(i-1);if(cx<x1)visit(i+1);if(cy>y0)visit(i-w);if(cy<y1)visit(i+w);}
    // Anything touching the bounding box edge reaches the outside, so it is not a hole.
    if(!edge&&queue.length<maxArea){for(const i of queue)mask[i]=1;region.count+=queue.length;filled++;}
  }
  return filled;
}
const dx=[1,0,-1,0],dy=[0,1,0,-1];
// Pixel-corner boundary loops with the region on the right (y down): outer rings run clockwise on
// screen, holes the other way. Where the region touches itself diagonally the walk turns right first,
// so loops meet at that corner instead of crossing. Only direction changes are kept.
export function traceRegion(region:Region):Point[][]{
  const {mask,width:w,height:h,box:[x0,y0,x1,y1]}=region,W=w+1,out=new Int8Array(W*(h+1)*2).fill(-1);
  const inside=(x:number,y:number)=>x>=0&&y>=0&&x<w&&y<h&&mask[y*w+x]===1;
  const add=(x:number,y:number,d:number)=>{const c=(y*W+x)*2;out[out[c]<0?c:c+1]=d;};
  const starts:number[]=[];
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){if(!inside(x,y))continue;
    if(!inside(x,y-1)){add(x,y,0);starts.push(y*W+x);}
    if(!inside(x+1,y))add(x+1,y,1);
    if(!inside(x,y+1))add(x+1,y+1,2);
    if(!inside(x-1,y))add(x,y+1,3);
  }
  const take=(c:number,prefer:number[])=>{for(const d of prefer){if(out[c*2]===d){out[c*2]=out[c*2+1];out[c*2+1]=-1;return d;}if(out[c*2+1]===d){out[c*2+1]=-1;return d;}}return -1;};
  const rings:Point[][]=[];
  for(const start of starts){
    let c=start,d=take(c,[0]);if(d<0)continue;const ring:Point[]=[];let prev=-1,guard=out.length;
    do{
      if(d!==prev)ring.push([c%W,Math.floor(c/W)]);prev=d;
      c+=dx[d]+dy[d]*W;if(c===start)break;
      d=take(c,[(d+1)%4,d,(d+3)%4]);
    }while(d>=0&&--guard>0);
    if(prev===0&&ring.length>1)ring.shift();// the start corner lies on the closing straight run
    if(ring.length>=3)rings.push(ring);
  }
  return rings;
}
export const ringArea=(r:Point[])=>{let a=0;for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length];a+=p[0]*q[1]-q[0]*p[1];}return a/2;};
function rdp(pts:Point[],a:number,b:number,eps:number,keep:Uint8Array){
  let best=-1,far=0;const [ax,ay]=pts[a],[bx,by]=pts[b],len=Math.hypot(bx-ax,by-ay);
  for(let i=a+1;i<b;i++){const [px,py]=pts[i],d=len?Math.abs((bx-ax)*(ay-py)-(ax-px)*(by-ay))/len:Math.hypot(px-ax,py-ay);if(d>far){far=d;best=i;}}
  if(best>=0&&far>eps){keep[best]=1;rdp(pts,a,best,eps,keep);rdp(pts,best,b,eps,keep);}
}
// Douglas–Peucker on a closed ring, split at the point farthest from the first.
export function simplifyRing(ring:Point[],eps:number):Point[]{
  if(ring.length<4)return ring;
  let far=0,split=0;ring.forEach((p,i)=>{const d=Math.hypot(p[0]-ring[0][0],p[1]-ring[0][1]);if(d>far){far=d;split=i;}});
  const pts=[...ring,ring[0]],keep=new Uint8Array(pts.length);keep[0]=keep[split]=keep[pts.length-1]=1;
  rdp(pts,0,split,eps,keep);rdp(pts,split,pts.length-1,eps,keep);
  const result=pts.slice(0,-1).filter((_,i)=>keep[i]);
  if(result.length>=3&&Math.abs(ringArea(result))>1e-10)return result;
  // Keep a third, non-collinear vertex when a large tolerance removes both arcs.
  let third=-1,area=0;for(let i=1;i<ring.length;i++){const a=Math.abs(ringArea([ring[0],ring[split],ring[i]]));if(a>area){area=a;third=i;}}
  return third<0?ring:[0,split,third].sort((a,b)=>a-b).map(i=>ring[i]);
}
// Outer ring first, then holes, each larger than minArea px²; simplification coarsens until the
// region fits maxPoints.
export function regionRings(region:Region,{eps=.8,minArea=2,maxPoints=2000}={}):Point[][]{
  const raw=traceRegion(region).filter(r=>Math.abs(ringArea(r))>=minArea).sort((a,b)=>Math.abs(ringArea(b))-Math.abs(ringArea(a)));
  for(let e=eps,step=0;step<8;step++,e*=1.6){
    const rings=raw.map(r=>simplifyRing(r,e)).filter(r=>r.length>=3&&Math.abs(ringArea(r))>=minArea);
    if(rings.reduce((n,r)=>n+r.length,0)<=maxPoints||step===7)return rings;
  }
  return [];
}
export type ClickResult={rings:Point[][];color:string;pixels:number};
// p is a point in the image's unrotated frame (mm); the result is in canvas millimetres.
export function clickToStitch(px:Pixels,image:Pick<RefImage,'x'|'y'|'width'|'height'|'rotation'>,p:Point,tolerance:number,opts:{minPixels?:number;maxPoints?:number}={}):ClickResult|null{
  const u=(p[0]-image.x)/image.width,v=(p[1]-image.y)/image.height;if(!(u>=0&&v>=0&&u<=1&&v<=1))return null;
  const region=floodRegion(px,Math.min(px.width-1,u*px.width),Math.min(px.height-1,v*px.height),tolerance);
  if(!region||region.count<(opts.minPixels??12))return null;
  fillSmallHoles(region,Math.max(6,region.count*.0015));
  const rings=regionRings(region,{maxPoints:opts.maxPoints});if(!rings.length)return null;
  return {rings:rings.map(r=>r.map(([x,y])=>imageToWorld(image,[x/px.width,y/px.height]))),color:region.color,pixels:region.count};
}
