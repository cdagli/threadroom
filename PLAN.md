# Ember-style editor layout

Goal: more canvas space and an editor laid out like Ember (emberdesign.net): floating overlays, a layers
panel with previews, hiding, drag reordering and one level of groups, Ember's tool set and Ember's shape
drawing. Keep Threadroom's light sage/cream look; copy the layout, not Ember's dark theme.

Decisions:
- **Hidden objects are view-only.** Hiding is for working over a background image: a hidden object is not
  drawn or hit-tested in either editing look (Lines/Thread), but it is still compiled, counted,
  checked and exported, like Ember (its "hidden" is transparency 0).
- **Blocks = satin along a line** (an open shape whose stitch starts as satin, constant width). Variable
  width satin blocks are the separate "Two-rail satin columns" TODO item.

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
| 3 | Blocks | open shape whose stitch starts as satin |
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
  Remaining: draggable Circular centre handle, flow-guide editing, multi-guide satin,
  full Euler routing, Double and Triple rope runs, and two-rail satin Blocks.
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
  2 open / 3 closed. Blocks remain centre-line satin; step 8 (two rails) is deferred.
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

- **Native SVG import / Split SVG (backlog 17, done)**. Import dialog offers native
  shapes or artwork tracing. DOMParser handles paths/basic shapes, nested transforms,
  physical dimensions/viewBox, basic CSS and solid paints. Fill rules preserve holes;
  strokes become running/satin and compatible gaps under 1 mm join. One named group
  is imported in one undo step. Exact straight paths retain corner curves; arbitrary
  Béziers/arcs use bounded 0.04 mm flattening. Unsupported rendering features and
  model-limit violations return translated errors; no imported markup is mounted.
- **Export image (backlog 20, done)**. Project-menu PNG options share the realistic
  thread renderer and fabric texture. Full stitch plan, design bounds + 5 mm margin,
  default 300 dpi, selectable scale, optional transparency and 8,000 px side cap.
- **Needle-density diagnostics (backlog 25, done)**. Density beside Travel and density
  warning clicks enable a cached canvas overlay. Disk-count grid in penetrations/mm²,
  selectable radius (default 1.5 mm), fixed per-design ramp and legend. Info histogram,
  adjustable short-stitch threshold, short/stationary counts, mean/longest stitches.
  All diagnostics include ties, omit jumps and require a fresh compiled plan.
  Native SVG, density and PNG sizing tests join the standard test command.
  Desktop browser checks pending: both SVG import choices/undo/editing; PNG downloads
  with fabric/transparency and large resolution; density alignment during pan/zoom,
  radius changes, timeline playback, fresh recompilation and English/Turkish labels.
