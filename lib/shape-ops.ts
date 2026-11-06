import {createT,type Translator} from './i18n';
import {curveRing,isClosedShape,openPath,reclose} from './curves';
import {hoops,isFillKind,validProject,type Point,type Project,type StitchObject} from './project';
import {difference,intersection,offsetRegion,regionArea,regionFromRings,regionRings,splitPolyline,splitRegion,union,type Region} from './polygon';

// Shape operations on whole objects: cut holes, flatten overlaps, union/subtract/intersect, offset and knife.
// Each returns one new project (one undo step) or a translated error. Results drop curve anchors and become
// plain-ring objects: the outer outline plus even-odd hole rings, all still editable point by point.
// Locked objects are skipped: never changed, removed or used as cutters (an operation with nothing
// unlocked left is refused). Two-rail satin Blocks are excluded too: their rings hold the centre line and
// the shape lives in the rails, which these operations can't rebuild, so a Block stays as drawn. Redwork
// is excluded as well: Break apart restores its sources, which a reshaped route would contradict.
// Angle guides are world-space directions, so every result (knife pieces included) keeps them as they are.
export type ShapeResult={project:Project;ids:string[];message:string}|{error:string};
export type Combine='union'|'subtract'|'intersect';
const flattenOverlap=.4,minOverlap=.1;

export function shapeRegion(o:StitchObject):Region|null{
  if(o.text||o.rails||o.kind==='satin-block'||!isClosedShape(o)||!o.rings.length)return null;
  const g=regionFromRings(o.curve?[curveRing(o.curve)]:o.rings);return g.length?g:null;
}
function withRegion(o:StitchObject,g:Region):StitchObject{
  const rings=regionRings(g),next:StitchObject={...o,rings:isFillKind(o.kind)?rings:reclose(rings,true)};
  delete next.curve;delete next.fillRule;return next;
}
const piece=(o:StitchObject,rings:Point[][],name:string,id:string):StitchObject=>{const next={...o,id,name:name.slice(0,40),rings};for(const k of ['curve','fillRule','entry','exit','center'] as const)delete next[k];return next;};
/** @test */ export const shapeable=(o:StitchObject)=>!o.hidden&&!o.locked&&!o.rails&&o.kind!=='satin-block'&&o.kind!=='redwork';
const chosen=(p:Project,ids:readonly string[])=>p.objects.filter(o=>ids.includes(o.id)&&shapeable(o));
type Box=[number,number,number,number];
const boxOf=(g:Region):Box=>{let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const [x,y] of g.flat(2)){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return [x0,y0,x1,y1];};
const touching=(a:Box,b:Box)=>a[0]<b[2]&&b[0]<a[2]&&a[1]<b[3]&&b[1]<a[3];
function done(p:Project,next:Project,ids:string[],message:string,t:Translator):ShapeResult{
  const h=hoops[p.hoop];
  if(next.objects.some(o=>o.rings.some(r=>r.some(([x,y])=>x<-1e-6||y<-1e-6||x>h.width+1e-6||y>h.height+1e-6))))return {error:t("The result would extend outside the hoop.")};
  if(!validProject(next))return {error:t("The result has too many points or objects for one design.")};
  return {project:next,ids,message};
}

// What the selection allows, for enabling the buttons.
export function shapeOptions(p:Project,ids:readonly string[]){
  const sel=chosen(p,ids),closed=sel.filter(o=>!o.text&&isClosedShape(o)&&o.rings.length),fills=closed.filter(o=>isFillKind(o.kind));
  const lines=sel.filter(o=>!o.text&&o.rings.length&&openPath(o));
  return {closed:closed.length,fills:fills.length,cut:fills.length>=1&&closed.length>=2,combine:closed.length>=2,flatten:fills.length>=2,offset:closed.length>=1,knife:closed.length+lines.length>=1};
}

