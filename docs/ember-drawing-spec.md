# Ember drawing interaction: spec for Threadroom

Source: Ember's minified client bundle (v2.emberdesign.net, downloaded 2026-10-21). This is the
companion to `docs/ember-fill-spec.md`. Everything here was read from client code. I did not watch
Ember run. Section 7 lists what I could not settle.

Chunk names are shortened:

| short | file |
|---|---|
| `page` | `c/page-99122af94fe2a2da.js`, the editor page |
| `3865` | `c/3865-174b98eedd80211b.js`, the xstate editor machine and its actions |
| `1967` | `c/1967-39e92085453e0147.js`. Module 16256 is the spline, 26131 is the geometry helpers, 666 is the Shape class and defaults, 29296 is the Bézier helpers |
| `5473` | `c/5473-af32e3bb9d403445.js`. Module 60001 splits blocks into rails |
| `2723` | `c/2723-a573d20a6a6a6aeb.js`. Module 97550 is the command factory, 78448 is the commands, and it also holds the command manager |

`page` identifiers are minified component names: `lC` EventLayer, `lw` double-click detector,
`lb` key map, `lJ` draft node markers, `sW` rubber band, `sK`/`sV` draft renderer, `sX` freehand,
`aH` blocks preview, `aK`/`aA` reshape. They are stable within this bundle only.

**Units.** Ember's world unit is 0.1 mm (10 units per mm). Thresholds below are given in mm, with
"px" meaning screen pixels (Ember divides by the zoom).

---

## 1. Event plumbing (how a click reaches the draw tool)

- **Points are placed on pointer-up, not pointer-down** (`page` `lC`). Pointer-down only records
  the button and the position. If the pointer moves 0.5 mm or more before release (5 world units,
  not zoom-scaled), it is a drag. A drag sends `DRAGGING`, which the DRAW state ignores, and on
  release **no point is placed**. A drag while drawing does nothing: it places no point and pulls
  no handles.
- On release it sends `MOUSE_DOWN {x, y, rightClick, doubleClick, modifierPressed, firstControlPoint}`
  to `p.appService`:
  - `rightClick`: the press was button 2. The browser context menu is suppressed on
    `#canvas-container`. A **second right-click within 400 ms and 16 px of the first is dropped
    entirely** (`lw`, using its own timestamp `u`), so a quick double right-click gives one point.
  - `doubleClick`: a left release with `event.detail ≥ 2`, or one within 400 ms and 16 px of the
    previous left release (`lw`).
  - `modifierPressed`: Ctrl or Cmd. **Shift is not used.**
  - `firstControlPoint`: the release target's Pixi label is `"FirstControlPoint"`. That marker
    exists only in the cases described in §2.4.
  - Middle-button releases and releases during a viewport drag or pinch (`lj`) send nothing.
- The DRAW state (`3865`) is `{entry: create a new empty Shape; exit: handleClearCurrentShape}`.
  Its sub-state `active` maps `MOUSE_DOWN→handleDrawMouseDown`, `DELETE→handleDeleteDraw`,
  `COMPLETE→handleCompleteDraw`. Draw types are `line` (open), `polygon` (closed), `blocks`, `pen`,
  `circle`, `rect`, `star`/`triangle`/`diamond`/`hexagon`/`heart` and `text`.
- Keys (`page` `lb`, on window keydown, ignored while typing): `Enter→COMPLETE` (except in the
  angle and flow-field editors). `Backspace`/`Delete→DELETE`. `1/2/3/4/5/6` switch to
  line/polygon/blocks/pen/circle/rect. `S` is select, `M` measure, `T` text. Space holds pan.
  `Ctrl+Z`/`Ctrl+Shift+Z` are the **global** command undo and redo. **There is no Escape binding
  in DRAW.**
- While panning (Space or the pan tool), `handleDrawMouseDown` returns early.

## 2. Open shape ("line") and closed shape ("polygon")

### 2.1 Click semantics (`3865` `handleDrawMouseDown`, cases `line|blocks|polygon`)

In this order:

1. **Clicking the first point** (`firstControlPoint`) does nothing if the shape has 2 or fewer
   points. Otherwise it calls `setIsClosed(true)` and completes the shape. This applies to the
   **line tool as well as the polygon tool**: clicking the first point of an open shape closes it
   and commits it as a closed shape. The click position is not added as a point.
