// Scores catalogue fonts for machine embroidery with the editor's own text layout and design-check raster.
// For each normal-style weight it finds the smallest letter height (mm) at which fill lettering passes the
// design check's thin-stroke test, the typical stroke width relative to the capital height, and flags faces
// that cannot sew cleanly at any practical size (outline/inline, distressed, or missing basic Latin).
// Usage: node scripts/audit-fonts.mjs [--ids a,b,c] [--limit n] [--shard i/n] [--jsonl progress.jsonl] [--out file.json]
//        node scripts/audit-fonts.mjs --apply progress.jsonl[,more.jsonl]  (updates public/fonts/catalog.json)
import {readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync} from 'node:fs';
import opentype from 'opentype.js';
import {load} from '../tests/load-lib.mjs';
const {layoutText, defaultText, mergedOutline} = load('text');
const {raster, limits} = load('check');

const args = process.argv.slice(2), arg = k => {const i = args.indexOf(k); return i >= 0 ? args[i+1] : undefined;};
const CDN = 'https://cdn.jsdelivr.net/fontsource/fonts', cacheDir = new URL('../.font-cache/', import.meta.url);
if (!existsSync(cacheDir)) mkdirSync(cacheDir);
const catalogURL = new URL('../public/fonts/catalog.json', import.meta.url), catalog = JSON.parse(readFileSync(catalogURL, 'utf8'));
// --apply a.jsonl,b.jsonl: write each weight's minimum clean height into the catalogue (row element 7,
// parallel to weights; 0 = never clean) and drop faces that cannot sew cleanly at any practical size.
if (arg('--apply')) {
  const results = new Map(arg('--apply').split(',').flatMap(f => readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))).map(r => [r.id, r]));
  const MAX = 25, removed = [];
  const kept = catalog.fonts.filter(row => {
    const r = results.get(row[0]);
    if (!r || r.error) return true; // unaudited: keep without size data
    const min = row[3].map(w => {const s = r.weights[w]; return s && !s.broken && s.min ? s.min : 0;});
    const usable = min.filter(m => m && m <= MAX), ok = Object.values(r.weights).filter(s => !s.broken);
    // Calibrated on the full audit: static instances of variable fonts keep overlapping contours (Aleo,
    // BioRhyme ~4–5 per letter) and stencils add a cut or two (Black Ops One), so only clear cases go.
    const bad = !ok.length ? ['no basic Latin'] : [
      ...(r.category !== 'h' && ok.every(s => s.simple >= 7) ? ['outline/inline'] : []),
      ...(ok.every(s => s.specks > 8 || s.ringsPerGlyph > 7) ? ['distressed/dotted'] : []),
    ];
    if (bad.length || !usable.length) {removed.push(`${row[1]} (${bad.join(',') || 'thin at every weight'})`); return false;}
    row[6] = min; return true;
  });
  writeFileSync(catalogURL, JSON.stringify({...catalog, audited: new Date().toISOString().slice(0, 10), fonts: kept}));
  console.log(`${kept.length} fonts kept, ${removed.length} removed:\n${removed.join('\n')}`);
  process.exit(0);
}
let fonts = catalog.fonts;
if (arg('--ids')) {const ids = arg('--ids').split(','); fonts = fonts.filter(f => ids.includes(f[0]));}
if (arg('--limit')) fonts = fonts.slice(0, Number(arg('--limit')));
if (arg('--shard')) {const [i, n] = arg('--shard').split('/').map(Number); fonts = fonts.filter((_, k) => k%n === i);}