// The fill sewn first is cut by every other selected closed shape.
export function cutHoles(p:Project,ids:readonly string[],keep=false,t:Translator=createT('en')):ShapeResult{
  const sel=chosen(p,ids),target=sel.find(o=>isFillKind(o.kind)&&shapeRegion(o)),cutters=sel.filter(o=>o!==target&&shapeRegion(o));
  if(!target||!cutters.length)return {error:t("Select a fill and the closed shapes to cut out of it.")};
  return punch(p,target,cutters.map(o=>shapeRegion(o)!),keep?[]:cutters.map(o=>o.id),t);
}
// Cut holes mode: a drawn closed outline becomes a hole in the fill.
export function cutHole(p:Project,id:string,ring:Point[],t:Translator=createT('en')):ShapeResult{
  const target=p.objects.find(o=>o.id===id),g=regionFromRings([ring]);
  if(!target||target.locked||!isFillKind(target.kind)||!shapeRegion(target))return {error:t("Select a fill to cut holes in.")};
  if(!g.length)return {error:t("Draw a closed shape inside the fill.")};
  return punch(p,target,[g],[],t);
}
function punch(p:Project,target:StitchObject,cutters:Region[],remove:string[],t:Translator):ShapeResult{
  const before=shapeRegion(target)!;
  if(regionArea(intersection(before,union(...cutters)))<minOverlap)return {error:t("The shapes don't overlap the fill.")};
  const after=difference(before,...cutters);if(!after.length)return {error:t("Nothing of the fill would be left.")};
  const next=withRegion(target,after);
  return done(p,{...p,objects:p.objects.filter(o=>!remove.includes(o.id)).map(o=>o.id===target.id?next:o)},[target.id],t("Holes cut in “{v0}”",{v0:target.name}),t);
}

// In sew order each later fill is removed from the earlier fills it overlaps, inset by `overlap` so the
// edges still interlock and no fabric shows. Earlier fills hidden completely are deleted.
export function flattenOverlaps(p:Project,ids:readonly string[]|null=null,overlap=flattenOverlap,t:Translator=createT('en')):ShapeResult{
  const fills=(ids?chosen(p,ids):p.objects.filter(shapeable)).filter(o=>isFillKind(o.kind)).map(o=>({o,g:shapeRegion(o)})).filter((f):f is {o:StitchObject;g:Region}=>!!f.g).map(f=>({...f,box:boxOf(f.g)}));
  if(fills.length<2)return {error:t("Select two or more overlapping fills.")};
  const replaced=new Map<string,StitchObject|null>(),insets=new Map<string,Region>();
  fills.forEach((lower,i)=>{
    const above=fills.slice(i+1).filter(u=>touching(lower.box,u.box)&&regionArea(intersection(lower.g,u.g))>=minOverlap);if(!above.length)return;
    const cover=union(...above.map(u=>u.g));
    if(regionArea(difference(lower.g,cover))<minOverlap){replaced.set(lower.o.id,null);return;}
    const inset=union(...above.map(u=>{if(!insets.has(u.o.id))insets.set(u.o.id,offsetRegion(u.g,-overlap));return insets.get(u.o.id)!;}));
    const rest=difference(lower.g,inset);if(rest.length&&regionArea(intersection(lower.g,inset))>=minOverlap/10)replaced.set(lower.o.id,withRegion(lower.o,rest));
  });
  if(!replaced.size)return {error:t("No selected fills overlap.")};
  const objects=p.objects.flatMap(o=>replaced.has(o.id)?replaced.get(o.id)?[replaced.get(o.id)!]:[]:[o]);
  const removed=[...replaced.values()].filter(v=>!v).length;
  return done(p,{...p,objects},fills.map(f=>f.o.id).filter(id=>replaced.get(id)!==null),t('flattened.other',{count:replaced.size-removed,removed}),t);
}