2. **Double-click** (`doubleClick && !rightClick`) is ignored if there are no points. Otherwise it
   **deletes the last point**, which the first click of the double-click added, and adds a
   **curve point at the second click's position**. A double-click therefore gives exactly one
   smooth point, even if the mouse drifted between the two clicks.
3. Otherwise a point is appended with `curve = rightClick || doubleClick`. A left click gives a
   corner and a right-click gives a smooth ("curve") point.
4. With Ctrl or Cmd held and at least one point placed, the new point is **angle-snapped**
   (`1967` 26131 `hp`, 15° steps): its direction from the previous point is rounded to a multiple
   of 15° and its distance is kept. For blocks, the reference is the second-last point, which is on
   the same rail.
5. No deduplication. Clicking on or near the last point adds a coincident point. Clicking an
   existing non-first point adds a new point there; draft points cannot be dragged.
6. No grid or object snapping while placing points. `snapToGrid`/`snapToObjects` (`page`, near
   `snapToGrid`) apply only to moving selections.

### 2.2 Keys

- **Enter** sends `COMPLETE` (`handleCompleteDraw`). For `polygon` it calls `setIsClosed(true)`
  first. For `blocks` it sets `stitchType "blocks"` and outline type `satin`. Then it runs
  `completeShape`, which adds the shape to the project, deselects everything else and **selects
  the new shape**. It then **creates a fresh empty current shape, so the tool stays active**. If
  the command reports an error on a polygon, the shape is reopened. Enter **does** close a polygon.
  Enter never closes a line.
- **Backspace/Delete** pops the last control point (`handleDeleteDraw`) and can go down to 0
  points. It does not undo in any other way.
- **Escape** does nothing.
- **Leaving the tool** (another tool key or button) runs `handleClearCurrentShape`. If the current
  shape has **any** points, it is completed: a polygon is closed first, and the shape is added to
  the project. Only then is the current shape cleared. Ember never discards a draft. I found no
  minimum-point check on this path or on Enter (see §7).

### 2.3 What the preview shows (`page` `sV` → `sK`, `sW`, `lJ`, `lP`)

- Nothing until the first point exists.
- **The shape's own path**: `shape.transformedDrawCmds`, the spline through the placed points, is
  stroked in the **thread colour, 1 px**. While drawing, `isClosed` is still false **for polygons
  too**, so the spline is rendered open. There is **no closing segment and no fill**: the renderer
  (`lP`) only strokes. Its 0.001-alpha fill is for hit-testing, and only when a `closePath` exists.
  This matches what the user reported. The closed topology and any fill appear only once the
  shape is completed. In "realistic" view, outline shapes instead show their stitch simulation
  (`lR.d`) for the open path.
- **Rubber band** (`sW`): one **straight** segment from the last point to the cursor, 1 px,
  red `#F04444`. It is never curved, and does not preview the curve the next point would make.
  With Ctrl or Cmd it follows the 15° snapped cursor. While the cursor hovers the first-point
  marker, the band's far end jumps to the **first point**. That straight red segment is the only
  closing preview.
- **Effect of a curve point on its neighbours while drawing**: the whole spline is re-solved on
  every click (§3). A smooth point influences every segment of its run, back to the previous corner
  and forward to the next corner or the end. Two consequences:
  - A smooth point that is currently the **last** point bends nothing yet. The final node of an
    open path acts as a free end, and a run that starts at a corner and ends at the last node needs
    a third node before it curves. With corner A, then a right-click at B, the A–B segment stays
    straight. The arc A–B–C appears when C is placed.
  - Adding more smooth points re-shapes earlier smooth segments, back to the last corner. Segments
    behind a corner never change.
- **Node markers** (`lJ`, all sizes in px):
  - Smooth: hollow circle, radius 3.5, 2 px stroke, green `#21C55F`.
  - Corner: hollow square, 6 px side, 2 px stroke, blue `#5979F7`.
  - First-point close affordance: only for `line` and `polygon` with **more than 2 points**, the
    first node is drawn as a separate interactive marker labelled `FirstControlPoint`, in its own
    type's shape and colour. On hover it grows to **2×** with a 150 ms cubic ease-out, and the
    rubber band snaps to it. Blocks never get this marker. Before 3 points it is drawn like any
    other node and clicking it simply adds a point.

