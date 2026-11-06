import type {Point,RefImage} from './project';
import type {Pixels} from './click-to-stitch';
import {defaultTolerance,floodRegion,ringArea,simplifyRing,traceRegion} from './click-to-stitch';
import {imageBounds,toImageFrame} from './images';
import {maskComponents} from './mask-components';
import {findThreads} from './agent-tools';

type Box=[number,number,number,number];
const round=(n:number)=>Math.round(n*100)/100;
const boundsOf=(points:Point[]):Box=>{const b:Box=[Infinity,Infinity,-Infinity,-Infinity];for(const [x,y] of points){b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);}return b;};

// Grid boundaries are implicit closed rings (the first point is not repeated). Split-ring DP keeps
// both halves of the closing edge; never replace a valid ring with a line at high tolerances.
export function traceMask(mask:Uint8Array,width:number,height:number,{origin=[0,0],step=1,simplify=.3,largestOnly=true,holes=false,maxPoints=400,hoop}:{origin?:Point;step?:number;simplify?:number;largestOnly?:boolean;holes?:boolean;maxPoints?:number;hoop?:{width:number;height:number}}={}){
  const parts=maskComponents(mask,width),chosen=largestOnly?parts.slice(0,1):parts;
  const selected=new Uint8Array(mask.length);for(const part of chosen)for(const k of part)selected[k]=1;
  const raw=traceRegion({mask:selected,width,height,count:0,box:[0,0,width-1,height-1],color:''})
    .filter(r=>holes||ringArea(r)>0).sort((a,b)=>Math.abs(ringArea(b))-Math.abs(ringArea(a)))
    .map(r=>({hole:ringArea(r)<0,points:r.map(([x,y]):Point=>[round(Math.max(0,Math.min(hoop?.width??Infinity,origin[0]+x*step))),round(Math.max(0,Math.min(hoop?.height??Infinity,origin[1]+y*step)))])}))
    .filter(r=>Math.abs(ringArea(r.points))>0);
  if(raw.length*3>maxPoints)throw new Error('maxPoints is too small to retain all rings. Increase it or use largestOnly / holes:false.');
  const reduce=(eps:number)=>raw.map(r=>({...r,points:simplifyRing(r.points,eps)}));
  let result=reduce(simplify),eps=Math.max(.01,simplify);
  for(let n=0;result.reduce((s,r)=>s+r.points.length,0)>maxPoints&&n<40;n++){eps*=1.5;result=reduce(eps);}
  if(result.reduce((s,r)=>s+r.points.length,0)>maxPoints)throw new Error('Cannot simplify within maxPoints without collapsing a ring. Increase maxPoints.');
  const rings=result.map(r=>r.points),points=rings.flat();
  return {rings,ringTypes:result.map(r=>r.hole?'hole':'outer'),bounds:points.length?boundsOf(points):null,pointCounts:rings.map(r=>r.length),area:round(raw.reduce((n,r)=>n+ringArea(r.points),0))};
}