async function fetchFont(id, subset, weight) {
  const name = `${id}-${subset}-${weight}.ttf`, file = new URL(name, cacheDir);
  if (existsSync(file)) {const b = readFileSync(file); return b.length ? opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset+b.length)) : null;}
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${CDN}/${id}@latest/${subset}-${weight}-normal.ttf`);
      if (r.status === 404) {writeFileSync(file, ''); return null;}
      if (!r.ok) throw new Error(String(r.status));
      const b = Buffer.from(await r.arrayBuffer()); writeFileSync(file, b);
      return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset+b.length));
    } catch (e) {if (attempt === 2) throw e; await new Promise(r => setTimeout(r, 500*(attempt+1)));}
  }
}

// Words sewn most often: mixed case, digits and the Turkish letters the editor supports.
const SAMPLES = ['Embroidery', 'Ağaç Şükrü', 'Jinx & 2026'];
const SIZES = [4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20, 25, 30];
const ref = (id, weight) => ({source: 'catalog', id, family: id, weight, italic: false, subsets: ['latin']});
const ringArea = r => Math.abs(r.reduce((a, p, i) => {const q = r[(i+1)%r.length]; return a+p[0]*q[1]-q[0]*p[1];}, 0)/2);
const perimeter = r => r.reduce((a, p, i) => {const q = r[(i+1)%r.length]; return a+Math.hypot(q[0]-p[0], q[1]-p[1]);}, 0);

function thinShare(fontList, size) {
  let thin = 0, area = 0;
  for (const word of SAMPLES) {
    const {rings} = layoutText({...defaultText(ref('x', 400), [0, 0], word), size}, fontList);
    if (!rings.length) continue;
    const r = raster(rings, 'nonzero');
    area += r.area; thin += r.thin && r.thin.area >= limits.thinArea ? r.thin.area : 0;
  }
  return area ? thin/area : 1;
}

function shapeStats(fontList) {
  // At a 100 mm capital height: mean stroke width ≈ 2·area / perimeter, per word.
  let A = 0, P = 0, rings = 0, specks = 0, glyphs = 0;
  for (const word of SAMPLES) {
    const out = layoutText({...defaultText(ref('x', 400), [0, 0], word), size: 100}, fontList).rings;
    glyphs += [...word.replace(/\s/g, '')].length; rings += out.length;
    for (const r of out) {const a = ringArea(r); if (a < 4) specks++;}
    const r = raster(out, 'nonzero'); A += r.area; P += out.reduce((s, q) => s+perimeter(q), 0);
  }
  // Simple strokes ("I", "l", "1", "-") have no counters. Their merged outline (overlapping contours united)
  // has one ring each; more mean outline, inline or shadow faces.
  const simple = mergedOutline(layoutText({...defaultText(ref('x', 400), [0, 0], 'I l 1 -'), size: 20}, fontList).rings).length;
  return {stroke: +(2*A/P/100).toFixed(3), ringsPerGlyph: +(rings/glyphs).toFixed(2), specks, simple};
}

const turkish = 'ğĞşŞıİçÇöÖüÜ', basic = 'AaBbEeGgHhMmRrSs0123456789';
async function auditFont([id, family, category, weights, , subsets]) {
  const result = {id, family, category, weights: {}, flags: []};
  if (!subsets.includes('latin')) {result.flags.push('no-latin'); return result;}
  for (const weight of weights) {
    const latin = await fetchFont(id, 'latin', weight);
    if (!latin) continue;
    const ext = subsets.includes('latin-ext') ? await fetchFont(id, 'latin-ext', weight).catch(() => null) : null;
    const list = [latin, ...(ext ? [ext] : [])];
    if ([...basic].some(c => !list.some(f => f.charToGlyphIndex(c) > 0))) {result.weights[weight] = {broken: true}; continue;}
    // Thin share falls as letters grow: binary search the first passing size.
    let lo = 0, hi = SIZES.length;
    while (lo < hi) {const mid = (lo+hi) >> 1; if (thinShare(list, SIZES[mid]) < limits.textThin) hi = mid; else lo = mid+1;}
    const min = SIZES[lo] ?? null;
    const stats = shapeStats(list);
    result.weights[weight] = {min, ...stats, turkish: [...turkish].every(c => list.some(f => f.charToGlyphIndex(c) > 0))};
  }
  const ok = Object.values(result.weights).filter(w => !w.broken);
  if (!ok.length) result.flags.push('no-basic-latin');
  if (category !== 'h' && ok.length && ok.every(w => w.simple >= 7)) result.flags.push('outline');
  if (ok.length && ok.every(w => w.specks > 8 || w.ringsPerGlyph > 7)) result.flags.push('distressed');
  if (ok.length && ok.every(w => w.min === null)) result.flags.push('hairline');
  return result;
}

const out = [], started = Date.now(), log = arg('--jsonl');
const done = new Set(log && existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => {const r = JSON.parse(l); out.push(r); return r.id;}) : []);
fonts = fonts.filter(f => !done.has(f[0]));
let next = 0;
await Promise.all(Array.from({length: 6}, async () => {
  while (next < fonts.length) {
    const f = fonts[next++];
    try {const r = await auditFont(f); out.push(r); if (log) appendFileSync(log, JSON.stringify(r)+'\n');} catch (e) {out.push({id: f[0], family: f[1], error: String(e)});}
    if (out.length%25 === 0) console.error(`${out.length}/${fonts.length} ${((Date.now()-started)/1000).toFixed(0)}s`);
  }
}));
out.sort((a, b) => a.id.localeCompare(b.id));
const file = arg('--out');
if (file) writeFileSync(file, JSON.stringify(out, null, 1));
else for (const r of out) console.log(r.id.padEnd(22), r.flags.join(',').padEnd(12), Object.entries(r.weights).map(([w, s]) => s.broken ? `${w}:broken` : `${w}:${s.min ?? '—'}mm/${s.stroke}${s.turkish ? '' : '!tr'}`).join(' '));