### 2.4 Minimum points

- Close by clicking the first point: at least 3 points (line or polygon).
- Enter, or leaving the tool: no client-side minimum found (§7).
- Blocks need at least 4 points to be useful (`ember-fill-spec` §1.5). Reshape deletion keeps
  at least 4.

## 3. Curve model and maths (`1967` module 16256)

### 3.1 What it is

Nodes are `{x, y, curve}`, plus optional `lTh`/`rTh`. `curve:true` maps to type `"smooth"` and
false maps to `"corner"`. The default spline type (`Shape.drawCmds` → `uA` → `I`) builds
`new eG(nodes.map(n => new w$(pt, curve ? "smooth" : "corner", lTh ?? null, rTh ?? null)), isClosed)`,
then runs `solve()`, `computeCurvatureBlending()` and `renderPixi()`, which emits
`moveTo`/`bezierCurveTo`/`closePath`. This is **Raph Levien's research interpolating spline**
(`spline.js` from his spline-research work). The class and member names match: `ctrlPts`, `ty`,
`lth`/`rth`, `lTh`/`rTh`, `iterDumb`, `computeCurvatureBlending`, `render4Quintic`. The method is
**not** Catmull–Rom, Spiro or Hobby. Each segment between two nodes is one cubic Bézier whose shape
depends only on its two end-tangent angles relative to the chord. The solver adjusts the node
tangent angles until **curvature is continuous** (G2) at every smooth node. There is no tension
parameter.

`lTh`/`rTh` (lower-case `lth`/`rth` in the node class) are **optional fixed tangent angles in
radians**, for the left (incoming) and right (outgoing) side of a node. They are not handle
positions. When one is set, it pins the tangent and splits the spline there, as a corner does, and
`computeCurvatureBlending` then blends curvature across that node (§3.5). **Drawing never sets
them.** Drawn shapes have only `{x, y, curve}`, so for everything drawn the blending pass is a
no-op. Separately, imported shapes with `splineType "bezier"` use real Bézier handles: there,
`lTh`/`rTh` are handle *points* `{x,y}`, edited with `BezierTangentHandle`. Toggling such a node to
smooth seeds its handles Catmull–Rom style (`1967` 29296 `xB`: `cp = p ± (next − prev)/6`). That
path does not apply to drawn shapes.

### 3.2 Splitting into runs (`eG.solve`)

Start index: 0 for open paths. For closed paths, the first corner (or first node with a fixed
tangent), or 0 if there is none. Walk the segments from there:

- If the segment's end node is a corner, or it is the last segment of an open path, and neither
  side has a fixed tangent, the segment is a **straight line**. Both tangents are set to the chord
  angle.
- Otherwise collect nodes forward until the next corner or fixed-tangent node, inclusive, or the
  end. Solve that run as an independent spline (`d`). Its ends are free unless pinned by
  `rth`/`lth`. The run is periodic only for a closed path with no corners. Continue from the run's
  last node.

Consequences:

- **Corners fully decouple** the curve. Each side of a corner is a free end of its own run.
- **Corner to corner is always straight.**
- The **first and last nodes of an open path behave as corners** whatever their flag.
- Smooth nodes influence nothing beyond the nearest corners.

### 3.3 Per-segment curve (the "ThetaCurve", `class c`, `render` / function `h`)

For a segment with chord from `P0` to `P3`, let `θ0` be the start tangent angle minus the chord
angle, and `θ1` the chord angle minus the end tangent angle, both wrapped to (−π, π]. A symmetric
arc has `θ0 = θ1`. In a unit-chord frame (P0 = (0,0), P3 = (1,0)):

```
φ(a, b) = 0.3 · sin(2b − 0.4 · sin 2b)
L(a, b) = ( cos(a − φ(a,b)) − 0.2 · cos(3(a − φ(a,b))) ) / 2.4
P1 = L(θ0, θ1) · (cos θ0, sin θ0)
P2 = (1 − L(θ1, θ0) · cos θ1,  L(θ1, θ0) · sin θ1)
```

