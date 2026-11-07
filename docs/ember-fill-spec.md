# Ember fill and outline behaviour: spec for Threadroom

Source: Ember's minified client bundle (v2.emberdesign.net, downloaded 2026-10-21). Citations use
`chunk` + webpack module id + nearby identifiers. Chunk names are shortened:
`page` = `page-99122af94fe2a2da.js` (editor page), `1967`, `5729`, `5473` = `c/<n>-*.js`.
Ember works in world units of 10 px per mm (`1967` module 57656, `gy=10`). Every value below is in
mm unless stated otherwise. Angles are in degrees on a y-down canvas.

Everything here was read from the client code. I did not observe any of it by running Ember.
Section 5 lists what I could not determine.

---

## 1. Open vs filled shapes, run types, blocks

### 1.1 Data model (`1967` module 666, class `P`; `5729` module 10556, its subclass)
- A shape has two independent properties. `isClosed` is the path topology, fixed when the shape is
  drawn. `stitchType` is one of `outline | fill | blocks | manual | text | machine-file | reference`
  (plus `redwork`). New shapes default to `stitchType "outline"`.
- A shape always carries both `outlineParameters` (defaults `SS`) and `fillParameters` (defaults `RZ`).
  Switching type keeps both sets, so switching back restores the earlier settings.
- `setStitchType` only sets the field. Nothing in the bundle changes `isClosed` when the stitch type
  changes. `setIsClosed` exists, but no stitch-type path calls it.

### 1.2 The Outlined | Filled toggle (`page`, component `cL`, buttons "Outlined" / "Filled")
- Outlined calls `setStitchType("outline")`. For a multi-selection it runs a command that skips
  `blocks` shapes.
- Filled calls `setStitchType("fill")` for every selected shape except `blocks`. Blocks cannot be
  filled.
- While a shape is still being drawn (it is the current shape and not yet selected), an effect in
  `cL` copies the panel's current fill/outline parameters and toggle state onto it. If the panel is
  on Filled, the shape is created as a fill, even with the open "line" tool ("Drawing Open Shape",
  `page` near the `case"line"` label switch).
- Mixed selections (blocks + outline + fill) hide the toggle and the run-type picker (flag `G`).

### 1.3 Filling an open path
- **Yes, an open path can be filled.** When the fill is computed, the shell is the resampled spline,
  with its first point appended if the shape is open (`5729` module 10556: the `fill` payload builder
  and `computeStitchPoints` both use `isClosed ? splineResampled : [...splineResampled, first]`).
  The fill pre-processor (`5729` module 41525, `f`) also closes any ring whose ends differ, unions it,
  and drops rings with fewer than 4 points or area < 8 px² (0.08 mm²).
- **The closing chord is not stitched.** It is only part of the fill boundary. Fill rows run up to
  it, and with Underpath off, travel may follow it as an edge. A fill never sews an outline.
- **The open/closed state does not change.** Switch the same shape back to Outlined and it is still
  an open run between its two ends.
- A closed shape switched to Outlined sews the full loop. The running stitch treats the path as
  closed when its first and last points coincide (`5473` module 18939, constructor `isClosed`).
  Triple adds a closing segment when `isClosed` (`5729` module 24423). Satin wraps the column
  (`5729` module 65682, `aD`).

### 1.4 Run types (outlined shapes) (`page` `ck` list, `cT` picker; dispatch `5729` module 10556 map `b`)

| id | label | free? | what it sews | parameters (default) |
|---|---|---|---|---|
| `single` | Single | free | Running stitch along the path | Stitch Length 1.5, Stitch Tolerance 0.2 |
| `triple` | Triple | free | Each running segment sewn forward, back, forward (a→b→a→b…). Closed paths add the closing segment | same as Single |
| `satin` | Satin | free | Constant-width satin column centred on the path (`kN`) | Width 2, Density 0.32, pull comp 0.2, split / shortening / fractional spacing, satin underlays (below) |
| `e-stitch` | E Stitch | paid | Appliqué E: a stem along the path with teeth to one side | Width 2, Stitch Length 1.5, Flipped false |
| `double-rope-run` | Double Rope Run | paid | A plain run, then a pass whose penetrations alternate ± width either side of the path | Width 0.4, Stitch Length 1.5 |
| `triple-rope-run` | Triple Rope Run | paid | A plain run, then alternating-offset passes out and back with mirrored alternation (`5729` 99342 class `b`) | Width 0.4, Stitch Length 1.5 |
| `manual` | Manual | paid | Control points used directly as needle points (stitchType becomes `manual`) | none |

