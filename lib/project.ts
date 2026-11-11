import {validPathSettings,type PathBinding} from './path-binding';
import {validThread,type Thread} from './threads';
import {createT,type Translator,type Key} from './i18n';
import {fillPatterns, validPatternParams, type FillPattern, type PatternParams} from './fill-patterns';
import {validText, type TextSpec} from './text';
import {validImages} from './images';
export type Point = [number, number];
export type Kind = 'fill' | 'running' | 'bean' | 'backstitch' | 'satin' | 'zigzag' | 'e-stitch' | 'cross' | 'underlay' | 'manual' | 'double-rope' | 'triple-rope' | 'satin-block';
// A straight angle guide across a fill (Ember's Edit angles), from a to b.
export type AngleGuide = {a: Point; b: Point};
// Two-rail satin block: left/right rail anchors paired by index (rung k = left[k], right[k]).
export type Rails = {points: [Point[], Point[]]; corners?: [boolean[], boolean[]]};
export type FillGradient = {mode:'ramp';start:number;end:number;endSpacing:number}|{mode:'plateau';center:number;width:number;endSpacing:number};
export type FillUnderlay = {angle:number;spacing:number;length:number;inset:number};
export type Underlay = 'none' | 'center' | 'edge' | 'zigzag' | 'edge-zigzag' | 'tatami' | 'edge-tatami';
export type Fabric = 'woven' | 'gauze' | 'jersey' | 'rib' | 'fleece' | 'terry' | 'denim';
export type Lock = 'none' | 'tack' | 'triangle';
export type Locks = {tieIn: Lock; tieOff: Lock; lockSize: number};
// Fabric-driven values are optional: unset values follow the project's fabric profile.
export type StitchObject = {
  id: string; name: string; color: string; kind: Kind; rings: Point[][];
  hidden?: boolean; locked?: boolean; layoutOnly?: boolean; group?: string; thread?: Thread; // locked: not hit-tested or edited on the canvas, still sewn
  length: number; angle: number; satinWidth: number;
  fillLength?: number; handStitch?: 0|1|2|3|4|5; gradient?: FillGradient;
  fillUnderlays?: FillUnderlay[];
  fillPattern?: FillPattern; patternParams?: PatternParams;
  crossStyle?: 'cross'|'upright'|'double'|'smyrna'|'half';
  crossSize?: number; threadCount?: number; coverage?: number; dense?: boolean; flipped?: boolean;
  center?: Point; // Circular fill; unset uses the area centroid
  tolerance?: number; // explicit run tolerance; unset keeps legacy sampling
  spacing?: number; underlay?: Underlay; pullCompensation?: number;
  splitLength?: number; shortStitches?: boolean; // wide kinds; unset follows satinDefaults
  entry?: Point; exit?: Point; // on the outline (open paths: an end); unset is automatic
  tieIn?: Lock; tieOff?: Lock; lockSize?: number; // unset follows the project's locks
  curve?: {points: Point[]; closed: boolean; corners?: boolean[]; spline?: 'levien'};
  rails?: Rails; // satin-block only; rings then hold the centre line
  ropeWidth?: number; // rope runs: offset either side (mm); unset is ropeDefaults.width
  eFlipped?: boolean; // E-stitch: teeth on the other side; unset keeps the original side
  text?: TextSpec;
  angleGuides?: AngleGuide[]; // fills: 1 sets the angle, 2+ sweep the rows (lib/angle-guides.ts)
  rowShortening?: boolean; densityTrigger?: number; // sweep density control; unset = on, 0.5
  rotation?:number; // accumulated editor rotation, degrees
  fillRule?: 'nonzero'; // SVG winding, also set by geometryPayload for text
};
// Legacy single reference image (read from old files; migrateImages turns it into images[0]).
export type Artwork = {src: string; name: string; x: number; y: number; width: number; height: number};
export type RefImage = Artwork & {id: string; rotation?: number; opacity: number; hidden?: boolean; locked?: boolean};
export type Project = {
  version: 1; name: string; machine: 'brother-pr1x'; hoop: string;
  fabric: Fabric; locks: Locks; trimJump: number; objects: StitchObject[]; images?: RefImage[]; artwork?: Artwork;
  groups?: {id: string; name: string; pathBinding?:PathBinding}[];
  sewingSpeed?: number; // stitches/minute; unset = 650, PR1X maximum 1000
};
// trim: a jump that starts with a thread cut; travel: an untrimmed connecting stitch between runs.
export type Command = {type: 'stitch' | 'jump'; x: number; y: number; fromX: number; fromY: number; block: number; objectIndex?: number; objectId?: string; fromObjectId?: string; trim?: boolean; tie?: 'in'|'off'|null; travel?: boolean};
export type Severity = 'fail' | 'check';
// A compiler design-check finding; bounds [x0, y0, x1, y1] in mm (see lib/check.ts).
export type RawWarning = {code: string; objectId: string | null; bounds: [number, number, number, number]; severity: Severity; values: Record<string, number> & {parts?: {bounds: [number, number, number, number]; area: number}[]}; fromId?: string};
export type Compiled = {
  warnings?: RawWarning[];
  pes: string; filename: string; commands: Command[]; threads: {color: string; name: string; thread?: Thread}[];
  stats: {stitches: number; jumps: number; jumpLength: number; trims: number; colorChanges: number; width: number; height: number; maxStitch: number; bytes: number; durationMs: number};
  engine: string; pesVersion: string;
};
export const hoops: Record<string, {width: number; height: number; label: Key}> = {
  '100x100': {width: 100, height: 100, label: '100 × 100 mm'},
  '180x130': {width: 180, height: 130, label: '180 × 130 mm'},
  '300x200': {width: 300, height: 200, label: '300 × 200 mm'},
  '60x40': {width: 60, height: 40, label: '60 × 40 mm'},
};
export const kindNames: Record<Kind, Key> = {running:'Running / straight', bean:'Bean stitch', backstitch:'Backstitch', 'double-rope':'Double rope run', 'triple-rope':'Triple rope run', 'satin-block':'Satin block', satin:'Satin line', zigzag:'Zigzag stitch', 'e-stitch':'Appliqué E-stitch', fill:'Tatami fill', cross:'Cross stitch fill', underlay:'Underlay stitch', manual:'Manual stitches'};
export const kindHints: Record<Kind, Key> = {running:'A single pass along a line', bean:'Three passes for a stronger outline', backstitch:'Overlapping stitches for a firm outline', 'double-rope':'A zigzag rope over a hidden double run', 'triple-rope':'A twisted rope sewn out and back', 'satin-block':'Satin between two drawn rails; the width can change', satin:'Dense, smooth coverage along a line', zigzag:'Open zigzags along a line', 'e-stitch':'An open edge for appliqué', fill:'Rows of short stitches covering a shape', cross:'Small crosses covering a shape', underlay:'A light foundation or placement line', manual:'Place each needle point yourself'};
export const isFillKind=(kind:Kind)=>kind==='fill'||kind==='cross';
export const hasCrossStyle=(o:StitchObject)=>o.crossStyle!==undefined||(['crossSize','threadCount','coverage','dense','flipped'] as const).some(k=>o[k]!==undefined);
export const isWideKind=(kind:Kind)=>kind==='satin'||kind==='zigzag'||kind==='e-stitch';
export const isRopeKind=(kind:Kind)=>kind==='double-rope'||kind==='triple-rope';
// Satin settings without a width: blocks take their width from the rails.
const isSatinKind=(kind:Kind)=>kind==='satin'||kind==='satin-block';
export const usesSplit=(kind:Kind)=>isWideKind(kind)||kind==='satin-block';
// Ember's rope run defaults; the width is the offset each side, so the rope is twice as wide.
export const ropeDefaults={width:.4,length:1.5};
export const ropeLimits={width:[.2,2] as const};
export type FabricProfile = {label: Key; fill: number; satin: number; fillUnderlay: Underlay; satinUnderlay: Underlay; pull: number; stabilizer: Key; topping: Key};
// The only fabric table: geometryPayload sends resolved values, so the compiler has no fabric defaults.
// fill/satin: row and column spacing (mm); pull: compensation (mm).
export const fabrics: Record<Fabric, FabricProfile> = {
  woven: {label: 'Woven cotton', fill: .42, satin: .4, fillUnderlay: 'tatami', satinUnderlay: 'center', pull: .2, stabilizer: 'Tear-away', topping: 'None'},
  gauze: {label: 'Muslin / double gauze', fill: .5, satin: .45, fillUnderlay: 'edge-tatami', satinUnderlay: 'edge', pull: .3, stabilizer: 'Cut-away mesh', topping: 'Water-soluble'},
  jersey: {label: 'Jersey / T-shirt knit', fill: .48, satin: .42, fillUnderlay: 'edge-tatami', satinUnderlay: 'edge', pull: .35, stabilizer: 'No-show mesh cut-away', topping: 'None'},
  rib: {label: 'Interlock / rib knit', fill: .5, satin: .42, fillUnderlay: 'edge-tatami', satinUnderlay: 'edge', pull: .4, stabilizer: 'No-show mesh cut-away', topping: 'Water-soluble on rib'},
  fleece: {label: 'Fleece / minky', fill: .45, satin: .4, fillUnderlay: 'edge-tatami', satinUnderlay: 'edge-zigzag', pull: .4, stabilizer: 'Cut-away', topping: 'Water-soluble'},
  terry: {label: 'Terry / towelling', fill: .4, satin: .38, fillUnderlay: 'edge-tatami', satinUnderlay: 'edge-zigzag', pull: .35, stabilizer: 'Tear-away', topping: 'Water-soluble'},
  denim: {label: 'Denim / twill', fill: .4, satin: .38, fillUnderlay: 'tatami', satinUnderlay: 'center', pull: .15, stabilizer: 'Heavy tear-away', topping: 'None'},
};
export const underlayNames: Record<Underlay, Key> = {none: 'None', center: 'Center walk', edge: 'Edge walk', zigzag: 'Light zigzag', 'edge-zigzag': 'Edge + zigzag', tatami: 'Light tatami', 'edge-tatami': 'Edge + tatami'};
export const underlayOptions=(kind:Kind):Underlay[]=>isFillKind(kind)?['none','edge','tatami','edge-tatami']:isSatinKind(kind)?['none','center','edge','zigzag','edge-zigzag']:['none'];
export const usesSpacing=(kind:Kind)=>isFillKind(kind)||usesSplit(kind);
/** @alias */ export const usesPull=usesSpacing;
export const usesShortStitches=(kind:Kind)=>isSatinKind(kind)||kind==='zigzag';
// Bites above 7 mm loosen and snag on baby clothes (PR1X sews up to 12.7 mm); width cap 10 mm
// keeps even an unsplit bite with 1 mm compensation within the machine limit.
export const satinLimits={width:[.5,10] as const,split:[3,12] as const};
export const satinDefaults={splitLength:7,shortStitches:true};
// Satin fill covers whole areas: 7 mm split bites lie loose across a large shape, so it splits at 5 mm.
export const sweepSatinSplit=5;
export type Setting = 'spacing' | 'underlay' | 'pullCompensation' | 'splitLength' | 'shortStitches' | keyof Locks;
// Ties are sewn only around trims: tie-in after each trim and at the start, tie-off before each trim
// and colour change. Size 1 mm hides under fill rows and satin yet grips (smaller on tiny pieces);
// jumps up to 3 mm (the longest running stitch) sew as one connecting stitch instead of a trim when
// later stitches cover it; over bare fabric anything over 1 mm trims (compiler hidden_connects).
export const lockNames: Record<Lock, Key> = {none: 'None', tack: 'Tack', triangle: 'Triangle'};
export const lockLimits={size:[.5,1.5] as const,trim:[1,10] as const};
export const defaultLocks: Locks = {tieIn: 'tack', tieOff: 'tack', lockSize: 1};
export const defaultTrimJump=3;
export const isLockSetting=(key:Setting):key is keyof Locks=>key==='tieIn'||key==='tieOff'||key==='lockSize';
// Profile default for an unset value; null when the stitch style ignores the setting.
export function profileDefault(kind:Kind, fabric:Fabric, key:Exclude<Setting,keyof Locks>):number|Underlay|boolean|null {
  const f=fabrics[fabric];
  if(key==='splitLength')return usesSplit(kind)?satinDefaults.splitLength:null;
  if(key==='shortStitches')return usesShortStitches(kind)?satinDefaults.shortStitches:null;
  if(key==='spacing')return kind==='fill'?f.fill:isSatinKind(kind)?f.satin:usesSpacing(kind)?1.5:null;
  if(key==='underlay')return kind==='fill'?f.fillUnderlay:isSatinKind(kind)?f.satinUnderlay:kind==='cross'?'none':null;
  return usesPull(kind)?f.pull:null;
}
// True when the default comes from the fabric (not a fixed style default such as zigzag spacing).
export const fromFabric=(kind:Kind,key:Setting)=>key==='pullCompensation'?usesPull(kind):key!=='splitLength'&&key!=='shortStitches'&&!isLockSetting(key)&&(kind==='fill'||isSatinKind(kind));
export const withFabric=(p:Project,fabric:Fabric):Project=>({...p,fabric});
// railPaths: the compile payload's sampled block rails, equal length and paired by index.
export type Resolved = StitchObject & Locks & {spacing: number; underlay: Underlay; pullCompensation: number; splitLength: number; shortStitches: boolean; railPaths?: [Point[], Point[]]; satinColumns?: {railPaths:[Point[],Point[]];character:number}[]; followStroke?: boolean};
export function resolve(o:StitchObject, fabric:Fabric, locks:Locks):Resolved {
  const sweep=o.kind==='fill'&&o.fillPattern==='sweepSatin';
  const sweepDefaults:Partial<Record<Exclude<Setting,keyof Locks>,number|Underlay|boolean>>={spacing:.32,underlay:'center',pullCompensation:.4,...satinDefaults,splitLength:sweepSatinSplit};
  const value=(key:Exclude<Setting,keyof Locks>)=>o[key]??(sweep?sweepDefaults[key]??profileDefault(o.kind,fabric,key):profileDefault(o.kind,fabric,key));
  const underlay=(value('underlay')??'none') as Underlay;
  return {...o, spacing: Number(value('spacing')??fabrics[fabric].fill), underlay, pullCompensation: Number(value('pullCompensation')??0), splitLength: Number(value('splitLength')??0), shortStitches: value('shortStitches')===true,
    tieIn: o.tieIn??locks.tieIn, tieOff: o.tieOff??locks.tieOff, lockSize: o.lockSize??locks.lockSize};
}
// Edge walks stay in the legacy underlay flag; this list contains row passes only.
export const fillUnderlayPreset=(underlay:Underlay,length:number):FillUnderlay[]=>underlay.includes('tatami')?[{angle:90,spacing:2,length,inset:.4}]:[];
const palette = ['#c99d72', '#f4e5cc', '#d8949b', '#664538', '#849984', '#a6bdca'];
export function object(name: string, rings: Point[][], kind: Kind = 'fill', color = palette[0]): StitchObject {
  return {id: crypto.randomUUID(), name, rings, kind, color, length: 2.5, angle: 35, satinWidth: 2};
}
function ellipse(cx: number, cy: number, rx: number, ry: number): Point[] {
  return Array.from({length: 48}, (_, i) => [cx+Math.cos(i/48*Math.PI*2)*rx, cy+Math.sin(i/48*Math.PI*2)*ry]);
}
export function bounds(objects: StitchObject[]) {
  const pts = objects.flatMap(o => o.rings.flat());
  if (!pts.length) return {x: 0, y: 0, width: 0, height: 0};
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return {x, y, width: Math.max(...xs)-x, height: Math.max(...ys)-y};
}
export const blankProject=(name:string,hoop='100x100',fabric:Fabric='woven'):Project=>({version:1,name,machine:'brother-pr1x',hoop,fabric,locks:{...defaultLocks},trimJump:defaultTrimJump,objects:[]});
export function demo(t:Translator=createT('en')): Project {
  // A simple teddy face with holes for the muzzle and inner ears, avoiding
  // stacked top fills. This is a new editable POC sample.
  const outer: Point[] = [];
  // Flatten cubic segments deterministically without a DOM dependency.
  const segments: Point[][] = [
    [[29,42],[18,37],[18,23],[28,22]], [[28,22],[34,20],[39,26],[38,32]],
    [[38,32],[46,29],[54,29],[62,32]], [[62,32],[61,26],[66,20],[72,22]],
    [[72,22],[82,23],[82,37],[71,42]], [[71,42],[76,49],[75,61],[67,67]],
    [[67,67],[57,75],[43,75],[33,67]], [[33,67],[25,61],[24,49],[29,42]],
  ];
  for (const [a,b,c,d] of segments) for (let i=0;i<14;i++) {
    const t=i/14, u=1-t;
    outer.push([u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*d[0], u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*d[1]]);
  }
  const muzzle = ellipse(50, 59, 10, 7), ear1 = ellipse(29, 31, 4.4, 5.2), ear2 = ellipse(71, 31, 4.4, 5.2);
  const items = [object(t("Honey bear"), [outer, muzzle, ear1, ear2]),
    object(t("Cream muzzle"), [muzzle], 'fill', palette[1]),
    object(t("Inner ears"), [ear1, ear2], 'fill', palette[1]),
    object(t("Rosy cheeks"), [ellipse(34,54,3,1.8), ellipse(66,54,3,1.8)], 'fill', palette[2]),
    object(t("Sleepy eyes"), [[[35,47],[36,48],[38,49],[40,48],[41,47]], [[59,47],[60,48],[62,49],[64,48],[65,47]]], 'bean', palette[3]),
    object(t("Little nose"), [ellipse(50,56,2.1,1.3)], 'fill', palette[3]),
    object(t("Smile"), [[[50,57],[50,60],[48,62],[46,60]], [[50,60],[52,62],[54,60]]], 'bean', palette[3])];
  return {version: 1, name: t("Sleepy little bear"), machine: 'brother-pr1x', hoop: '100x100', fabric: 'woven', locks: {...defaultLocks}, trimJump: defaultTrimJump, objects: items};
}
export function pathData(rings: Point[][], closed: boolean) {
  return rings.map(r => r.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')+(closed?' Z':'')).join(' ');
}

export const withGroup=(o:StitchObject,group?:string):StitchObject=>{
  if(o.group===group)return o;
  const next={...o};delete next.group;return group===undefined?next:{...next,group};
};
export function normalizeGroups(p:Project):Project {
  const known=new Set(p.groups?.map(g=>g.id)),seen=new Set<string>();let previous:string|undefined;
  const objects=p.objects.map(o=>{
    const g=o.group,keep=g!==undefined&&known.has(g)&&(g===previous||!seen.has(g));
    previous=keep?g:undefined;
    if(keep){seen.add(g);return o;}
    return withGroup(o);
  });
  const groups=p.groups?.filter(g=>seen.has(g.id));
  return objects.every((o,i)=>o===p.objects[i])&&groups?.length===p.groups?.length?p:{...p,objects,...(groups&&{groups})};
}

// The insertion index refers to the original order, even when the moved block precedes it.
export function moveObjects(p:Project,ids:string[],index:number,group?:string|null):Project {
  const selected=new Set(ids),block=p.objects.filter(o=>selected.has(o.id)).map(o=>withGroup(o,group??undefined));
  if(!block.length)return normalizeGroups(p);
  const at=p.objects.slice(0,Math.max(0,Math.min(p.objects.length,index))).filter(o=>!selected.has(o.id)).length;
  const rest=p.objects.filter(o=>!selected.has(o.id));
  return normalizeGroups({...p,objects:[...rest.slice(0,at),...block,...rest.slice(at)]});
}
export function groupObjects(p:Project,ids:string[],name?:string,t:Translator=createT('en')):{project:Project;groupId:string|null} {
  const selected=new Set(ids),members=p.objects.filter(o=>selected.has(o.id));
  if(members.length<2)return {project:p,groupId:null};
  let n=1;while(p.groups?.some(g=>g.name===t("Group {v0}",{v0:n})))n++;
  const groupId=crypto.randomUUID(),groups=[...(p.groups??[]),{id:groupId,name:name??t("Group {v0}",{v0:n})}];
  return {project:moveObjects({...p,groups},members.map(o=>o.id),p.objects.indexOf(members[0]),groupId),groupId};
}
export function ungroupObjects(p:Project,ids:string[]):Project {
  const selected=new Set(ids),objects=p.objects.map(o=>selected.has(o.id)?withGroup(o):o);
  return normalizeGroups(objects.every((o,i)=>o===p.objects[i])?p:{...p,objects});
}
/** @test */ export function ungroup(p:Project,groupId:string):Project {
  return ungroupObjects(p,p.objects.filter(o=>o.group===groupId).map(o=>o.id));
}
export function moveGroup(p:Project,groupId:string,index:number):Project {
  const target=p.objects[index]?.group;
  if(target!==undefined&&target!==groupId)while(index>0&&p.objects[index-1].group===target)index--;
  return moveObjects(p,p.objects.filter(o=>o.group===groupId).map(o=>o.id),index,groupId);
}

const validLock=(v:unknown)=>typeof v==='string'&&Object.hasOwn(lockNames,v);
const validSize=(v:unknown)=>typeof v==='number'&&v>=lockLimits.size[0]&&v<=lockLimits.size[1];
const inRange=(v:unknown,lo:number,hi:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const validPoint=(pt:unknown)=>Array.isArray(pt)&&pt.length===2&&pt.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1000);
// Both rails carry one anchor per rung: 2–100 rungs, no curve or text on the same object.
// Live satin text keeps outlines and settings instead, expanding to paired columns in geometryPayload.
function validRails(r:unknown,o:StitchObject):boolean {
  if(!r||typeof r!=='object'||o.curve||o.text)return false;
  const {points,corners}=r as Rails;
  if(!Array.isArray(points)||points.length!==2||!points.every(Array.isArray)||points[0].length!==points[1].length||points[0].length<2||points[0].length>100||!points.every(rail=>rail.every(validPoint)))return false;
  return corners===undefined||Array.isArray(corners)&&corners.length===2&&corners.every((c,i)=>Array.isArray(c)&&c.length===points[i].length&&c.every(v=>typeof v==='boolean'));
}
// Brings designs saved by older versions up to date before they are validated or edited.
// Redwork (removed) becomes one running-stitch object with the same lines, so the object count,
// ids, groups and Map to path layouts stay as they were and its lines become point-editable.
type Legacy=Omit<StitchObject,'kind'>&{kind:string;sources?:unknown};
const unRedwork=(o:Legacy):Legacy=>{if(o?.kind!=='redwork'&&o?.sources===undefined)return o;const {sources,...rest}=o;void sources;return o.kind==='redwork'?{...rest,kind:'running'}:rest;};
export function migrateProject<T>(value:T):T{
  if(!value||typeof value!=='object'||!Array.isArray((value as {objects?:unknown}).objects)||!JSON.stringify(value).includes('"redwork"'))return value;
  const p=value as unknown as Omit<Project,'objects'>&{objects:Legacy[]};
  const groups=p.groups?.map(g=>g.pathBinding?{...g,pathBinding:{...g.pathBinding,prototypes:(g.pathBinding.prototypes as unknown as Legacy[]).map(unRedwork) as unknown as StitchObject[]}}:g);
  return {...p,objects:p.objects.map(unRedwork),...(groups&&{groups})} as unknown as T;
}
export function validProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false;
  const p = value as Project;
  if (p.version !== 1 || p.machine !== 'brother-pr1x' || !hoops[p.hoop] || !Object.hasOwn(fabrics,p.fabric) || typeof p.name !== 'string') return false;
  if(p.sewingSpeed!==undefined&&!inRange(p.sewingSpeed,100,1000))return false;
  if (!Array.isArray(p.objects) || p.objects.length > 80) return false;
  if(p.groups!==undefined&&(!Array.isArray(p.groups)||p.groups.length>80||Array.from(p.groups).some(g=>!g||typeof g.id!=='string'||typeof g.name!=='string'||g.name.length>40)||new Set(p.groups.map(g=>g.id)).size!==p.groups.length))return false;
  const groups=new Set(p.groups?.map(g=>g.id));
  if (!p.locks || typeof p.locks !== 'object' || !validLock(p.locks.tieIn) || !validLock(p.locks.tieOff) || !validSize(p.locks.lockSize)) return false;
  if (typeof p.trimJump !== 'number' || !(p.trimJump >= lockLimits.trim[0] && p.trimJump <= lockLimits.trim[1])) return false;
  let count=0;
  for (const o of p.objects) {
    if(o?.rotation!==undefined&&(typeof o.rotation!=='number'||!Number.isFinite(o.rotation)||Math.abs(o.rotation)>360))return false;
    if (!o || typeof o.id !== 'string' || typeof o.name !== 'string' || !Object.hasOwn(kindNames,o.kind) || !/^#[0-9a-f]{6}$/i.test(o.color) || !Array.isArray(o.rings) || (!o.rings.length && !o.text)) return false;
    if(o.fillRule!==undefined&&o.fillRule!=='nonzero')return false;
    if(o.thread!==undefined&&!validThread(o.thread,o.color))return false;
    if(o.layoutOnly!==undefined&&typeof o.layoutOnly!=='boolean')return false;
    if(o.hidden!==undefined&&typeof o.hidden!=='boolean'||o.locked!==undefined&&typeof o.locked!=='boolean'||o.group!==undefined&&(typeof o.group!=='string'||!groups.has(o.group)))return false;
    if (o.text !== undefined && (!validText(o.text) || o.curve)) return false;
    for (const r of o.rings) {
      if (!Array.isArray(r) || r.length < (isFillKind(o.kind) ? 3 : 2)) return false;
      count+=r.length;
      if (count > 12000 || r.some(pt => !Array.isArray(pt) || pt.length !== 2 || pt.some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n)>1000))) return false;
    }
    if ([o.length,o.angle,o.satinWidth].some(n=>typeof n !== 'number' || !Number.isFinite(n))) return false;
    if(o.length<.5||o.length>3||o.angle< -180||o.angle>180||o.satinWidth<satinLimits.width[0]||o.satinWidth>satinLimits.width[1])return false;
    if(o.splitLength!==undefined&&(typeof o.splitLength!=='number'||!(o.splitLength>=satinLimits.split[0]&&o.splitLength<=satinLimits.split[1])))return false;
    if(o.shortStitches!==undefined&&typeof o.shortStitches!=='boolean')return false;
    if(o.fillLength!==undefined&&!inRange(o.fillLength,1,6))return false;
    if(o.handStitch!==undefined&&(!Number.isInteger(o.handStitch)||!inRange(o.handStitch,0,5)))return false;
    if(o.gradient!==undefined){const g=o.gradient;if(!g||typeof g!=='object'||!inRange(g.endSpacing,.3,4)||(g.mode==='ramp'? !inRange(g.start,0,1)||!inRange(g.end,0,1):g.mode==='plateau'?!inRange(g.center,0,1)||!inRange(g.width,0,1):true))return false;}
    if(o.fillUnderlays!==undefined&&(!Array.isArray(o.fillUnderlays)||o.fillUnderlays.length>3||Array.from(o.fillUnderlays).some(u=>!u||typeof u!=='object'||!inRange(u.angle,-180,180)||!inRange(u.spacing,1,4)||!inRange(u.length,1,5)||!inRange(u.inset,0,2))))return false;
    if(o.fillPattern!==undefined&&!fillPatterns.some(p=>p.id===o.fillPattern))return false;
    if(o.patternParams!==undefined&&!validPatternParams(o.fillPattern,o.patternParams))return false;
    if(o.tolerance!==undefined&&(typeof o.tolerance!=='number'||!(o.tolerance>=.1&&o.tolerance<=1)))return false;
    if(o.spacing!==undefined&&(typeof o.spacing!=='number'||!(o.spacing>=(o.kind==='fill'&&o.fillPattern==='circular'?.05:o.kind==='fill'&&o.fillPattern==='sweepSatin'?.2:.3)&&o.spacing<=(o.kind==='fill'&&o.fillPattern==='circular'?50:o.kind==='fill'&&o.fillPattern==='sweepSatin'?1:2))))return false;
    if(o.pullCompensation!==undefined&&(typeof o.pullCompensation!=='number'||!(o.pullCompensation>=0&&o.pullCompensation<=1)))return false;
    if(o.underlay!==undefined&&!(o.kind==='fill'&&o.fillPattern==='sweepSatin'?underlayOptions('satin'):underlayOptions(o.kind)).includes(o.underlay))return false;
    if(o.crossStyle!==undefined&&!['cross','upright','double','smyrna','half'].includes(o.crossStyle))return false;
    for(const f of fillPatterns.find(p=>p.id==='crossStitchFill')!.params){const v=o[f.key as 'crossSize'];if(v!==undefined&&(!inRange(v,f.min,f.max)||Math.abs((v-f.min)/f.step-Math.round((v-f.min)/f.step))>1e-7))return false;}
    if([o.dense,o.flipped].some(v=>v!==undefined&&typeof v!=='boolean'))return false;
    if(o.center!==undefined&&(!validPoint(o.center)||o.center.some((n,i)=>n<0||n>(i?hoops[p.hoop].height:hoops[p.hoop].width))))return false;
    if([o.entry,o.exit].some(pt=>pt!==undefined&&!validPoint(pt)))return false;
    if([o.tieIn,o.tieOff].some(v=>v!==undefined&&!validLock(v))||o.lockSize!==undefined&&!validSize(o.lockSize))return false;
    if(o.curve){
      if(o.curve.spline!==undefined&&o.curve.spline!=='levien')return false;
      if(typeof o.curve.closed!=='boolean'||!Array.isArray(o.curve.points)||o.curve.points.length<(o.curve.closed?3:2)||o.curve.points.length>200) return false;
      if(!o.curve.points.every(validPoint))return false;
      if(o.curve.corners!==undefined&&(!Array.isArray(o.curve.corners)||o.curve.corners.length!==o.curve.points.length||Array.from(o.curve.corners).some(c=>typeof c!=='boolean')))return false;
    }
    if((o.kind==='satin-block')!==(o.rails!==undefined||!!o.text?.satin)||o.text?.satin&&o.kind!=='satin-block')return false;
    if(o.rails!==undefined&&!validRails(o.rails,o))return false;
    if(o.ropeWidth!==undefined&&!inRange(o.ropeWidth,...ropeLimits.width))return false;
    if(o.eFlipped!==undefined&&typeof o.eFlipped!=='boolean')return false;
    if(o.angleGuides!==undefined&&(!Array.isArray(o.angleGuides)||o.angleGuides.length>8||Array.from(o.angleGuides).some(g=>!g||typeof g!=='object'||!validPoint(g.a)||!validPoint(g.b)||Math.hypot(g.b[0]-g.a[0],g.b[1]-g.a[1])<.1)))return false;
    if(o.rowShortening!==undefined&&typeof o.rowShortening!=='boolean'||o.densityTrigger!==undefined&&!inRange(o.densityTrigger,.1,1))return false;
  }
  if (p.images !== undefined && !validImages(p.images)) return false;
  if(new Set(p.objects.map(o=>o.id)).size!==p.objects.length)return false;
  for(const g of p.groups??[]){const b=g.pathBinding;if(b!==undefined){
    if(!b||typeof b.pathId!=='string'||!validPathSettings(b.settings)||!Array.isArray(b.prototypes)||!b.prototypes.length||b.prototypes.some(o=>!o||o.group!==undefined||o.layoutOnly)||!validProject({...p,groups:[],objects:b.prototypes,artwork:undefined,images:undefined}))return false;
    if(!Array.isArray(b.members)||!b.members.length||b.members.length>80||b.members.some(row=>!Array.isArray(row)||row.length!==b.prototypes.length||row.some(id=>typeof id!=='string'||!p.objects.some(o=>o.id===id&&o.group===g.id))))return false;
    const ids=b.members.flat();if(new Set(ids).size!==ids.length||ids.includes(b.pathId)||p.objects.some(o=>o.group===g.id&&!ids.includes(o.id)))return false;
    const path=p.objects.find(o=>o.id===b.pathId);if(!path||path.text||path.rails||path.rings.length!==1||path.rings[0].length<2||path.group&&p.groups?.some(g=>g.id===path.group&&g.pathBinding))return false;
  }}
  if (p.artwork && (typeof p.artwork.src !== 'string' || !/^data:image\/(png|jpeg|webp|svg\+xml);/i.test(p.artwork.src) || typeof p.artwork.name !== 'string' || [p.artwork.x,p.artwork.y,p.artwork.width,p.artwork.height].some(n=>typeof n !== 'number'|| !Number.isFinite(n)))) return false;
  return true;
}

// Area centroid, with even-odd holes subtracted (matching the compiler).
export function fillCenter(o:StitchObject):Point {
  let total=0,cx=0,cy=0;
  const inside=(p:Point,r:Point[])=>{let n=0;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<a[0]+(p[1]-a[1])*(b[0]-a[0])/(b[1]-a[1]))n++;}return n%2===1;};
  for(const ring of o.rings){let area=0,x=0,y=0;ring.forEach((a,i)=>{const b=ring[(i+1)%ring.length],v=a[0]*b[1]-b[0]*a[1];area+=v;x+=(a[0]+b[0])*v;y+=(a[1]+b[1])*v;});if(Math.abs(area)<1e-9)continue;const weight=o.fillRule==='nonzero'?area:Math.abs(area)*(o.rings.filter(r=>r!==ring&&inside(ring[0],r)).length%2?-1:1);cx+=x/(3*area)*weight;cy+=y/(3*area)*weight;total+=weight;}
  return Math.abs(total)>1e-9?[cx/total,cy/total]:o.rings[0]?.[0]??[0,0];
}
