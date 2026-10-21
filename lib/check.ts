import {createT,errorText,type Translator,type Key} from './i18n';
import {defaultTrimJump, hoops, isFillKind, isWideKind, kindNames, normalizeGroups, resolve, satinDefaults, type Kind, type Point, type Project, type RawWarning, type Severity, type StitchObject} from './project';
import {moveGeometry, reclose} from './curves';

// Design check: fast geometry checks run in the editor; stitch checks (short/long stitches, density,
// jumps, trims) come from the compiler (embroidery/compiler.py design_check). Bounds are [x0, y0, x1, y1] mm.
export type Box = [number, number, number, number];
export type Warning = RawWarning & {source: 'design' | 'stitches'; key: string};
export type Fix = {label: string; title: string; apply: (p: Project) => Project};
export const severityNames: Record<Severity, Key> = {fail: 'Will likely fail', check: 'Worth checking'};
// Thresholds (mm, mm²). Fills: under 3 mm² is mostly lock stitches; parts thinner than 1 mm sew as
// tiny bunched stitches; under 2 mm wide (the compiler's MIN_UNDERLAY_FILL) gets no underlay.
// Satin under 1 mm hits nearly the same holes twice; over 7 mm (the default split) it is split, or floats
// when Split above is raised past 7 mm.
// Text: fill letters 6 mm (as the Text panel advises), satin 5 mm, outlines 4 mm; fail at two-thirds.
// Objects within 3 mm of the sewing field edge are worth checking.
export const limits = {fillArea: [3, 6], fillWidth: [1, 2], thinArea: 1, satinWidth: 1, satinWide: satinDefaults.splitLength, edge: 3,
  text: {fill: 6, wide: 5, line: 4} as Record<'fill'|'wide'|'line', number>};

const round = (n: number, d = 1) => Math.round(n*10**d)/10**d;
export function box(points: Point[], pad = 0): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) {x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);}
  return [x0-pad, y0-pad, x1+pad, y1+pad];
}
const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const textGroup = (kind: Kind) => isFillKind(kind) ? 'fill' : isWideKind(kind) ? 'wide' : 'line';

// Rasterised fill: area, thickness (twice the largest inscribed radius) and parts thinner than
// limits.fillWidth[0] (cells outside the morphological opening by half that width). Cached per rings.
type Raster = {area: number; thickness: number; thin: {area: number; bounds: Box} | null};
const rasterCache = new WeakMap<Point[][], Raster>();
export function raster(rings: Point[][], rule: 'evenodd' | 'nonzero' = 'evenodd'): Raster {
  const cached = rasterCache.get(rings); if (cached) return cached;
  const [minX, minY, maxX, maxY] = box(rings.flat());
  const cell = Math.max(.06, Math.sqrt((maxX-minX)*(maxY-minY)/150000)), x0 = minX-cell, y0 = minY-cell;
  const W = Math.ceil((maxX-x0)/cell)+2, H = Math.ceil((maxY-y0)/cell)+2, inside = new Uint8Array(W*H);
  let count = 0;
  for (let j = 0; j < H; j++) {
    const y = y0+(j+.5)*cell, hits: [number, number][] = [];
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i+1)%r.length];
      if ((a[1] <= y && y < b[1]) || (b[1] <= y && y < a[1])) hits.push([a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]), b[1] > a[1] ? 1 : -1]);
    }
    hits.sort((p, q) => p[0]-q[0]);
    let winding = 0, start = 0;
    for (const [x, d] of hits) {
      const was = rule === 'nonzero' ? winding !== 0 : winding%2 !== 0;
      winding += d;
      const now = rule === 'nonzero' ? winding !== 0 : winding%2 !== 0;
      if (!was && now) start = x;
      else if (was && !now) for (let i = Math.max(0, Math.ceil((start-x0)/cell-.5)); i <= Math.min(W-1, Math.floor((x-x0)/cell-.5)); i++) {if (!inside[j*W+i]) count++; inside[j*W+i] = 1;}
    }
  }
  // Two-pass chamfer distance (cells) from the given sources.
  const chamfer = (source: (k: number) => boolean) => {
    const d = new Float32Array(W*H);
    for (let k = 0; k < W*H; k++) d[k] = source(k) ? 0 : 1e9;
    const pass = (forward: boolean) => {
      for (let n = 0; n < W*H; n++) {
        const k = forward ? n : W*H-1-n, i = k%W, j = (k-i)/W, s = forward ? -1 : 1;
        for (const [di, dj, w] of [[s, 0, 1], [0, s, 1], [s, s, Math.SQRT2], [-s, s, Math.SQRT2]] as const) {
          const ii = i+di, jj = j+dj;
          if (ii >= 0 && ii < W && jj >= 0 && jj < H && d[jj*W+ii]+w < d[k]) d[k] = d[jj*W+ii]+w;
        }
      }
    };
    pass(true); pass(false); return d;
  };
  const edge = chamfer(k => !inside[k]);
  let deepest = 0;
  for (let k = 0; k < W*H; k++) if (inside[k]) deepest = Math.max(deepest, edge[k]);
  const r = limits.fillWidth[0]/2/cell, core = chamfer(k => inside[k] === 1 && edge[k] >= r+.5);
  const thin: Point[] = [];
  for (let k = 0; k < W*H; k++) if (inside[k] && core[k] > r+.5) thin.push([x0+(k%W+.5)*cell, y0+(Math.floor(k/W)+.5)*cell]);
  const result = {area: count*cell*cell, thickness: Math.max(cell, (2*deepest-.5)*cell), thin: thin.length ? {area: thin.length*cell*cell, bounds: box(thin, cell)} : null};
  rasterCache.set(rings, result);
  return result;
}