// The first selected object in sew order keeps its stitch settings, name and place.
export function combineShapes(p:Project,ids:readonly string[],op:Combine,t:Translator=createT('en')):ShapeResult{
  const sel=chosen(p,ids).filter(o=>shapeRegion(o));
  if(sel.length<2)return {error:t("Select two or more closed shapes.")};
  const [first,...rest]=sel.map(o=>shapeRegion(o)!);
  const g=op==='union'?union(first,...rest):op==='subtract'?difference(first,...rest):intersection(first,...rest);
  if(!g.length)return {error:op==='intersect'?t("These shapes don't overlap."):t("Nothing would be left of the first shape.")};
  const next=withRegion(sel[0],g),others=new Set(sel.slice(1).map(o=>o.id));
  return done(p,{...p,objects:p.objects.filter(o=>!others.has(o.id)).map(o=>o.id===next.id?next:o)},[next.id],t(op==='union'?"Shapes joined":op==='subtract'?"Shapes subtracted":"Shapes intersected"),t);
}

// Grow (positive mm) or shrink with round joins. keep adds the result after each original, for
// appliqué allowances and outlines around a fill; otherwise the shapes change in place.
export function offsetShapes(p:Project,ids:readonly string[],mm:number,keep=false,t:Translator=createT('en'),id:()=>string=()=>crypto.randomUUID()):ShapeResult{
  const sel=chosen(p,ids).filter(o=>shapeRegion(o));
  if(!sel.length)return {error:t("Select a closed shape to offset.")};
  if(!Number.isFinite(mm)||Math.abs(mm)<.05||Math.abs(mm)>20)return {error:t("Choose an offset between 0.05 and 20 mm.")};
  const made=new Map<string,StitchObject>();
  for(const o of sel){
    const g=offsetRegion(shapeRegion(o)!,mm);if(!g.length)return {error:t("“{v0}” is too small to shrink by {v1} mm.",{v0:o.name,v1:Math.abs(mm)})};
    const next=withRegion(o,g);made.set(o.id,keep?{...next,id:id(),name:t("{v0} offset",{v0:o.name}).slice(0,40)}:next);
  }
  for(const o of made.values()){delete o.entry;delete o.exit;}
  const objects=p.objects.flatMap(o=>!made.has(o.id)?[o]:keep?[o,made.get(o.id)!]:[made.get(o.id)!]);
  return done(p,{...p,objects},[...made.values()].map(o=>o.id),mm>0?t("Shapes grown by {v0} mm",{v0:mm}):t("Shapes shrunk by {v0} mm",{v0:-mm}),t);
}

// Splits each shape the straight line a→b crosses into the parts left and right of it, keeping the settings.
// Closed shapes need both ends of the line outside them; open paths split where they cross the line.
export function knifeShapes(p:Project,ids:readonly string[]|null,a:Point,b:Point,t:Translator=createT('en'),id:()=>string=()=>crypto.randomUUID()):ShapeResult{
  const targets=(ids?.length?chosen(p,ids):p.objects.filter(shapeable)).filter(o=>!o.text&&o.rings.length);
  const side=(r:Point[])=>{let s=0;for(const q of r)s+=(b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0]);return s>0;};
  const split=new Map<string,StitchObject[]>();
  for(const o of targets){
    const g=shapeRegion(o);let parts:Point[][][]|null=null;
    if(g){const halves=splitRegion(g,a,b);if(halves)parts=halves.map(h=>{const rings=regionRings(h);return isFillKind(o.kind)?rings:reclose(rings,true);});}
    else if(openPath(o)){
      const lines=o.curve?[curveRing(o.curve)]:o.rings,left:Point[][]=[],right:Point[][]=[];let cut=false;
      for(const line of lines){const pieces=splitPolyline(line,a,b);if(pieces)cut=true;for(const r of pieces??[line])(side(r)?left:right).push(r);}
      if(cut&&left.length&&right.length)parts=[left,right];
    }
    if(parts)split.set(o.id,parts.map((rings,i)=>piece(o,rings,`${o.name} ${i+1}`,id())));
  }
  if(!split.size)return {error:t("Draw the line across a shape, starting and ending outside it.")};
  const objects=p.objects.flatMap(o=>split.get(o.id)??[o]);
  return done(p,{...p,objects},[...split.values()].flat().map(o=>o.id),t('knifeSplit.other',{count:split.size}),t);
}
