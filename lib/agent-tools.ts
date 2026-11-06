import {bounds,fabrics,hoops,isFillKind,kindHints,kindNames,lockLimits,lockNames,object,palette,resolve,ropeLimits,satinLimits,underlayNames,underlayOptions,validProject,type Kind,type Point,type Project,type StitchObject} from './project';
import {blockOutline,changeStitchKind,curveRing,draftRails,insertGeometryPoint,isClosedShape,moveGeometry,removeGeometryPoint,routeEnds,setCorner,withEnd,withRails} from './curves';
import {explain,fixFor,type Warning} from './check';
import {fillPatterns} from './fill-patterns';
import {brotherThreads,nearestBrother,threadReference,type Thread} from './threads';
import {circle,diamond,heart,hexagon,rect,shapeNames,star,triangle,type ShapeKind} from './shapes';
import {textLimits} from './text';
import {production} from './production';
import {createT,en as enDictionary,tr as trDictionary,type Key,type Translator} from './i18n';

// WebMCP agent helpers: compact, JSON-safe views of the editor model and validated edits.
// Every length is in millimetres; the hoop's top-left corner is (0, 0), x grows right and y grows down.
export const objectLimit=80;
export const en=createT('en');
const r2=(n:number)=>Math.round(n*100)/100;
const roundPoint=([x,y]:Point):Point=>[r2(x),r2(y)];
const box=(b:{x:number;y:number;width:number;height:number})=>({x:r2(b.x),y:r2(b.y),width:r2(b.width),height:r2(b.height)});
export const objectBox=(o:StitchObject)=>box(bounds([o.rails?{...o,rings:[blockOutline(o.rails)]}:o]));

export function summarizeObject(o:StitchObject,p:Project,index:number){
  const r=resolve(o,p.fabric,p.locks);
  return {
    id:o.id,index,name:o.name,kind:o.kind,kindName:en(kindNames[o.kind]),color:o.color,
    ...(o.thread&&{thread:`${o.thread.brand} ${o.thread.code} ${o.thread.name}`}),
    ...(o.group&&{group:o.group}),...(o.locked&&{locked:true}),...(o.hidden&&{hidden:true}),...(o.layoutOnly&&{layoutOnly:true}),
    closed:isClosedShape(o),bounds:objectBox(o),
    ...(o.text&&{text:{content:o.text.content,size:o.text.size,font:o.text.satin?`satin:${o.text.satin.font}`:o.text.font.family,layout:o.text.layout}}),
    settings:{
      ...(isFillKind(o.kind)&&{angle:o.angle,fillPattern:o.fillPattern??'even',spacing:r2(r.spacing),underlay:r.underlay,...(o.fillLength!==undefined&&{fillLength:o.fillLength})}),
      ...(!isFillKind(o.kind)&&{length:o.length}),
      ...((o.kind==='satin'||o.kind==='zigzag'||o.kind==='e-stitch')&&{satinWidth:o.satinWidth,spacing:r2(r.spacing),underlay:r.underlay,splitLength:r.splitLength}),
      ...(o.kind==='satin-block'&&{spacing:r2(r.spacing),underlay:r.underlay,splitLength:r.splitLength}),
      pullCompensation:r2(r.pullCompensation),tieIn:r.tieIn,tieOff:r.tieOff,
    },
  };
}

export function designSummary(p:Project,extra:Record<string,unknown>={}){
  const hoop=hoops[p.hoop],all=p.objects.filter(o=>o.rings.length);
  return {
    name:p.name,machine:p.machine,hoop:{id:p.hoop,width:hoop.width,height:hoop.height},fabric:p.fabric,fabricName:en(fabrics[p.fabric].label),
    sewingSpeed:p.sewingSpeed??production.defaultSpeed,locks:p.locks,trimJump:p.trimJump,
    units:'mm; origin is the hoop top-left corner, x right, y down',
    objectCount:p.objects.length,objectLimit,designBounds:all.length?box(bounds(all.map(o=>o.rails?{...o,rings:[blockOutline(o.rails)]}:o))):null,
    objects:p.objects.map((o,i)=>summarizeObject(o,p,i)),
    groups:(p.groups??[]).map(g=>({id:g.id,name:g.name,objects:p.objects.filter(o=>o.group===g.id).map(o=>o.id)})),
    images:(p.images??[]).map(i=>({id:i.id,name:i.name,x:r2(i.x),y:r2(i.y),width:r2(i.width),height:r2(i.height),rotation:i.rotation??0,opacity:i.opacity,...(i.hidden&&{hidden:true}),...(i.locked&&{locked:true})})),
    ...extra,
  };
}