Only `single`, `triple` and `satin` are free (`cA` set). The rest show a lock and open the
`RUN_TYPES` upsell modal.

**Stitch tolerance** (`5473` module 18939, `takeStitch` / `resampleEvenly` / `splitPath`): how far a
straight stitch may stray from the drawn path (help text: "How far a stitch may leave the path. Lower
follows corners more closely; higher lets stitches cut them."). How the run is built:
1. Split the path at turns sharper than about 45°.
2. Divide each piece into equal stitches of length `L/ceil(L/stitchLength)`.
3. A stitch may skip intermediate path points only while every skipped point stays within the
   tolerance of the stitch. Each skipped point adds a disc of that radius, and the stitch must stay
   inside the intersection of those discs.

Default 0.2. User settings clamp it to 0.1–20 (`1967` 666 `K`). The UI enforces a minimum of 0.1.

### 1.5 Blocks (satin blocks)
- Tool "blocks" ("Drawing Blocks"). Control points alternate between rails: index 0 and even indices
  are the left rail, odd indices the right rail (`5473` module 60001, `Dg`). The user clicks rung
  pairs left/right, and at least 4 points are needed.
- Each rail is drawn as a smooth spline (`1967` 666 `o`). Satin is sewn between the two rails
  (`5729` module 38086, `mx`), so column width can vary along its length, unlike the constant-width
  Satin run type.
- Blocks use the satin settings panel: Density, pull comp, Split, Shortening, Fractional spacing and
  satin underlays. Width is not shown because the rails define it. Blocks can't be switched to Fill.
- Satin details (`5473` module 70026, ClassicSatin; defaults in `1967` 666):
  - **Split** (`Ho`: enabled, maxWidthMm 7, staggerEnabled, staggerCycles 4, staggerAmountMm 0.6).
    A rung longer than max is cut into `ceil(w/max)` equal pieces. With stagger, row i shifts the
    split points by `min(amount/w, 1/n) * min(1, w/(n*max)) * ((i mod cycles)+1)/cycles` of the
    rung.
  - **Shortening** (`gv`: enabled, triggerSpacingPercent 50, maxConsecutive 2, randomize true,
    randomSeed 0). See 2.10.
  - **Fractional spacing** (`eb`: offsetFraction 0.33). Density is measured along a line blended
    between the edges: 0 outside, 0.5 centre, 1 inside.
  - **Satin pull comp** (0.2) moves each rung end outward along the rung by the value. This is per
    side.
  - **Satin underlays** (list; default `[center]`, `bd`: underlayStitchLength 1.5, contour/zigzag
    insets 0.5, cap insets 0.5, density 1.5). Types: `center` (run along the middle, tolerance 0.25),
    `contour` (runs along both edges, side/cap inset), `zigzag` (density, side/cap inset).
    "Add underlay" appends another `center`.

---

## 2. Fill settings (`page` component `ch`; defaults `1967` 666 `RZ`; generator `5473` module 79438)

Fill defaults (`RZ`): pattern Tatami. Overlay angle 135, rowSpacing 0.2, stitchSpacing 4.
`pullCompensationMm` 0.2, `handStitchIntensity` 0, `underpath` true, `gradient` null.
`sweepRowShortening` true, `sweepRowShorteningTriggerPct` 0.5, `sweepGuideLines` []. One underlay
(see 2.9).

Saved per-user defaults are clamped (`1967` 666 `K`):
- angle −360..360; rowSpacing 0.05–50; stitchSpacing 0.1–50
- pullComp 0–5; handStitch 0–5 (integer); trigger 0–1
- underlay row 0.05–50, length 0.1–50, inset 0–10

The panel enforces only `> 0`. Validation (`1967` 666 `Z`) rejects rowSpacing ≤ 0, a stitch length
≤ 0 (unless the pattern ignores length), a gradient end ≤ 0, a trigger outside 0..1, an underlay
row or length ≤ 0, and pattern parameters equal to 0.

### 2.1 How fills are built
- The shape (with holes) goes to `RoutedFill` (`5729` 99342 class `R`, `tb`).
  - With 0–1 angle guides it uses `BCDFill` (`5473` module 29459): straight parallel rows,
    boustrophedon cells, rows joined by in-shape travel (`travelRouting "row-midpoints"`).
  - With ≥ 2 angle guides it uses `SweepFill` (`5473` module 25554): curved rows following the
    guides. It falls back to BCDFill if the guides are invalid.
- Travel: length 3, tolerance 0.5 (`5473` module 83470 `l2`).
- Routing phases: underlay first, then cover (`getRoutingPhases`).
- Multiple separate pieces of a shape are combined by a router (`pD`) with entry and exit at the
  shape's Start/End points (default: first/last spline point).

### 2.2 Fill Pattern: how patterns work
A pattern is `stitchPattern(stitchLength, rowSpacing, params)`. It returns a cycle of row
descriptors `{rowOffsetMm, rowPatternMm[]}` (`5729` module 21068, list `a`).
- For each row (lane), the engine picks `pattern[laneIndex mod cycleLength]` (`5473` 29459,
  `patternedFillRows`).
- Lane index is global across the shape. Lanes are anchored to the shape centroid
  (`fillPatternCenterPosition`), so rows align between disconnected parts.
- Needle points sit at `anchor + rowOffsetMm + shearPerRow*laneIndex`, stepping by the
  `rowPatternMm` lengths in a cycle, both forward and backward. They are projected onto the row
  segment, and the row end is always a penetration.
- Patterns with `usesStitchSpacing:false` hide Stitch Length and define their own spacing.
- **Penetrations are never randomised by the pattern.** Only Hand Stitch adds randomness.

Fill Pattern list in order (32 entries; Threadroom leaves out Ember's Original, which aligns every
penetration in columns, and the large 12 mm Hearts, Diamond and Circles tiles, whose long floats
snag). Offsets are given as fractions of stitch length L unless noted:

| # | id | name | free? | row cycle |
|---|---|---|---|---|
| 1 | tatami | Tatami | free | 4 rows, offsets L/4, L/2, 3L/4, L (quarter-step stagger) |
| 2 | sweepSatin | Satin | free | Not row-based. Satin across the shape at the fill angle using satin settings. Fill settings panel hidden, satin panel shown |
| 3 | partitionLine | Walk | free | 7 rows, offsets 1/7…7/7 L (digit seed "1234567") |
| 5 | triangle | Triangle | free | 6 rows: 2/5, 3/5, 4/5, 1, 4/5, 3/5 L |
| 6 | waves | Waves | free | `steps` rows (20, 1–100), offset `(sin(2πi/steps)+1)/2 * amplitude` (2 mm, 0–10) |
| 7 | columns | Columns | free | 2 rows: L/4, L/2 |
| 8 | offset-columns | Offset Columns | free | 6 rows at 0, then 6 rows at +6 mm (absolute) |
| 9–10 | small/mediumHearts | Hearts (sm/md) | free | Tile size 4 / 8 mm, `round(size/rowSpacing)` rows. Penetrations sit where each row crosses a heart curve. Ignores L |
| 12–13 | small/mediumDiamond | Diamonds (sm/md) | paid | Width 2 / 6 mm, rows trace a diamond outline. Ignores L |
| 15 | zigzag | Zig-Zag | paid | Offset rises over 2L of rows |
| 16–17 | small/mediumCircles | Circles (sm/md) | paid | Diameter 4 / 8. Ignores L |
| 19 | heartbeat | Heartbeat | paid | 21-row ECG profile × intensity (3, 1–8) |
| 20 | spiral | Spiral | paid | tightness 3 (1–8), rotations 2 (1–5) |
| 21 | staircase | Staircase | paid | stepHeight 1.5 (0.5–4), steps 5 (2–10) |
| 22 | rainfall | Rainfall | paid | chaos 4 (1–10), density 30 (10–60). Golden-ratio pseudo-random offsets and lengths |
| 23 | hexweave | Hexweave | paid | cellSize 4 (2–12). Ignores L |
| 24 | tornado | Tornado | paid | tightness 2.5 (1–5), rotations 3 (1–6) |
| 25 | partitionWaveWalk | Wavy Walk | paid | 21 rows |
| 26–31 | partitionJitter / Bands / Interlocked / Rails / Twill / Houndstooth | Jitter, Bands, Interlocked, Rails, Twill, Houndstooth | paid | Digit-seed partitions ("20163", "00001111", "00001111", "00001111", "0123", "01"). Some add a per-row shear (row spacing × cot(shear angle), shear 90 / 90 / 45 / 90) and split rows into sub-lengths |
| 32 | partitionChain | Chain | paid | Two interleaved sinusoids in an 8 mm tile |
| 33 | partitionStars | Stars | paid | 5-point star in an 8 mm tile |
| 34 | streamlineFill | Streamlines | paid | Separate engine (`5473` 49374): flow-field streamlines, separation 1.5 (0.5–20). Edited with "Edit flow field" |
| 35 | circularFill | Circular Fill | paid | Concentric rows around a draggable centre (`5729` 61505) |
| 36 | crossStitchFill | Cross Stitch | paid | Separate engine. Style cross / upright / double / smyrna / half, flipped, dense, size 3, threads 2, coverage 50% |

Free: 9 (Tatami, Satin, Walk, Triangle, Waves, Columns, Offset Columns, 2 × Hearts).
Paid: 23.

### 2.3 Stitch Angle and Edit angles
- **Stitch Angle** (default 135): the direction of the rows. Typed values are normalised to the
  integer 0–359 (`5729` 56075 `yc`). There is a circular dial (`o_`) next to the input. Angle 0 =
  rows along +x. The canvas is y-down, so 135 runs from bottom-left to top-right.
- Changing the top angle re-derives every underlay angle: underlay i =
  `normalise(angle + [90, 45, 135][i mod 3])` (`5729` 56075 `KY`, applied in `cL` `onFillParamsChange`).
- **Edit angles** (mode `EDIT_ANGLE`): toolbar tool. "Click twice to add an angle guideline. Drag
  either end to move it. Delete with a node selected removes that angle. Crossing or T-junction
  guides turn red." Guides are stored in `fillParameters.sweepGuideLines`.
  - One guide: the angle is the guide's direction (BCDFill).
  - Two or more guides: SweepFill bends the rows between them. The Stitch Angle input is locked
    ("More than one stitch angle. Change them with Edit angles."), and Gradient and Density Control
    apply to the sweep only.
  - Entering the mode on a fill without guides seeds one guide across the bounds at the current
    angle.
- **Edit flow field** (Streamlines only, paid) and **Start/End** (entry/exit points) are separate
  tools.

### 2.4 Row Space (default 0.2, step 0.1)
Perpendicular distance between rows: "Spacing between fill rows. Smaller packs tighter". Lanes are
evenly spaced and phase-anchored on the centroid, except when a gradient is set (2.8).
**Note:** 0.2 is about half Threadroom's woven 0.42. I could not tell from the client code whether
this is intentionally that dense (see section 5).

### 2.5 Stitch Length (default 4, step 0.1)
The base length L used by the pattern (`overlay.stitchSpacing`): "How long each stitch is along a
fill row." Hidden for patterns with `usesStitchSpacing:false`.

### 2.6 Pull compensation (default 0.2; shown for row-based patterns only)
Extends both ends of every fill row outward along the row direction by the value (`5473` module
61170: number → `[p, p]` per side; BCDFill extends rows with `compensationSides`). This is **per
side**, so a row grows by 2 × p in total. Only supported for straight rows (SweepFill uses a
buffered variant). Clamp 0–5.

### 2.7 Hand Stitch (0–5 integer slider, default 0)
Randomises needle placement for a handmade look (`5729` module 36161, `L`). For stitch index k of the
shape, a seeded random value `r ∈ [-0.5, 0.5)` is drawn (seed = `shapeId + "-" + k`), and the
penetration moves sideways (perpendicular to the row direction) by:

`offset_mm = 0.1 * (sign(r) * |r|^1.5 * L² + 0.02*I) * (I/5)^1.2`

where I is the intensity and L the stitch length in mm. At I=5 and L=4 this is at most ≈ 0.58 mm.
Underlay stitches (type 7) are skipped. Top and travel stitches move.
**Quirk:** the angle reaches `cos(angle + π/2)` without degree-to-radian conversion, so the movement
direction isn't truly perpendicular to the rows. Don't copy this.

### 2.8 Gradient (paid, toggle; hidden with ≥ 2 angle guides or non-row patterns)
- Turning it on sets `{mode:"ramp", start:0, end:1, endRowSpacingMm: max(4 × rowSpacing, 1)}`
  (`a_` merged in `ch`). Modes:
  - **ramp** (Start / End, 0–100%): spacing is Row Space before `start`, rises linearly to End Row
    Space at `end`, then stays at End Row Space. If start > end the ramp is reversed.
  - **plateau** (Center 50%, Width 20%): Row Space inside `center ± width/2`, ramping linearly to End
    Row Space at both edges (0 and 1).
- t is the normalised position across the shape, perpendicular to the rows (`5473` 29459
  `rowSpacingAtT`, `spacingAtSweep`). Lanes are placed by stepping the local spacing from the shape's
  minimum edge. With a gradient the centroid anchor isn't used, and `skipLast` is off.
- "Edit gradient" (paid) drags start/end handles on canvas.

### 2.9 Underpath (toggle, default on)
"Whether under-fill travel stays on the edges or cuts through the shape."
- On: travel between cells and sections may cut straight through the interior. Later rows cover it,
  and the planner prefers direct interior hops.
- Off: travel follows the outline (edges) only.

Source: `5473` 29459 `planTour` (`this.underpath` branches) and module 59014 `buildTravelGraph`
(interior diagonal travel edges only when underpath is on).

### 2.10 Density Control: two different features
1. **Fill "Density Control"** (fill panel `ch`, help `cs`): Row shortening (toggle, default on) and
   Density trigger (slider 0–1, step 0.01, default 0.5).
   - It only has an effect in SweepFill (≥ 2 angle guides), where rows fan.
   - Neighbouring rows whose inner-side spacing falls below `trigger × rowSpacing` have their shared
     connector end trimmed back, so the inside of a bend doesn't pile up (`5473` 25554
     `refinePatternedFillRows`).
   - The trim depth for each connector is chosen recursively so that the retained ends keep about
     row spacing between them.
   - With straight rows it does nothing.
