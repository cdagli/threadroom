// Sews every stitch type and fill pattern over a matrix of shapes, sizes and settings with the real compiler
// (embroidery/compiler.py, through the same geometryPayload the editor sends) and measures the written stitches
// against machine-embroidery practice: stitch-length histogram, satin bite length, coverage and edge gaps,
// aligned penetrations between neighbouring fill rows, trims, untrimmed floats, density and design-check warnings.
// Usage: node scripts/audit-stitches.mjs [--only id,id] [--kinds fill,satin] [--json out.json] [--verbose]
// Exit status 1 when a case fails a hard limit (see LIMITS), so it doubles as a regression gate.
import {spawn} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import opentype from 'opentype.js';
import {load} from '../tests/load-lib.mjs';
const {object, demo} = load('project'), {geometryPayload} = load('curves'), {fillPatterns} = load('fill-patterns'), {checkProject} = load('check');

const args = process.argv.slice(2), arg = k => {const i = args.indexOf(k); return i >= 0 ? args[i+1] : undefined;};
const only = arg('--only')?.split(','), kindsFilter = arg('--kinds')?.split(','), verbose = args.includes('--verbose');
// Hard limits (mm). Sewn moves under SHORT break thread or bird-nest; satin bites over SATIN snag; other sewn
// stitches over LONG snag. Floats are untrimmed connecting stitches that no later stitch covers.
export const LIMITS = {short: .45, tiny: .28, long: 7, satin: 8, float: 1, shortShare: .03, coverage: .97, edgeGap: .06, aligned: .5};

// ---- shapes (mm, in a 300 × 200 hoop) ----
const C = [90, 65];
const circle = (r, n = 64, c = C) => Array.from({length: n}, (_, i) => [c[0]+Math.cos(i/n*2*Math.PI)*r, c[1]+Math.sin(i/n*2*Math.PI)*r]);
const rect = (w, h, c = C) => [[c[0]-w/2, c[1]-h/2], [c[0]+w/2, c[1]-h/2], [c[0]+w/2, c[1]+h/2], [c[0]-w/2, c[1]+h/2]];
const star = (ro, ri, c = C) => Array.from({length: 10}, (_, i) => {const a = -Math.PI/2+i*Math.PI/5, r = i%2 ? ri : ro; return [c[0]+Math.cos(a)*r, c[1]+Math.sin(a)*r];});
const arcBand = (r, w, sweep = 1.6*Math.PI, n = 80) => {
  const a0 = -sweep/2-Math.PI/2, at = (rad, t) => [C[0]+Math.cos(a0+t*sweep)*rad, C[1]+20+Math.sin(a0+t*sweep)*rad];
  return [...Array.from({length: n+1}, (_, i) => at(r+w/2, i/n)), ...Array.from({length: n+1}, (_, i) => at(r-w/2, 1-i/n))];
};
const arcLine = (r, sweep = 1.6*Math.PI, n = 80) => Array.from({length: n+1}, (_, i) => {const a = -sweep/2-Math.PI/2+i/n*sweep; return [C[0]+Math.cos(a)*r, C[1]+20+Math.sin(a)*r];});
export const fillShapes = {
  'circle-10': [circle(5)], 'circle-5': [circle(2.5, 40)], 'strip-1.5': [rect(30, 1.5)], 'strip-3': [rect(30, 3)],
  'rect-60x40': [rect(60, 40)], 'star-40': [star(20, 8)], 'hole-40x30': [rect(40, 30), rect(15, 10)], 'arc-4': [arcBand(25, 4)],
};
const close = r => [...r, r[0]];
export const lineShapes = {'circle-20': [close(circle(10))], 'star-40': [close(star(20, 8))], 'arc-60': [arcLine(25)], 'line-30': [[[75, 65], [105, 65]]]};

