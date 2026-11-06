// Point builders for add_path (all coordinates in hoop mm). Load in the page after webmcp-bridge.js,
// or use the same functions in any JS runtime: they are pure.
//   const P = window.__paths;
(() => {
  const r2 = v => +v.toFixed(2);
  const paths = {
    // Smooth closed ellipse anchors (use with add_path smooth:true).
    ellipse: (cx, cy, rx, ry, n = 10, rotationDeg = 0) => {
      const t = rotationDeg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
      return Array.from({length: n}, (_, i) => {
        const a = i / n * 2 * Math.PI, x = rx * Math.cos(a), y = ry * Math.sin(a);
        return [r2(cx + x * c - y * s), r2(cy + x * s + y * c)];
      });
    },
    // Mirror points across a vertical axis x = axis (left feature → right feature).
    mirrorX: (points, axis) => points.map(([x, y]) => [r2(2 * axis - x), y]),
    // Walk an arc (paw top edge) and drop retraced lines (toes) down to `bottom` at each x in `toes`.
    // Returns one open running path: no trims between toes. reverse:true walks the arc right-to-left.
    arcWithTicks: (arc, ticks, bottom, reverse = false) => {
      const a = reverse ? [...arc].reverse() : arc, out = [a[0]];
      for (let i = 1; i < a.length; i++) {
        const [x0, y0] = a[i - 1], [x1, y1] = a[i];
        const hits = ticks.filter(x => (x - x0) * (x - x1) < 0).sort((p, q) => (p - q) * Math.sign(x1 - x0));
        for (const x of hits) {
          const y = r2(y0 + (y1 - y0) * (x - x0) / (x1 - x0));
          out.push([x, y], [x, bottom], [x, y]);
        }
        out.push(a[i]);
      }
      return out;
    },
    // Several strokes from (nearly) one root as a single retraced path, e.g. whiskers:
    // strokes = [[root, mid, tip], ...]; travels root→root between strokes.
    fan: strokes => strokes.flatMap((s, i) => {
      const out = i === 0 ? [...s].reverse() : [...s, ...[...s].reverse().slice(1)];
      return i === strokes.length - 1 && i > 0 ? s : out;
    }),
    // Corner flags for add_path: true = sharp. Pass indexes that should be smooth.
    corners: (count, smoothIdx = []) => Array.from({length: count}, (_, i) => !smoothIdx.includes(i)),
    // Run of an outline between two y limits (e.g. the ear tops of a silhouette for a bean outline).
    runWhere: (ring, keep) => {
      const n = ring.length, start = ring.findIndex((p, i) => keep(p) && !keep(ring[(i - 1 + n) % n]));
      const out = [];
      if (start < 0) return out;
      for (let i = 0; i < n; i++) { const p = ring[(start + i) % n]; if (!keep(p)) break; out.push(p); }
      return out;
    },
  };
  if (typeof window !== 'undefined') window.__paths = paths;
  if (typeof module !== 'undefined') module.exports = paths;
})();