// Full settings for one object; geometry (rings, curve anchors, rails) only when asked, rounded to 0.01 mm.
export function objectDetail(o:StitchObject,p:Project,geometry=false){
  const {rings,curve,rails,sources,text,...settings}=o;
  const resolved=resolve(o,p.fabric,p.locks);
  return {
    ...settings,bounds:objectBox(o),closed:isClosedShape(o),
    resolved:{spacing:r2(resolved.spacing),underlay:resolved.underlay,underlayOptions:underlayOptions(o.kind),pullCompensation:r2(resolved.pullCompensation),splitLength:resolved.splitLength,shortStitches:resolved.shortStitches,tieIn:resolved.tieIn,tieOff:resolved.tieOff,lockSize:resolved.lockSize},
    ...(text&&{text:{...text,font:text.font.family,fontRef:text.font,path:undefined}}),
    ...(sources&&{redworkSources:sources.length}),
    pointCount:rings.reduce((n,r)=>n+r.length,0),
    ...(geometry&&{geometry:{rings:rings.map(r=>r.map(roundPoint)),...(curve&&{curve:{...curve,points:curve.points.map(roundPoint)}}),...(rails&&{rails:{...rails,points:rails.points.map(s=>s.map(roundPoint))}})}}),
  };
}

// The check panel, as data: what is wrong, why it matters, how to fix it and whether a one-click fix exists.
export function issueReport(list:Warning[],p:Project,engineMessage='',t:Translator=en){
  return list.map(w=>{
    const copy=explain(w,p,engineMessage,t),fix=fixFor(w,p,t),o=w.objectId?p.objects.find(o=>o.id===w.objectId):undefined;
    return {key:w.key,severity:w.severity,severityName:w.severity==='fail'?'Will likely fail':'Worth checking',code:w.code,source:w.source,
      objectId:w.objectId,objectName:o?.name??'Whole design',bounds:w.bounds.map(r2),values:w.values,
      title:copy.title,why:copy.why,howToFix:copy.fix,autoFix:fix?{label:fix.label,description:fix.title}:null};
  });
}
export const issueCounts=(list:Warning[])=>({fail:list.filter(w=>w.severity==='fail').length,check:list.filter(w=>w.severity==='check').length});

export const menuCommands=['copy','cut','paste','duplicate','delete','group','ungroup','lock','unlock','hide','show','redwork','breakApart','front','forward','backward','back','flipH','flipV','rotate','selectAll','unlockAll'] as const;
export type MenuCommand=typeof menuCommands[number];
export const shapeKinds=Object.keys(shapeNames) as ShapeKind[];
export const stitchKinds=Object.keys(kindNames) as Kind[];