2. **Satin "Stitch Shortening"** (satin/blocks panel, help `ci`; defaults `gv`
   triggerSpacingPercent 50, maxConsecutive 2, randomize, randomSeed 0). This is the source of the
   values you saw. In ClassicSatin `applyStitchShortening` (`5473` 70026):
   - For each rung, compare the distance moved on the left rail and the right rail since the previous
     rung. If the smaller distance is < `density × trigger%` and the rails differ, the tighter side
     is a candidate.
   - Consecutive candidates are grouped. A group closes at `maxConsecutive` members (engine clamp
     0–5) or when its accumulated spacing exceeds one full density.
   - Within a group of n, rung j's tight-side end is pulled toward the other rail to
     `pct[j]%` of the rung length. The table by n is [80], [85, 72], [70, 90, 70],
     [70, 90, 80, 70], [70, 87, 65, 83, 70].
   - With randomize the percentages are shuffled with a seeded PRNG (mulberry32). The seed is
     replaced by an FNV-1a hash of the shape id (`1967` 666 `W`, `q`).
   - Closed columns wrap around.
   - **Quirk:** the outline-satin config builder (`5729` 65682 `f`) forwards only
     `triggerSpacingPercent` and `randomSeed`. In that path `maxConsecutive` falls back to the engine
     default 5 and `randomize` to true. I'm not certain the UI's 2 takes effect.