Map back with `(u, v) → (P0.x + dx·u − dy·v, P0.y + dy·u + dx·v)`, where `(dx, dy) = P3 − P0`. For
`θ0 = θ1 = 0`, `L = 1/3`, which gives a straight line with handles at 1/3 and 2/3.

### 3.4 Solving one run (`class d`)

Notation: `th[i]` is the tangent angle at run node `i`. `getThs(i)` gives the segment's
`(θ0, θ1, chord)`.

1. **Initial tangents** (`initialThs`). An interior node takes `a_in + turn · |in| / (|in| + |out|)`,
   where `turn = wrap(a_out − a_in)`: the chord-length-weighted bisector. The end nodes take their
   chord angles. Fixed `startTh`/`endTh` override these.
2. **Curvature at segment ends** (`computeCurvature(θ0, θ1)`). For the unit-chord cubic, at t = 0
   (direction θ0) and t = 1 (direction −θ1): `ak = atan2(n·B'', s·|s|)`, where `s = B'·dir` and
   `n·B''` is the normal component of the second derivative. So `tan(ak)` is curvature × chord.
3. **Ten iterations** (`iterDumb(k)`, k = 0..9). Each iteration:
   - Free start: set `θ0` of the first segment to `0.5·sin(2·θ1)`. Free end: set `θ1` of the last
     segment to `0.5·sin(2·θ0)`. This is the solver's natural end condition.
   - Periodic run (closed, no corners): then set `th[0] = th[n−1] =` their average. Node 0 is a
     seam that is not fully G2.
   - For each interior node, with left segment `Lseg` (chord `cL`, end curvature `akL1`) and right
     segment `Rseg` (`cR`, `akR0`):
     `err = atan2(sin akL1 · √cR, cos akL1 · √cL) − atan2(sin akR0 · √cL, cos akR0 · √cR)`.
     This is zero when `tan(akL1)/cL = tan(akR0)/cR`, i.e. equal curvature. The slope comes from
     re-evaluating with `Lseg.θ1 + 0.001` and `Rseg.θ0 − 0.001`. Then
     `th[node] += tanh(0.25·(k+1)) · err/slope`. The update is Jacobi style: all steps are computed
     before any is applied.
4. Copy the tangents back to the nodes as `rTh`/`lTh`.

(`iterate()`, a tridiagonal Newton variant, exists but `solve` does not call it.)

### 3.5 Rendering and curvature blending

`computeCurvatureBlending` only acts on **smooth nodes with a fixed tangent** (`lth ≠ null`). It
sets `kBlend` to 0 when the two sides curve in opposite directions, and otherwise to the harmonic
mean of the two sides' curvatures. `render4` then replaces that segment's cubic with 4 cubics that
match the blended end curvature (`render4Quintic`). For drawn shapes `kBlend` is always null, so
**each segment is exactly the single cubic of §3.3**. `render` adds `closePath` when closed.

### 3.6 Tessellation

Ember never stores flattened geometry. It resamples the Bézier commands at fixed arc length
(`1967` 666 `splineResampled`): the stitch length for runs, 1.5 mm for satin, 0.75 mm for holes.
Our `curveSegments` sampling (about 0.5 mm steps) is fine to keep.

### 3.7 Reshape (editing) (`page` `aK`, `aA`)

- Markers are **filled**, with a 1 px black outline. Smooth: circle, radius 4.5 px, green
  `#21C55F`. Corner: square, 7 px side, blue `#5979F7`. Selected: yellow `#FFFF00`. On hover they
  grow to 2× over 150 ms. Hit radius 14 px.
- **Double-click a node** toggles `curve` (smooth ↔ corner) and commits.
- Dragging starts after 3 px. Ctrl/Cmd **constrains the drag to horizontal or vertical** from the
  press point (`1967` 26131 `jc`). Ctrl/Cmd-click toggles a node in the multi-selection. Dragging
  moves every selected node.
- **Click on the path** (within 5 px, not on a node) inserts a node at the click after that
  segment: **left click inserts a corner, right-click inserts a smooth node**. The new node is
  selected.
- Delete/Backspace removes the selected nodes. For blocks they are removed in rail pairs, keeping
  at least 4.
- The path is re-solved live during drags. Selected segments are highlighted in yellow, 2 px.