// Sample a hoop-aligned mm grid via the inverse placement transform, so rotation and clipping are
// applied before component selection and boundary tracing. Opacity is an editor display setting.
export function traceOutline(px:Pixels,image:RefImage,hoop:{width:number;height:number},{mode='alpha',point,tolerance=defaultTolerance,resolution=.25,simplify=.3,largestOnly=true,holes=false,maxPoints=400}:{mode?:'alpha'|'colour';point?:Point;tolerance?:number;resolution?:number;simplify?:number;largestOnly?:boolean;holes?:boolean;maxPoints?:number}={}){
  if(mode==='colour'&&!point)throw new Error('point is required for colour mode.');
  const b=imageBounds(image),x0=Math.max(0,b.x),y0=Math.max(0,b.y),x1=Math.min(hoop.width,b.x+b.width),y1=Math.min(hoop.height,b.y+b.height);
  if(x1<=x0||y1<=y0)return {rings:[],ringTypes:[],bounds:null,pointCounts:[],area:0};
  const width=Math.ceil((x1-x0)/resolution),height=Math.ceil((y1-y0)/resolution),data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at:Point=[x0+(x+.5)*resolution,y0+(y+.5)*resolution];
    if(at[0]>x1||at[1]>y1)continue;
    const p=toImageFrame(image,at),u=(p[0]-image.x)/image.width,v=(p[1]-image.y)/image.height;
    if(u<0||u>=1||v<0||v>=1)continue;
    const k=(Math.floor(v*px.height)*px.width+Math.floor(u*px.width))*4,o=(y*width+x)*4;
    for(let c=0;c<4;c++)data[o+c]=px.data[k+c];
    if(data[o+3]<=128)data[o+3]=0;
  }
  let mask:Uint8Array;
  if(mode==='colour')mask=floodRegion({width,height,data},(point![0]-x0)/resolution,(point![1]-y0)/resolution,tolerance)?.mask??new Uint8Array(width*height);
  else{mask=new Uint8Array(width*height);for(let k=0;k<mask.length;k++)mask[k]=data[k*4+3]>128?1:0;}
  return traceMask(mask,width,height,{origin:[x0,y0],step:resolution,simplify,largestOnly,holes,maxPoints,hoop});
}

// Circular mm neighbourhood in original pixels, alpha-weighted and independent of display opacity.
// A transparent/outside seed stays null rather than picking up a neighbouring opaque object.
export function sampleColors(px:Pixels,image:RefImage,points:Point[],radius=.5){
  return points.map(point=>{
    const p=toImageFrame(image,point),u=(p[0]-image.x)/image.width,v=(p[1]-image.y)/image.height;
    let color:string|null=null;
    if(u>=0&&u<1&&v>=0&&v<1){
      const cx=u*px.width,cy=v*px.height,ix=Math.floor(cx),iy=Math.floor(cy),sx=image.width/px.width,sy=image.height/px.height;
      if(px.data[(iy*px.width+ix)*4+3]){
        const sum=[0,0,0];let alpha=0;
        for(let y=Math.max(0,Math.floor(cy-radius/sy));y<=Math.min(px.height-1,Math.floor(cy+radius/sy));y++)for(let x=Math.max(0,Math.floor(cx-radius/sx));x<=Math.min(px.width-1,Math.floor(cx+radius/sx));x++){
          if((x!==ix||y!==iy)&&Math.hypot((x+.5-cx)*sx,(y+.5-cy)*sy)>radius)continue;
          const k=(y*px.width+x)*4,a=px.data[k+3];alpha+=a;for(let c=0;c<3;c++)sum[c]+=px.data[k+c]*a;
        }
        if(alpha)color='#'+sum.map(n=>Math.round(n/alpha).toString(16).padStart(2,'0')).join('');
      }
    }
    const matches=color?findThreads({color,limit:1}):null;
    return {point,color,nearest:matches&&'threads' in matches?matches.threads[0]:null};
  });
}

// Leave room for axis labels while preserving one scale on both axes.
export function referenceMapping(image:RefImage,region:Box|undefined,size=768,grid?:number){
  const b=imageBounds(image),box:Box=region??[b.x,b.y,b.x+b.width,b.y+b.height],w=box[2]-box[0],h=box[3]-box[1];
  if(!(w>0&&h>0))throw new Error('region must be [x0,y0,x1,y1] with positive width and height.');
  const margin=36,span=Math.max(w,h),scale=(size-margin*2)/span;
  const step=grid??(span<=25?1:span<=80?5:10);
  // Dense custom grids cannot be meaningfully displayed and would block the browser.
  if(w/step+h/step>2000)throw new Error('grid is too small for this region. Use a larger mm step.');
  return {region:box,scale,margin,width:Math.round(w*scale)+margin*2,height:Math.round(h*scale)+margin*2,grid:step,major:step*(step<1?10:step<5?5:step<10?2:1)};
}