### 2.11 Underlays (fill)
List, header "Underlays (n)". Each item has Angle °, Row (mm), Length (mm), Inset (mm) and a remove
button.
- Default list: one underlay, `{pattern: tatami, rowSpacing 1, stitchSpacing 4, angle 225,
  insetMm 0.4}` (`1967` 666 `u` / `d9`). 225 = 135 + 90.
- **Add Underlay**: appends `{...d9, tatami, angle: KY(topAngle, currentCount)}`, so the 2nd gets
  top+45 and the 3rd top+135. The underlay's own pattern field is ignored: underlays are plain
  straight-row fills using the engine default 3-row stagger (0, 0.33L, 0.66L).
- Each underlay fills the shape shrunk by Inset (polygon buffer −inset, then simplify) at its own
  angle, spacing and length (`5729` 99342 `R.getUnderlayRuns`).
- **Order sewn:** all underlays first (phase "underlay"), then the cover. Underlays go to the router
  with `preserveOrder:false`, so the router may sew them out of list order to shorten travel.
- An underlay with a missing inset uses 0.7 in the engine. The UI default is 0.4.

### 2.12 Advanced options (per shape; defaults `Wu` = `{tieOn true, tieOff true, trimAfter true, speed "fast"}`)
Applied after stitches are generated (`1967` 666 `_` / `cQ`):
- Trailing duplicate trims are removed and the first/last markers are normalised.
- If tieOn, the first stitch is marked START (tie-in).
- If trimAfter, a TRIM is appended. Otherwise, if tieOff, the last stitch is marked STOP (tie-off).

