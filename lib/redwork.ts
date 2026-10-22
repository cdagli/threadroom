import {createT,type Translator} from './i18n';
import {isFillKind,normalizeGroups,object,withGroup,type Point,type Project,type StitchObject} from './project';
import {curveRing,reclose} from './curves';
// Ember's Convert to redwork: the selected outlines merge into one redwork object whose lines the
// compiler sews out and back with no trims (embroidery/redwork.py). It keeps its sources, which
// move with it, so Break apart restores them. Fills contribute their outlines; text is excluded.
export const redworkLength=2;
const convertible=(o:StitchObject)=>!o.locked&&!o.text&&o.rings.length>0;
export function canConvertToRedwork(p:Project,ids:readonly string[]):boolean {
  const chosen=p.objects.filter(o=>ids.includes(o.id));
  return chosen.length>0&&chosen.every(convertible)&&!(chosen.length===1&&chosen[0].kind==='redwork');
}
export const canBreakApart=(p:Project,ids:readonly string[])=>ids.length===1&&p.objects.some(o=>o.id===ids[0]&&o.kind==='redwork'&&!o.locked);
// Each source's lines as open or closed (first point repeated) paths.
export function redworkLines(o:StitchObject):Point[][] {
  if(o.kind==='redwork'||o.rails)return o.rings;
  if(o.curve)return [curveRing(o.curve,true)];
  return isFillKind(o.kind)?reclose(o.rings,true):o.rings;
}
const plain=(o:StitchObject):StitchObject=>{const next=withGroup(o);delete next.sources;return next;};
export function convertToRedwork(p:Project,ids:readonly string[],t:Translator=createT('en')):{project:Project;id:string}|null {
  if(!canConvertToRedwork(p,ids))return null;
  const chosen=p.objects.filter(o=>ids.includes(o.id)),first=chosen[0];
  const sources=chosen.flatMap(o=>o.kind!=='redwork'?[plain(o)]:o.sources?.map(plain)??[{...plain(o),kind:'running' as const}]);
  const merged:StitchObject={...object(t('Redwork'),chosen.flatMap(redworkLines),'redwork',first.color),length:redworkLength,...(first.thread&&{thread:first.thread}),...(first.group!==undefined&&{group:first.group}),sources};
  const at=p.objects.indexOf(first),objects=p.objects.flatMap((o,i)=>i===at?[merged]:ids.includes(o.id)?[]:[o]);
  return {project:normalizeGroups({...p,objects}),id:merged.id};
}
// Sources come back where the redwork was, in its group; ids already in use are replaced.
export function breakApart(p:Project,id:string):{project:Project;ids:string[]}|null {
  const o=p.objects.find(x=>x.id===id);if(!o||o.kind!=='redwork'||o.locked)return null;
  // Ids of other objects, and of other redwork's sources (a pasted copy shares them), are taken.
  const taken=new Set(p.objects.filter(x=>x!==o).flatMap(x=>[x.id,...(x.sources?.map(s=>s.id)??[])]));
  const parts=(o.sources??o.rings.map(r=>({...object(o.name,[r],'running',o.color),length:o.length,...(o.thread&&{thread:o.thread})}))).map(s=>{
    const next=withGroup({...s,id:taken.has(s.id)?crypto.randomUUID():s.id},o.group);taken.add(next.id);return next;
  });
  return {project:normalizeGroups({...p,objects:p.objects.flatMap(x=>x===o?parts:[x])}),ids:parts.map(s=>s.id)};
}