export function reference(){
  return {
    units:'Millimetres. The hoop top-left corner is (0, 0); x grows right, y grows down. Angles are degrees.',
    objectLimit,
    stitchKinds:stitchKinds.map(k=>({id:k,name:en(kindNames[k]),hint:en(kindHints[k]),needsClosedShape:isFillKind(k),underlays:underlayOptions(k)})),
    fillPatterns:fillPatterns.map(f=>({id:f.id,name:en(f.name),params:f.params.map(q=>({key:q.key,default:q.default,min:q.min,max:q.max,step:q.step}))})),
    underlays:Object.fromEntries(Object.entries(underlayNames).map(([k,v])=>[k,en(v)])),
    hoops:Object.entries(hoops).map(([id,h])=>({id,width:h.width,height:h.height})),
    fabrics:Object.entries(fabrics).map(([id,f])=>({id,name:en(f.label),fillSpacing:f.fill,satinSpacing:f.satin,pullCompensation:f.pull,stabilizer:en(f.stabilizer),topping:en(f.topping)})),
    locks:{types:Object.fromEntries(Object.entries(lockNames).map(([k,v])=>[k,en(v)])),size:lockLimits.size,trimJump:lockLimits.trim},
    limits:{satinWidth:satinLimits.width,splitLength:satinLimits.split,ropeWidth:ropeLimits.width,text:textLimits,sewingSpeed:[production.minSpeed,production.maxSpeed]},
    shapes:shapeKinds,menuCommands,palette,
    threads:`${brotherThreads.length} Brother embroidery threads; pass threadCode (e.g. "${brotherThreads[0].code}") or matchThread:true to update_objects`,
    workflow:['get_reference (once)','get_design','list_issues','fix with apply_issue_fix / update_objects / transform_objects','capture_preview to look at the result','export_design'],
  };
}

// Settings an agent may patch; null resets a setting to its inherited (fabric/Setup) default.
export const editableKeys=['name','color','kind','length','angle','satinWidth','fillLength','handStitch','gradient','fillUnderlays','fillPattern','patternParams','crossStyle','crossSize','threadCount','coverage','dense','flipped','center','tolerance','spacing','underlay','pullCompensation','splitLength','shortStitches','entry','exit','tieIn','tieOff','lockSize','ropeWidth','eFlipped','rowShortening','densityTrigger','hidden','locked'] as const;
export type ObjectPatch=Partial<Record<typeof editableKeys[number],unknown>>&{threadCode?:string;matchThread?:boolean};
const resettable=new Set<string>(['fillLength','handStitch','gradient','fillUnderlays','fillPattern','patternParams','crossStyle','crossSize','threadCount','coverage','dense','flipped','center','tolerance','spacing','underlay','pullCompensation','splitLength','shortStitches','entry','exit','tieIn','tieOff','lockSize','ropeWidth','eFlipped','rowShortening','densityTrigger','hidden','locked']);

// Mirrors the settings panel: kind changes go through changeStitchKind, fills need a closed shape,
// a new colour drops its thread reference, and null/undefined removes the key (inherit).
export function patchObject(o:StitchObject,patch:ObjectPatch):{object:StitchObject}|{error:string}{
  const unknown=Object.keys(patch).filter(k=>!(editableKeys as readonly string[]).includes(k)&&k!=='threadCode'&&k!=='matchThread');
  if(unknown.length)return {error:`Unknown or read-only setting: ${unknown.join(', ')}. Editable: ${editableKeys.join(', ')}.`};
  if(o.locked&&patch.locked!==false&&patch.locked!==null)return {error:`"${o.name}" is locked. Pass locked:false to unlock it first.`};
  const kind=patch.kind as Kind|undefined;
  if(kind!==undefined&&!stitchKinds.includes(kind))return {error:`Unknown stitch kind "${kind}".`};
  if(kind&&kind!==o.kind&&isFillKind(kind)&&!isClosedShape(o))return {error:`"${o.name}" is an open line; ${kind} needs a closed shape.`};
  let next:StitchObject=o;
  if(kind&&kind!==o.kind){next=changeStitchKind(o,kind);if(next.kind!==kind&&!(o.text&&kind==='manual'))return {error:`"${o.name}" can't change from ${o.kind} to ${kind} (satin blocks, satin lettering and redwork keep their kind).`};}
  const rest:Record<string,unknown>={...patch};delete rest.kind;delete rest.threadCode;delete rest.matchThread;
  next={...next,...rest} as StitchObject;
  for(const [k,v] of Object.entries(rest))if(v===null||v===undefined){if(!resettable.has(k))return {error:`${k} can't be reset.`};delete (next as Record<string,unknown>)[k];}
  if(typeof next.name==='string')next.name=next.name.slice(0,40);
  if(patch.color!==undefined)delete next.thread;
  if(patch.threadCode!==undefined){const thread=brotherThreads.find(t=>t.code===String(patch.threadCode));if(!thread)return {error:`Unknown Brother thread code "${patch.threadCode}".`};next={...next,color:thread.color,thread:threadReference(thread)};}
  else if(patch.matchThread){const thread=nearestBrother(next.color);next={...next,color:thread.color,thread:threadReference(thread) as Thread};}
  return {object:next};
}