// ---- cases ----
const base = (kind, rings, patch = {}) => ({...object(kind, rings, kind), id: 'o', angle: 35, ...patch});
const cases = [];
const add = (id, kind, shape, rings, patch) => cases.push({id, kind, shape, object: base(kind, rings, patch)});
for (const p of fillPatterns) for (const [shape, rings] of Object.entries(fillShapes)) add(`fill/${p.id}`, 'fill', shape, rings, p.id === 'even' ? {} : {fillPattern: p.id});
for (const [shape, rings] of Object.entries(fillShapes)) {
  add('fill/tatami@0.35', 'fill', shape, rings, {fillPattern: 'tatami', spacing: .35});
  add('fill/tatami@0.5+edge', 'fill', shape, rings, {fillPattern: 'tatami', spacing: .5, underlay: 'edge-tatami'});
  add('cross', 'cross', shape, rings, {});
}
// Rows of equal length at 0° expose aligned penetrations (perforation lines).
add('fill/even@0°', 'fill', 'rect-60x40', fillShapes['rect-60x40'], {angle: 0});
add('fill/tatami@0°', 'fill', 'rect-60x40', fillShapes['rect-60x40'], {angle: 0, fillPattern: 'tatami'});
for (const [shape, rings] of Object.entries(lineShapes)) {
  for (const kind of ['running', 'bean', 'backstitch', 'double-rope', 'triple-rope', 'underlay', 'redwork', 'e-stitch']) add(kind, kind, shape, rings, {});
  for (const w of [1, 3, 6, 10]) add(`satin@${w}`, 'satin', shape, rings, {satinWidth: w});
  for (const w of [2, 4]) add(`zigzag@${w}`, 'zigzag', shape, rings, {satinWidth: w});
  add('running@1.5', 'running', shape, rings, {length: 1.5});
}
// Satin blocks: straight and curved rails at several widths.
const block = (w, curved) => {
  const centre = curved ? arcLine(25, Math.PI, 12) : Array.from({length: 7}, (_, i) => [75+i*5, 65]);
  const n = centre.length, normal = i => {const a = centre[Math.max(0, i-1)], b = centre[Math.min(n-1, i+1)], d = Math.hypot(b[0]-a[0], b[1]-a[1]); return [-(b[1]-a[1])/d, (b[0]-a[0])/d];};
  return {points: [centre.map((p, i) => [p[0]+normal(i)[0]*w/2, p[1]+normal(i)[1]*w/2]), centre.map((p, i) => [p[0]-normal(i)[0]*w/2, p[1]-normal(i)[1]*w/2])]};
};
for (const w of [1, 3, 6, 10]) for (const curved of [false, true]) {
  const rails = block(w, curved);
  cases.push({id: `satin-block@${w}`, kind: 'satin-block', shape: curved ? 'arc' : 'straight', object: {...base('satin-block', [rails.points[0].map((p, i) => [(p[0]+rails.points[1][i][0])/2, (p[1]+rails.points[1][i][1])/2])]), rails}});
}

// Lettering: fill text (Nunito Bold fixture) and satin lettering, with Turkish diacritics (dots, breves, cedillas).
const {layoutText, defaultText, autoTextPattern} = load('text'), {defaultFont} = load('fonts'), satinLib = load('satin-lettering');
await satinLib.ensureSatinFonts();
const fontFile = name => {const b = readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url)); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset+b.length));};
const nunito = [fontFile('nunito-latin-700-normal.ttf'), fontFile('nunito-latin-ext-700-normal.ttf')];
const nunitoRef = {source: 'catalog', id: 'nunito', family: 'Nunito', weight: 700, italic: false, subsets: ['latin', 'latin-ext']};
const WORD = 'Ağaç Şükrü';
for (const size of [6, 10, 20]) {
  const text = {...defaultText(nunitoRef, [150, 100], WORD), size}, rings = layoutText(text, nunito).rings;
  for (const pattern of ['tatami', 'sweepSatin', 'auto']) {
    const fillPattern = pattern === 'auto' ? autoTextPattern(rings) : pattern;
    cases.push({id: `text/${pattern}`, kind: 'fill', shape: `${size}mm`, object: {...base('fill', rings, {fillPattern}), angle: 0, fillRule: 'nonzero', text}});
  }
  for (const font of Object.keys(satinLib.satinFonts)) {
    const spec = {...defaultText(defaultFont, [150, 100], WORD), size, satin: {font, columnWidth: 14}};
    cases.push({id: `lettering/${font}`, kind: 'satin-block', shape: `${size}mm`, object: {...base('satin-block', satinLib.layoutSatinText(spec).rings), text: spec}});
  }
}

const selected = cases.filter(c => (!only || only.some(o => c.id === o || c.id.startsWith(o+'@') || c.id.startsWith(o+'/'))) && (!kindsFilter || kindsFilter.includes(c.kind)));