### 3.8 How close Catmull–Rom with corner flags comes

I ported §3.2–3.4 to Python (scratch, not committed) and measured the Hausdorff distance to our
`curveSegments`:

| case (mm) | max distance | note |
|---|---|---|
| corner (0,0), smooth (20,−10), corner (40,0) | 1.42 | Ember leaves the corner at −48.2°, ours at −28.9°. Ember is close to a circular arc. Ours heads straight at the smooth node, then pinches. |
| open, all smooth, uneven spacing (5 nodes, 60 wide) | 2.17 | Uniform CR overshoots around short chords |
| closed, 4 smooth nodes on a 20 mm square | 1.32 | Ember radius 13.8–14.1 (near circle). CR radius 12.5–14.1 (squarish) |
| closed, 12 smooth nodes on r = 10 circle | 0.03 | Equivalent |
| closed D shape: 2 corners + 2 smooth | 2.44 | |

Catmull–Rom is fine for dense, evenly spaced smooth nodes such as our circle preset. It is
visibly different, by millimetres, exactly where people draw by hand: sparse right-click points,
and smooth points next to corners. Two things cause this:

1. Our corner handling phantom-duplicates the corner (`a = b`). That makes the tangent at the
   corner point at the neighbour. Ember instead gives each corner side a free end with
   `θ0 = 0.5·sin 2θ1`.
2. Uniform CR ignores chord lengths and is only G1. Ember weights by chord length and solves for
   G2.

Tweaking CR (centripetal parameterisation, or better corner end tangents) would close part of the
gap but would not match. **Port the spline. It is about 150 lines.**

## 4. Blocks (satin blocks)

- The click sequence is the same handler as line/polygon. Points alternate **left rail** (index 0
  and even indices) and **right rail** (odd indices) (`5473` 60001 `Dg`). A rail point that is
  within 0.001 mm of the previous one is nudged 0.0001 mm along the rail. Right-click or
  double-click makes that rail point smooth. Ctrl/Cmd snaps 15° from the **second-last** point,
  which is on the same rail. No first-point close.
- Preview (`page` `aH`, red `#F04444`, 1 px):
  - Each rail is drawn as its own open spline (§3): left rail commands followed by right rail
    commands.
  - Straight "rungs" join each pair (0–1, 2–3, …).
  - Rubber band: with 1–2 points, from point 0 to the cursor. With 3 or more, from both the last
    **and** the second-last point to the cursor, a wedge showing both rails growing.
  - Node markers as in §2.3.
- Enter completes, as `stitchType "blocks"` with outline type satin. Stitches are not computed
  during drawing.

## 5. Freehand ("pen") (`page` `sX`; fitter `1967` 16256 export `xp` = `M`)

- Press, drag and release. Every pointer-move appends a raw point (no minimum distance). The live
  preview is the raw polyline in the thread colour, 0.1 mm wide.
- On release, with more than 1 point:
  1. **Closing**: if the last point is within **2 mm** of the first, the stroke is closed. Trailing
     points within 2 mm of the start are dropped while more than 3 remain.
  2. **Nearly straight**: if every point lies within `max(0.3, min(0.05·L, 5))` mm of the
     start–end chord (L = chord length), the result is **2 corner nodes**. If start and end are
     closer than 0.5 mm, a closed stroke is only collapsed to 2 corners when every point is
     within 0.5 mm of the start; an open stroke always is.
  3. Otherwise build the node list (indices into the N raw points):
     - Seeds: index 0, the last index (open strokes), and **every raw sample whose turning angle
       between its adjacent raw segments exceeds 30°**.
     - Ramer–Douglas–Peucker between consecutive seeds, with tolerance `max(0.15, min(0.5, 0.02·√N))` mm.
     - If fewer than 3 seeds remain, use `max(3, min(cap, ⌈N/8⌉))` evenly spaced samples instead.
     - If there are more than `cap = max(30, ⌈N/3⌉)`, keep every k-th.
     - **Refit loop** (at most 50 rounds, while there are fewer than `cap` nodes): solve the spline
       through the nodes, find the raw sample farthest from it within each span, and insert the
       worst one if its error exceeds `max(0.2, min(1.0, 0.02·bbox diagonal))` mm. Otherwise stop.
  4. **Node types**: a node is a **corner if the raw turning angle at that sample is over 30°**,
     otherwise **smooth**. The angle is measured between the raw samples on either side of it,
     not between neighbouring nodes. The shape gets `isClosed` = (closed stroke and at least 3
     nodes), these nodes as control points, and is completed immediately. The tool stays on pen.