// How far stitches reach past the drawn line: half the column for satin styles, the satin text border.
function reach(o: StitchObject, p: Project) {
  if (isWideKind(o.kind)) return (o.satinWidth+resolve(o, p.fabric, p.locks).pullCompensation)/2;
  return o.text?.border?.kind === 'satin' && isFillKind(o.kind) ? o.text.border.width/2 : 0;
}
// Colour blocks in sewing order (text borders sew right after their letters).
function colourBlocks(p: Project) {
  const blocks: {color: string; objects: number[]}[] = [];
  p.objects.forEach((o, i) => {
    if (!o.rings.length) return;
    for (const color of [o.color, ...(o.text?.border && isFillKind(o.kind) ? [o.text.border.color] : [])].map(c => c.toLowerCase())) {
      const last = blocks.at(-1);
      if (last?.color === color) {if (last.objects.at(-1) !== i) last.objects.push(i);} else blocks.push({color, objects: [i]});
    }
  });
  return blocks;
}

export function checkProject(p: Project): Warning[] {
  const out: RawWarning[] = [], hoop = hoops[p.hoop];
  const add = (code: string, o: StitchObject, bounds: Box, severity: Severity, values: Record<string, number>) => out.push({code, objectId: o.id, bounds: bounds.map(n => round(n, 2)) as Box, severity, values});
  for (const o of p.objects) {
    if (!o.rings.length) continue;
    const b = box(o.rings.flat()), g = box([[b[0], b[1]], [b[2], b[3]]], reach(o, p));
    const margin = Math.min(g[0], g[1], hoop.width-g[2], hoop.height-g[3]);
    if (margin < -.001) add('outside-hoop', o, g, 'fail', {by: round(-margin)});
    else if (margin < limits.edge) add('near-edge', o, g, 'check', {margin: round(margin), limit: limits.edge});
    if (o.text) {
      const min = limits.text[textGroup(o.kind)];
      if (o.text.size < min) add('text-small', o, b, o.text.size < min*2/3 ? 'fail' : 'check', {size: round(o.text.size), limit: min});
    } else if (isFillKind(o.kind)) {
      const r = raster(o.rings), cross = o.kind === 'cross' ? resolve(o, p.fabric, p.locks).spacing : 0;
      const [fail, check] = cross ? [cross, 2*cross] : limits.fillWidth;
      if (r.area < limits.fillArea[1]) add('fill-small', o, b, r.area < limits.fillArea[0] ? 'fail' : 'check', {area: round(r.area), limit: limits.fillArea[1]});
      else if (r.thickness < check) add('fill-narrow', o, b, r.thickness < fail ? 'fail' : 'check', {width: round(r.thickness), limit: check});
      else if (r.thin && r.thin.area >= limits.thinArea) add('fill-thin-part', o, r.thin.bounds, 'check', {area: round(r.thin.area), limit: limits.fillWidth[0]});
    }
    if (isWideKind(o.kind)) {
      const r = resolve(o, p.fabric, p.locks), bite = o.satinWidth+r.pullCompensation;
      if (o.satinWidth < limits.satinWidth) add('satin-narrow', o, g, 'fail', {width: o.satinWidth, limit: limits.satinWidth});
      else if (bite > limits.satinWide && r.splitLength > limits.satinWide) add('satin-long', o, g, 'fail', {bite: round(Math.min(bite, r.splitLength)), split: r.splitLength, limit: limits.satinWide});
      else if (o.satinWidth > limits.satinWide) add('satin-wide', o, g, 'check', {width: o.satinWidth, limit: limits.satinWide});
    }
  }
  const blocks = colourBlocks(p), distinct = new Set(blocks.map(b => b.color)).size;
  blocks.forEach((block, k) => {
    if (k < 2 || !blocks.slice(0, k-1).some(b => b.color === block.color)) return;
    const o = p.objects[block.objects[0]];
    add('colour-order', o, box(o.rings.flat()), 'check', {changes: blocks.length-1, minimum: distinct-1});
  });
  return keyed(out, 'design');
}

