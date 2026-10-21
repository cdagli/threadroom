# Ember fill patterns, fill engines, run types and blocks: re-implementation spec

Companion to `docs/ember-fill-spec.md` (read that first; this file does not repeat its settings
tables). Goal: everything needed to re-implement each Ember fill pattern, the four non-row fill
engines, the rope runs and two-rail Blocks without the bundle.

Source: Ember's minified client bundle (v2.emberdesign.net, downloaded 2026-10-21). Citations use
`chunk` + webpack module id + nearby identifiers, with the same chunk short names as the companion
spec (`page`, `1967`, `5729`, `5473`, plus `6712` = `c/6712-417a6c7bf2305cfe.js`). Everything was
read from client code; none of it was observed by running Ember. Ember world units are 10 per mm
(`gy=10`); every value below is in mm unless stated. Canvas is y-down.

Notation: L = Stitch Length (`overlay.stitchSpacing`, default 4), s = Row Space (`overlay.rowSpacing`,
default 0.2), `frac(x) = x mod 1` for x ≥ 0, φ = 1.618033988749.

---

## 0. Corrections to `ember-fill-spec.md`

Found while reading the engine more closely (`5473` 29459 `X`, `5729` 79438):

1. **Anchor is per piece, not per shape.** The fill pre-processor (`5729` 41525 `f`) splits a
   shape into separate pieces; `79438` builds one `RoutedFill` (`tb`) per piece, and each piece's
   BCDFill anchors lanes and penetrations on **that piece's** polygon centroid
   (`fillPatternCenterPosition ?? polygon.getCentroid()`). Disconnected pieces of one shape do not
   share a pattern phase. Cells inside one piece do.
2. **Lane index starts at the piece's near edge.** The pattern row used for a row is its index in
   the lane list `globalLaneXs`, which starts at the first lane ≥ the piece's minimum
   across-row coordinate. Lane positions are centroid-anchored; the index is not centroid-relative.
3. **The row end is normally *not* a penetration.** `skipLast` defaults to true (`RoutedFill`
   constructor `null==skipLast||skipLast`). A patterned row pushes its start, its interior
   penetrations, and its end **only if it has no interior penetrations** (or a gradient is on,
   which sets `skipLast:false`). The last stitch of a row therefore runs from its last interior
   penetration straight to the next row's start on the boundary.
4. **Circular Fill is a double Archimedean spiral**, not concentric rings (section 3.2).
5. **Rope runs sew a hidden double travel run first** (section 4).
6. Engine-default fill pattern (used for underlays): `RoutedFill` default is 3 rows at offsets
   0, 0.33L, 0.66L with length L (`5729` 99342 `R` constructor); BCDFill's own fallback is
   offsets 0, 1, 2 mm with [3] (`5473` 29459 constructor). The first one is what underlays get.

---

## 1. The row-pattern engine (shared by patterns 1, 3–33)

Source: `5473` 29459 class `X` (BCDFill): `patternedFillRows`, `getFillPatternLaneParameters`,
`globalLaneXs`; pattern table `5729` 21068 export `r` (array `a`); call site `5729` 79438.

### 1.1 Inputs
`pattern.stitchPattern(L, s, params)` returns a cycle `[{rowOffsetMm o_i, rowPatternMm [ℓ_i0, ℓ_i1, …]}]`
of length n. Optional `pattern.rowOffsetShearPerRowMm(L, s, params)` returns shear h (mm per lane);
default 0. `params` is the rest of `overlay` (pattern parameters such as `steps`, `cellSize`).

### 1.2 Frames
Stitch angle θ (rows run along `(cos θ, sin θ)`). Ember's sweep frame rotates by T = θ + 90°:
- across-row coordinate `X = p·(−sin θ, cos θ)` (lane axis),
- along-row coordinate `Y = −p·(cos θ, sin θ)` (note the minus sign).

### 1.3 Lanes
Without a gradient: lanes at `X_m = c_X + m·s` for every integer m with `X_min ≤ X_m ≤ X_max`
(piece extent), where c is the piece centroid. Lane index `k = m − ceil((X_min − c_X)/s)`, i.e. 0 for
the first lane inside the piece. With a gradient, lanes start at `X_min + spacing(X_min)/2` and step
by the local spacing (companion spec 2.8); index is again the position in that list. Each BCD row
segment finds its lane by binary search on its start X (nearest lane).

### 1.4 Penetrations on one row
For row segment from `Y_a` to `Y_b` on lane k:
- `r = pattern[k mod n]`; lengths `ℓ_j = max(r.rowPatternMm[j], 0.01)`; W = Σℓ_j.
- base `B = c_Y + r.rowOffsetMm + h·k`.
- Penetration set = `{ B + q·W + C_j : q ∈ ℤ, j = 0..len−1 }` with prefix sums `C_0 = 0, C_j = ℓ_0+…+ℓ_{j−1}`.
  (Code: step forward from B adding ℓ_0, ℓ_1, … cyclically; step backward subtracting ℓ_last,
  ℓ_last−1, ….)
- Keep only values strictly inside `(min(Y_a,Y_b)+ε, max(Y_a,Y_b)−ε)`, ε = 1e-9·diag. Order them in
  the row's sewing direction.
- Emitted points: row start, the kept penetrations, and the row end only if none were kept or
  `skipLast` is false (see 0.3).
- No minimum stitch length is enforced: a penetration may land 0.01 mm from a row end.

### 1.5 Shear
`rowOffsetShearPerRowMm(L, s) = s · clamp(cot(shearAngle), −20, 20)`, returning 0 when
`|sin| < 1e-6` or `|cos| < 1e-12`. Only digit-seed partitions define it (section 2.4); only Twill
(45°) has a non-zero value (`h = s`). Shear grows with the **lane index** k (unbounded), not with
k mod n, so it draws a continuous diagonal across the piece.

### Implementation notes for Threadroom
- Today `Rows.paths` (compiler.py) emits `[a] + interpolate(a, b, length)`: evenly divided rows,
  each starting from its own end. Replace the interpolation with `pattern_points(y, a_x, b_x, k)`.
- Our `rotate(p, angle)` gives `x = p·(cos, sin)` (along row) and `y = p·(−sin, cos)` (across). So
  Ember's `Y = −x` and `X = y`. In our frame the set becomes
  `x ∈ { A − r.o − h·k − (q·W + C_j) }` with `A = centroid_x` (rotated). Equivalently mirror the
  cycle. It matters for direction-sensitive patterns (Twill, Staircase, Zig-Zag, Tornado).