// Returns the project only if the editor would accept it (same validation as loading a file).
export function checked(p:Project):{project:Project}|{error:string}{
  if(p.objects.length>objectLimit)return {error:`A design holds at most ${objectLimit} objects.`};
  return validProject(p)?{project:p}:{error:'That change produces an invalid design (check values against get_reference limits).'};
}

const outside=(rings:Point[][],hoop:{width:number;height:number})=>rings.some(r=>r.some(([x,y])=>x<0||y<0||x>hoop.width||y>hoop.height));
const radial={circle,star,triangle,diamond,hexagon,heart};

// A filled shape centred on center with the given width (and height for rectangles), as the Shapes tool draws it.
export function makeShape(kind:ShapeKind,center:Point,width:number,height:number,p:Project,opts:{name?:string;color?:string;kind?:Kind}={}):{object:StitchObject}|{error:string}{
  if(!shapeKinds.includes(kind))return {error:`Unknown shape "${kind}". Use one of ${shapeKinds.join(', ')}.`};
  if(!(width>=1)||!(height>=1))return {error:'Shapes must be at least 1 mm across.'};
  const shape=kind==='rect'?rect([center[0]-width/2,center[1]-height/2],[center[0]+width/2,center[1]+height/2]):radial[kind](center,width/2);
  const curve={points:shape.points,closed:true,corners:shape.corners,spline:'levien' as const};
  const ring=curveRing(curve);if(outside([ring],hoops[p.hoop]))return {error:'The shape would extend outside the hoop. Move it inward or make it smaller.'};
  let o:StitchObject={...object(opts.name??en(shapeNames[kind]),[ring],'fill',opts.color??palette[3]),fillPattern:'tatami',curve};
  if(opts.kind&&opts.kind!=='fill'){const r=patchObject(o,{kind:opts.kind});if('error' in r)return r;o=r.object;}
  return {object:o};
}

export type PathMode='open'|'closed'|'blocks'|'points';
// Builds the object the drawing tools make when a path is finished. corners: one flag per point
// (true: sharp corner, false: smooth curve point); omitted means every point is a corner.
export function makePath(mode:PathMode,points:Point[],p:Project,opts:{corners?:boolean[];smooth?:boolean;name?:string;color?:string;kind?:Kind}={}):{object:StitchObject}|{error:string}{
  const min=mode==='closed'?3:mode==='blocks'?4:mode==='points'?1:2;
  if(points.length<min)return {error:`A ${mode} path needs at least ${min} points.`};
  if(points.length>2000)return {error:'Use at most 2000 points.'};
  if(points.some(q=>!Array.isArray(q)||q.length!==2||!q.every(Number.isFinite)))return {error:'Points must be [x, y] pairs in mm.'};
  const corners=opts.corners??points.map(()=>!opts.smooth),color=opts.color??palette[3],hoop=hoops[p.hoop];
  let o:StitchObject;
  if(mode==='blocks'){
    const rails=draftRails(points,corners);if(!rails)return {error:'Blocks need pairs of points: left, right, left, right…'};
    o=withRails(object(opts.name??'Satin block',[],'satin-block',color),rails);
    if(outside([blockOutline(rails)],hoop))return {error:'The block extends outside the hoop.'};
    return {object:o};
  }
  if(mode==='points'){o=object(opts.name??'Point stitches',[points.map(q=>[...q] as Point)],'manual',color);}
  else{
    const closed=mode==='closed',curve={points:points.map(q=>[...q] as Point),closed,corners,spline:'levien' as const};
    o={...object(opts.name??(closed?'Closed shape':'Open shape'),[curveRing(curve,!closed)],closed?'fill':'running',color),curve,...(closed&&{fillPattern:'tatami' as const})};
  }
  if(outside(o.rings,hoop))return {error:'The path extends outside the hoop. Keep every point within 0…width and 0…height mm.'};
  if(opts.kind&&opts.kind!==o.kind){const r=patchObject(o,{kind:opts.kind});if('error' in r)return r;o=r.object;}
  return {object:o};
}