function keyed(list: RawWarning[], source: Warning['source']): Warning[] {
  const seen = new Map<string, number>();
  return list.map(w => {const base = `${source}:${w.code}:${w.objectId}`, n = seen.get(base) ?? 0; seen.set(base, n+1); return {...w, source, key: n ? `${base}:${n}` : base};});
}
// Compiler warnings: text border objects (id-border) point back to their text.
export function stitchWarnings(raw: RawWarning[] | undefined, p: Project): Warning[] {
  const ids = new Set(p.objects.map(o => o.id)), base = (id: string | null | undefined) => id && !ids.has(id) && id.endsWith('-border') && ids.has(id.slice(0, -7)) ? id.slice(0, -7) : id ?? null;
  return keyed((raw ?? []).map(w => ({...w, objectId: base(w.objectId), ...(w.fromId ? {fromId: base(w.fromId)!} : {})})), 'stitches');
}
export function engineWarning(message: string, p: Project): Warning {
  const pts = p.objects.flatMap(o => o.rings.flat()), hoop = hoops[p.hoop];
  return {code: 'engine-error', objectId: null, bounds: pts.length ? box(pts) : [0, 0, hoop.width, hoop.height], severity: 'fail', values: {}, source: 'stitches', key: 'stitches:engine-error'};
}
export const sortWarnings = (list: Warning[], p: Project) => {
  const order = new Map(p.objects.map((o, i) => [o.id, i]));
  return [...list].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'fail' ? -1 : 1) || (order.get(a.objectId ?? '') ?? -1)-(order.get(b.objectId ?? '') ?? -1));
};

