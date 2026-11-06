import {type Key} from './i18n';
import table from '../embroidery/fill-patterns.json';
export type FillPattern=(typeof table)[number]['id'];
export type PatternParams={steps?:number;amplitude?:number;intensity?:number;tightness?:number;rotations?:number;stepHeight?:number;stepsPerFlight?:number;chaos?:number;density?:number;separation?:number;crossSize?:number;threadCount?:number;coverage?:number;cellSize?:number};
export type PatternParam={key:keyof PatternParams;label:Key;default:number;min:number;max:number;step:number};
export const fillPatterns=table.map(p=>({...p,name:p.name as Key,params:('params' in p?p.params:[]) as PatternParam[]}));
export function validPatternParams(id:FillPattern|undefined,params:unknown):params is PatternParams {
  if(!params||typeof params!=='object'||Array.isArray(params))return false;
  const schema=fillPatterns.find(p=>p.id===(id??'even'))?.params??[];
  return Object.entries(params).every(([key,v])=>{const f=schema.find(f=>f.key===key);return f&&typeof v==='number'&&Number.isFinite(v)&&v>=f.min&&v<=f.max&&Math.abs((v-f.min)/f.step-Math.round((v-f.min)/f.step))<1e-7;});
}
type PatternRow=[number,number[]];
function descriptor(xs:number[],width:number):PatternRow {
  const points:number[]=[];
  for(const x of xs.sort((a,b)=>a-b))if(x>=-1e-6&&x<=width+1e-6&&(!points.length||x-points.at(-1)!>1e-4))points.push(x);
  return points.length?[points[0],[...points.slice(1).map((x,i)=>x-points[i]),Math.max(width-points.at(-1)!+points[0],.01)]]:[0,[width]];
}
function heartCrossings(y:number,size:number):number[] {
  const f=(e:number)=>e**3+e**2-2*y*e+y*y-1,roots:number[]=[];
  for(let i=0;i<=64;i++){
    let a=i/64,b=a+1/64;
    if(Math.abs(f(a))<1e-9)roots.push(a);
    if(i===64||f(a)*f(b)>=0)continue;
    for(let j=0;j<40;j++){const m=(a+b)/2;if(Math.abs(f(m))<1e-9){a=b=m;break;}if(f(a)*f(m)<0)b=m;else a=m;}
    roots.push((a+b)/2);
  }
  const unique:number[]=[];
  for(const e of roots.sort((a,b)=>a-b))if(!unique.length||e-unique.at(-1)!>1e-6)unique.push(Math.max(0,Math.min(1,e)));
  return unique.flatMap(e=>(e**1.5>=1e-8?[-(e**1.5),e**1.5]:[0]).map(x=>(x+1)/2*size));
}
// These pure row descriptors mirror embroidery/patterns.py; parity is checked for every pattern.
/** @test */ export function patternCycle(id:FillPattern,L=4,s=.2,params?:PatternParams):{rows:PatternRow[];shear:number} {
  const p=fillPatterns.find(p=>p.id===id)!;
  const v=Object.fromEntries(p.params.map(f=>[f.key,params?.[f.key]??f.default])),mode=p.mode;
  const offsets=(values:number[]):PatternRow[]=>values.map(o=>[o,[L]]),range=(n:number)=>Array.from({length:n},(_,i)=>i),mod=(x:number,n:number)=>(x%n+n)%n;
  let rows:PatternRow[]=[],shear=0;
  if(mode==='engine')return {rows:[],shear:0};
  if(mode==='even')rows=[[0,[L]]];
  else if(mode==='offsets')rows=offsets(p.offsets!.map(o=>o*(p.absolute?1:L)));
  else if(mode==='waves')rows=offsets(range(v.steps).map(i=>(Math.sin(2*Math.PI*i/v.steps)+1)/2*(v.amplitude||2)));
  else if(mode==='zigzag'){for(let x=0;x<2*L;x+=s)rows.push([x<=L?0:x-L,[L]]);}
  else if(mode==='heartbeat')rows=offsets([0,0,0,0,.3,.5,.3,0,-.4,2,2.5,2,-.6,0,.4,.7,.7,.4,0,0,0].map(x=>x*v.intensity));
  else if(mode==='spiral'){const n=Math.round(20*v.rotations);rows=offsets(range(n).map(i=>i/n*v.tightness*Math.sin(2*Math.PI*v.rotations*i/n)));}
  else if(mode==='staircase'){const flight=range(v.stepsPerFlight);rows=offsets([...flight,...flight.toReversed()].flatMap(e=>Array(4).fill(e*v.stepHeight)));}
  else if(mode==='rainfall'){const phi=1.618033988749,c=v.chaos;rows=range(v.density).map(i=>[(7*i*phi%1)*c-.5*c*(13*i*phi%1)+.3*c*Math.sin(.3*i)+(i%7===0?.8*c*(i*phi%1):0),[L*(.7+.6*(11*i*phi%1))]]);}
  else if(mode==='tornado'){const n=Math.round(25*v.rotations);rows=range(n).map(i=>{const t=i/n,a=2*Math.PI*v.rotations*i/n,amp=v.tightness*(1-t**1.5)*(1+.3*t);return [amp*Math.sin(a)+.15*v.tightness*Math.sin(7*a),[L*(.6+.4*(1-t))]];});}
  else if(mode==='wavy-walk')rows=offsets(range(21).map(i=>(i%7+1)/7*L+(Math.sin(2*Math.PI*i/21)+1)/2*.4*L));
  else if(mode==='partition'){
    const digits=p.seed!.split('').filter(c=>'01234567'.includes(c)).slice(0,8).map(Number);
    rows=digits.map((d,i)=>{let ls=[L];if(id==='partitionInterlocked'&&d===1)ls=[L/3,L/3,L/3];else if(id==='partitionRails')ls=d===0?[L*.22,L*.78]:[L*.78,L*.22];else if(id==='partitionTwill')ls=[L/4,3*L/4];else if(id==='partitionHoundstooth')ls=i%2===0?[L/4,L/4,L/2]:[L/2,L/4,L/4];return [d/digits.length*L,ls];});
    const a=p.shear!*Math.PI/180;shear=Math.abs(Math.sin(a))>=1e-6&&Math.abs(Math.cos(a))>=1e-12?s*Math.max(-20,Math.min(20,Math.cos(a)/Math.sin(a))):0;
  }
  else if(mode==='heart'){const n=Math.max(1,Math.round(p.size!/s));rows=range(n).map(i=>descriptor(heartCrossings(1.51-2.51*i/n,p.size!),p.size!));}
  else if(mode==='diamond'){const w=p.size!,h=Math.max(1,Math.floor(Math.round(w/s)/2));rows=[[w/2,[w]],...range(h-1).map(j=>{const i=j+1;return [w/2*(1-i/h),[w*i/h,w*(1-i/h)]] as PatternRow;}),[0,[w]]];rows.push(...rows.slice(1,h).toReversed());}
  else if(mode==='circle'){const d=p.size!,m=Math.max(2,Math.round(d/(2*s))),r=d/2;rows=[[r,[d]],...range(m-2).map(j=>{const c=2*Math.sqrt(r*r-(r*(j+1)/m-r)**2);return [r-c/2,[c,2*r-c]] as PatternRow;})];rows.push([0,[d]],...rows.slice(1).toReversed());}
  else if(mode==='hexweave'){const c=v.cellSize,n=2*Math.ceil(c*Math.sin(Math.PI/3)/s);rows=range(n).map(i=>[i%2===0?c*Math.min(i/n,1-i/n):c-c*Math.min(i/n,1-i/n),[c]]);}
  else if(mode==='chain'){const n=Math.max(4,Math.round(8/Math.max(s,.05)));rows=range(n).map(i=>{const a=Math.asin(((i+.5)/n*8-4)/4);return descriptor([0,Math.PI].flatMap(phase=>[a,Math.PI-a].map(b=>mod(b-phase,2*Math.PI)/(2*Math.PI)*8)),8);});}
  else if(mode==='stars'){
    const n=Math.max(4,4*Math.round(Math.max(4,Math.round(8/Math.max(s,.05)))/4));
    let vertices=range(10).map(i=>[Math.cos(-Math.PI/2+i*Math.PI/5)*(i%2===0?1:.38),Math.sin(-Math.PI/2+i*Math.PI/5)*(i%2===0?1:.38)]);
    const lo=[0,1].map(j=>Math.min(...vertices.map(v=>v[j]))),hi=[0,1].map(j=>Math.max(...vertices.map(v=>v[j])));
    vertices=vertices.map(v=>[0,1].map(j=>(v[j]-lo[j])/(hi[j]-lo[j])*8));
    rows=range(n).map(i=>{const y=(i+.5)/n*8,xs:number[]=[];vertices.forEach((a,j)=>{const b=vertices[(j+1)%10];if(Math.abs(a[1]-b[1])>1e-9&&y>=Math.min(a[1],b[1])-1e-9&&y<=Math.max(a[1],b[1])+1e-9)xs.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));});const grid:number[]=[];for(let x=(L*[.25,.5,.75,1][i%4])%L;x<8;x+=L)if(xs.filter(a=>a<x-1e-6).length%2===0)grid.push(x);return descriptor([...xs,...grid],8);});
  }
  return {rows,shear};
}
// Show a full cycle in mm, including variable-length crossings and continuous shear.
export function patternPreview(id:FillPattern,params?:PatternParams):[number,number][][] {
  if(id==='streamlines')return Array.from({length:12},(_,i)=>Array.from({length:15},(_,j)=>[2+j*38/14,Math.max(2,Math.min(26,3+i*1.85+1.5*Math.sin(j/3+i/4)))]));
  if(id==='crossStitchFill')return Array.from({length:12},(_,i)=>{const x=3+i%4*9,y=3+Math.floor(i/4)*8;return [[x,y],[x+7,y+6],[x+3.5,y+3],[x+7,y],[x,y+6]];});
  if(id==='circular')return Array.from({length:12},(_,i)=>Array.from({length:9},(_,j)=>{const a=(i+j/8)*Math.PI/3,r=1+2*(i+j/8);return [21+Math.cos(a)*r*.75,14+Math.sin(a)*r*.48];}));
  if(id==='sweepSatin')return Array.from({length:12},(_,i)=>[[3+i*3,i%2?25:3],[3+(i+1)*3,i%2?3:25]]);
  const {rows,shear}=patternCycle(id,4,.2,params),count=Math.max(12,rows.length),height=(count-1)*.2,width=Math.max(...rows.map(([,ls])=>ls.reduce((a,b)=>a+b,0)*1.5),height*38/24),scale=38/width;
  return Array.from({length:count},(_,row)=>{const [offset,lengths]=rows[row%rows.length],period=lengths.reduce((a,b)=>a+Math.max(.01,b),0),points:[number,number][]=[];let prefix=0;
    for(const length of lengths){const origin=-offset-shear*row-prefix;for(let q=Math.floor((-width/2-origin)/period)+1;q<Math.ceil((width/2-origin)/period);q++)points.push([Math.max(2,Math.min(40,21+(origin+q*period)*scale)),Math.max(2,Math.min(26,14+(row*.2-height/2)*scale))]);prefix+=Math.max(.01,length);}return points;});
}