// ---- compiler bridge: one Python process, one JSON project per line ----
const python = process.env.THREADROOM_PYTHON || (existsSync('.venv/bin/python') ? process.cwd()+'/.venv/bin/python' : 'python3');
const bridge = `
import sys, json
from embroidery.compiler import compile_project
for line in sys.stdin:
    try:
        r = compile_project(json.loads(line)); r.pop('pes', None)
        r['commands'] = [[c['x'], c['y'], c['fromX'], c['fromY'], 1 if c['type'] == 'stitch' else 0, 1 if c.get('trim') else 0, 1 if c.get('travel') else 0, 1 if c.get('tie') else 0] for c in r['commands']]
    except Exception as e:
        r = {'error': str(e)}
    print(json.dumps(r), flush=True)
`;
// AUDIT_ENGINE_ROOT: compare against another checkout's embroidery/ package (for before/after numbers).
const child = spawn(python, ['-c', bridge], {stdio: ['pipe', 'pipe', 'inherit'], cwd: process.env.AUDIT_ENGINE_ROOT || process.cwd()});
let buffer = '';
const waiting = [];
child.stdout.on('data', d => {buffer += d; let i; while ((i = buffer.indexOf('\n')) >= 0) {const line = buffer.slice(0, i); buffer = buffer.slice(i+1); waiting.shift()(JSON.parse(line));}});
const compile = project => new Promise(res => {waiting.push(res); child.stdin.write(JSON.stringify(project)+'\n');});

// ---- geometry helpers ----
const inside = (p, rings) => {let n = 0; for (const r of rings) for (let i = 0, j = r.length-1; i < r.length; j = i++) {const a = r[i], b = r[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) n++;} return n%2 === 1;};
const area = rings => {let s = 0; for (const r of rings) {let a = 0; r.forEach((p, i) => {const q = r[(i+1)%r.length]; a += p[0]*q[1]-q[0]*p[1];}); s += Math.abs(a/2)*(rings.indexOf(r) && inside(r[0], rings.filter(o => o !== r)) ? -1 : 1);} return s;};
const segDist = (p, a, b) => {const dx = b[0]-a[0], dy = b[1]-a[1], l = dx*dx+dy*dy, t = l ? Math.max(0, Math.min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)) : 0; return Math.hypot(p[0]-a[0]-t*dx, p[1]-a[1]-t*dy);};
// Spatial hash of sewn segments (cell 1 mm) with their sewing order.
function segmentIndex(segs) {
  const grid = new Map(), key = (x, y) => `${x},${y}`;
  segs.forEach((s, k) => {
    const x0 = Math.floor(Math.min(s.a[0], s.b[0])), x1 = Math.floor(Math.max(s.a[0], s.b[0])), y0 = Math.floor(Math.min(s.a[1], s.b[1])), y1 = Math.floor(Math.max(s.a[1], s.b[1]));
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {const c = key(x, y); if (!grid.has(c)) grid.set(c, []); grid.get(c).push(k);}
  });
  return (p, r, filter = () => true) => {
    for (let x = Math.floor(p[0]-r); x <= Math.floor(p[0]+r); x++) for (let y = Math.floor(p[1]-r); y <= Math.floor(p[1]+r); y++)
      for (const k of grid.get(key(x, y)) ?? []) if (filter(k) && segDist(p, segs[k].a, segs[k].b) <= r) return true;
    return false;
  };
}