// Plain-language copy: a short title, why it matters for the stitch-out, and one concrete fix.
export function explain(w: Warning, p: Project, message = '', t:Translator=createT('en')): {title: string; why: string; fix: string} {
  const v = w.values, o = p.objects.find(x => x.id === w.objectId), kind = o ? t(kindNames[o.kind]).toLocaleLowerCase(t.lang) : t('Stitches').toLocaleLowerCase(t.lang);
  switch (w.code) {
    case 'fill-small': return {title: t("Shape too small to fill"), why: t("At {v0} mm² the knots that start and end the thread take up most of it, so it sews as a lump.",{v0:v.area}), fix: t("Enlarge it to at least 3 × 2 mm, or sew it as a running stitch outline.")};
    case 'fill-narrow': return {title: t("Shape too thin to fill"), why: w.severity === 'fail' ? t("At its widest it is {v0} mm, so the rows become tiny stitches that bunch up and break thread.",{v0:v.width}) : t("At its widest it is {v0} mm, too thin for underlay (the foundation stitches), so the edges pull in.",{v0:v.width}), fix: t("Make this shape at least {v0} mm wide or change it to a running stitch.",{v0:v.limit})};
    case 'fill-thin-part': return {title: t("Thin parts in a fill"), why: t("About {v0} mm² is thinner than {v1} mm and sews as tiny stitches that pucker or break thread.",{v0:v.area,v1:v.limit}), fix: t("Widen the highlighted part to {v0} mm or more, or draw it as a separate line.",{v0:v.limit})};
    case 'satin-narrow': return {title: t("Satin too narrow"), why: t("At {v0} mm the needle hits almost the same holes on both sides, which cuts the fabric and breaks thread.",{v0:v.width}), fix: t("Make it at least {v0} mm wide or use a bean stitch.",{v0:v.limit})};
    case 'satin-long': return {title: t("Satin stitches too long"), why: t("Stitches up to {v0} mm long lie loose and snag on fingers and toys.",{v0:v.bite}), fix: t("Split stitches above {v0} mm (Split above in the object settings).",{v0:v.limit})};
    case 'satin-wide': return {title: t("Wide satin"), why: t("Across {v0} mm each stitch is split into pieces, which looks less smooth and is easier to snag.",{v0:v.width}), fix: t("Keep satin under {v0} mm wide; draw wider areas as a fill.",{v0:v.limit})};
    case 'text-small': return {title: t("Text too small"), why: t("{v0} letters under {v1} mm lose their shape; these are {v2} mm tall.",{v0:kind[0].toLocaleUpperCase(t.lang)+kind.slice(1),v1:v.limit,v2:v.size}), fix: o && !isFillKind(o.kind) && !isWideKind(o.kind) ? t("Make the letters at least {v0} mm tall.",{v0:v.limit}) : t("Make the letters at least {v0} mm tall, or use a bean stitch outline.",{v0:v.limit})};
    case 'outside-hoop': return {title: t("Outside the hoop"), why: t("Stitches reach {v0} mm past the {v1} sewing area, so the file can't be made.",{v0:v.by,v1:t(hoops[p.hoop].label)}), fix: t("Move it inside the hoop, or choose a larger hoop in Setup.")};
    case 'near-edge': return {title: t("Very close to the hoop edge"), why: t("Only {v0} mm from the edge, where fabric puckers and any shift pushes stitches out of the sewing area.",{v0:v.margin}), fix: t("Move it at least {v0} mm in from the edge.",{v0:v.limit})};
    case 'colour-order': return {title: t("Same colour sewn twice"), why: t("You'll change thread {v0} times; sewing each colour together needs only {v1}.",{v0:v.changes,v1:v.minimum}), fix: t("Sew this object next to the other objects of the same colour (Sew earlier / Sew later).")};
    case 'short-stitches': return {title: t("Stitches too short"), why: t("{v0} stitches are under {v1} mm, so the needle keeps hitting the same spot, which frays or breaks thread.",{v0:v.count,v1:v.limit}), fix: t("Enlarge tiny details, smooth sharp tips, or remove points that are very close together.")};
    case 'long-stitches': return {title: t("Stitches too long"), why: t('longStitches.other',{count:v.count,limit:v.limit,longest:v.longest}), fix: t("Set \"Trim jumps longer than\" in Setup to {v0} mm or less, so long moves are cut instead of sewn.",{v0:v.limit})};
    case 'dense': return {title: t("Stitches pile up"), why: t("About {v0} layers of thread ({v1} needle holes per mm²) stack here, making a stiff patch that can break needles or cut the fabric.",{v0:v.layers,v1:v.hits}), fix: v.objects > 1 ? t("Cut a hole in the shape underneath, or remove one of the overlapping layers.") : t("Increase the spacing, or use lighter underlay.")};
    case 'long-jump': return {title: t("Long jump between objects"), why: t("The machine cuts the thread and moves {v0} mm to sew the same colour elsewhere, adding time and a loose tail.",{v0:v.length}), fix: t("Sew objects that are close together one after another (Sew earlier / Sew later).")};
    case 'many-trims': return {title: t("Many thread cuts"), why: t("{v0} trims (the machine stops to cut the thread); each adds time and leaves a tail that can pull out.",{v0:v.count}), fix: t("Join nearby pieces into one shape, remove tiny pieces, or raise \"Trim jumps longer than\" in Setup (up to 7 mm).")};
    case 'engine-error': return {title: t("Stitches can't be made"), why: errorText(message,t,'The stitch engine rejected this design.'), fix: t("Change the highlighted object, then check again.")};
    default: return {title: t('Unknown design issue'), why: t('The stitch engine rejected this design.'), fix: t('Change the highlighted object, then check again.')};
  }
}