These are toggles in the object list toolbar and "Stitch Options" checkboxes. Speed has Slow / Fast
radios. **I found no client code that reads `speed`.** It's probably used at export or server-side
(not determined).

### 2.13 Run settings recap
- Single/Triple: Stitch Length 1.5 (step 0.1), Stitch Tolerance 0.2 (≥ 0.1).
- E-stitch, rope runs: see 1.4.
- Satin: Width 2, Density 0.32, pull 0.2.

---

## 3. Threadroom today vs Ember

Threadroom sources:
- `lib/project.ts`: `StitchObject`, `fabrics`, `underlayOptions`, `resolve`, `validProject`
- `app/studio.tsx`: "Object settings" panel at about lines 689–712, `updateObject` at line 300
- `embroidery/compiler.py`: `fill_sections`, `route_fill`, `Rows.paths`, `satin_path`,
  `split_bites`, `line_passes`

Threadroom resolves spacing, underlay and pull from the fabric profile when a value is unset.
Geometry is mm, and fill angle is −180..180 (slider −90..90, default 35).

| Ember setting | Threadroom today | Status | What would change |
|---|---|---|---|
| Open path can be filled; chord implicit, unstitched | `canFill` needs ≥ 3 points. Kind → fill sets `curve.closed=true` (`updateObject`), and the compiler's scan-lines wrap rings implicitly | **Partly**: fill works, but topology is rewritten | Model: keep `curve.closed` independent of `kind`. UI: stop toggling `closed` on kind change. Compiler: none for fill |
| Closed shape → Outlined keeps the loop | Kind → running sets `curve.closed=false`, so the closing segment is lost. Non-curve fill rings have no repeated first point, so `closed_ring` is false and they sew as open polylines | **Different (bug-like)** | `geometryPayload`: for line kinds with `curve.closed` (or fill-origin rings), append the first point so `closed_ring` holds. Tests in `curves.test.mjs` and `test_compiler.py` |
| Run types single / triple / satin | `running`, `bean` (= triple: b,a,b per segment), `satin` (constant width, centre line) | **Equivalent** (names differ) | Optional label alias "Triple" |
| E-stitch, rope runs, manual | `e-stitch`, `manual` exist. No rope runs | Partly | Rope runs: new kinds plus `line_passes` branches (paid in Ember) |
| Stitch tolerance (run) | `line_path`/`samplePath` divide evenly. No tolerance; curve corners are kept | **Missing** | Add `tolerance?` (0.1–1, default 0.2). Compiler: corner-split + ball-intersection resampling |
| Blocks (two rails, variable width) | "blocks" tool makes a constant-width `satin` centre line | **Missing** | New kind/geometry (`rails`) and a satin-between-rails generator. Large; later |
| Satin split (max 7, stagger) | `splitLength` 3–12 (default 7), golden-ratio stagger | **Equivalent** | none |
| Satin shortening (trigger %, max consecutive, table, seeded shuffle) | `shortStitches` bool: alternate inner bites shortened by 25% of width when compression < 0.8 | Partly | Optional: trigger % and table; keep the bool as the on/off |
| Satin underlay list (center / contour / zigzag, insets) | Single enum `center / edge / zigzag / edge-zigzag` | Partly | Keep enum; optional list later |
| Fill pattern (36) | Rows divided evenly from each row's own start (`Rows.paths` → `interpolate`). No inter-row stagger | **Missing** | See step 3 |
| Stitch Angle 0–359 + dial | `angle` −180..180, UI −90..90 slider | Equivalent for straight rows (mod 180) | Optional dial. Widen UI to −180..180 only once patterns make direction matter |
| Edit angles (multi-guide sweep) | `angleGuides` (≤ 8), sweep in `embroidery/sweep.py` | **Done** (own field blend) | none |
| Row Space | `spacing` 0.3–2, fabric default 0.38–0.5 | Equivalent (range differs) | none (keep fabric) |
| Stitch Length (fill) | Shared `length` 0.5–3 (also used by running) | Partly | Add `fillLength?` (1–6, default 3.5?). Decide (see 4.4) |
| Pull compensation | `pullCompensation` 0–1, applied **half per side** (`extend_spans`) | Equivalent but different semantics | Ember value p equals Threadroom 2p. Document; no change |
| Hand Stitch 0–5 | none | **Missing** | `handStitch?` 0–5. Compiler offset perpendicular to rows, seeded by object id |
| Underpath | Travel is always hidden inside the part (`travel` via `Grid.reach`), else trim | Equivalent to "on" | Optional `underpath:false` → route travel along the edge. Low value |
| Gradient ramp / plateau | none | **Missing** (paid in Ember) | `gradient?` and non-uniform `y` stepping in `fill_sections` |
| Density Control (row shortening) | `rowShortening`, `densityTrigger` (0.1–1) | **Done** | none |
| Fill underlays: list of {angle, row, length, inset} | Enum `none / edge / tatami / edge-tatami`. Tatami = angle+90, spacing 2, inset 0.4 (`EDGE_INSET`), length = `length`. Edge = inset walk. Underlay is skipped in parts without "deep" cells | Partly | See step 4 |
| Underlay order | Per part: edge, then tatami, then top | Equivalent | Keep list order, which is more predictable than Ember's reordering |
| tieOn / tieOff / trimAfter | `tieIn` / `tieOff` locks (none / tack / triangle, size). Ties only around trims. Trims decided by `trimJump` | Equivalent or richer | `trimAfter` (force a trim after an object) is **missing**. Optional bool |
| speed | none | Missing (unknown effect) | Skip |

