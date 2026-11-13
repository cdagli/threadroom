import type {PatternParams} from './fill-patterns';
import type {Project,StitchObject} from './project';
// Long & short stitch (embroidery/longshort.py). A shading set is several long & short
// objects that share one outline, centre and stitch settings; each covers a band of every
// thread line, from the centre side (0 %) to the outer side (100 %), in its own colour.
// Neighbouring bands meet at a shared value, where the engine interleaves the colours.
export const isLongShort=(o:StitchObject)=>o.kind==='fill'&&o.fillPattern==='longShort';
export const isRadial=(o:StitchObject)=>(o.patternParams?.radial??1)===1;
export function band(o:StitchObject):[number,number]{const p=o.patternParams;return [p?.bandStart??0,p?.bandEnd??100];}
// Settings every layer of a set keeps equal, so all layers lay their threads on the same lines.
const sharedKeys=['rings','curve','center','angle','fillRule','rotation','spacing','fillLength'] as const;
const sharedParams=['radial','variation','blend'] as const;
const MIN_BAND=4;
function shared(o:StitchObject){
  return JSON.stringify([...sharedKeys.map(k=>o[k]??null),...sharedParams.map(k=>o.patternParams?.[k]??null)]);
}
function copyShared(from:StitchObject,to:StitchObject):StitchObject{
  const next:StitchObject={...to};
  for(const k of sharedKeys){if(from[k]===undefined)delete next[k];else (next as Record<string,unknown>)[k]=from[k];}
  const params:PatternParams={...to.patternParams};
  for(const k of sharedParams){if(from.patternParams?.[k]===undefined)delete params[k];else params[k]=from.patternParams[k];}
  return withParams(next,params);
}
function withParams(o:StitchObject,params:PatternParams):StitchObject{
  const next:StitchObject={...o,patternParams:params};
  if(!Object.keys(params).length)delete next.patternParams;
  return next;
}
export function withBand(o:StitchObject,start:number,end:number):StitchObject{
  const params:PatternParams={...o.patternParams,bandStart:start,bandEnd:end};
  if(start===0)delete params.bandStart;
  if(end===100)delete params.bandEnd;
  return withParams(o,params);
}
/** The layers of o's shading set, centre side first (o alone when it has none). */
export function shadeLayers(p:Project,o:StitchObject):StitchObject[]{
  if(!o.shade||!isLongShort(o))return [o];
  return p.objects.filter(x=>x.shade===o.shade&&isLongShort(x)).sort((a,b)=>band(a)[0]-band(b)[0]||band(a)[1]-band(b)[1]);
}
// A darker or lighter version of a colour, for a new shading layer's first colour.
function shadeColour(hex:string):string{
  const n=parseInt(hex.slice(1),16),rgb=[n>>16,n>>8&255,n&255],light=(rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000>140;
  return '#'+rgb.map(v=>Math.round(light?v*.62:v+(255-v)*.45).toString(16).padStart(2,'0')).join('');
}
/** Splits o's band in two; the new layer takes the centre-side half and is sewn after o, on top. */
export function addShade(p:Project,id:string,newId:string,colour?:string):{project:Project;id:string}|null{
  const o=p.objects.find(x=>x.id===id);
  if(!o||!isLongShort(o))return null;
  const [a,b]=band(o),m=Math.round((a+b)/2);
  if(m-a<MIN_BAND||b-m<MIN_BAND)return null;
  const shade=o.shade??o.id,{thread:_,...rest}=o,index=p.objects.indexOf(o);
  const layer:StitchObject=withBand({...rest,id:newId,shade,color:colour??shadeColour(o.color)},a,m);
  const objects=[...p.objects];
  objects.splice(index,1,withBand({...o,shade},m,b),layer);
  return {project:{...p,objects},id:newId};
}
/** Removes one layer; its neighbour takes over its band. */
export function removeShade(p:Project,id:string):Project{
  return syncShades({...p,objects:p.objects.filter(o=>o.id!==id)},p);
}
/** Moves the meeting point between layer `index` and the next one (both centre side first). */
export function setShadeEdge(p:Project,shade:string,index:number,value:number):Project{
  const layers=p.objects.filter(o=>o.shade===shade&&isLongShort(o)).sort((a,b)=>band(a)[0]-band(b)[0]);
  const inner=layers[index],outer=layers[index+1];
  if(!inner||!outer)return p;
  const v=Math.round(Math.max(band(inner)[0]+MIN_BAND,Math.min(band(outer)[1]-MIN_BAND,value)));
  return {...p,objects:p.objects.map(o=>o===inner?withBand(o,band(o)[0],v):o===outer?withBand(o,v,band(o)[1]):o)};
}
/** Keeps shading sets consistent after any edit: a layer whose outline, centre or stitch
 * settings changed passes them to its set; pasted copies form a new set; a removed layer's
 * band goes to its neighbour; a set of one becomes a plain long & short fill. */
export function syncShades(next:Project,previous?:Project):Project{
  if(!next.objects.some(o=>o.shade))return next;
  const before=new Map((previous?.objects??[]).map(o=>[o.id,o]));
  let objects:StitchObject[]=next.objects.map(o=>o.shade&&!isLongShort(o)?(({shade:_,...rest})=>rest)(o):o);
  const sets=new Map<string,StitchObject[]>();
  for(const o of objects)if(o.shade)sets.set(o.shade,[...sets.get(o.shade)??[],o]);
  const replace=new Map<string,StitchObject>();
  for(const [shade,members] of sets){
    // Copies arrive with new ids; unless they are still on the set's outline they form their own set.
    const known=members.filter(o=>before.get(o.id)?.shade===shade),added=members.filter(o=>!known.includes(o));
    const groups=known.length&&added.length&&JSON.stringify(added[0].rings)!==JSON.stringify(known[0].rings)?[known,added.map(o=>({...o,shade:added[0].id}))]:[members];
    for(let layers of groups){
      const leader=layers.find(o=>{const old=before.get(o.id);return old&&shared(old)!==shared(o);});
      if(leader)layers=layers.map(o=>o===leader?o:copyShared(leader,o));
      const lost=[...before.values()].some(o=>o.shade===shade&&!layers.some(x=>x.id===o.id))&&layers.some(o=>before.get(o.id)?.shade===shade);
      if(layers.length===1){const {shade:_,...rest}=layers[0];layers=[withBand(rest,0,100)];}
      else if(lost){
        const sorted=[...layers].sort((a,b)=>band(a)[0]-band(b)[0]);
        layers=sorted.map((o,i)=>withBand(o,i?band(sorted[i-1])[1]:0,i===sorted.length-1?100:band(o)[1]));
      }
      for(const o of layers)replace.set(o.id,o);
    }
  }
  objects=objects.map(o=>replace.get(o.id)??o);
  return objects.every((o,i)=>o===next.objects[i])?next:{...next,objects};
}
