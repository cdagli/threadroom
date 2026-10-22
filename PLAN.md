# Ember-style editor layout

Goal: more canvas space and an editor laid out like Ember (emberdesign.net): floating overlays, a layers
panel with previews, hiding, drag reordering and one level of groups, Ember's tool set and Ember's shape
drawing. Keep Threadroom's light sage/cream look; copy the layout, not Ember's dark theme.

Decisions:
- **Hidden objects are view-only.** Hiding is for working over a background image: a hidden object is not
  drawn or hit-tested in either editing look (Lines/Thread), but it is still compiled, counted,
  checked and exported, like Ember (its "hidden" is transparency 0).
- **Blocks = two-rail satin** (done; see "All Ember stitch and fill types"). The tool once drew a
  constant-width satin line; such saved objects still load and sew unchanged.

Desktop only (~99% of use): no mobile optimisation. Each phase ships on its own: typecheck, `npm test`,
README/TODO updated, and checked in the real app at desktop widths.

## Phase 0: model and geometry (lib only, no UI)
- `curve.corners?: boolean[]` (same length as `points`; unset = all smooth). Catmull–Rom stays sharp at a
  corner (the neighbour is replaced by the corner itself), so a run of corners is straight. Kept through
  insert/remove point, move, continue curve, text paths, validation and `geometryPayload`.
- `lib/shapes.ts`: Ember's node layouts in mm, as `{points, corners}` closed curves:
  circle (12 smooth; Ember uses 8, but Catmull–Rom through 8 shows flats), rectangle from two corners (Ctrl/⌘: square), star (10 corners, inner 0.382 · r,
  point up), triangle (point up), diamond, hexagon (point up), heart (8 nodes; tip and dip are corners).
  Plus the largest size that keeps a shape centred at a point inside the hoop.
- Groups: `project.groups?: {id, name}[]`, `object.group?: string`, `object.hidden?: boolean`.
  Members of a group are contiguous in sew order. `normalizeGroups` (objects outside a group's first run
  leave it; empty groups are dropped), `moveObjects` (move a block of objects to an index, optionally into
  a group), group/ungroup helpers. Validation for all new fields.
- Tests for each of these.

## Phase 1: full-screen layout
- No top bar; the canvas fills the window. Overlays:
  - top-left project chip: name, save dot, ▾ menu (Import file, Bear sample, Blank canvas, Save project
    JSON, Export SVG);
  - top-right: design-check badge, "likely to fail" pill, Export PES;
  - top-centre tool banner: tool name + one-line hint; Undo point / Cancel / Done and the point-edit
    actions live here; issue callout sits below it;
  - bottom-left: zoom (−, %, +, fit) and undo/redo; messages as a toast above the toolbar;
  - right: collapsible panel with an icon rail and tabs Layers, Artwork (was the popover), Setup (was the
    popover), Info (design size, stitches, thread changes, jumps/trims, design width, engine state).
- Phone width: the right panel is a drawer; overlays stack; no horizontal page scroll.

## Phase 2: object settings overlay
Status: done. Floating left panel (collapse, delete in the header); Sew earlier/later moved to the Layers tab until Phase 5.
- Selecting an object opens today's settings (and the text panel) as a floating left panel: scrolls,
  collapses to its header, delete in the header. No selection, no panel.
- Sew earlier/later leave the panel (reordering is in Layers).

## Phase 3: bottom toolbar, Ember's tool set
Status: done. Tools, keys, Play and Realistic view as below; the Design/Stitches switch is gone; Corner/Curve toggle and double-click in point editing.
| Key | Tool | Behaviour |
|---|---|---|
| S (V) | Select | as now |
| H / Space | Pan | as now |
| M | Measure | drag to show the distance in mm; not saved |
| 1 | Open shape | left-click corner point, right-click or double-click curve point, Enter finishes |
| 2 | Closed shape | same, closed, creates a fill |
| 3 | Blocks | clicks alternate left/right rail points (rungs); satin between the rails |
| 4 | Freehand | as now |
| P | Points | kept (not in Ember) |
| T | Text | as now |
| R | Shapes ▾ | Phase 4 |
| | ▶ Play | builds stitches if needed, plays from the start |
| | 👁 Realistic view | toggles design ↔ thread preview |