- So freehand becomes an ordinary editable spline of mostly smooth nodes with detected corners,
  not a polyline.

## 6. Threadroom today vs Ember, and the plan

### 6.1 Differences (current code: `app/studio.tsx` `pointerDown`/`applyPointerMove`/`pointerUp`/`finish`/`onDoubleClick`/keydown, `app/canvas-overlays.tsx` `DraftOverlay`, `lib/curves.ts`)

| # | Area | Threadroom | Ember |
|---|---|---|---|
| D1 | Closed draft preview | `DraftOverlay` draws `curvePoints(draft, closedDraft, …)` with `closedDraft` = true: a **closing curve segment and `--draft-fill`** from the first point on | Open path, stroke only. The closure appears only on completion |
| D2 | Rubber band | Dashed accent line `.3` wide, last point to hover | Solid 1 px red `#F04444`. Snaps to the first point while it is hovered |
| D3 | When a point is placed | On pointer-down, so a drag still places a point | On pointer-up. A drag of 0.5 mm or more places nothing |
| D4 | Dragging draft points | Pressing a draft point drags it (`draftDrag`) | Not possible. A click there adds a point |
| D5 | Double-click | First click adds a corner. The second press adds another corner unless it lands within 3 px, then `dblclick` makes the last point smooth. Drift gives 2 points | Delete the last point, add one smooth point at the second click's position |
| D6 | Right-click | Every right press adds a smooth point. Within 3 px of the last it only marks it smooth | Smooth point on release. A second right-click within 400 ms and 16 px is dropped |
| D7 | Close by first point | Closed tool only, ≥3 points, 12 px radius around point 0 | Line **and** polygon, >2 points. The marker grows on hover. Line becomes closed |
| D8 | First-point marker | Closed tool: hollow circle r 6 px from the first point on | Shown only once there are >2 points, in the node's own type style, grows 2× on hover |
| D9 | Node markers | Filled accent: square 6.8 px for corners, circle r 4 px for smooth | Hollow 2 px: green circle r 3.5 for smooth, blue square 6 for corners |
| D10 | Angle snap | None for paths (Ctrl only squares shapes) | Ctrl/Cmd: 15° from the last point, for the placed point and the rubber band |
| D11 | Dedupe | Ignores presses within 3 px of the last point | None (double-click handles the duplicate) |
| D12 | Enter | Finishes if ≥2 (open) or ≥3 (closed), then **switches to Select** | Completes and **stays in the tool** with a new empty shape. The new shape is selected |
| D13 | Escape | Discards the draft | Nothing. Leaving the tool **commits** the draft |
| D14 | Switching tool mid-draft | Tool buttons disabled while drafting | Allowed. Commits the draft |
| D15 | Ctrl+Z mid-draft | Pops the last draft point | Global undo (the draft is not a command). Backspace pops |
| D16 | Curve maths | Uniform Catmull–Rom. Corners via phantom endpoints. G1 | Levien spline: corner-split runs, free natural ends, chord-weighted, G2 (§3) |
| D17 | Curve preview of the next point | Straight rubber band (same as Ember) | Same |
| D18 | Freehand | RDP at 0.25 mm into a **polyline** `rings` with no `curve`. Auto-finishes. Never closes | Spline fit into smooth/corner nodes. Closes if it ends within 2 mm (§5) |
| D19 | Blocks | Single centre-line curve sewn as satin with a width | Two rails from alternating clicks, with rungs (§4) |
| D20 | Reshape insert | `+` handles at segment midpoints, or add mode | Click on the path: left inserts a corner, right inserts smooth |
| D21 | Reshape markers | Our edit markers | Filled green and blue, selected yellow, 2× on hover, Ctrl axis-lock drag |
| D22 | Hoop bounds | Points outside the hoop are refused | Not limited by the hoop in the draw handler |
| D23 | Point limit | 200 per curve | None seen |