- Row index: `fill_sections` places rows at `min_y + s/2 + j·s`; use `k = round((y − base)/s)`
  with `base` = the object's first row (already computed in `route_fill`). Use one object-level
  anchor (centroid of all rings) so separate parts stay in phase (an improvement over Ember's
  per-piece anchor). This keeps output deterministic and independent of section order.
- `skipLast`: optional. If adopted, drop `b` when interior penetrations exist; `sew_piece`
  then joins the last interior point straight to the next row's `a`. Keep `b` on the last row of a
  section (Ember gets it from travel/exit handling).
- Drop or merge any penetration closer than `SHORT_STITCH` (0.3 mm) to a row end or to its
  neighbour; otherwise tiles (hearts) trip the design check.
- The chunk limit passed to `sew_to` is 3 mm for fills (`plan_object` returns `(path, 3)`),
  which silently subdivides longer stitches. Patterned fills must pass
  `min(max_pattern_length + 0.01, SATIN_MAX)`. `validate()` caps `length` at 3; patterns need
  a separate `fillLength` (companion spec step 6) of up to ~6.
- Model: `fillPattern?: string` (Ember id), `patternParams?: Record<string, number|string|boolean>`.
  Patterns become pure data functions `(L, s, params) -> (cycle, shear)` in a Python table.

Confidence: high (straight from `patternedFillRows`).

---

## 2. Row-based patterns: exact cycles

All from `5729` 21068 list `a`, in table order. "Uses L" = `usesStitchSpacing` not false. Row counts
quoted for the defaults L = 4, s = 0.2.

### 2.1 Fixed offset patterns (uses L; one length [L] per row)

| # | id | rows | `o_i` (i = 0..n−1) |
|---|---|---|---|
| 1 | tatami | 4 | L/4, L/2, 3L/4, L |
| 4 | original | 1 | 0 |
| 5 | triangle | 6 | 2L/5, 3L/5, 4L/5, L, 4L/5, 3L/5 |
| 7 | columns | 2 | L/4, L/2 |
| 8 | offset-columns | 12 | 0 ×6, then 6 mm ×6 (absolute 6 mm, not ×L; with L = 4 this equals a 2 mm shift) |

### 2.2 Formula patterns (uses L)

**6 Waves** (params `steps` 20, 1–100, step 1; `amplitude` 2, 0–10, step 0.1):
`n = steps`, `o_i = (sin(2πi/n) + 1)/2 · A`, lengths [L]. Quirk: `steps || 20` and
`amplitude || 2` overwrite 0 with the default, so amplitude 0 gives 2.

**15 Zig-Zag** (no params): iterate `v = 0, s, 2s, …` while `v < 2L`; row is `o = 0` if `v ≤ L`
else `o = v − L`; lengths [L]. With L 4, s 0.2: 40 rows, 20 flat rows (float accumulation makes the
21st value 4.000000000000001 > L, so it starts the ramp at ≈ 0), then 20 rows rising 0, 0.2, …, 3.8.
Result: alternating flat band and 45° (s per row) diagonal band.

**19 Heartbeat** (`intensity` I 3, 1–8, step 0.5): 21 rows, lengths [L], offsets
`0,0,0,0, .3I, .5I, .3I, 0, −.4I, 2I, 2.5I, 2I, −.6I, 0, .4I, .7I, .7I, .4I, 0,0,0`.

**20 Spiral** (`tightness` T 3, 1–8, 0.5; `rotations` R 2, 1–5, 0.5): `n = round(20R)` rows
(40), `t = i/n`, `o_i = t·T·sin(2π·R·t)`, lengths [L]. (Image file is `droop.webp`.)

**21 Staircase** (`stepHeight` H 1.5, 0.5–4, 0.25; `stepsPerFlight` N 5, 2–10, 1): for e = 0..N−1
four rows at `e·H`, then for e = N−1..0 four rows at `e·H`. 8N rows (40). Lengths [L].

**22 Rainfall** (`chaos` C 4, 1–10, 0.5; `density` D 30, 10–60, 5): D rows. For row n:
```
o_n = frac(7nφ)·C − 0.5·C·frac(13nφ) + 0.3·C·sin(0.3n) + (n mod 7 == 0 ? 0.8·C·frac(nφ) : 0)
ℓ_n = [ L · (0.7 + 0.6·frac(11nφ)) ]
```
(JS `%1` on positive values.) First rows at defaults: (0, 2.8), (1.591, 4.716), (3.150, 4.232),
(4.648, 3.748), (2.063, 3.264), (3.377, 5.180). Deterministic; no RNG. Note each row has its own
period ℓ_n, so penetrations do not repeat along the row with period L.

**24 Tornado** (`tightness` T 2.5, 1–5, 0.25; `rotations` R 3, 1–6, 0.5): `n = round(25R)` (75),
`t = i/n`, `amp = T·(1 − t^1.5)·(1 + 0.3t)`, `a = 2π·R·t`,
`o_i = amp·sin(a) + 0.15·T·sin(7a)`, `ℓ_i = [ L·(0.6 + 0.4(1 − t)) ]`.

**25 Wavy Walk** (no params): 21 rows, `o_i = ((i mod 7)+1)/7 · L + (sin(2πi/21)+1)/2 · 0.4L`, [L].

### 2.3 Digit-seed partitions (3, 26–31)
Builder `r(id, name, image, seed, shearDeg = 90, lengthsFn?)` in 21068:
1. Seed → digits: take `String(seed)` (a finite number seed is `trunc(abs)`), keep characters
   '0'–'7' only, stop at 8 digits. Empty → `[1,2,3,4,5,6,7]`.
2. Row i (one per digit d_i, n = number of digits): `o_i = d_i/n · L`;
   `ℓ_i = lengthsFn(d_i, i, L)` or `[L]`.
3. Shear `h = s·clamp(cot shearDeg, ±20)` (0 for 90°).

| # | id | seed | shear | lengths | resulting rows (o as multiple of L) |
|---|---|---|---|---|---|
| 3 | partitionLine (Walk, free) | 1234567 | 0 | [L] | 1/7, 2/7, …, 7/7 |
| 26 | partitionJitter | 20163 | 0 | [L] | 2/5, 0, 1/5, 6/5, 3/5 (6/5 ≡ 1/5 mod L, so rows 2 and 3 coincide) |
| 27 | partitionBands | 00001111 | 0 | [L] | 0,0,0,0, 1/8,1/8,1/8,1/8 |
| 28 | partitionInterlocked | 00001111 | 0 | d=0: [L]; d=1: [L/3, L/3, L/3] | as Bands; rows 4–7 stitch at L/3 |
| 29 | partitionRails | 00001111 | 0 | d=0: [0.22L, 0.78L]; d=1: [0.78L, 0.22L] | as Bands |
| 30 | partitionTwill | 0123 | 45° → h = s | [L/4, 3L/4] | 0, 1/4, 1/2, 3/4, plus s·k mm |
| 31 | partitionHoundstooth | 01 | 0 | i even: [L/4, L/4, L/2]; i odd: [L/2, L/4, L/4] | 0, 1/2 |

