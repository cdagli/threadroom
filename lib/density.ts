import type {Command} from './project';
export type Density={x:number;y:number;cell:number;width:number;height:number;radius:number;values:Float32Array;max:number;penetrations:number};
// A disk count divided by its physical area. Sample a fixed world-space grid, including zero-length
// stitch destinations (stationary penetrations and ties), excluding all jump destinations.
// Resolution is bounded independently of stitch count and viewport; never recompute while navigating.
export function needleDensity(commands:readonly Command[],radius=1.5):Density{
  if(!Number.isFinite(radius)||radius<.25||radius>10)throw new RangeError('radius');
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,penetrations=0;
  for(const c of commands)if(c.type==='stitch'&&Number.isFinite(c.x)&&Number.isFinite(c.y)){x0=Math.min(x0,c.x);y0=Math.min(y0,c.y);x1=Math.max(x1,c.x);y1=Math.max(y1,c.y);penetrations++;}
  if(!penetrations)return {x:0,y:0,cell:.5,width:0,height:0,radius,values:new Float32Array(),max:0,penetrations:0};
  x0-=radius;y0-=radius;x1+=radius;y1+=radius;
  const cell=Math.max(.25,radius/3,(x1-x0)/1024,(y1-y0)/1024),width=Math.ceil((x1-x0)/cell),height=Math.ceil((y1-y0)/cell),counts=new Uint32Array(width*height),r2=radius*radius;
  for(const c of commands)if(c.type==='stitch'&&Number.isFinite(c.x)&&Number.isFinite(c.y)){
    const left=Math.max(0,Math.ceil((c.x-radius-x0)/cell-.5)),right=Math.min(width-1,Math.floor((c.x+radius-x0)/cell-.5)),top=Math.max(0,Math.ceil((c.y-radius-y0)/cell-.5)),bottom=Math.min(height-1,Math.floor((c.y+radius-y0)/cell-.5));
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)if((x0+(x+.5)*cell-c.x)**2+(y0+(y+.5)*cell-c.y)**2<=r2+1e-10)counts[y*width+x]++;
  }
  const values=new Float32Array(counts.length),area=Math.PI*r2;let max=0;
  counts.forEach((n,i)=>{values[i]=n/area;max=Math.max(max,values[i]);});return {x:x0,y:y0,cell,width,height,radius,values,max,penetrations};
}
export const lengthBins=[0,.3,.5,1,2,3,5,7,Infinity] as const;
export function stitchLengths(commands:readonly Command[],shortThreshold=.3){
  if(!Number.isFinite(shortThreshold)||shortThreshold<.1||shortThreshold>2)throw new RangeError('threshold');
  const bins=Array<number>(lengthBins.length-1).fill(0);let count=0,short=0,stationary=0,total=0,longest=0;
  for(const c of commands)if(c.type==='stitch'){
    const length=Math.hypot(c.x-c.fromX,c.y-c.fromY);if(!Number.isFinite(length))continue;
    const bin=lengthBins.findIndex((edge,i)=>i>0&&length<edge)-1;bins[bin<0?bins.length-1:bin]++;count++;total+=length;longest=Math.max(longest,length);if(length<shortThreshold)short++;if(length<1e-8)stationary++;
  }
  return {bins,count,short,stationary,mean:count?total/count:0,longest,shortThreshold};
}