// ---- argument validation -------------------------------------------------------------------------
// Browsers don't enforce inputSchema, so every tool call is checked here first: unknown keys, required
// keys, JSON types, enums, ranges, lengths, and nested objects/arrays where the schema describes them.
export type Schema={type?:string|string[];properties?:Record<string,Schema>;required?:string[];additionalProperties?:boolean;items?:Schema;enum?:unknown[];minimum?:number;maximum?:number;minItems?:number;maxItems?:number;maxLength?:number;description?:string};
const typeOf=(v:unknown)=>v===null?'null':Array.isArray(v)?'array':typeof v==='number'?(Number.isInteger(v)?'integer':'number'):typeof v;
const matches=(v:unknown,type:string)=>{const actual=typeOf(v);return actual===type||type==='number'&&actual==='integer';};
export function validateArgs(schema:Schema,value:unknown,path=''):string|null{
  const name=path||'arguments',types=schema.type===undefined?null:Array.isArray(schema.type)?schema.type:[schema.type];
  if(types&&!types.some(t=>matches(value,t)))return `${path?`'${path}'`:'Arguments'} must be ${types.join(' or ')}, not ${typeOf(value)==='integer'?'number':typeOf(value)}.`;
  if(schema.enum&&!schema.enum.includes(value))return `'${name}' must be one of: ${schema.enum.map(v=>v===null?'null':String(v)).join(', ')}.`;
  if(typeof value==='number'){
    if(!Number.isFinite(value))return `'${name}' must be a finite number.`;
    if(schema.minimum!==undefined&&value<schema.minimum)return `'${name}' must be at least ${schema.minimum}.`;
    if(schema.maximum!==undefined&&value>schema.maximum)return `'${name}' must be at most ${schema.maximum}.`;
  }
  if(typeof value==='string'&&schema.maxLength!==undefined&&value.length>schema.maxLength)return `'${name}' must be at most ${schema.maxLength} characters.`;
  if(Array.isArray(value)){
    if(schema.minItems!==undefined&&value.length<schema.minItems)return `'${name}' needs at least ${schema.minItems} item${schema.minItems===1?'':'s'}.`;
    if(schema.maxItems!==undefined&&value.length>schema.maxItems)return `'${name}' takes at most ${schema.maxItems} item${schema.maxItems===1?'':'s'}.`;
    if(schema.items)for(let i=0;i<value.length;i++){const e=validateArgs(schema.items,value[i],`${name}[${i}]`);if(e)return e;}
  }
  if(typeOf(value)==='object'&&schema.properties){
    const record=value as Record<string,unknown>,allowed=Object.keys(schema.properties);
    if(schema.additionalProperties===false){
      const unknown=Object.keys(record).filter(k=>!allowed.includes(k));
      if(unknown.length)return `Unknown argument${unknown.length>1?'s':''} ${unknown.map(k=>`'${path?`${path}.`:''}${k}'`).join(', ')}. Allowed: ${allowed.length?allowed.join(', '):'none'}.`;
    }
    for(const k of schema.required??[])if(record[k]===undefined)return `Missing required argument '${path?`${path}.`:''}${k}'.`;
    for(const [k,v] of Object.entries(record))if(v!==undefined&&schema.properties[k]){const e=validateArgs(schema.properties[k],v,path?`${path}.${k}`:k);if(e)return e;}
  }
  return null;
}

