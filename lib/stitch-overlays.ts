import type {Command} from './project';
/** At most three SVG paths, irrespective of stitch count. Playback and visibility
 * are applied by the caller before building these paths. */
export function overlayPaths(commands:Command[],count:number,selection:readonly string[],scale:number){
  const trims:string[]=[],ties:string[]=[],needles:string[]=[],r=1.2/scale,a=3.5/scale;let previous:Command|undefined;const selected=new Set(selection);
  for(let i=0;i<Math.min(count,commands.length);i++){
    const c=commands[i],{x,y}=c;
    if(c.trim){const x=c.fromX,y=c.fromY,r=a*.4;trims.push(`M${x-a+r} ${y-a}a${r} ${r} 0 1 0 ${-2*r} 0a${r} ${r} 0 1 0 ${2*r} 0M${x-a+r} ${y+a}a${r} ${r} 0 1 0 ${-2*r} 0a${r} ${r} 0 1 0 ${2*r} 0M${x-a+r} ${y-a+r}L${x+a} ${y+a}M${x-a+r} ${y+a-r}L${x+a} ${y-a}`);}
    if(c.tie&&(previous?.tie!==c.tie||previous.objectId!==c.objectId))ties.push(c.tie==='in'?`M${c.fromX} ${c.fromY-a}l${a} ${2*a}h${-2*a}Z`:`M${c.fromX-a} ${c.fromY-a}h${2*a}v${2*a}h${-2*a}Z`);
    if(c.type==='stitch'&&c.objectId&&(selected.has(c.objectId)||c.objectId.endsWith('-border')&&selected.has(c.objectId.slice(0,-7))))needles.push(`M${x-r} ${y}a${r} ${r} 0 1 0 ${2*r} 0a${r} ${r} 0 1 0 ${-2*r} 0`);
    previous=c;
  }
  return {trims:trims.join(''),ties:ties.join(''),needles:needles.join('')};
}