- Open/closed shape replace Curve and Fill. Double-click a point while editing toggles corner/curve.
- Thread preview: a bar above the toolbar with playback slider, counter, Lines/Thread and Travel.
- Artwork tab's Trace outline / Trace line start Closed / Open shape.

## Phase 4: shape drawing like Ember
Status: done. Flyout above the toolbar while Shapes is active; click-click or press-drag; Esc cancels.
- Flyout: circle, rectangle, star, triangle, diamond, hexagon, heart.
- Rectangle: click a corner, click the opposite corner (Ctrl/⌘: square). Others: click the centre, click
  again for the size. Click-drag-release also works. Live outline and radius line; Esc cancels.
- Clamped inside the hoop. The result is an ordinary editable closed curve with a fill.

## Phase 4b: lines and realistic views (like Ember)
Status: implemented. One stitch editing view, Lines by default; independent Thread toggle and playback bar. Shared revision-guarded compile requests, 350 ms debounce (bear median 182.4 ms), faint pending shapes and offline fallback. Desktop interaction check pending.
- There is one editing view. It always shows the design as stitches: **Lines** (thin needle paths in the
  thread colour) by default; the 👁 **Realistic view** toggle switches it to **Thread** (the 3D thread
  render). The toggle only changes how stitches are drawn; tools, selection and editing keep working.
- ▶ **Play** doesn't change the view either: it shows the timeline bar (play/pause, slider, counter) and the
  Travel overlay toggle, and plays the needle over the current view; closing it hides the bar.
- Stitches come from the background compile, made faster after edits. While an object's stitches are out
  of date (just drawn, moved or changed), its shape is drawn faintly in its colour so editing never waits;
  shapes stay the hit targets for selecting and dragging. Imported PES files show in the same view.
- Remove the separate Design/Stitches mode (`view`), keeping its uses (playback, travel, thread canvas)
  working in the single view.

## Phase 5: layers panel
Status: implemented. Ordered multi-selection, previews, rename, visibility, pointer reordering, footer actions and shared selection settings. Hidden stitch filtering uses compiler object IDs, including text borders. Desktop interaction check pending.
- Row: sew-order number, SVG preview in the thread colour, name and stitch type, eye toggle.
  Double-click to rename.
- Click selects; Ctrl/⌘-click toggles; Shift-click selects a range. Ctrl/⌘-click on the canvas adds to the
  selection; dragging a selected object on the canvas moves the whole selection.
- Pointer-based drag reordering (works on touch); dragging a selected row moves all selected rows.
- Footer: Group (⌘G), Ungroup (⇧⌘G), top / up / down / bottom, delete.
- Several selected: the settings overlay shows "N objects" with a shared thread colour, Group/Ungroup and
  Delete.

## Phase 6: groups (one level)
Status: implemented. Collapsible group rows, rename, visibility, member selection, block moves and membership drops. Group normalization on load and commits; JSON, autosave and undo/redo retain groups and hidden flags. Desktop interaction check pending.
- Group row: collapse arrow, name (double-click to rename), member count, eye toggle (all members).
  Drag a group as a block; drag objects in and out. Clicking a group selects its members.
- Saved in JSON and autosave, part of undo; `normalizeGroups` runs on load and after every commit.

## Phase 7: higher-contrast theme
- Overlays, panels and the canvas background currently blend together. Keep the sage/cream character but
  give clear separation: a darker workspace behind the hoop, opaque overlays with visible borders and
  shadows, stronger text and icon colours (WCAG AA for text, ≥ 3:1 for controls and focus rings), clearer
  selected/hover/pressed states for tools, rows and tabs.
- Colours become tokens on `:root` (surface, panel, border, text, muted, accent, danger, warning…) and the
  stylesheet uses them instead of literal hex values.

## Phase 8: Turkish UI with a TR/EN switch
Status: implemented. Turkish default, persistent project-menu language switch, typed dictionaries, localised library messages and number formatting. Dictionary/placeholder and Turkish design-check tests added; desktop browser interaction check pending.
- Turkish by default; a language switch in the project menu, remembered per browser.
- `lib/i18n.ts`: a small typed dictionary (`tr`, `en`) and `t(key, values)`, no dependency. Every UI
  string moves there: buttons, hints, banners, settings, stitch/fabric/underlay/lock names and hints,
  design-check titles, reasons and fixes, errors and messages, aria labels and titles.