// ---- metrics ----
function measure(c, result, payloadObject) {
  const commands = result.commands, satinish = ['satin', 'zigzag', 'satin-block', 'e-stitch'].includes(c.kind) || c.object.fillPattern === 'sweepSatin';
  const segs = [], lengths = [], m = {stitches: 0, trims: 0, jumps: 0, short: 0, tiny: 0, long: 0, maxBite: 0, maxRun: 0, floats: 0, floatLength: 0, repeat: 0};
  let afterJump = true;
  const fillRings = ['fill', 'cross'].includes(c.kind) ? c.object.rings : null;
  const edgeDist = p => Math.min(...fillRings.flatMap(r => r.map((q, i) => segDist(p, q, r[(i+1)%r.length]))));
  const rowFill = c.kind === 'fill' && !satinish && !['circular', 'streamlines', 'crossStitchFill'].includes(c.object.fillPattern), t = c.object.angle*Math.PI/180;
  const holes = new Map();
  for (const [x, y, fx, fy, stitch, trim, travel, tie] of commands) {
    if (!stitch) {m.jumps++; if (trim) m.trims++; afterJump = true; continue;}
    m.stitches++;
    const d = Math.hypot(x-fx, y-fy), landing = afterJump;
    afterJump = false;
    if (landing || tie) continue;
    segs.push({a: [fx, fy], b: [x, y], travel: !!travel, d});
    // Row turns along a fill edge are about one row spacing long by design (every tatami has them).
    if (rowFill && Math.abs((y-fy)*Math.cos(t)-(x-fx)*Math.sin(t)) > .25 && d < .8) continue;
    if (fillRings && d < .8 && edgeDist([x, y]) < .4 && edgeDist([fx, fy]) < .4) continue;
    lengths.push(d);
    if (d < LIMITS.short) m.short++;
    if (d < LIMITS.tiny) m.tiny++;
    const across = satinish && !travel;
    if (across) m.maxBite = Math.max(m.maxBite, d); else m.maxRun = Math.max(m.maxRun, d);
    if (d > (across ? LIMITS.satin : LIMITS.long)) m.long++;
    const h = `${Math.round(x*10)},${Math.round(y*10)}`; holes.set(h, (holes.get(h) ?? 0)+1);
  }
  const retrace = ['bean', 'backstitch', 'redwork', 'double-rope', 'triple-rope'].includes(c.kind);
  for (const n of holes.values()) if (n >= 3 && !retrace) m.repeat += n-2;
  m.sewn = lengths.length;
  m.shortShare = lengths.length ? m.short/lengths.length : 0;
  const near = segmentIndex(segs);
  // A float: an untrimmed connector (or any stitch longer than 1 mm leaving the shape) that no later stitch covers.
  segs.forEach((s, k) => {
    if (!s.travel || s.d < LIMITS.float) return;
    let open = 0, n = Math.ceil(s.d/.25);
    for (let i = 0; i <= n; i++) {
      const p = [s.a[0]+(s.b[0]-s.a[0])*i/n, s.a[1]+(s.b[1]-s.a[1])*i/n];
      if (!near(p, .35, j => j > k && !segs[j].travel)) open++;
    }
    if (open/(n+1) > .3) {m.floats++; m.floatLength = Math.max(m.floatLength, s.d);}
  });
  m.warnings = (result.warnings ?? []).map(w => `${w.code}:${w.severity}`);
  if (fillRings) {
    const a = area(fillRings);
    m.area = a; m.perCm2 = m.stitches/(a/100);
    // Coverage: interior points (0.4 mm grid, 0.3 mm inside the edge) within 0.35 mm of a sewn stitch.
    const xs = fillRings.flat().map(p => p[0]), ys = fillRings.flat().map(p => p[1]);
    let total = 0, covered = 0;
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += .4) for (let y = Math.min(...ys); y <= Math.max(...ys); y += .4) {
      const p = [x, y];
      if (!inside(p, fillRings) || edgeDist(p) < .3) continue;
      total++; if (near(p, c.kind === 'cross' ? 1.5 : .35)) covered++;
    }
    m.coverage = total ? covered/total : 1;
    // Edge gaps: outline samples with no stitch within 0.5 mm (pull compensation should reach the edge).
    let edge = 0, gaps = 0;
    for (const r of fillRings) r.forEach((q, i) => {const b = r[(i+1)%r.length], n = Math.max(1, Math.ceil(Math.hypot(b[0]-q[0], b[1]-q[1])/.5)); for (let j = 0; j < n; j++) {edge++; if (!near([q[0]+(b[0]-q[0])*j/n, q[1]+(b[1]-q[1])*j/n], .5)) gaps++;}});
    m.edgeGaps = edge ? gaps/edge : 0;
    // Aligned holes: top-row penetrations (stitches along the fill angle) that line up with one in the next row.
    if (c.kind === 'fill' && !satinish && !['circular', 'streamlines', 'crossStitchFill'].includes(c.object.fillPattern)) {
      const t = -c.object.angle*Math.PI/180, rot = p => [p[0]*Math.cos(t)-p[1]*Math.sin(t), p[0]*Math.sin(t)+p[1]*Math.cos(t)];
      const spacing = payloadObject.spacing, rows = new Map();
      for (const s of segs) {
        const a = rot(s.a), b = rot(s.b);
        if (s.d < 1 || Math.abs(a[1]-b[1]) > .05) continue;
        const row = Math.round(b[1]/spacing);
        if (!rows.has(row)) rows.set(row, []);
        rows.get(row).push(b[0]);
      }
      let hits = 0, all = 0;
      for (const [row, list] of rows) {
        const next = rows.get(row+1);
        if (!next) continue;
        for (const x of list) {all++; if (next.some(v => Math.abs(v-x) < .15)) hits++;}
      }
      m.aligned = all > 20 ? hits/all : 0;
    }
  }
  const fails = [];
  if (m.tiny) fails.push(`${m.tiny} stitch<${LIMITS.tiny}`);
  if (m.shortShare > LIMITS.shortShare) fails.push(`${(m.shortShare*100).toFixed(1)}% <${LIMITS.short}mm`);
  if (m.long) fails.push(`${m.long} long (max ${(satinish ? m.maxBite : m.maxRun).toFixed(1)})`);
  if (m.floats) fails.push(`${m.floats} floats (≤${m.floatLength.toFixed(1)}mm)`);
  if (m.coverage !== undefined && m.coverage < LIMITS.coverage && !['cross', 'crossStitchFill'].some(k => c.id.includes(k)) && !c.object.fillPattern?.match(/Hearts|Diamond|Circles|Stars|Chain|hexweave|streamlines/)) fails.push(`coverage ${(m.coverage*100).toFixed(0)}%`);
  if (m.edgeGaps > LIMITS.edgeGap && !c.id.includes('cross')) fails.push(`edge gaps ${(m.edgeGaps*100).toFixed(0)}%`);
  // Smooth fills must stagger; decorative patterns use aligned holes as their texture (reported, not failed).
  if (m.aligned > LIMITS.aligned) (['even', 'tatami', undefined].includes(c.object.fillPattern) ? fails : m.notes ??= []).push(`aligned holes ${(m.aligned*100).toFixed(0)}%`);
  if (m.repeat > 3 && !c.object.fillPattern?.match(/streamlines|crossStitchFill/) && c.kind !== 'cross') fails.push(`${m.repeat} repeated holes`);
  for (const w of m.warnings) if (w.endsWith(':fail')) fails.push(w);
  return {...m, fails};
}