Matches already: left click = corner, right-click = smooth, Enter completes, Backspace pops, a
straight rubber band, corner-to-corner segments are straight, endpoints of open curves act as
corners, and the hint text (`pathHint`) is Ember's wording.

### 6.2 Recommended changes (small steps, each with tests)

Tests in this repo are lib-level (`node:test` + `tests/load-lib.mjs`), so each step moves the
logic into `lib/` and keeps `studio.tsx` thin.

**Step 1: Stop rendering the closed draft as closed (D1, D2, D8).** This is the user's request.
- In `DraftOverlay`, use `curvePoints(draft, false, corners)` and `fill="none"` for every tool.
  Draw the rubber band as a solid 1 px line (`strokeWidth={1/canvasScale}`, colour
  `var(--danger)`) from the last point to `hover`. While the cursor is over the first-point
  marker, draw it to `draft[0]` instead.
- Show the first-point close marker only when `draft.length > 2`, for both the open and closed
  tools. Draw it in its own type style, scaled 2× while hovered (CSS transform with a 150 ms
  transition). Keep `displayDraft` closed only for the committed object.
- Tests: add `lib/drawing.ts` with `draftPreview(draft, corners, hover, hoverFirst)`. It returns
  `{path: Point[], closed: false, band: [Point, Point] | null, firstMarker: boolean}`. Assert that
  a 4-point closed draft gives an open path whose last point is the last anchor, not the first;
  that `band` ends at `draft[0]` when `hoverFirst`; and that `firstMarker` is false with
  ≤2 points.

**Step 2: Click on release, drags do nothing, Ember double and right-click (D3, D5, D6, D11).**
- Record the press in `pointerDown`. In `pointerUp`, if the pointer moved less than 0.5 mm in
  world units, call `draftClick`. Drop the native `onDoubleClick` path branch.
- `draftClick(state, {p, button, time, detail, scale, ctrl, onFirst})` is a pure reducer in
  `lib/drawing.ts`. It returns `{points, corners, lastLeft, lastRight, action: 'none'|'close'}`.
  It implements §2.1: first-point close when length > 2; double = detail ≥ 2 or within 400 ms and
  16/scale mm, then pop and push a smooth point; repeat right-click within 400 ms and 16 px →
  ignored; Ctrl → 15° snap from the last point (second-last for blocks); no dedupe.
- Tests:
  - Two left clicks 10 px apart within 400 ms → one smooth point at the second position.
  - Two right-clicks within 400 ms → one point.
  - 450 ms apart → two points.
  - Ctrl at a 20° bearing from (0,0) at distance 10 → (10 cos 15°, 10 sin 15°).
  - `onFirst` with 2 points → no change. With 3 → `action:'close'`.
  - A press that moves 0.6 mm → no point (test the movement helper).
- Decision for the user (D4): Ember cannot drag draft points. Keeping ours means a press on a draft
  point drags it when it moves, and otherwise (released without movement) adds a point there, as
  Ember does. I suggest keeping it as a deliberate extra.

**Step 3: Closing and completion semantics (D7, D12, D13, D14).**
- Clicking the first point of an **open** draft with more than 2 points finishes it as a
  **closed** curve: `curve.closed = true`, the closed-tool defaults (kind and fill pattern as the
  closed tool gives today), name "Closed shape".
- After `finish()`, stay in the drawing tool with an empty draft, and select the new object.
  Drop the `setTool('select')` in `finish`.
- Switching tool, or pressing a tool key, while drafting commits the draft when it has enough
  points: closed for the closed tool, as Ember does. Enable the toolbar while drafting.
- Escape is a decision: Ember has no Escape, and leaving commits. I recommend keeping Escape =
  discard (safer, and already documented in our UI) and noting the deviation.
- Tests: in `lib/drawing.ts`, `completeDraft(tool, points, corners, how:'enter'|'first'|'switch')`
  → `{closed, kind} | null`. `line` + `first` gives closed. `closed` + `enter` gives closed.
  `line` + `enter` gives open. Fewer than the minimum gives null (we keep minimums of 2 open and
  3 closed, which Ember lacks).

