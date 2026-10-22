import {bounds, isFillKind, pathData, type Command, type Compiled, type Project, type StitchObject, type Point} from './project';
import {mergedOutline} from './text';
import {blockOutline} from './curves';

// Editor objects are immutable. Weak keys release cached geometry with undo history.
const geometry=new WeakMap<StitchObject,ReturnType<typeof buildGeometry>>();
function buildGeometry(o:StitchObject){
  // A satin block shows (and hit-tests) as the area between its rails.
  if(o.rails){const outline=[blockOutline(o.rails)];return {path:pathData(outline,true),bounds:bounds([{...o,rings:outline}]),border:'',guide:''};}
  return {path:pathData(o.rings,isFillKind(o.kind)||!!o.curve?.closed),bounds:bounds([o]),
    border:o.text?.border&&isFillKind(o.kind)?pathData(mergedOutline(o.rings),false):'',
    guide:o.text?.layout==='path'&&o.text.path?pathData([o.text.path.map(([x,y])=>{const m=o.text!.affine;return m?[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]] as Point:[x,y];})],false):''};
}
export function objectGeometry(o:StitchObject){let value=geometry.get(o);if(!value){value=buildGeometry(o);geometry.set(o,value);}return value;}
export function designBounds(objects:StitchObject[]){
  const boxes=objects.filter(o=>o.rings.some(r=>r.length)).map(o=>objectGeometry(o).bounds);
  if(!boxes.length)return {x:0,y:0,width:0,height:0};
  const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
  return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};
}
// Include deleted objects and text borders. Global sewing settings invalidate every object.
export function changedObjectIds(source:Project|null,current:Project){
  const ids=new Set<string>(),before=new Map(source?.objects.map(o=>[o.id,o]));
  const global=!source||source.fabric!==current.fabric||source.locks!==current.locks||source.trimJump!==current.trimJump||source.hoop!==current.hoop||source.machine!==current.machine;
  const orderChanged=!!source&&source.objects.length===current.objects.length&&source.objects.some((o,i)=>o.id!==current.objects[i].id);
  const after=new Map(current.objects.map(o=>[o.id,o]));
  for(const o of [...(source?.objects??[]),...current.objects])if(global||orderChanged||before.get(o.id)!==after.get(o.id)){
    ids.add(o.id);if(o.text?.border)ids.add(`${o.id}-border`);
  }
  return ids;
}
export function commandPaths(commands:Command[],blockCount:number,count:number){
  const cached=paths.get(commands);if(cached?.count===count&&cached.blockCount===blockCount)return cached.value;
  const value={blocks:Array.from({length:blockCount},()=>({stitch:'',jump:''})),travel:'',trims:[] as Point[],travelCount:0,jumpCount:0};
  for(let i=0;i<count;i++){
    const c=commands[i],b=value.blocks[c.block];if(!b)continue;const segment=`M${c.fromX} ${c.fromY}L${c.x} ${c.y}`;
    if(c.type==='jump'){b.jump+=segment;value.jumpCount++;if(c.trim)value.trims.push([c.fromX,c.fromY]);}
    else{b.stitch+=segment;if(c.travel){value.travel+=segment;value.travelCount++;}}
  }
  paths.set(commands,{count,blockCount,value});return value;
}
const paths=new WeakMap<Command[],{count:number;blockCount:number;value:{blocks:{stitch:string;jump:string}[];travel:string;trims:Point[];travelCount:number;jumpCount:number}}>();
const stitchCounts=new WeakMap<Compiled,Uint32Array>();
export function sewnStitches(compiled:Compiled,count:number){
  let prefix=stitchCounts.get(compiled);if(!prefix){prefix=new Uint32Array(compiled.commands.length+1);compiled.commands.forEach((c,i)=>{prefix![i+1]=prefix![i]+Number(c.type==='stitch');});stitchCounts.set(compiled,prefix);}
  return prefix[count];
}