---

## 4. Implementation plan (small, independently shippable)

Each step adds model fields, `validProject` and `validate()` checks, UI, compiler changes and tests.
Unset optional fields keep today's output byte-for-byte, so existing projects and the PES tests
stay stable.

### Step 1: Keep open/closed independent of stitch type
- Model: no new field. `curve.closed` is the topology. For non-curve objects, treat fill-origin
  rings as closed.
- UI (`app/studio.tsx` `updateObject`): drop `closed:isFillKind(patch.kind)`. Keep `canFill` (≥ 3
  points). Fill on an open curve closes implicitly with a straight chord. Show a dashed chord on
  canvas so the user can see it.
- Payload (`lib/curves.ts` `geometryPayload`): for line kinds whose curve is closed, append the first
  point so `closed_ring()` sews the loop.
- Compiler: none.
- Tests:
  - an open curve → fill → running round-trip keeps its endpoints
  - a circle → running sews a closed loop (first == last, and the stitch count includes the chord)
  - the fill of an open "U" covers the U plus its chord, with no running stitches on the chord

### Step 2: Run stitch tolerance (free in Ember)
- Model: `tolerance?: number` (0.1–1, default 0.2) for running, bean and backstitch.
- UI: number field under Length for line kinds.
- Compiler: replace `line_path` resampling for curves with corner-split equal division plus a
  tolerance check (a stitch may skip curve points within the tolerance).