(The 90° passed to Interlocked/Rails/Houndstooth is explicit; Bands/Jitter/Walk use the default
90°, so the shear function exists but returns 0.) "Sub-row splitting" in Ember is exactly the
multi-length `rowPatternMm` lists above.

Twill example (L 4, s 0.2): lane k penetrations at `B = c + (k mod 4) + 0.2k` mm, then +1, +3,
+1, +3 … repeating every 4 mm.

### Implementation notes for Threadroom (2.1–2.3)
Pure data: a Python dict `PATTERNS[id] = (fn(L, s, p) -> [(o, [ℓ…])], shear_fn or None,
uses_length, param schema)`. Parameter schema (name, default, min, max, step) is in the tables
above and should be mirrored into `lib/project.ts` for the UI and `validate()`. No geometry
changes beyond section 1. Tests: Tatami row k+4 repeats row k; Twill penetrations on lane k+1 are
shifted by s (+ L/4 mod L) against lane k; Rainfall row 1 = (1.591, 4.716) at defaults.
Confidence: high.

---

## 3. Tile and curve patterns (generated tables, ignore L unless noted)

Every one of these is still a row cycle; the curve is only used to build the table. Each table row
is a set of crossing positions x in a tile of width W along the row; `o = x_0`,
`ℓ = [x_1−x_0, …, x_last−x_{last−1}, W − x_last + x_0]`. So inside the tile a stitch runs between
consecutive curve crossings, and the last stitch wraps into the next tile. The tile height is
`n·s` (n = number of rows).

Helper used by Chain/Stars (`l(t, e)` in 21068): sort, dedupe within 1e-4, keep values in
`[−1e-6, W+1e-6]`; wrap length is `max(W − last + first, 0.01)`.

### 3.1 Hearts (9–11, free; sizes 4 / 8 / 12; no params; ignores L)
Curve: the classic heart `x² + (y − |x|^(2/3))² = 1`, x ∈ [−1, 1], y from about −1 to 1.5115.
- Rows: `n = round(size/s)` (20 / 40 / 60 at s 0.2).
- Row t (0..n−1): `y = 1.51 + (−1 − 1.51)·t/n` (top of heart first; y never reaches −1).
- Solve for `e = |x|^(2/3)` ∈ [0, 1]: `f(e) = e³ + e² − 2y·e + (y² − 1) = 0` (this is the curve with
  `|x| = e^1.5`). Root finding: sample e at 64 equal steps of [0, 1]; record exact zeros
  (|f| < 1e-9) and bisect (40 iterations, same tolerance) every sign change; sort, dedupe within
  1e-6, clamp to [0,1].
- Each root e gives x = ±e^1.5 (just 0 if e^1.5 < 1e-8); dedupe within 1e-6, sort.
- Map x → `(x + 1)/2 · size`; build the row descriptor as above with W = size.
- Rows 0–4 (sm) cross both lobes (4 crossings), later rows 2 crossings. Example sm, s 0.2: row 0
  `o 0.693, ℓ [0.149, 2.316, 0.149, 1.387]`; row 4 `o 0, ℓ [1.999, 0.003, 1.999, 0→0.01]`;
  row 10 `o 0.407, ℓ [3.187, 0.813]`; row 19 `o 1.912, ℓ [0.176, 3.824]`.
- Quirk: the code skips a row only when the root array is falsy, never for an empty array; all
  rows in range have crossings, so it doesn't bite.

### 3.2 Diamonds (12–14; width w 2 / 6 / 12; ignores L)
- `m = 2·floor(round(w/s)/2) + 1` (odd), `h = floor(m/2)`.
- Row 0: `o = w/2`, [w]. Rows t = 1..h−1: `o = (w/2)(1 − t/h)`, `ℓ = [w·t/h, w·(1 − t/h)]`
  (penetrations at `w/2 ∓ (w/2)(t/h)`). Row h: `o = 0`, [w]. Then rows h−1..1 again (mirror).
- n = 2h rows (10 / 30 / 60). Tile w × (2h·s).
- sm at s 0.2: o = 1, .8, .6, .4, .2, 0, .2, .4, .6, .8 with ℓ = [2], [.4,1.6], [.8,1.2], [1.2,.8],
  [1.6,.4], [2], ….

### 3.3 Circles (16–18; diameter D 4 / 8 / 12; ignores L)
- `m = round(D/(2s))`, R = D/2.
- Row 0: `o = R`, [D]. Rows t = 1..m−2: `l = R·t/m`, chord `c = 2√(R² − (l − R)²)`,
  `a = R − c/2`, `o = a`, `ℓ = [c, 2a]` (crossings at R ± c/2). Then a row `o = 0`, [D]; then rows
  m−2..1 mirrored.
- n = 2m − 2 rows (18 / 38 / 58). Note the tile is (2m−2)·s ≈ D − 2s tall: circles are very
  slightly squashed.
- sm row 1: o 1.128, ℓ [1.744, 2.256]; row 2: o 0.8, ℓ [2.4, 1.6].

### 3.4 Hexweave (23; `cellSize` c 4, 2–12, 0.5; ignores L)
`n = 2·ceil(c·sin60°/s)` (36 at defaults). Row t: `u = t/n`, `e = c·u` if `u < 0.5` else
`c·(1 − u)` (triangle wave 0 → c/2 → 0); `o = e` for even t, `c − e` for odd t; ℓ = [c]. One
penetration per c per row; alternating rows mirror about the cell centre, giving interleaved
zig-zag columns that read as a hex weave.

### 3.5 Chain (32; tile 8 mm; ignores L)
- `n = max(4, round(8 / max(s, 0.05)))` (40).
- Row t: `y = (t + 0.5)/n · 8`. Crossings with the two sinusoids `y = 4 + 4·sin(2πx/8 + φ)`,
  φ ∈ {0, π}: with `λ = (y − 4)/4` (none if |λ| > 1), `α = asin λ`, for α' ∈ {α, π − α}:
  `x = ((α' − φ) mod 2π)/(2π) · 8`. Union of both curves' crossings → descriptor with W = 8.
- Rows are symmetric about the middle. Row 0: o 1.715, ℓ [0.571, 3.429, 0.571, 3.429];
  row 19: o 0.032, ℓ [3.936, 0.064, 3.936, 0.064].

