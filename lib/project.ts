import {validText, type TextSpec} from './text';
export type Point = [number, number];
export type Kind = 'fill' | 'running' | 'bean' | 'backstitch' | 'satin' | 'zigzag' | 'e-stitch' | 'cross' | 'underlay' | 'manual';
export type UnderlayType = 'auto' | 'center' | 'edge' | 'zigzag' | 'tatami';
export type StitchObject = {
  id: string; name: string; color: string; kind: Kind; rings: Point[][];
  spacing: number; length: number; angle: number; satinWidth: number; underlay: boolean;
  underlayType?: UnderlayType;
  pullCompensation?: number; // mm; the fabric default applies when unset
  curve?: {points: Point[]; closed: boolean};
  text?: TextSpec;
  fillRule?: 'nonzero'; // set by geometryPayload for text
};
export type Artwork = {src: string; name: string; x: number; y: number; width: number; height: number};
export type Project = {
  version: 1; name: string; machine: 'brother-pr1x'; hoop: string;
  fabric: 'woven' | 'jersey'; objects: StitchObject[]; artwork?: Artwork;
};
export type Command = {type: 'stitch' | 'jump'; x: number; y: number; fromX: number; fromY: number; block: number};
export type Compiled = {
  pes: string; filename: string; commands: Command[]; threads: {color: string; name: string}[];
  stats: {stitches: number; jumps: number; trims: number; colorChanges: number; width: number; height: number; maxStitch: number; bytes: number; durationMs: number};
  engine: string; pesVersion: string;
};
export const hoops: Record<string, {width: number; height: number; label: string}> = {
  '100x100': {width: 100, height: 100, label: '100 × 100 mm'},
  '180x130': {width: 180, height: 130, label: '180 × 130 mm'},
  '300x200': {width: 300, height: 200, label: '300 × 200 mm'},
  '60x40': {width: 60, height: 40, label: '60 × 40 mm'},
};
export const kindNames: Record<Kind, string> = {running:'Running / straight', bean:'Bean stitch', backstitch:'Backstitch', satin:'Satin line', zigzag:'Zigzag stitch', 'e-stitch':'Appliqué E-stitch', fill:'Tatami fill', cross:'Cross stitch fill', underlay:'Underlay stitch', manual:'Manual stitches'};
export const kindHints: Record<Kind, string> = {running:'A single pass along a line', bean:'Three passes for a stronger outline', backstitch:'Overlapping stitches for a firm outline', satin:'Dense, smooth coverage along a line', zigzag:'Open zigzags along a line', 'e-stitch':'An open edge for appliqué', fill:'Rows of short stitches covering a shape', cross:'Small crosses covering a shape', underlay:'A light foundation or placement line', manual:'Place each needle point yourself'};
export const isFillKind=(kind:Kind)=>kind==='fill'||kind==='cross';
export const isWideKind=(kind:Kind)=>kind==='satin'||kind==='zigzag'||kind==='e-stitch';
// Keep in sync with FABRIC_PULL in embroidery/compiler.py.
export const pullDefaults: Record<Project['fabric'], number> = {woven: .2, jersey: .35};
export const pullCompensation=(o:StitchObject,fabric:Project['fabric'])=>o.pullCompensation??pullDefaults[fabric];
export const palette = ['#c99d72', '#f4e5cc', '#d8949b', '#664538', '#849984', '#a6bdca'];
export function object(name: string, rings: Point[][], kind: Kind = 'fill', color = palette[0]): StitchObject {
  return {id: crypto.randomUUID(), name, rings, kind, color, spacing: 0.45, length: 2.5, angle: 35, satinWidth: 2, underlay: false};
}
export function ellipse(cx: number, cy: number, rx: number, ry: number): Point[] {
  return Array.from({length: 48}, (_, i) => [cx+Math.cos(i/48*Math.PI*2)*rx, cy+Math.sin(i/48*Math.PI*2)*ry]);
}
export function bounds(objects: StitchObject[]) {
  const pts = objects.flatMap(o => o.rings.flat());
  if (!pts.length) return {x: 0, y: 0, width: 0, height: 0};
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return {x, y, width: Math.max(...xs)-x, height: Math.max(...ys)-y};
}
export function demo(): Project {
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
  const items = [object('Honey bear', [outer, muzzle, ear1, ear2]),
    object('Cream muzzle', [muzzle], 'fill', palette[1]),
    object('Inner ears', [ear1, ear2], 'fill', palette[1]),
    object('Rosy cheeks', [ellipse(34,54,3,1.8), ellipse(66,54,3,1.8)], 'fill', palette[2]),
    object('Sleepy eyes', [[[35,47],[36,48],[38,49],[40,48],[41,47]], [[59,47],[60,48],[62,49],[64,48],[65,47]]], 'bean', palette[3]),
    object('Little nose', [ellipse(50,56,2.1,1.3)], 'fill', palette[3]),
    object('Smile', [[[50,57],[50,60],[48,62],[46,60]], [[50,60],[52,62],[54,60]]], 'bean', palette[3])];
  return {version: 1, name: 'Sleepy little bear', machine: 'brother-pr1x', hoop: '100x100', fabric: 'woven', objects: items};
}
export function pathData(rings: Point[][], closed: boolean) {
  return rings.map(r => r.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')+(closed?' Z':'')).join(' ');
}
export function validProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false;
  const p = value as Project;
  if (p.version !== 1 || p.machine !== 'brother-pr1x' || !hoops[p.hoop] || !['woven','jersey'].includes(p.fabric) || typeof p.name !== 'string') return false;
  if (!Array.isArray(p.objects) || p.objects.length > 80) return false;
  let count=0;
  for (const o of p.objects) {
    if (!o || typeof o.id !== 'string' || typeof o.name !== 'string' || !Object.hasOwn(kindNames,o.kind) || !/^#[0-9a-f]{6}$/i.test(o.color) || !Array.isArray(o.rings) || (!o.rings.length && !o.text)) return false;
    if (o.text !== undefined && (!validText(o.text) || o.curve)) return false;
    for (const r of o.rings) {
      if (!Array.isArray(r) || r.length < (isFillKind(o.kind) ? 3 : 2)) return false;
      count+=r.length;
      if (count > 12000 || r.some(pt => !Array.isArray(pt) || pt.length !== 2 || pt.some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n)>1000))) return false;
    }
    if ([o.spacing,o.length,o.angle,o.satinWidth].some(n=>typeof n !== 'number' || !Number.isFinite(n)) || typeof o.underlay !== 'boolean') return false;
    if(o.spacing<.3||o.spacing>2||o.length<.5||o.length>3||o.angle< -180||o.angle>180||o.satinWidth<.5||o.satinWidth>6)return false;
    if(o.pullCompensation!==undefined&&(typeof o.pullCompensation!=='number'||!(o.pullCompensation>=0&&o.pullCompensation<=1)))return false;
    if(o.underlayType!==undefined&&!['auto','center','edge','zigzag','tatami'].includes(o.underlayType))return false;
    if(o.underlay&&o.underlayType&&o.underlayType!=='auto'&&!((isFillKind(o.kind)&&['edge','tatami'].includes(o.underlayType))||(o.kind==='satin'&&['center','edge','zigzag'].includes(o.underlayType))))return false;
    if(o.curve){
      if(typeof o.curve.closed!=='boolean'||!Array.isArray(o.curve.points)||o.curve.points.length<(o.curve.closed?3:2)||o.curve.points.length>200) return false;
      if(o.curve.points.some(pt=>!Array.isArray(pt)||pt.length!==2||pt.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1000)))return false;
    }
  }
  if (p.artwork && (typeof p.artwork.src !== 'string' || !/^data:image\/(png|jpeg|webp|svg\+xml);/i.test(p.artwork.src) || typeof p.artwork.name !== 'string' || [p.artwork.x,p.artwork.y,p.artwork.width,p.artwork.height].some(n=>typeof n !== 'number'|| !Number.isFinite(n)))) return false;
  return true;
}