const kindFix = (o: StitchObject, kind: Kind): StitchObject => {
  const next: StitchObject = {...o, kind, rings: reclose(o.rings, true)};
  delete next.spacing; delete next.underlay; delete next.pullCompensation; delete next.splitLength; delete next.shortStitches;
  return next;
};
const replace = (p: Project, next: StitchObject) => ({...p, objects: p.objects.map(o => o.id === next.id ? next : o)});
// One-click fixes, offered only where they cannot make the design worse.
export function fixFor(w: Warning, p: Project, t:Translator=createT('en')): Fix | null {
  const o = p.objects.find(x => x.id === w.objectId);
  if (w.code === 'long-stitches' && p.trimJump > limits.satinWide) return {label: t("Trim above {v0} mm",{v0:defaultTrimJump}), title: t("Cut the thread for moves longer than {v0} mm",{v0:defaultTrimJump}), apply: q => ({...q, trimJump: defaultTrimJump})};
  if (!o) return null;
  switch (w.code) {
    case 'fill-small': case 'fill-narrow':
      return o.curve ? null : {label: t("Use running stitch"), title: t("Sew this shape as a running stitch outline"), apply: q => replace(q, kindFix(o, 'running'))};
    case 'satin-narrow':
      return o.curve?.closed ? null : {label: t("Use bean stitch"), title: t("A triple running stitch: strong and thin"), apply: q => replace(q, kindFix(o, 'bean'))};
    case 'text-small': {
      // Scaling moves the editable text settings with the outline (transformText), so it stays text.
      const hoop = hoops[p.hoop], [x0, y0, x1, y1] = box(o.rings.flat()), k = w.values.limit/o.text!.size, cx = (x0+x1)/2, cy = (y0+y1)/2, grow = reach(o, p);
      if (cx-(cx-x0)*k-grow >= 0 && cy-(cy-y0)*k-grow >= 0 && cx+(x1-cx)*k+grow <= hoop.width && cy+(y1-cy)*k+grow <= hoop.height)
        return {label: t("Make {v0} mm tall",{v0:w.values.limit}), title: t("Enlarge the text around its centre"), apply: q => replace(q, moveGeometry(o, ([x, y]) => [cx+(x-cx)*k, cy+(y-cy)*k]))};
      return isFillKind(o.kind) || isWideKind(o.kind) ? {label: t("Use bean outline"), title: t("Outline the letters with a triple running stitch"), apply: q => replace(q, kindFix(o, 'bean'))} : null;
    }
    case 'satin-long': {
      const next = {...o}; delete next.splitLength;
      return {label: t("Split at {v0} mm",{v0:satinDefaults.splitLength}), title: t("Split stitches longer than 7 mm into staggered pieces"), apply: q => replace(q, next)};
    }
    case 'outside-hoop': case 'near-edge': {
      const hoop = hoops[p.hoop], [x0, y0, x1, y1] = w.bounds;
      const shift = (lo: number, hi: number, size: number) => {for (const m of [limits.edge, 0]) if (hi-lo <= size-2*m) return lo < m ? m-lo : hi > size-m ? size-m-hi : 0; return null;};
      const dx = shift(x0, x1, hoop.width), dy = shift(y0, y1, hoop.height);
      return dx === null || dy === null || (!dx && !dy) ? null : {label: t("Move inside"), title: t("Move it {v0} mm in from the hoop edge",{v0:limits.edge}), apply: q => replace(q, moveGeometry(o, ([x, y]) => [x+dx, y+dy]))};
    }
    case 'colour-order': {
      const blocks = colourBlocks(p), k = blocks.findIndex(b => p.objects[b.objects[0]].id === o.id), block = blocks[k];
      const m = k > 0 ? blocks.slice(0, k-1).map(b => b.color).lastIndexOf(block.color) : -1;
      if (m < 0) return null;
      const area = (i: number) => {const x = p.objects[i]; return box(x.rings.flat(), reach(x, p)+.5);};
      const moved = new Set(block.objects), earlier = new Set(blocks[m].objects);
      const between = blocks.slice(m+1, k).flatMap(b => b.objects).filter(i => !moved.has(i) && !earlier.has(i));
      const clear = (group: number[]) => group.every(i => between.every(j => !overlaps(area(i), area(j))));
      const reorder = (q: Project, group: Set<number>, after: number) => {
        const items = q.objects.filter((_, i) => !group.has(i)), at = items.indexOf(q.objects[after])+1;
        return normalizeGroups({...q, objects: [...items.slice(0, at), ...q.objects.filter((_, i) => group.has(i)), ...items.slice(at)]});
      };
      if (clear(block.objects)) return {label: t("Sew earlier"), title: t("Sew it right after the earlier objects of this colour; nothing it passes overlaps it"), apply: q => reorder(q, moved, blocks[m].objects.at(-1)!)};
      if (between.length && clear(blocks[m].objects)) return {label: t("Sew others later"), title: t("Sew the earlier objects of this colour just before this one; nothing they pass overlaps them"), apply: q => reorder(q, earlier, Math.max(...between))};
      return null;
    }
  }
  return null;
}