// Editor errors are shown in the UI language; agents always get English. Finds the Turkish template
// (with {placeholders}) that produced a message and fills the English one with the same values.
let templates:{key:Key;pattern:RegExp;names:string[]}[]|null=null;
export function englishMessage(message:string):string{
  if(!message)return message;
  // Templates that are only placeholders ("{v0}") would match anything, so they are skipped.
  templates??=(Object.keys(trDictionary) as Key[]).filter(key=>(trDictionary[key] as string).replace(/\{\w+\}/g,'').trim().length>2).map(key=>{
    const source=trDictionary[key] as string,names:string[]=[];
    const pattern=new RegExp(`^${source.split(/\{(\w+)\}/).map((part,i)=>i%2?(names.push(part),'(.+?)'):part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('')}$`);
    return {key,pattern,names};
  });
  for(const {key,pattern,names} of templates){
    const m=pattern.exec(message);if(!m)continue;
    return (enDictionary[key] as string).replace(/\{(\w+)\}/g,(all,name)=>{const i=names.indexOf(name);return i<0?all:m[i+1];});
  }
  return message;
}

// ---- point editing -------------------------------------------------------------------------------
// The anchors the point editor shows. Curves: ring 0, one entry per anchor. Satin blocks: ring 0 is the
// left rail and ring 1 the right rail; index k on both rails is rung k. Plain outlines: one ring per path.
export function pointEditBlock(o:StitchObject):string|null{
  if(o.text)return 'Text is laid out from its font; change it with update_text, or convert it to shapes first.';
  if(o.kind==='redwork')return 'Redwork points can\'t be edited. Break it apart (edit_objects breakApart) to edit the source lines.';
  if(o.locked)return `"${o.name}" is locked. Unlock it first.`;
  if(o.hidden)return `"${o.name}" is hidden. Show it first.`;
  if(!o.rings.length)return `"${o.name}" has no points.`;
  return null;
}
export function editablePoints(o:StitchObject,p:Project){
  const block=pointEditBlock(o),pt=([x,y]:Point,index:number,corner?:boolean)=>({index,x:r2(x),y:r2(y),...(corner!==undefined&&{corner})});
  const ends=routeEnds(p,o.id);
  const base={id:o.id,name:o.name,kind:o.kind,editable:!block,...(block&&{reason:block}),
    ends:ends&&{entry:roundPoint(ends.entry),exit:roundPoint(ends.exit),entryAutomatic:ends.auto.entry,exitAutomatic:ends.auto.exit}};
  if(o.rails)return {...base,structure:'satin-block rails',closed:false,minPoints:2,
    note:'Each rung is a pair: index k on ring 0 (left rail) and ring 1 (right rail). insert adds a whole rung on the centre line; remove deletes the whole rung.',
    rings:o.rails.points.map((rail,ring)=>({ring,rail:ring?'right':'left',points:rail.map((q,i)=>pt(q,i,!!o.rails!.corners?.[ring]?.[i]))}))};
  if(o.curve)return {...base,structure:'curve',closed:o.curve.closed,minPoints:o.curve.closed||isFillKind(o.kind)?3:2,
    note:'Anchors of a Levien spline: corner true is a sharp point, false a smooth curve point.',
    rings:[{ring:0,points:o.curve.points.map((q,i)=>pt(q,i,!!o.curve!.corners?.[i]))}]};
  const closed=isFillKind(o.kind);
  return {...base,structure:'polyline',closed,minPoints:closed?3:2,note:'Straight segments between points; corner flags don\'t apply.',
    rings:o.rings.map((r,ring)=>({ring,points:r.map((q,i)=>pt(q,i))}))};
}
export type PointOp={op:'move';ring?:number;index:number;to?:Point;by?:Point}|{op:'insert';ring?:number;afterIndex:number;at:Point;corner?:boolean}
  |{op:'remove';ring?:number;index:number}|{op:'set_corner';ring?:number;index:number;corner:boolean}|{op:'set_end';end:'entry'|'exit';at:Point|null};
