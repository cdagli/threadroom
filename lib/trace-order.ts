import {fillCenter,type StitchObject} from './project';
import {simplifyPath} from './curves';
const area=(o:StitchObject)=>Math.abs(o.rings.reduce((sum,r)=>sum+r.reduce((a,p,i)=>{const q=r[(i+1)%r.length];return a+p[0]*q[1]-q[0]*p[1];},0)/2,0));
const rgb=(c:string)=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255);
function hue(c:string){const [r,g,b]=rgb(c),max=Math.max(r,g,b),d=max-Math.min(r,g,b);return d===0?0:((max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4)*60+360)%360;}
/** One run per colour: dominant area first, dark detail colours last, then hue.
 * Equal-distance choices retain input order so the trace is reproducible. */
export function orderTrace(objects:StitchObject[]):StitchObject[]{
  const groups=new Map<string,StitchObject[]>();for(const o of objects){const key=o.color.toLowerCase();groups.set(key,[...(groups.get(key)??[]),o]);}
  const entries=[...groups],total=(items:StitchObject[])=>items.reduce((s,o)=>s+area(o),0);
  const dominant=entries.reduce<string|undefined>((best,[c,items])=>!best||total(items)>total(groups.get(best)!)?c:best,undefined);
  entries.sort(([a],[b])=>a===dominant?-1:b===dominant?1:Number(Math.max(...rgb(a))<.3)-Number(Math.max(...rgb(b))<.3)||hue(a)-hue(b)||a.localeCompare(b));
  return entries.flatMap(([,items])=>{
    const remaining=items.map(o=>({o,p:fillCenter(o)})),ordered:StitchObject[]=[];
    remaining.sort((a,b)=>a.p[1]-b.p[1]||a.p[0]-b.p[0]);let at=remaining[0].p;
    while(remaining.length){let best=0;for(let i=1;i<remaining.length;i++)if(Math.hypot(remaining[i].p[0]-at[0],remaining[i].p[1]-at[1])<Math.hypot(remaining[best].p[0]-at[0],remaining[best].p[1]-at[1]))best=i;const next=remaining.splice(best,1)[0];ordered.push(next.o);at=next.p;}
    return ordered;
  });
}
// Ember's 0.1 mm design units converted to mm; scale follows the artwork size.
export const traceTolerance=(dimensionMm:number)=>Math.max(.032,Math.min(.25,.0028*dimensionMm));
export function simplifyTrace(o:StitchObject,tolerance:number):StitchObject{
  return {...o,rings:o.rings.map(r=>{const s=simplifyPath([...r,r[0]],tolerance).slice(0,-1);return s.length>=3?s:r;})};
}
