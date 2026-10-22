import type {Compiled,Project} from './project';
// Planning allowances, not measured machine timings: manual PR1X rethread 30 s, trim 3 s.
// Excludes hooping, bobbin changes, acceleration, thread breaks and operator pauses.
export const production={defaultSpeed:650,minSpeed:100,maxSpeed:1000,colorChangeSeconds:30,trimSeconds:3} as const;
export const sewingSpeed=(p:Project)=>p.sewingSpeed??production.defaultSpeed;
export function estimatedSeconds(stats:Pick<Compiled['stats'],'stitches'|'colorChanges'|'trims'>,speed=production.defaultSpeed as number):number {
  const rate=Number.isFinite(speed)?Math.min(production.maxSpeed,Math.max(production.minSpeed,speed)):production.defaultSpeed;
  return stats.stitches/rate*60+stats.colorChanges*production.colorChangeSeconds+stats.trims*production.trimSeconds;
}
// One row per exported colour block, including repeated colours and hidden objects.
export function threadSequence(compiled:Compiled,project:Project){
  const rows=compiled.threads.map((thread,index)=>({...thread,index,stitches:0,path:'',objects:new Set<string>()}));
  for(const c of compiled.commands){
    const row=rows[c.block];if(!row||c.type!=='stitch')continue;
    row.stitches++;row.path+=`M${c.fromX} ${c.fromY}L${c.x} ${c.y}`;
    const o=project.objects.find(o=>o.id===c.objectId||`${o.id}-border`===c.objectId);if(o)row.objects.add(o.name);
  }
  return rows.filter(r=>r.stitches>0);
}
export function stitchBounds(compiled:Compiled){
  let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
  for(const c of compiled.commands)if(c.type==='stitch')for(const [px,py] of [[c.fromX,c.fromY],[c.x,c.y]]){x=Math.min(x,px);y=Math.min(y,py);right=Math.max(right,px);bottom=Math.max(bottom,py);}
  return Number.isFinite(x)?`${x-2} ${y-2} ${Math.max(1,right-x)+4} ${Math.max(1,bottom-y)+4}`:'0 0 100 100';
}