const finitePoint=(v:unknown):v is Point=>Array.isArray(v)&&v.length===2&&v.every(n=>typeof n==='number'&&Number.isFinite(n));
// Applies every operation in order (indices refer to the result of the previous operation) and returns
// one object for a single commit, or the first problem. The result must stay inside the hoop.
export function editPoints(o:StitchObject,ops:PointOp[],hoop:{width:number;height:number}):{object:StitchObject}|{error:string}{
  const block=pointEditBlock(o);if(block)return {error:block};
  if(!Array.isArray(ops)||!ops.length)return {error:'operations must list at least one operation.'};
  let next=o;
  for(const [n,op] of ops.entries()){
    const where=`operations[${n}] (${op?.op})`,ring=('ring' in op&&op.ring)||0;
    const anchors=next.rails?next.rails.points[ring]:next.curve?(ring===0?next.curve.points:undefined):next.rings[ring];
    if(op.op!=='set_end'&&!anchors)return {error:`${where}: no ring ${ring}. ${next.rails?'Satin blocks have ring 0 (left rail) and 1 (right rail).':next.curve?'Curves have only ring 0.':`This object has rings 0–${next.rings.length-1}.`}`};
    const inRange=(i:unknown)=>Number.isInteger(i)&&(i as number)>=0&&(i as number)<anchors!.length;
    if(op.op==='move'){
      if(!inRange(op.index))return {error:`${where}: index must be 0–${anchors!.length-1}.`};
      const from=anchors![op.index],to=op.to!==undefined?op.to:op.by!==undefined&&finitePoint(op.by)?[from[0]+op.by[0],from[1]+op.by[1]] as Point:null;
      if(!finitePoint(to))return {error:`${where}: give to:[x, y] or by:[dx, dy] in mm.`};
      next=moveGeometry(next,(q,ri,i)=>ri===ring&&i===op.index?[to[0],to[1]]:q);
    }else if(op.op==='insert'){
      if(!Number.isInteger(op.afterIndex)||op.afterIndex<(next.rails?0:-1)||op.afterIndex>=anchors!.length)return {error:`${where}: afterIndex must be ${next.rails?0:-1}–${anchors!.length-1}${next.rails?' (between two rungs)':' (-1 inserts before the first point)'}.`};
      if(!finitePoint(op.at))return {error:`${where}: at must be [x, y] in mm.`};
      if(next.rails&&op.afterIndex>=anchors!.length-1)return {error:`${where}: a new rung must go between two rungs (afterIndex 0–${anchors!.length-2}).`};
      const inserted=insertGeometryPoint(next,ring,op.afterIndex+1,op.at,!!op.corner);
      if(inserted===next)return {error:`${where}: the point could not be inserted there (too many points, or too close to a rung end).`};
      next=inserted;
    }else if(op.op==='remove'){
      if(!inRange(op.index))return {error:`${where}: index must be 0–${anchors!.length-1}.`};
      const removed=removeGeometryPoint(next,ring,op.index);
      if(removed===next)return {error:`${where}: ${next.rails?'keep at least two rungs in a satin block.':`keep at least ${next.curve?.closed||isFillKind(next.kind)?3:2} points in this path.`}`};
      next=removed;
    }else if(op.op==='set_corner'){
      if(!next.rails&&!next.curve)return {error:`${where}: this outline is a polyline without corner flags; every point is already sharp.`};
      if(!inRange(op.index))return {error:`${where}: index must be 0–${anchors!.length-1}.`};
      if(typeof op.corner!=='boolean')return {error:`${where}: corner must be true or false.`};
      next=setCorner(next,op.index,op.corner,ring);
    }else if(op.op==='set_end'){
      if(op.end!=='entry'&&op.end!=='exit')return {error:`${where}: end must be "entry" or "exit".`};
      if(op.at!==null&&!finitePoint(op.at))return {error:`${where}: at must be [x, y] in mm, or null for automatic.`};
      next=withEnd(next,op.end,op.at??undefined);
    }else return {error:`${where}: op must be move, insert, remove, set_corner or set_end.`};
  }
  const extent=next.rails?[blockOutline(next.rails)]:next.rings;
  if(outside(extent,hoop))return {error:'That edit would put part of the object outside the hoop. Keep points within 0…width and 0…height mm.'};
  return {object:next};
}