### 3.6 Stars (33; tile 8 mm; **uses L**)
- Star polygon: 10 vertices, vertex l at radius 1 (even l) or 0.38 (odd l), angle `−π/2 + lπ/5`,
  centred at 0; then normalised to the bbox [0, 8] × [0, 8] (x and y scaled independently).
  Vertices: (4,0) (4.94,3.06) (8,3.06) (5.52,4.94) (6.47,8) (4,6.1) (1.53,8) (2.48,4.94)
  (0,3.06) (3.06,3.06).
- `n = max(4, round(8/max(s, .05)))`, then `n = max(4, 4·round(n/4))` (40).
- Row t: `y = (t + 0.5)/n · 8`. Star crossings A = x of every non-horizontal edge that spans y
  (within 1e-9), deduped. Background grid G = positions starting at `(L·[.25,.5,.75,1][t mod 4])
  mod L`, stepping L, below 8; drop those inside the star (odd number of A values < x − 1e-6).
  Descriptor of A ∪ G with W = 8.
- Effect: tatami-like quarter-stagger background, no penetrations inside the star, so the star is
  one long float per row (up to ~7.9 mm). E.g. row 15: o 0, ℓ [0.058, 7.884, 0.058].

### Implementation notes for Threadroom (section 3)
- Same engine as section 2; add the generators as Python functions returning the cycle (cache per
  (id, s, params)). The heart root finder, chain sinusoids and star polygon above are complete.
- These patterns make long stitches: large hearts/diamonds/circles up to 12 mm, stars ~8 mm.
  Our design check flags sewn stitches > `LONG_STITCH` 7 mm; either exempt patterned fill
  stitches or show it as an informational warning. Never exceed `SATIN_MAX` 12.7.
- Very short pieces (0.003 mm in hearts) must be merged (section 1 notes).
- Tests: table row counts (hearts sm 20, diamonds sm 10, circles sm 18, hexweave 36, chain 40,
  stars 40 at s 0.2) and the example rows above.
Confidence: high for tables; medium for how they look sewn (not observed).

---

## 4. Separate fill engines

Dispatch (`5729` 79438 `g`): `circularFill` → `61505 F`, `streamlineFill` → `49374 O`,
`crossStitchFill` → `97311 n`, `sweepSatin` → `44779 Z`; everything else → row engine. These
engines get **no fill underlay and no pull compensation**; Hand Stitch still applies afterwards.
Panel visibility (`page` component `ch`): Streamlines hide angle, row space, underpath, gradient;
Circular hides angle and gradient (shows row space, stitch length, underpath); Cross Stitch shows
the angle as "Rotation" and hides row space, stitch length (`usesStitchSpacing:false`), underpath,
gradient; Satin (sweepSatin) hides the whole Fill Settings group and shows the satin panel.
"Edit angles" is allowed for every fill except Streamlines and Circular.

### 4.1 Satin fill (pattern 2, `sweepSatin`, free)
Sources: `5729` 44779 `Z`, `5473` 68973 `G`, `5473` 3867 `RoutedSweepSatin`, `5473` 90076 `E`
(sweep satin), `5473` 88458 (sweep fields), `5729` 17743 `X8`/`u` (satin config).

Behaviour:
- Settings: `fillParameters.satinSettings ?? satin defaults` (density 0.32, split max 7 with
  stagger, shortening, fractional spacing 0.33, pull 0.2, underlays [center]); config builder `u`
  in 17743 converts these exactly as for satin outlines (`pullCompensationMethod "keep-rows"`).
  Travel 3 / 0.5.
- Guides: `sweepGuideLines` if any, else one synthetic guide through the bbox centre at
  `overlay.angle` (default 135), half-length `max(bbox diagonal/2, 2.4 mm)` (function `u`).
- **Sweep level field** (88458): with one guide (kind `parallel-to-guide`) the level of a point is
  its signed distance from the guide line. With two guides, level = d₁/(d₁+d₂) (distance ratio),
  so iso-lines blend between the guides' directions.
- **Satin stitches lie along iso-lines of the level.** With one guide they are parallel to the
  guide, i.e. the satin stitches run at the stitch angle and the column advances perpendicular
  to it.
- The shape is cut ("sweepcut") into facets in which every iso-line crosses the boundary exactly
  twice (left/right rail). Each facet becomes a satin column whose quad strip is the pairs
  (left, right) at successive levels; rows are spaced `density` apart **perpendicular**
  (`rowSpacing:"perpendicular"`, analytic interpolation). Neighbouring columns that share an
  end section are matched so their end rows don't double up.
- Each column is sewn like a ClassicSatin column (section 6.3): split, shortening, fractional
  spacing, pull comp on rung ends, satin underlay first. Columns are routed by the generic router
  (`pD`) with hidden travel between them; entry/exit = Start/End points.
- Errors such as "non-monotone-facet" ("add a guide to separate its branches") or
  "invalid-rails" make the multi-piece path retry angles `[angle, angle+90, 0, 90, 45]`
  (deduped mod 180), and finally fall back to the first guide only.

#### Implementation notes for Threadroom
- The single-guide case maps neatly onto existing code. `fill_sections(rotate(rings, θ+90), d,
  rule, 0)` (rows perpendicular to the stitch direction) already yields monotone sections, each
  row a span (left, right). Emit per section `l₀, r₀, l₁, r₁, …` (satin zig-zag, *not*
  boustrophedon), with `d = satin spacing` (our `satin` profile density). Apply `split_bites`
  for wide spans, pull compensation by widening spans (`extend_spans`), short stitches off.
- Underlay: run `route_fill` with a center/edge walk or reuse the satin underlay passes.
- Route sections with the same `plan`/`travel` machinery used for fill sections (Rows
  variants), but sections must start and end at a rung end.
- Multi-guide sweep (curved satin) needs the level field and facet decomposition: defer with
  Edit angles.
- New kind or `fillPattern: 'satin'` on `fill`. Validate density 0.2–1.
Confidence: high for settings, guide default and stitch direction; medium for the column
decomposition details (module 90076 is ~49 KB; only its structure was read).

### 4.2 Circular Fill (35, paid)
Sources: `5729` 61505 `F`; engine `5473` 59014 class `S` (exported as `TX`).