- Tests: on a polyline with a 90° corner the corner is always a penetration. On a gentle arc a
  higher tolerance gives fewer or equal stitches, and no stitch exceeds `length`.

### Step 3: Fill patterns, row offsets only (free set)
- Model: `fillPattern?: 'tatami'|'columns'|'offset-columns'|'triangle'|'walk'|'waves'`,
  plus `patternParams?` for waves (steps 1–100, amplitude 0–10). Unset keeps today's even division
  (call it "Even").
- Compiler: `Rows.paths` places penetrations at `anchor + offset[k mod n] + j*L` along each row in
  the rotated frame. k is the global row index `round((y-base)/spacing)` and the anchor is the
  object centroid, so parts align. Always penetrate at both row ends. Drop or merge a fragment
  shorter than 0.3 mm (`SHORT_STITCH`) so the design check stays quiet.
- UI: "Fill pattern" select with small preview thumbnails, under Fill direction.
- Tests:
  - Tatami: penetrations in row k+4 repeat row k's along-row coordinates (mod L)
  - no stitch > L + ε; no new short-stitch warnings on the demo bear

Hearts and the paid patterns can follow as data-only additions to the pattern table.

### Step 4: Fill underlay list
- Model: `fillUnderlays?: {angle:number; spacing:number; length:number; inset:number}[]` (max 3;
  spacing 1–4; length 1–5; inset 0–2). Angle is stored relative to the top angle (+90 default),
  which matches Ember's derived angles and survives top-angle edits. Unset = the fabric's
  `fillUnderlay` enum expanded to a preset list:
  - `tatami` → `[{+90, 2, length, 0.4}]` (today's values, so output is unchanged)
  - `edge` and `edge-tatami` keep the edge walk as a separate flag
- UI: "Underlays (n)" list with Angle / Row / Length / Inset and an Add button. Add uses Ember's
  rule: offsets +90, +45, +135 by index, row 2, length = the object's length, inset 0.4. Show
  "from fabric" until the user edits the list. Add a reset button.
- Compiler (`route_fill`): loop over the list in order (sew in list order, not reordered), each with
  `fill_sections(rotate(r, angle+offset), spacing, rule, 0, inset)`.
- Tests: the preset list gives an identical PES to today. Two underlays at +90/+45 produce two
  underlay phases before the top rows.

### Step 5: Hand stitch
- Model: `handStitch?: 0|1|2|3|4|5`.
- Compiler: displace each top-row interior penetration perpendicular to its row. Use a correct
  angle (fixing Ember's quirk), offset = `0.1*(sign(r)|r|^1.5 L² + 0.02 I)(I/5)^1.2`, with a seeded
  PRNG keyed by object id and stitch index. Never move row ends, so fill edges and pull compensation
  stay exact.
- Tests: deterministic output for the same id. The maximum displacement is within the bound.
  0 means no change.

### Step 6 (optional): Fill stitch length separate from run length
- `fillLength?` (1–6, default 3.5, or keep the current `length` if unset) so fills can use
  tatami-typical 3.5–4 mm while runs stay at 2.5. Design check: warn above 5 mm on knit fabrics.

### Step 7 (optional, Ember-paid): Gradient
- `gradient?: {mode:'ramp',start,end,endSpacing} | {mode:'plateau',center,width,endSpacing}`
  (endSpacing 0.3–4). `fill_sections` steps `y` by the local spacing (formulas in 2.8). Tests:
  monotonic spacing for a ramp, symmetric spacing for a plateau.

### Later / large
- Blocks with two rails, Edit angles (sweep fill and row shortening), Streamlines, Circular,
  Cross-stitch variants, rope runs, satin shortening table, `trimAfter`.

### 4.4 Recommended Threadroom defaults and coexistence with fabric profiles
- Keep the fabric profile as the source of spacing, underlay and pull. Every new Ember-style field
  is optional, and `undefined` follows the profile (or today's fixed behaviour), exactly like
  `spacing` / `underlay` / `pullCompensation` now. The panel shows "from fabric" and a reset button.
- Don't import Ember's absolute numbers as defaults:
  - Row 0.2 and satin density 0.32 are denser than our fabric table (0.38–0.5 / 0.38–0.45), which is
    tuned for baby knits.
  - Ember's pull of 0.2 per side equals Threadroom 0.4 total.
  - When showing an Ember-equivalent value, convert pull as `ours = 2 × ember`.
- Defaults:
  - pattern: Tatami for new fills; unset (Even) for existing objects
  - fill length 2.5 (current) until step 6 is decided
  - tolerance 0.2
  - hand stitch 0
  - underlay offsets +90 / +45 / +135
  - underlay row 2 (current; Ember uses 1, which is denser than needed on knits)
  - inset 0.4 (same as Ember and our `EDGE_INSET`)
  - underpath: keep the current always-hidden travel

---

## 5. Paid features and open questions

**Paid in Ember** (lock icon or upsell):
- run types E Stitch, Double/Triple Rope Run, Manual
- 25 fill patterns (all except the 11 listed in 2.2)
- Gradient and Edit gradient
- "along-path" (map to path), click-to-stitch, auto-digitize-all, convert-to-redwork
  (`page` `r6`)
- Streamlines, Circular and Cross Stitch fills

**Not determined:**
- Whether Ember's 0.2 mm Row Space default really produces 0.2 mm rows in the exported file.
  Client code multiplies by 10 px/mm with no extra factor, but I didn't check an actual export.
- What `speed` (slow/fast) does. I found no client consumer.
- Whether the satin `maxConsecutive`/`randomize` UI values reach the engine in the outline-satin
  path (2.10 quirk).
- The exact rail spline and satin-between-rails sampling for Blocks (`5729` 17743 `bA` not
  examined in depth).
- The exact SweepFill row-shortening depth heuristic (described in outline only).
- Rope-run pass order beyond what's summarised in 1.4.
