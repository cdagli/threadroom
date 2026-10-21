import type {Point} from './project';

// Levien's interpolating ThetaCurve: angles are relative to the segment chord.
export type Cubic=[Point,Point,Point,Point];
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
const distance=(a:Point,b:Point)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
const angle=(a:Point,b:Point)=>Math.atan2(b[1]-a[1],b[0]-a[0]);
function theta(a:number,b:number):Cubic {
  const length=(a:number,b:number)=>{const th=a-.3*Math.sin(2*b-.4*Math.sin(2*b));return (Math.cos(th)-.2*Math.cos(3*th))/2.4;};
  const l=length(a,b),r=length(b,a);
  return [[0,0],[l*Math.cos(a),l*Math.sin(a)],[1-r*Math.cos(b),r*Math.sin(b)],[1,0]];
}
function curvature(a:number,b:number):Point {
  const p=theta(a,b);
  return [0,1].map(end=>{
    const i=end?3:0,j=end?2:1,k=end?1:2,sign=end?-1:1;
    const dx=sign*3*(p[j][0]-p[i][0]),dy=sign*3*(p[j][1]-p[i][1]);
    const ddx=6*(p[k][0]-2*p[j][0]+p[i][0]),ddy=6*(p[k][1]-2*p[j][1]+p[i][1]);
    const th=end?-b:a,s=dx*Math.cos(th)+dy*Math.sin(th);
    return Math.atan2(ddy*Math.cos(th)-ddx*Math.sin(th),s*Math.abs(s));
  }) as Point;
}
function solveRun(p:Point[],periodic:boolean):number[] {
  const n=p.length,th=p.map((q,i)=>{
    if(!i)return angle(q,p[1]);if(i===n-1)return angle(p[i-1],q);
    const a=angle(p[i-1],q),l=distance(p[i-1],q),r=distance(q,p[i+1]);
    return a+wrap(angle(q,p[i+1])-a)*l/(l+r||1);
  });
  const segment=(i:number)=>{const a=angle(p[i],p[i+1]);return [wrap(th[i]-a),wrap(a-th[i+1]),Math.max(1e-9,distance(p[i],p[i+1]))];};
  for(let k=0;k<10;k++){
    const first=segment(0);th[0]+=wrap(.5*Math.sin(2*first[1])-first[0]);
    const last=segment(n-2);th[n-1]-=wrap(.5*Math.sin(2*last[0])-last[1]);
    if(periodic){th[0]+=wrap(th[n-1]-th[0])/2;th[n-1]=th[0];}
    const steps=Array(n).fill(0);
    for(let i=1;i<n-1;i++){
      const l=segment(i-1),r=segment(i);
      const error=(delta:number)=>{
        const kl=curvature(l[0],l[1]+delta)[1],kr=curvature(r[0]-delta,r[1])[0];
        return wrap(Math.atan2(Math.sin(kl)*Math.sqrt(r[2]),Math.cos(kl)*Math.sqrt(l[2]))-Math.atan2(Math.sin(kr)*Math.sqrt(l[2]),Math.cos(kr)*Math.sqrt(r[2])));
      };
      const err=error(0),slope=wrap(error(.001)-err)/.001;
      if(Math.abs(slope)>1e-9)steps[i]=Math.tanh(.25*(k+1))*err/slope;
    }
    for(let i=1;i<n-1;i++)th[i]+=steps[i];
  }
  return th;
}
export function splineBeziers(points:Point[],closed:boolean,corners?:boolean[]):Cubic[] {
  const n=points.length;if(n<2)return [];
  const result:Cubic[]=Array(closed?n:n-1),start=closed?Math.max(0,points.findIndex((_,i)=>corners?.[i])):0;
  let offset=0;
  while(offset<result.length){
    let end=offset+1;
    while(end<result.length&&!corners?.[(start+end)%n])end++;
    const run=Array.from({length:end-offset+1},(_,i)=>points[(start+offset+i)%n]);
    const periodic=closed&&offset===0&&end===n&&!corners?.some(Boolean),th=solveRun(run,periodic);
    for(let j=0;j<run.length-1;j++){
      const a=run[j],b=run[j+1],ch=angle(a,b),unit=theta(wrap(th[j]-ch),wrap(ch-th[j+1])),dx=b[0]-a[0],dy=b[1]-a[1];
      result[(start+offset+j)%n]=[a,...unit.slice(1,3).map(([u,v])=>[a[0]+dx*u-dy*v,a[1]+dy*u+dx*v] as Point),b] as Cubic;
    }
    offset=end;
  }
  return result;
}
export const cubicPoint=(p:Cubic,t:number):Point=>[0,1].map(k=>(1-t)**3*p[0][k]+3*(1-t)**2*t*p[1][k]+3*(1-t)*t*t*p[2][k]+t**3*p[3][k]) as Point;
export function sampleCubic(p:Cubic,step=.5):Point[] {
  const steps=Math.max(4,Math.ceil((distance(p[0],p[1])+distance(p[1],p[2])+distance(p[2],p[3]))/step));
  return Array.from({length:steps+1},(_,i)=>i===0?[...p[0]]:i===steps?[...p[3]]:cubicPoint(p,i/steps));
}
const lineDistance=(p:Point,a:Point,b:Point)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
};
// Fit raw millimetre samples, preserving sharp raw turns and refining the spline by span.
export function fitFreehand(raw:Point[],mmScale=1):{points:Point[];corners:boolean[];closed:boolean} {
  const p=raw.filter((q,i)=>!i||distance(q,raw[i-1])>1e-9).map(q=>q.map(v=>v*mmScale) as Point);
  const closed=p.length>2&&distance(p[0],p[p.length-1])<2;
  while(closed&&p.length>3&&distance(p[0],p[p.length-1])<2)p.pop();
  const result=(indices:number[],shut=closed)=>({points:indices.map(i=>p[i].map(v=>v/mmScale) as Point),corners:indices.map(i=>!shut&&(i===0||i===p.length-1)||turn(i)>Math.PI/6),closed:shut&&indices.length>=3});
  const turn=(i:number)=>!closed&&(i===0||i===p.length-1)?0:Math.abs(wrap(angle(p[(i+p.length-1)%p.length],p[i])-angle(p[i],p[(i+1)%p.length])));
  if(p.length<2)return {points:p.map(q=>q.map(v=>v/mmScale) as Point),corners:p.map(()=>true),closed:false};
  const chord=distance(p[0],p[p.length-1]),tol=Math.max(.3,Math.min(.05*chord,5));
  if(chord<.5?!closed||p.every(q=>distance(q,p[0])<.5):p.every(q=>lineDistance(q,p[0],p[p.length-1])<=tol))return {points:[p[0],p[p.length-1]].map(q=>q.map(v=>v/mmScale) as Point),corners:[true,true],closed:false};
  const n=p.length,cap=Math.min(200,Math.max(30,Math.ceil(n/3))),seeds=[0,...p.flatMap((_,i)=>i>0&&turn(i)>Math.PI/6?[i]:[]),...(closed?[]:[n-1])];
  const indices=new Set(seeds),tolerance=Math.max(.15,Math.min(.5,.02*Math.sqrt(n)));
  const rdp=(a:number,b:number)=>{let best=tolerance,index=-1;for(let i=a+1;i<b;i++){const d=lineDistance(p[i%n],p[a%n],p[b%n]);if(d>best){best=d;index=i;}}if(index>=0){indices.add(index%n);rdp(a,index);rdp(index,b);}};
  for(let i=0;i<seeds.length-(closed?0:1);i++)rdp(seeds[i],i+1<seeds.length?seeds[i+1]:n);
  let list=[...indices].sort((a,b)=>a-b);
  if(list.length<3){const count=Math.min(n,Math.max(3,Math.min(cap,Math.ceil(n/8))));list=Array.from({length:count},(_,i)=>Math.floor(i*(closed?n:n-1)/(closed?count:count-1)));}
  if(list.length>cap)list=list.filter((_,i)=>i%Math.ceil(list.length/cap)===0||!closed&&i===list.length-1);
  const xs=p.map(q=>q[0]),ys=p.map(q=>q[1]),fitTolerance=Math.max(.2,Math.min(1,.02*Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))));
  for(let round=0;round<50&&list.length<cap;round++){
    const fit=result(list),paths=splineBeziers(list.map(i=>p[i]),fit.closed,fit.corners).map(c=>sampleCubic(c,.1));let best=fitTolerance,index=-1;
    for(let s=0;s<paths.length;s++)for(let i=list[s]+1;i<(s+1<list.length?list[s+1]:n);i++){
      const path=paths[s],error=Math.min(...path.slice(1).map((q,j)=>lineDistance(p[i],path[j],q)));
      if(error>best){best=error;index=i;}
    }
    if(index<0)break;list.push(index);list.sort((a,b)=>a-b);
  }
  return result(list);
}