const out = [], started = Date.now();
let failing = 0;
for (const c of selected) {
  const project = {...demo(), hoop: '300x200', objects: [c.object]};
  let payload;
  try {payload = geometryPayload(project);} catch (e) {out.push({id: c.id, shape: c.shape, error: String(e)}); continue;}
  // A case the editor's design check already steers away from (cross stitch on a band too narrow for
  // whole crosses) is reported, not failed: the user is told to pick another stitch before sewing it.
  const steered = (c.kind === 'cross' ? checkProject(project) : []).filter(w => w.code === 'cross-sparse').map(w => `${w.code}:${w.severity}`);
  const result = await compile(payload);
  if (result.error) {out.push({id: c.id, shape: c.shape, error: result.error, steered}); if (!steered.length) failing++; continue;}
  const m = measure(c, result, payload.objects[0]);
  if (steered.length && m.fails.length) {m.notes = [...(m.notes ?? []), ...m.fails, `steered by ${steered.join(', ')}`]; m.fails = [];}
  if (m.fails.length) failing++;
  out.push({id: c.id, shape: c.shape, ...m});
}
child.stdin.end();
const round = (v, d = 2) => typeof v === 'number' ? +v.toFixed(d) : v;
for (const r of out) {
  if (!verbose && !r.error && !r.fails.length && !r.notes?.some(n => n.startsWith('steered'))) continue;
  console.log(`${r.id.padEnd(28)} ${r.shape.padEnd(11)} ${r.error ? `ERROR ${r.error}${r.steered?.length ? ` (steered by ${r.steered.join(', ')})` : ''}` : `st ${String(r.stitches).padStart(5)} trims ${String(r.trims).padStart(3)} bite ${round(r.maxBite, 1)} run ${round(r.maxRun, 1)}${r.coverage !== undefined ? ` cov ${round(r.coverage*100, 0)}% gaps ${round(r.edgeGaps*100, 0)}% /cm² ${round(r.perCm2, 0)}` : ''}${r.aligned !== undefined ? ` aligned ${round(r.aligned*100, 0)}%` : ''}  ${r.fails.join('; ')}${r.notes ? ` (${r.notes.join('; ')})` : ''}`}`);
}
console.log(`${out.length} cases, ${failing} failing, ${((Date.now()-started)/1000).toFixed(0)}s`);
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(out, null, 1));
process.exit(failing ? 1 : 0);