Parameters: Row Space s (0.2), Stitch Length L (4), Underpath (on), Start/End points (default:
the shape's first point for both), **centre** = `fillParameters.center` (draggable on canvas)
or the piece's polygon centroid. Angle, gradient, underlays and pull comp are unused.

Geometry (`getSpiralSegments`): two interleaved Archimedean spirals around the centre.
- `b = s` (code: `n = s/2`, `r = 2n·θ`). Arm A: `P(θ) = centre + bθ(cos θ, sin θ)`; arm B is A
  rotated by 180°: `centre − bθ(cos θ, sin θ)`.
- Consequence: at any direction the two arms alternate, so neighbouring rows are **π·s apart**
  (0.628 mm at the default 0.2), not s. Each arm alone has pitch 2πs.
- Radii: `r_min = max(dist(polygon, centre) − s, 0)` (0 when the centre is inside),
  `r_max = (farthest polygon vertex from centre) + s`. Start at `r₀ = max(r_min, π·s)`,
  `θ₀ = r₀/b`.
- Steps: near the centre ("precise" mode) dθ is the largest value (binary search, start 0.05,
  doubling then 50 halvings, tol 1e-8) for which the spiral arc length ≤ L **and** the sagitta
  (max distance of the arc from its chord; 48 samples + golden-section refinement) ≤ s/2. Arc
  length of r = bθ uses the closed form `(r·√(r²+b²) + b²·asinh(r/b))/(2b)` difference. Once a
  precise step's arc exceeds 0.9 L, switch to `dθ = L/(b·√(1+θ²))` (constant arc length L).
  Stop when r ≥ r_max.
- If r_min = 0: one polyline = arm B reversed (outside → centre) then arm A (centre → outside),
  with a ≈ 2π·s chord across the centre. Otherwise two polylines.
- Intersect with the polygon (with holes) → segments.

Routing: Ink/Stitch's auto-fill graph algorithm (names and structure match:
`buildFillStitchGraph`, `"extra"` outline edges, `buildTravelGraph` with ±45°/90° gratings,
`findStitchPath`, `pathToStitches` with collapsed travel and A*):
1. Fill graph: each segment is an edge between its two boundary end nodes. Nodes are projected
   onto their ring; on each ring, consecutive nodes (by arc position, cyclic) are joined by
   `outline` edges, and every second one also by an `extra` edge (makes degrees even). Start/End
   points are inserted as nodes on the nearest outline edge.
2. Travel graph: same nodes plus, if Underpath is on, grating lines through the centroid at +45°
   and −45° spaced 3 mm (travel length) and at 90° spaced 3√2 mm, clipped to the shape; their
   intersections and ring hits become nodes. Travel edge weight = length/(distance to boundary +
   0.1); outline edge weight 3 × length. Travel edges that cross a segment (and lie closer to the
   centre) are recorded and removed once that segment is sewn. Without Underpath, ring vertices
   plus points every 3 mm along the rings are travel nodes and only outline edges exist.
3. Path: Hierholzer Euler walk from the end node, preferring `segment` edges; prepend the start.
   Consecutive non-segment edges collapse into one travel move found by A* on the travel graph
   (heuristic = straight distance), resampled to 3 mm / 0.5 tolerance. Segments are sewn using
   their spiral vertices (so stitch length ≈ L).

#### Implementation notes for Threadroom
- Spiral generation is ~40 lines (closed-form arc length, dθ rule). Recommend `b = s/π` if we
  want Row Space to mean the true row distance; keep Ember's `b = s` behind a comment if parity
  matters. Decide before shipping (this changes density by π).
- Clipping: scan the polyline against `Region` / rings (segment–ring intersections), or sample
  at 0.1 mm and split where `region.contains` flips.
- Routing: our `route_fill` is row-specific. Simplest acceptable route: keep the spiral order
  (pieces sorted by θ along each arm, inside out, alternating arms) and join consecutive pieces by
  `Grid.reach` hidden travel (Grid works in any frame; use angle 0), else trim. A full Euler router
  can come later and would also serve Streamlines.
- Model: `fillPattern:'circular'`, `center?: [x, y]` (default centroid; canvas handle).
Confidence: high for geometry; medium-high for routing (standard Ink/Stitch algorithm, read in
full but not run).

### 4.3 Streamlines (34, paid)
Sources: `5729` 49374 `O` (field from guides), `5473` 16433 class `g` (exported `Mw`), generator
`6712` module 43339 `A`, line router `5473` 10252 class `M` (exported `fX`, error text says
"Redwork"), component connector `5473` 25890 `h`.

Parameters: Separation (`separationMm`, 1.5, 0.5–20, step 0.5), Stitch Length L (4), Start point.
Guides: `fillParameters.streamlineGuideLines` (polylines with per-point `curve` flags), edited with
the "Edit flow field" tool (`EDIT_STREAMLINE_FIELD`).

**Field**
- With guides: each guide is smoothed with the editor spline (`16256` `eG`, smooth/corner points,
  curvature blending) and resampled (`YT(cmds, 5, 1, 50)`, about 0.5 mm). Every resampled segment
  i has unit tangent t_i. Field at p:
  `F(p) = normalise( Σ t_i·w_i ),  w_i = 1/(d_i² + 1)`, d_i = distance from p to segment i in
  **world units (0.1 mm)**. Falls back to (1, 0) if the sum vanishes. Note: segments, not guides,
  are weighted, so densely sampled guides weigh more; the sign of t_i follows the drawing
  direction (opposite-direction guides cancel).
- Without guides: a noise field. Angle `a = 2π · simplex2((x+123456)/400, (y+345678)/400)`
  (x, y in world units, so features are ~40 mm), and the vector is the **position vector**
  `(x, y)` rotated by a (normalised later). The position-vector quirk makes the field depend on
  absolute canvas position; don't copy it (use `(cos a, sin a)`).

**Streamline placement** (Jobard–Lefer evenly spaced streamlines; same API as the `streamlines`
npm library). In world units:
- `dSep = 10·separation`, `dTest = 0.5·dSep`, step h = 1 (0.1 mm), minPoints 2,
  maxPoints 10 000 per direction, domain = the shape's bounding box (not the polygon).
- Integration: RK4 on the normalised field (`k1..k4` each normalised; null if the field
  vanishes).
- Spatial hash with cell size dSep.
- Seeds: first seed = bbox centre. A seed is accepted only if it lies in the bbox and is ≥ dSep
  from every existing streamline point. Integrate forward (+h) and backward (−h); a direction
  stops when the next point leaves the bbox, is < dTest from any point of an accepted streamline,
  or is < dTest from its own points older than `ceil(dTest/h) + 1` steps (self-loop guard).
  Streamline = reversed backward points + seed + forward points; kept if ≥ 2 points.
- After accepting a streamline, enqueue candidate seeds every `round(dSep/h)` points at ±dSep
  along the field normal. When the queue is empty, fall back to the centres of a dSep grid over
  the bbox in row-major order.