- Number formatting follows the language (decimal comma in Turkish). README stays English.
- Runs last, once the UI strings from the other phases are stable.

## Queued after Phase 7
- **Editing tools from Ember (done)**. Selection box with eight scale handles and rotation;
  Shift proportions/15° rotation, Alt centre scaling, numeric X/Y/W/H/rotation, flips,
  quarter-turn, align/distribute, browser clipboard and duplication, coalesced arrow nudges.
  Editable affine text, entry/exit transforms and hoop guards; persisted view units, fine grid,
  object snapping/guides, rulers, live coordinates, shared jump overlay and localized shortcut help.
  Pure geometry, clipboard, text regeneration and preference tests. Desktop browser checks pending.
- **Single design-check pill** (done). Merge the issue-count badge and the "likely to fail" pill into one pill
  (red with the likely-to-fail count when any fail, amber for warnings only, green when ready).
- **Editor performance** (done). Moving or editing one object currently re-renders everything. Memoised canvas
  objects, layer rows and previews; derived data cached per object; drag updates batched per animation
  frame; only the edited object goes faint while the others keep their stitches until the compile
  returns. Measure before/after on the bear sample and a large traced design.
- **Ember open/filled mechanics and fill settings.** Spec in `docs/ember-fill-spec.md` (research from
  Ember's client bundle): Outlined/Filled for open and closed shapes, run types, and Ember's fill panel —
  pattern, stitch angle (with a canvas angle picker), row space, stitch length, pull compensation, hand
  stitch, underpath, gradient, density control (row shortening, density trigger) and a list of
  underlays (angle, row, length, inset each). Implemented in small steps from the spec.
- **Stitch styles by shape** (done). Fill styles (tatami, cross stitch) only for closed shapes; open paths offer only
  line stitches. The stitch menu is grouped: "Fill" and "Outline" for closed shapes, "Line" for open ones.
  Switching a closed shape between fill and outline keeps it closed (the outline sews the closing segment).
  This deliberately differs from Ember, which can fill an open path.
- **Image colour picker** (done). An eyedropper beside the thread colour samples the reference image's original
  pixels at the clicked point, ignoring the reference opacity on screen.
- **Reference images panel (done)**. `project.images[]` (≤ 10; id, data URL, mm box, rotation, opacity,
  hidden, locked; validated) replaces the single `artwork`, which still loads and migrates to `images[0]`.
  Artwork-tab list with thumbnails, show/hide, lock, reorder and delete; width and opacity for the
  selected (else top visible) image, which Auto trace, the eyedropper and Click to stitch use. Select-tool
  canvas selection with move and the shared transform box (scale/rotate; images can't skew or mirror);
  locked/hidden images take no canvas clicks. Drawn bottom-up under the stitches in Lines and Thread.
  `lib/images.ts` with node tests. Desktop browser checks pending.
- **Click to stitch (done)**. Tool 7 (Artwork-tab button, not on the dock): hover previews and a click
  adds the clicked colour area of the selected image as a Tatami fill (Shift: running outline) in the area's
  mean colour. Seeded 4-connected flood fill with a tolerance slider on original pixels downsampled to
  480 px, speck filling, pixel-corner boundary tracing with holes (right turn at diagonal contacts), closed
  Douglas–Peucker with a 2000-point budget, px→mm through the image's rotation. `lib/click-to-stitch.ts`
  with node tests on synthetic RGBA buffers. Ember's drag-select of several regions is not included.
  Desktop browser checks pending.
- **Reference image always at the bottom** (done). In Realistic view the image is drawn into the thread canvas
  between the fabric and the threads (not in the SVG above it), so stitches always cover it at any opacity.
- **All Ember stitch and fill types.** Row and tile patterns **done**: Hearts sm/md/lg,
  Diamonds sm/md/lg, Zig-Zag, Circles sm/md/lg, Heartbeat, Spiral, Staircase, Rainfall,
  Hexweave, Tornado, Wavy Walk, Jitter, Bands, Interlocked, Rails, Twill, Houndstooth,
  Chain and Stars, with validated parameters, translated names and thumbnail picker.
  Non-row fills **done**: single-guide Satin sweep fill with satin settings/underlay,
  Circular fill with true row spacing and panel centre inputs, Cross-stitch styles
  (cross, upright, double, smyrna, half; coverage, dense, flipped and repeats), and
  Streamlines with a deterministic smooth angle field and separation placement.
  Legacy cross output stays unchanged until a new option is set. New engines have
  translated picker thumbnails, validation, deterministic PES tests and quiet demo checks.
  Run types and blocks **done**: Double and Triple rope runs (`double-rope`, `triple-rope`; hidden
  double base run, alternating ±width passes in Ember's order, rope width 0.4 mm default 0.2–2,
  1.5 mm length on switching), E-stitch flip (unset keeps today's output), and two-rail
  `satin-block` objects (`rails` stored on the object and validated; drawn with the Blocks tool,
  preview of rails, rungs and both bands; rail points movable, rungs insertable/removable; satin
  with our spacing, pull, split, short stitches and satin underlay; local-width design check; SVG
  export). Old centre-line satin blocks load and sew unchanged; fixtures stay byte-identical.
  Deviations: our satin spacing semantics (one penetration per spacing, as satin lines) rather than
  Ember's rung pairs; pull is half per side as for satin; fractional spacing fixed at 1/3.
  Browser check pending for block drawing and editing.
  Angle guides and redwork **done**: Edit angles (key A, button in Fill settings) draws straight
  guides (`angleGuides`, ≤ 8, arrows with draggable ends, Delete removes, crossing guides red); one
  guide sets the angle, two or more sweep row fills and satin fill along level lines of an
  inverse-square blend of the guides (`embroidery/sweep.py`), with Ember's Density control (row
  shortening on, trigger 0.1–1, default 0.5) shown only while guides sweep; Streamlines use the
  guides as a flow field (Edit flow field). Convert to redwork / Break apart (key W, settings
  button) merges lines and fill outlines into a `redwork` object that keeps its sources; the
  compiler nodes the lines and sews every edge once each way with Tarry's Euler walk, no trims
  within a connected group (`embroidery/redwork.py`). Unset guides keep today's output byte-for-byte.
  Deviations: our own field blend (Ember's module 88458 is only outlined); turns along the outline
  can be long where rows run nearly parallel to it; sweep satin has no facet decomposition.
  Browser check pending for guide drawing, dragging and redwork conversion.
  Merge follow-ups: canvas menu Edit angles / Edit flow field (one unlocked visible guided fill;
  shown disabled when locked or hidden) and Convert to redwork / Break apart (canConvertToRedwork /
  canBreakApart; any locked object in the selection disables it, and W then refuses with the locked
  notice). A, F and W act only in the Select tool without Ctrl/⌘. Shortcut audit: tool keys S/V, H, M,
  1–4, P, T, R, O, K, 7; actions A, F (Streamlines only), W, Shift H/V, ?; no clashes. Ember's H (cut
  holes), R (reshape), P (map to path) and K stay as before (H pans, R shapes, P points, O cuts holes).
  Shape operations keep angle guides unchanged (world-space directions, knife pieces too) and skip
  redwork; map-to-path copies get guides and redwork sources through `moveGeometry`.
  Remaining: draggable Circular centre handle, curved (polyline) flow guides.
  Exact definitions in `docs/ember-patterns-spec.md`.
- **Entry/exit handle size** (done: it was Chrome's default focus outline on the handle after a click). The selected object's entry/exit handle sometimes shows as a large dark
  ring with a light fill (reported 2026-10-22). Find the cause (handle radius from a stale canvas scale,
  or a focus/hover style on the 12 px hit circle) and keep the handles small and quiet like Ember's.
- **Ember drawing mechanics (done, steps 1–7).** Open unfilled drafts, solid cursor band,
  release placement with 0.5 mm drag rejection, double/right-click timing, Ctrl/⌘ 15° snap,
  first-point closure for either tool, repeat drawing, tool-switch completion and Ember node markers.
  New curves/presets/freehand use optional `curve.spline:'levien'`; existing curves keep Catmull–Rom,
  including during edits and continuation. Freehand fits editable nodes and closes within 2 mm.
  Editing inserts corner/smooth nodes on left/right path clicks; Ctrl/⌘ axis-locks node drags.
  Kept the reviewed deviations: Escape discards and draft nodes are draggable; minimums remain
  2 open / 3 closed. Step 8 (two-rail blocks) is now done, as a separate `satin-block` kind.
  Solver follows §3.4's end formula: the symmetric sample's tangent is −49.48°, rather than the
  inconsistent approximate −48.2° in §6's example. Fixed-tangent curvature blending is out of
  scope for drawn nodes. Pure drawing/spline and model/export regression tests added.
  Details in `docs/ember-drawing-spec.md`. Desktop browser interaction check pending.

- **Ember fill settings (done)**. Steps 2–7: optional run tolerance; data-driven fill
  patterns and thumbnail picker; angle input/dial; ordered relative-angle underlays
  with fabric presets; seeded hand stitch; independent fill length; ramp/plateau
  gradients; validation, SVG metadata and regression tests. Open paths remain line-only.
  Hearts await curve data; Underpath off awaits boundary routing and jump handling.
  Desktop browser interaction check remains pending.
  Decisions taken overnight (review): Escape still discards a drawing draft and draft points stay
  draggable while drawing — both differ from Ember, which has neither.

- **Brother thread catalogue (done)**. Generated all 64 Brother PEC colours from installed
  pystitch; searchable translated picker, design swatches, CIEDE2000 matching for the
  selection or whole design, validated metadata, one-step undo and PES v6 code/name entries.
  TS/Python reference-pair, model and PES read-back tests pass; legacy PES bytes unchanged.
- **Production worksheet (done)**. Project-menu/Info printable A4 or Letter sheet with
  exported sew-order blocks, object names, stitch counts, design and step previews,
  fabric advice and design-check summary. Saved Setup speed defaults to 650 stitches/min
  (max 1000); Info and sheet include 30 s/change and 3 s/trim planning allowances.
  Desktop popover/undo/print-preview browser checks remain pending.
- **Lock objects (done)**. `object.locked` (validated, saved, undo, SVG metadata); padlock
  toggles on layer and group rows, Ctrl/⌘ L, Unlock all in the Layers footer, Ctrl/⌘ A
  selects unlocked visible objects. Locked objects pass canvas clicks through and are
  read-only (overlay notice with Unlock); mixed selections transform only unlocked members.
- **Canvas context menu (done)**. Select-tool right-click without drag (right-drag still
  pans, drawing tools keep curve points); object and empty-canvas item lists in
  `lib/context-menu.ts` with keyboard stepping and viewport placement; Shift F10 / Menu key.
- **Colour runs view (done)**. Layers Objects / Colours switch; consecutive same-thread
  objects merge into draggable runs (swatch, Brother label, count, compiled stitches)
  moved as one block by `placeObjects`, which keeps groups whole; click a sew-order
  number to type a new position. "Sort by selection order" remains open.
- **Playback speed (done)**. 0.25×–16× selector in the timeline bar (1× = 450 stitches/s),
  saved with the per-browser view settings.
- **Merge follow-ups (done)**. Worksheet design and hoop sizes use the View settings display
  units (shared `formatLength`); Turkish instructions and messages moved to the formal
  register, with a dictionary test. Sewing time has no lengths, so it is unchanged.
- **Shape operations from Ember (done)**. `lib/polygon.ts` wraps `polygon-clipping` 0.15.7
  (MIT, the clipper Ember uses; inputs snapped to 1e-6 mm with coarser retries) and adds round
  offsets (union of edge capsules) and the knife split; `lib/shape-ops.ts` works on objects:
  Cut holes (selection, keep or remove cutters; O drawing mode), Flatten overlaps (sew order,
  0.4 mm inset, hidden fills deleted, design-check "Flatten overlaps" fix on stacked fills),
  Union/Subtract/Intersect (first object keeps settings), Offset (grow/shrink, in place or as a
  copy) and Knife (K, straight line, left/right parts named "Name 1/2"). One undo step each;
  results become plain-ring objects (curve anchors dropped). Shape tools section in the object
  settings; Cut holes and Knife modes are shortcuts and buttons, not dock tools. Locked objects
  are skipped (or the operation is refused); two-rail satin Blocks are excluded. The object context menu has Cut holes, Flatten overlaps,
  Union/Subtract/Intersect, Offset… (opens the Shape tools distance) and Knife, enabled as the section's buttons. Node and Python
  tests (compiled fills with Cut holes holes and flattened overlaps). Desktop browser checks pending.
- **Native SVG import / Split SVG (backlog 17, done)**. Import dialog offers native
  shapes or adding the SVG to `project.images` as a reference image to trace. DOMParser handles paths/basic shapes, nested transforms,
  physical dimensions/viewBox, basic CSS and solid paints. Fill rules preserve holes;
  strokes become running/satin and compatible gaps under 1 mm join. One named, unlocked group
  is added after the existing objects in one undo step (an empty design takes the file name); reference images are kept. Exact straight paths retain corner curves; arbitrary
  Béziers/arcs use bounded 0.04 mm flattening. Unsupported rendering features and
  model-limit violations return translated errors; no imported markup is mounted.
- **Export image (backlog 20, done)**. Project-menu PNG options share the realistic
  thread renderer and fabric texture. Visible objects only (hidden ones are left out, as in
  the thread view), visible stitch bounds + 5 mm margin; visible reference images are drawn
  under the threads only with "Include reference images" (off by default),
  default 300 dpi, selectable scale, optional transparency and 8,000 px side cap.
- **Needle-density diagnostics (backlog 25, done)**. Density beside Travel and density
  warning clicks enable a cached heat image inside the design SVG, above the
  stitches and under travel, selection, snapping guides and the playback needle (no hit area). Disk-count grid in penetrations/mm²,
  selectable radius (default 1.5 mm), fixed per-design ramp and legend. Info histogram,
  adjustable short-stitch threshold, short/stationary counts, mean/longest stitches.
  All diagnostics include ties, omit jumps and require a fresh compiled plan.
  Native SVG, density and PNG sizing tests join the standard test command.
  Desktop browser checks pending: both SVG import choices/undo/editing; PNG downloads
  with fabric/transparency and large resolution; density alignment during pan/zoom,
  radius changes, timeline playback, fresh recompilation and English/Turkish labels.


## Ember backlog 15, 18, 19, 24, 26 — implemented 2026-10-22

- 15: pure trace ordering/simplification helpers; dominant area first, hue colour
  groups, dark details last and nearest centroids within a colour. Bear benchmark
  records travel 741.5 → 571.4 mm, trims 51 → 52, colour changes unchanged at 3;
  centroid routing does not promise fewer intra-fill trims. See the gap document.
- 18: independent jumps/trims/ties/selected penetration toggles in Setup and
  playback; persisted view schema migrates old settings. Batched SVG paths use
  compiler lock metadata and the visible playback prefix.
- 19: display-unit measurement, secondary inches, clockwise degrees; Shift
  snaps to 15° without changing distance.
- 24: group-owned path bindings retain prototypes, instance IDs and settings;
  commit/drag hooks re-layout atomically with undo. Fill/count/fixed-gap preview,
  tangent rotation, reverse, offset, centre alignment, hide/edit guide and unlink.
  Guide removal or broken membership detaches; clipboard copies are ordinary
  groups. Hoop/complexity validation rejects layouts without changing the design.
- 26: image/reference pixel modal, nearest-colour quantisation, optional Brother
  matching, canvas preview with paint/erase, cell-edge merging with holes and one
  native cross fill per colour. Tests verify occupied cells through the Python
  engine and PES decoding. Explicit zero-distance PEC jumps retain cuts when
  adjacent colours meet at the same needle position.

Verification: typecheck, Python/Node tests, production build, typed en/tr and formal
Turkish tests, and contrast audit. No browser used for this batch; human checks:
trace the bear and inspect sew order; toggle overlays separately during scrub and
reload; measure/snap in mm/cm/in; map multiple motifs to a curved guide, edit it,
change settings, undo/reload/unlink; import/paint a pixel grid, match threads and
export PES in both languages. Path layouts use numeric controls, without Ember’s
additional draggable start/end/mid layout handles.

Merged with reference images, click-to-stitch, SVG import, PNG export and density:
auto trace orders only the newly traced regions (appended after existing objects);
Click to stitch adds one region per click, so its results keep the click order; pixel art reads the selected
entry of `project.images`; design SVG layering is stitches < density < trims/ties/needle
points < travel < selection/handles; path bindings survive locks, hiding and the
transform box.

- **Satin block fonts for small lettering (done; backlog 23)**. Bundled public-domain
  Hershey Roman Simplex and Script Simplex, regenerated offline from checksum-verified
  packed Hershey data with advances and em-unit stroke polylines. Turkish characters
  compose Hershey marks; no Ember data. `lib/satin-lettering.ts` offsets strokes into
  paired rails, splits sharp corners and shares the existing text layout for all
  baseline shapes and affine transforms. Live panel style/font/column-width controls;
  ordinary Blocks on conversion, grouped per character within the 80-object budget.
  Live compiler columns retain one owner, sew in character order, connect nearby
  strokes and travel under previously sewn columns when connected. SVG rail export,
  typed formal Turkish copy, every-glyph validity and deterministic generation/PES
  tests; 6 mm Turkish names are quiet in both design checks. Desktop checks pending:
  live typing/style switching, all layouts, undo/save/reload, conversion/rail editing,
  Lines/Thread preview and PES export. No browser used for this implementation.

  Merged with SVG import, PNG export, density, trace order, overlays, measure, map to path, pixel art,
  angle guides and redwork: live satin text stays excluded from shape operations, redwork and Edit
  points/angles; map-to-path copies, locks, hiding and the transform box keep it live; SVG export skips
  hidden guides (`layoutOnly`) before expanding columns. Convert to shapes gives ordinary Blocks.

## Stitch compiler performance — implemented 2026-10-22

- Added `scripts/compile-benchmark.py` with demo bear, 60 traced-style objects,
  all fill patterns/engines and cross styles, satin blocks/rope runs and the
  stitch library. Baseline and after reports include five-run cold medians,
  phase measurements, cProfile leaders and SHA-256 output hashes. Cached
  unchanged and one-object edit timings are also recorded in the after report.
- Replaced per-cell span generators with row masks in the travel raster,
  precomputed region edge vectors, removed whole-row allocations for routing
  endpoints, and reduced density/short-stitch warning overhead. Existing
  pattern-cycle caching and module-level table loading remain sufficient.
- API process LRU: 256 immutable object-plan variants / 200,000 retained needle
  points; canonical resolved-payload SHA-256 plus hoop/trim and routing context.
  Unchanged contexts reuse planned blocks; changed neighbouring endpoints
  invalidate affected routes. Global joins, locks/trims, command limits, PES
  output/readback and warnings always rerun after request validation.
- Tests prove a middle-object length edit replans only that object and matches
  a cold compile, and cover context invalidation, settings, reorder, insertion,
  removal, eviction, mutation isolation, concurrent requests and API reuse.
  Raster masks and row endpoints also have differential regression tests.
- Kept the editor's full payload, debounce, abort and stale handling. No revision
  ID protocol: local editor counters are not safe process-wide cache keys;
  content-keyed plans already handle identical requests. No new dependencies.

Measured milliseconds (before cold → after cold / cached unchanged / one edit):

- bear: 217.8 → 124.4 / 24.9 / 24.6.
- traced-60: 1125.9 → 667.4 / 111.8 / 130.4.
- all-patterns: 303.3 → 155.5 / 67.2 / 64.2.
- blocks-ropes: 15.9 → 13.4 / 12.4 / 12.6.
- stitch-library: 75.4 → 42.2 / 19.4 / 29.4.

All five fixtures retain identical PES and full-response hashes (only elapsed
`durationMs` excluded), including warnings/ownership/ties/stats. The committed
stitch-library JSON hash and PES bytes are unchanged. Phase figures are from
a separate instrumented pass, not portions of the uninstrumented median.

Verification: `npm run typecheck`, `THREADROOM_PYTHON=.venv/bin/python npm test`
and `THREADROOM_PYTHON=.venv/bin/python npm run build`. No browser used; no commits.