**Step 4: Node and band visuals (D9, D10 visuals).** In `DraftOverlay`, smooth nodes become
hollow circles (r 3.5 px, 2 px stroke, `--node-smooth: #21C55F`) and corners hollow 6 px squares
(`--node-corner: #5979F7`). Add the tokens to the theme for light and dark. Make the path stroke
1 px in the thread colour, so the draft reads as the eventual run. No unit test; check by eye.

**Step 5: Port the Levien spline (D16).**
- New `lib/spline.ts`, about 150 lines, implementing §3.2–3.4 with the §3.3 segment and no
  blending: `splineBeziers(points, closed, corners) → [P0, P1, P2, P3][]`. Make
  `curveSegments(points, closed, corners)` sample those cubics (keep the ~0.5 mm step logic), so
  `curvePoints`, `curveRing`, `editableSegments`, insertion and export keep working unchanged.
  The corner flag maps directly: `corners[i] === true` ⇔ Ember `curve:false`.
- **Migration**: the existing hash test pins Catmull–Rom output, and saved projects would change
  shape. Add `curve.spline?: 'levien'`. New drawn curves, reshaped curves and shape presets get
  `'levien'`. Curves without the field keep Catmull–Rom, and an "Upgrade curve" action or
  re-editing a curve can opt in. `geometryPayload` is unaffected, because rings are flattened.
- Tests (`tests/spline.test.mjs`):
  - Two corners → P1 and P2 at 1/3 and 2/3 of the chord.
  - Corner (0,0), smooth (20,−10), corner (40,0) → passes through all three. Apex y = −10 at
    x = 20. Start tangent −48° ± 1°. Symmetric about x = 20.
  - 12 smooth nodes on r = 10 → every sample within 0.005 mm of r.
  - 4 smooth nodes on a 20 mm square → radius between 13.7 and 14.15.
  - At each interior smooth node, `|κ_left − κ_right| / max(|κ|) < 0.02` (G2 after 10 iterations).
  - Locality: moving a node after a corner leaves every segment before that corner bit-identical.
  - `[corner, smooth]` open → straight. `[smooth, corner, smooth]` open → both segments straight.
  - The existing Catmull–Rom hash test still passes for curves without `spline`.

**Step 6: Freehand to curve (D18).** Port `M` (§5) as `fitFreehand(points, mmScale)` in
`lib/spline.ts`, with the thresholds converted to mm as in §5. In `finish` for freehand, create
`curve: {points, closed, corners, spline:'levien'}` instead of an RDP polyline. A stroke that
ends within 2 mm of its start becomes a closed curve.
- Tests:
  - A noisy straight stroke → 2 corner nodes.
  - An L stroke → 3 nodes, with a corner at the bend.
  - A circle stroke ending within 2 mm → closed, ≥3 smooth nodes, max deviation ≤ the fit
    tolerance.
  - A stroke ending 3 mm away → open.

**Step 7: Reshape parity (D20, D21).**
- Clicking on a selected curve's path in edit mode inserts a node: a left click gives a corner,
  a right click gives a smooth point. This extends `insertGeometryPoint` with a `corner` argument
  (today it always inserts smooth). Keep the `+` midpoint handles.
- Ctrl/Cmd while dragging a node locks the drag to horizontal or vertical from the press point.
- Markers: filled green and blue, selected yellow.
- Tests: `insertGeometryPoint(o, 0, i, p, true)` puts `true` at `corners[i]`. Add an axis-lock
  helper test.

**Step 8 (optional, larger): Ember-style rail blocks (D19).** Our blocks are centre-line satin
with a width. Ember's are two clicked rails. This needs a new object form, such as
`rails: {points, corners}`, and compiler support for satin between two splines. I suggest
deferring it until the rest lands, and treating it as a separate feature ("Draw rails") rather than
changing today's blocks.

## 7. Not determined

- Minimum points for Enter and for leaving the tool. The client handlers have no check, and the
  complete command (`2723` 78448 `xy`) has none either. `projectStore.addShape` was not in the
  downloaded chunks, so a 1-point shape may be filtered there.
- Whether the pan tool or the viewport plugin consumes left-drags in DRAW. The viewport config has
  `drag.pressDrag: false`. The drag is ignored either way.
- The exact `snapToGrid` behaviour while placing points: I found no use in the draw path.
- Hoop clamping: the event layer's hit area is the whole world. Whether points outside the hoop are
  later refused (as ours are) is unknown.