**Stitches**
- Clip all streamlines to the polygon (JTS intersection); add **all polygon boundary rings** as
  lines too.
- Router (10252): densify every line to 1 mm, node all lines at intersections (precision
  0.1 world unit), build a directed multigraph with each line piece in both directions, join
  disconnected components with jump edges via Borůvka (nearest-point MST between component
  envelopes, both directions), then one Hierholzer Euler circuit from the node nearest the start
  point. If an exit differs from the entry, a Dijkstra path entry→exit is sewn first as TRAVEL.
- So **every streamline and the outline are sewn twice** (out and back, redwork style), with
  jumps between disconnected groups. STITCH runs are resampled at L with tolerance 0.1 (same
  tolerance resampler as running stitch); TRAVEL at 3 / 0.5.
- No underlay, no pull compensation; Hand Stitch afterwards with angle 0.

#### Implementation notes for Threadroom
- New module `embroidery/streamlines.py`: field from guides (inverse-square segment average,
  distances in mm with the "+1" term converted: `w = 1/(100·d_mm² + 1)`), RK4, spatial hash,
  seeding as above. Pure Python is fine at 0.1 mm steps for hoop-sized shapes if capped
  (e.g. stop at 200 000 integration steps and report "too dense").
- Clip by sampling each streamline and splitting on `Region.contains`.
- Router: an Euler circuit over doubled edges is simple once lines are noded. Since streamlines
  never cross (by construction), noding is only needed against the outline; endpoints
  touch the boundary after clipping. A simpler first version: sew boundary + streamlines with
  our nearest-first `route_lines`, then add the redwork Euler router later (it also gives
  Threadroom a "redwork" kind).
- Model: `fillPattern:'streamlines'`, `separation` (0.5–20, default 1.5),
  `flowGuides?: Point[][]`. UI: a guide-drawing mode like Edit angles.
- Default field without guides: use the fill angle as a uniform field (straight streamlines)
  rather than noise, or seeded simplex with `(cos a, sin a)`.
Confidence: high for the algorithm; medium for exact visual parity (noise table and spline
smoothing not reproduced).

### 4.4 Cross Stitch fill (36, paid)
Sources: `5729` 97311 `n`; engine `5473` 70314 classes `g` (exported `J$`), `p` (builder),
`f` (stitch writer).

Parameters (overlay): Style `type` cross | upright | double | smyrna | half (default cross);
`flipped` false; `dense` false; `sizeMm` 3 (1–20, 0.5); `threadCount` 2 (1–8, integer);
`coveragePct` 50 (1–100); Rotation = `overlay.angle` (degrees); `stitchLengthMm` =
`overlay.stitchSpacing` (hidden in the UI but still used, default 4); travel 3. Start/End points
(default first and last shape point).

**Grid**
- Grid space: rotate by −rotation about `rotationCenter` = bbox minimum of the unrotated shell;
  if `flipped` and style ≠ half, also map `(x, y) → (−y, x)` (a 90° turn, mirroring the cross
  sewing order). Half + flipped instead sets `halfFlipped` (diagonal direction, below).
- Box size b = size (square). Grid origin: rotated bbox min (`gridOrigin`/`offsetMm` unused by
  the UI), snapped as `origin − ceil((origin − min)/b − 1e-9)·b`. Points live on a b/2 lattice so
  neighbouring crosses share corners and edge midpoints.
- Dense: a second grid shifted by (−b/2, −b/2) is added (both grids' crosses overlap).
- Cell selection per grid row (y band `[y, y+b]`):
  - "Straddling" columns: any ring edge that overlaps the band in y, widened by one column each
    side. For these, coverage = area(box ∩ shape)/area(box)·100; keep the cross if
    `coverage + 1e-4 ≥ coveragePct`.
  - Other columns: keep if the box centre is inside (even-odd parity of the row-centre scanline).
- **Quirk worth checking**: the fill default angle is 135, and choosing Cross Stitch doesn't reset
  it, so a new cross-stitch fill is rotated 135° (legs horizontal/vertical) unless the user types
  0.

**Per-cross points**: corners tl tr br bl, edge midpoints ml mt mr mb, centre c.

| style | "good" entry points | "bad" entry points | points that connect neighbours |
|---|---|---|---|
| cross | tr, bl | tl, br | corners + c |
| upright | mt, mb | ml, mr | midpoints + c |
| smyrna | mt, mb | 4 corners | all 9 |
| double | tr, bl | tl, br | all 9 |
| half | tr, bl | tl, br | corners |

**Thread count**: `repeats = floor(tc/2)` for half, else `max(1, floor(tc/2))` (tc 1 and 2 sew the
same). `g(a, b, n)` = the point sequence a, b repeated n times.

**One cross as a closed cycle** (starts and ends at the entry point P), `cycleFromPoint`
(n = repeats):
- cross / double, P good (tr or bl), Q = the other good point:
  `P, c, g(tl, br, n) [or g(br, tl, n) when P = bl], c, [double: g(ml, mr, n), c, g(mt, mb, n), c],
  g(Q, P, n)`.
  Example cross, n = 1, P = tr: tr → c → tl → br → c → bl → tr. Each diagonal is sewn once full
  and once as two halves through the centre; "/" ends on top.
- cross / double, P bad (tl or br), E = opposite corner:
  `P, g(E, P, n−1), E, c, [double extras], g(tr, bl, n), c, P`. Example n 1, P = tl:
  tl → br → c → tr → bl → c → tl.
- upright: P = mt/mb: `P, c, g(ml, mr, n), c, g(opp, P, n)`; P = ml/mr:
  `P, g(E, P, n−1), E, c, g(mt, mb, n), c, P`.
- smyrna: both diagonals then the upright cross, all through c, ending at P (see `cycleFromPoint`
  smyrna branch; same building blocks: diagonal pairs via c, then `g(ml, mr, n), c, g(mt|mb …)`).

**Tour of a connected group** (`buildCycle`, a Hierholzer-style splice on a linked list): start
with one cross containing the entry point. Repeatedly walk the current tour; at every point that
is a *good* point of an unsewn cross, splice that cross's cycle in at that point. When a pass adds
nothing, find the first tour point that is a *bad* point of an unsewn cross and splice there.
Result: one continuous needle path covering every cross in the group with no travel at all (all
moves are cross legs). Groups = crosses connected through shared "connect" points.

**Group order**: the group containing the start point first; then greedy nearest (by each group's
"outside start point" = a good point used by only one cross); the group containing the end point
last. A group starts at the entry point, end point, or its outside point nearest to the previous
group's last needle point. Between groups the writer emits a JUMP. If start and end fall in the
same group, it first travels (TRAVEL, A* over the cross-centre/leg graph) from start to end and
then sews the group's tour from the end point, so the tour finishes at the end.

**Half style**: chains of "\" legs (tl→br; "/" bl→tr when flipped) linking crosses that touch at
corners along the diagonal. Each chain is sewn `2·repeats + 1` times, alternating direction
(tc 2 → 3 passes: out, back, out). Chains are grouped by diagonal (key i − j, or i + j when
flipped), and ordered in serpentine order; of the 4 combinations (groups forward/reversed,
alternation phase) the one with the least distance to start + end wins. Between chains: shortest
path along cross box edges as TRAVEL, else JUMP.

**Stitch writer**: any leg longer than L (normal) or 3 (travel) is split into equal pieces. With
defaults (size 3, L 4) the full diagonals (4.24 mm) are split in two.

#### Implementation notes for Threadroom
- Threadroom's `route_cross` sews the "row method" (half-crosses along a row, return with the
  other legs) with cell = `spacing` and complete-crosses-only selection (`cross_cells`). Ember's
  method differs: per-cross closed cycles spliced into one tour, plus coverage-based edge cells.
- Plan: keep `route_cross` as style "rows" (it is the better production method for top-leg
  consistency) and add Ember's styles behind `crossStyle?: 'cross'|'upright'|'double'|'smyrna'|
  'half'`, `crossSize`, `threadCount`, `coverage`, `dense`, `flipped`. `cross_cells` gains a
  coverage mode: cells cut by the boundary use polygon-clip area (Sutherland–Hodgman of the box
  against each ring, even-odd) and are kept at ≥ coverage %.
- The splice tour is ~80 lines of Python with dicts keyed by lattice point `(2i, 2j)` ints.
- Pass the leg split limit as the chunk limit (cross legs up to √2·size).
Confidence: high (engine read in full).

---

## 5. Run types: rope runs (and E-stitch details)

Sources: `5729` 99342 class `f` (Double, exported `IF`, built by `5729` 95472 `n`), class `b`
(Triple, exported `jL`, `5729` 23283 `e`), class `S` (E-stitch, `Lb`, `5729` 52980 `Z`);
dispatch `5729` 10556 map. Input polyline = `splineResampled` (path resampled at 10·stitchLength
world units = stitch length mm). Parameters: Width w (`outlineParameters.width`, 0.4), Stitch
Length L (1.5). The rope pass uses a running stitch with tolerance **1 mm** (the RunningStitch
default; the UI's Stitch Tolerance is not passed). Travel = 3 mm, tolerance 0.5, type TRAVEL.

**Offset rule** at rope point r_i (running-stitch points along the path, start to end):
tangent `T_i` = normalised (unit(r_i − r_{i−1}) + unit(r_{i+1} − r_i)); at the ends the single
neighbour direction; if the three points are collinear (`|cross| ≤ 1e-5`, world units) use
unit(r_i − r_{i−1}). Normal `N_i = T_i` rotated by +90° (`(x, y) → (−y, x)`, y-down canvas).
Offsets are ±w·N_i, so the rope is 2w wide (0.8 mm by default).

**Double Rope Run** (with default start/end at the path ends):
1. TRAVEL run start → end along the path (3 mm stitches).
2. TRAVEL run end → start (the whole path back).
3. Rope pass start → end: point i at `r_i + w·N_i` for even i, `r_i − w·N_i` for odd i.
4. TRAVEL from the end to the exit (nothing when exit = end).
With a custom start S: a jump to S's projection if > 1 world unit away, TRAVEL S → path end, then
the full path back, then the rope pass, then TRAVEL back to the exit projection. The base run is
hidden travel, so the visible result is one zig-zag rope over a double run.

**Triple Rope Run**:
1. TRAVEL start → end, 2. TRAVEL end → start (as above),
3. Rope out (start → end): even i `+w`, odd i `−w`,
4. Rope back (end → start): the mirrored alternation, even i `−w`, odd i `+w`, traversed in
   reverse. Out and back stitches cross between every pair of points, giving a twisted rope.
5. TRAVEL start → exit (the whole path forward again with default ends).

**E Stitch** (class S): points from the tolerance resampler (L, tolerance default 1 mm). For each
point p_i with normal `n_i = (−dy, dx)/|d|`, d = p_{i+1} − p_{i−1} (one-sided at the ends):
emit `p_i, p_i − W·n_i, p_i` (`+W·n_i` when Flipped). W = E-stitch width (2). Travel to/from
the access points as for rope runs.

### Implementation notes for Threadroom
- `line_passes` gets two branches, `kind in ('rope2', 'rope3')`, reusing `line_path` for the
  base runs (sew them at `length` or 3 mm) and a new `rope_points(path, w)` for the offsets.
  Pass order exactly as above; the passes already alternate direction in `line_passes`.
- Our `e-stitch` (`satin_path` style "e-stitch") walks one rail and bites to the other; Ember walks
  the *centre* path and bites one side. Equivalent up to which edge the stem sits on; no change
  needed beyond documenting.
- Model: kinds `'double-rope'`, `'triple-rope'` with `ropeWidth` (0.2–2, default 0.4);
  `isWideKind` false. Tests: triple pass count, crossing alternation, endpoints.
Confidence: high.

---

## 6. Blocks (two-rail satin)

Sources: rails `5473` 60001 `Dg`, rail splines `1967` 666 `o`/`RO`, spline `1967` 16256 `eG`,
pairing `5729` 17743 `p` and `bA`, entry `5729` 38086 `mx`, satin `5473` 70026 ClassicSatin
(`Od`), editing `page` (node delete handler near `"blocks"===n.stitchType`).

### 6.1 Data model and editing
- One `controlPoints` list; index 0 and even indices form the left rail, odd indices the right
  rail. Rung k = (point 2k, point 2k+1). At least 4 points (2 rungs). Each point has a
  `curve` flag (smooth vs corner).
- Rail extraction `Dg` also nudges a point that lies within 0.01 world units of its predecessor
  by 0.001 along the local direction (avoids zero-length segments).
- Drawing: the "blocks" tool adds points alternately left/right (rung by rung). Deleting a
  selected node deletes its whole rung (both partners), refusing to go below 4 points.
- Blocks can't be filled; they use the satin panel (Density, pull, Split, Shortening,
  Fractional spacing, underlays; no Width). Each block may carry a `randomSeed` used for
  shortening.

### 6.2 From rails to a quad strip
1. Each rail's points go through the editor spline: if the points carry explicit bezier/line
   commands they are used as-is (`1967` `W`), otherwise Raph Levien's interpolating spline
   (`eG`, smooth/corner points, `solve()` then `computeCurvatureBlending()`) renders to cubic
   beziers, emitting a `mark k` command before segment k (between rung k and k+1).
2. Flatten: every `lineTo`/`bezierCurveTo` becomes 10 equal-parameter points. Points are grouped
   by the current mark (the initial `moveTo` point belongs to group 0).
3. Pair per group: for group k with left points A (count a) and right points B (count b), emit
   `max(a, b)` pairs `(A[min(t, a−1)], B[min(t, b−1)])`, t = 0.. (the code's
   `floor(min(t/(a−1), 1)·(a−1))` reduces to `min(t, a−1)`). If one rail has more points in a
   segment, the shorter rail's last point repeats (a small fan at the rung). Usually both have the
   same count.
4. The interleaved list `[L0, R0, L1, R1, …]` is the quad strip.

### 6.3 Satin between the rails (ClassicSatin)
- Lines: left = L points, right = R points, centre = midpoints.
- Closed if the first and last pairs coincide (1e-7).
- Rung count `N = round(len/density) + 1` (open; N for closed), where len is the centre length,
  or with fractional spacing the blended length Σ_k `max(l_k, r_k)·(1−f) + min(l_k, r_k)·f`
  (l_k, r_k = left/right lengths of quad k; f = `offsetFraction`, 0.33; 0 = outer rail,
  0.5 ≈ centre, 1 = inner rail).
- Rung j at parameter j/N: find the quad k and fraction u where the measured length reaches
  `j/N·len` (binary search on cumulative quad lengths), then left = lerp(L_k, L_{k+1}, u),
  right = lerp(R_k, R_{k+1}, u). So both rails are sampled at the **same quad and fraction**,
  which is what makes rung pairing follow the user's rungs.
- Then: pull compensation (`keep-rows` method: move each rung end outward along the rung by pull
  per side), stitch shortening (companion spec 2.10), split of long rungs with stagger (companion
  spec 1.5). Needle sequence `L'_0, R'_0, L'_1, R'_1, …` (plus split points).
- Order: start defaults to L0 and end to the last R. Underlays first, in list order, each from
  where the previous ended: `center` = running stitch along the centre (length 1.5, tolerance
  0.25, no cap inset) start → end; `contour` = closed loop along both rails inset by side inset,
  capped by cap inset; `zigzag` = a closed loop of two crossing zig-zags at underlay density
  between the inset rails. Then the cover: if the needle is not at the start of the satin, it
  travels along the centre line (hidden under the satin) and sews the satin towards the end, so
  with a center underlay the order is: centre run out, hidden travel back, satin out.
- Several blocks/outlines in one group are routed with `pD` (travel 3/0.5).

### Implementation notes for Threadroom
- Model: kind `'blocks'` with `rails: [Point[], Point[]]` (or keep alternating control points
  for editor parity) plus curve flags. `lib/curves.ts` already samples our curves; reuse it per
  rail, segment by segment (between rung k and k+1), so each segment yields the same number of
  samples on both rails (e.g. `max(8, ceil(segLen/0.3))`), which avoids Ember's fan quirk.
- Compiler: new `blocks_path(left, right, spacing, pull, split, short)`:
  quad strip → rung sampling by blended length (above) → pull per side → `split_bites` (ours) →
  shortening (our compression rule works per rail: compare consecutive rung-end distances, which
  is Ember's trigger too). Reuse `line_passes`-style underlay: centre = midpoints line, edge =
  inset rails, zigzag between inset rails.
- Editor: rung-pair insert/delete, ≥ 2 rungs.
- Tests: a straight 2-rung block equals a constant-width satin; a tapered block has rung widths
  interpolating linearly; rung count = round(len/spacing)+1.
Confidence: high for pairing and sampling; medium for the Levien spline (we'd use our own).

---

## 7. Recommended implementation order

**Batch 1: row-pattern engine and data-only patterns** (one compiler change + tables)
1. Engine (section 1): `pattern_points` in `Rows.paths`, object-level anchor, global row index,
   shear, chunk limit, short-fragment merge, optional `skipLast`, `fillLength`.
2. Free patterns: Tatami, Walk, Original, Triangle, Waves, Columns, Offset Columns.
3. Paid formula patterns: Zig-Zag, Heartbeat, Spiral, Staircase, Rainfall, Tornado, Wavy Walk.
4. Digit-seed partitions: Jitter, Bands, Interlocked, Rails, Twill (shear), Houndstooth.

**Batch 2: tile/curve patterns** (generators feeding the same engine)
5. Diamonds ×3, Circles ×3, Hexweave (closed form).
6. Hearts ×3 (root finder), Chain (sinusoids), Stars (polygon crossings + grid). Add the long-stitch
   handling in the design check.

**Batch 3: separate engines**
7. Satin fill, single-guide case (fill_sections + satin zig-zag + split): small, high value.
8. Cross-stitch styles, coverage, dense, thread count (extend `cross_cells`/`route_cross`).
9. Circular fill (spiral + simple ordered routing; decide the π·s spacing question first).
10. Streamlines (field, Jobard–Lefer, clip, router). A redwork Euler router built here can later
    back a redwork kind.
11. Multi-guide sweep (Satin fill and Edit angles): last; needs the level field and facet
    decomposition.

**Batch 4: run types and blocks**
12. Double/Triple Rope Run (quick; could be pulled forward any time).
13. Blocks (rails model, editor, quad-strip satin).

---

## 8. Not determined

- Exact visual parity of Streamlines without guides: the simplex permutation table (`5473` 84706
  `f1`) was not reproduced, and the position-vector rotation quirk looks unintended.
- The guide-smoothing resampler `YT(cmds, 5, 1, 50)` parameters (meaning of 1 and 50) for the
  flow field; I assumed ~0.5 mm spacing.
- Sweep satin facet decomposition and column merging (`5473` 90076 / 88458) are only outlined;
  the single-guide behaviour (stitches parallel to the angle) is certain, the multi-guide sweep
  internals are not.
- Whether Circular Fill's π·Row Space ring distance is intended.
- Whether the cross-stitch default rotation of 135° (inherited fill angle) is what users see
  (the panel shows it as "Rotation 135").
- Euler-walk tie-breaking in the redwork and circular routers depends on graph-library insertion
  order; the stitch set is reproducible, the exact order may differ.
- Smyrna's full cycle for every entry case was read but only summarised here (`5473` 70314
  `cycleFromPoint`, smyrna branch).
- Levien spline maths for block rails (`1967` 16256) was not transcribed; any smooth interpolating
  spline gives the same structure.
- Nothing above was checked against an exported Ember file.
