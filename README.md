# Threadroom POC

A beginner-oriented embroidery editor built with **Next.js 16, React 19,
Astryx, and a headless Python + Pystitch exporter**. Supports the Brother PR1X.
The existing `../pes-viewer` and original bear files are unchanged.

## Language

The editor starts in Turkish. Choose **Türkçe / English** in the project chip’s ▾ menu;
the preference is remembered in this browser. Displayed numbers follow the language.
Existing project names, layer names and text are preserved; new objects use the current language.

## What works

- Import PNG/JPG/WebP/SVG reference artwork, size it in millimetres, and trace
  flat colours into editable regions. Tracing runs locally in the browser.
- Draw open and closed shapes with corner and curve points, satin blocks, freehand strokes (finish on release), ready-made shapes (circle, rectangle, star, triangle, diamond, hexagon, heart), or individual stitch points. Curves retain draggable anchors and their corner/curve type in saved JSON projects. Move objects
  and edit control points; change thread colours, order, spacing, length,
  fill direction, constant-width satin, underlay, and pull compensation.
- PR1X hoop profiles: 100 × 100, 180 × 130, 300 × 200, and 60 × 40 mm. Select
  the hoop actually fitted to your machine. Profiles are limits, not a machine
  connection.
- Fabric profiles (Setup) set fill and satin spacing, default underlay and pull
  compensation, and recommend a stabilizer and topping:

  | Fabric | Fill | Satin | Fill / satin underlay | Pull | Stabilizer · topping |
  |---|---|---|---|---|---|
  | Woven cotton | 0.42 | 0.40 | tatami / center | 0.20 | tear-away · none |
  | Muslin / double gauze | 0.50 | 0.45 | edge + tatami / edge | 0.30 | cut-away mesh · water-soluble |
  | Jersey / T-shirt knit | 0.48 | 0.42 | edge + tatami / edge | 0.35 | no-show mesh · none |
  | Interlock / rib knit | 0.50 | 0.42 | edge + tatami / edge | 0.40 | no-show mesh · water-soluble on rib |
  | Fleece / minky | 0.45 | 0.40 | edge + tatami / edge + zigzag | 0.40 | cut-away · water-soluble |
  | Terry / towelling | 0.40 | 0.38 | edge + tatami / edge + zigzag | 0.35 | tear-away · water-soluble |
  | Denim / twill | 0.40 | 0.38 | tatami / center | 0.15 | heavy tear-away · none |

  Values are mm. Spacing, underlay and pull compensation are inherited unless set
  on the object; object settings mark each as *Fabric* (or *Default* for fixed
  zigzag/E-stitch/cross spacing) or offer *Reset*. Changing fabric never
  overwrites set values. `fabrics` in `lib/project.ts` is the only table: the
  compile payload carries resolved values and the Python compiler has no fabric
  defaults. These are starting points; test-stitch on matching fabric.
- Choose illustrated stitch styles: running/straight, bean, backstitch, satin,
  zigzag, appliqué E-stitch, tatami fill, cross-stitch fill, standalone underlay,
  and manual stitches. Each generates real paths in **PES v6 with custom RGB thread colours**.
- Pull compensation (0–1 mm) widens satin, zigzag and E-stitch bites and
  lengthens tatami rows and cross diagonals by the amount, half per side.
  Underlay stays inset.
- Satin, zigzag and E-stitch columns are 0.5–10 mm wide. Each bite is one
  stitch; bites longer than **Split above** (default 7 mm, 3–12 mm) are split
  into pieces of at most that length, with penetrations staggered by a
  golden-ratio sequence so they never line up into a groove. Pull compensation
  is applied before splitting. 7 mm: longer floats loosen and snag on baby
  clothes; the PR1X limit is 12.7 mm, and a 10 mm column with 1 mm compensation
  stays under it even with splitting raised to 12 mm (effectively off).
- **Short stitches on curves** (satin and zigzag, on by default): where the inner
  edge is compressed below 80 % of the centre line and its needle hits are
  closer than 1 mm, alternate inner bites stop 25 % of the width short. The
  outer edge and every other inner hit are unchanged, so the edge stays
  continuous. Both are per-object settings with fixed defaults (*Default* /
  *Reset*); text satin borders use the defaults.
- Underlay: edge walk, light tatami or edge + tatami for fills; center walk,
  edge walk, light zigzag or edge + zigzag for satin lines. Default fill underlay stays
  0.4 mm inside the edge (around holes too, and on nonzero text fills), so it
  never shows past the top stitches. Parts of a fill narrower than 2 mm get no
  underlay; satin narrower than 1.5 mm gets at most a centre walk.
- **Entry and exit points.** A selected object shows a green entry and a red exit
  marker (hollow while automatic). Drag them along the outline; on an open line
  they snap to its ends, so moving one just reverses the direction. **Reset**
  (or Delete on a focused marker) returns to automatic. Points move and resize
  with the object and are kept in JSON, autosave, undo/redo and SVG export
  (`data-threadroom-entry` / `-exit`). Automatically, each object starts at its
  point nearest the previous exit and fills end near the next object; closed
  outlines start at their nearest point, lines and satin columns may sew in
  reverse, and satin underlay passes alternate direction so they join the top
  pass without a trim.
- Fill routing: each separate part sews its underlay, then its top rows.
  Sections are ordered (a bounded search) to need the fewest trims and joined by
  travel stitches through the inside of the shape, at least 0.3 mm from the
  edge, where they will be covered: underlay travel anywhere in the part, top
  travel only through rows not yet sewn. An explicit entry starts with such
  travel; the section nearest the exit is sewn last, ending on the row end
  nearest it. The preview shows jumps, total jump length and trims.
- **Lock stitches and trims** (Setup): **Tie-in** and **Tie-off** are *None*,
  *Tack* (along the path and back, twice) or *Triangle* (a small arrow pointing
  along the path); **Lock size** 0.5–1.5 mm (default tack, 1 mm: hidden under
  fill rows and satin, yet long enough to grip). Objects inherit these
  (*Setup*) or override them (*Reset*). **Trim jumps longer than** 1–10 mm
  (default 3 mm, the longest running stitch, so an untrimmed connector is never
  a longer float than a normal stitch). A colour change or a longer jump is tied
  off, trimmed and tied in; the design starts with a tie-in and ends with a
  tie-off. Shorter jumps sew as one connecting stitch with no trim and no ties.
  In PES, pystitch writes every jump after the first with the PEC trim flag
  (0x20) and drops the TRIM command itself, so a jump that must not cut is
  written as a stitch. The compiler checks that the trims read back from the
  PES equal the trims it planned. Settings are kept in JSON, autosave,
  undo/redo and SVG export (`data-threadroom-tie-in`, `-tie-off`,
  `-lock-size`, and `data-threadroom-trim-jump` on the root).
- **Cross stitch** sews each row run as `/` half-crosses, then returns with the
  `\` legs, so every top leg lies the same way. Travel between legs, runs and
  rows passes through cell centres along cross legs (covered or doubled by
  them), never across empty cells; only unreachable parts trim.
- Preview the **exported PES after Python reads it back**, with playback and
  a travel view. Preview existing PES/PEC files using an independent browser parser.
- Save/load editable JSON projects, autosave locally, undo/redo, and export
  millimetre-sized SVG artwork. SVG retains shapes; JSON retains all editor
  settings. SVG import is rendered as artwork and traced, not native path import.

## Fill and run settings

Closed shapes offer fills; open paths offer line stitches. Switching a closed shape
between fill and outline keeps its topology. The object panel has collapsible
**Fill settings** and **Underlays (n)** sections. Spacing and pull still follow the
fabric profile until edited, with the existing **Fabric / Reset** markers.

- **Stitch tolerance** (`tolerance`, 0.1–1 mm) is available for running, bean and
  backstitch. Lower values follow curves more closely; higher values permit more
  corner cutting on smooth parts. Turns sharper than 45° stay needle points.
  Explicit tolerance uses equal arc divisions with a deviation check. Unset keeps
  the previous sampling exactly; the suggested starting tolerance is 0.2 mm.
- **Fill pattern** (`fillPattern`): Even preserves the previous equal row division.
  Tatami staggers penetrations over four rows; Original aligns columns; Columns
  alternates two offsets; Offset columns switches every six rows by 6 mm; Triangle
  rises and falls over six rows; Walk uses seven offsets; Waves uses sinusoidal
  offsets. `patternParams` sets Waves steps (1–100, initially 20) and amplitude
  (0–10 mm, initially 2). New drawn shapes and text start with Tatami; existing
  projects and traced regions with no setting stay Even. Pattern rows and
  penetrations share an area-centroid anchor across separate parts. Both ends of
  every row remain penetrations; tiny end fragments are merged and long gaps split.
  The JSON table in `embroidery/fill-patterns.json` drives both the compiler and
  SVG thumbnail grid; offset patterns can be added there as data. Hearts are
  deferred because the source spec gives tile sizes but no exact heart curve.
- **Stitch angle** uses the existing −180…180° field, with a number input and a
  draggable circular dial. Arrow keys adjust the focused dial by 1°. Zero follows
  the x axis; positive angles rotate clockwise on the canvas.
- **Fill stitch length** (`fillLength`, 1–6 mm) changes cover stitches independently
  of the run length. Unset uses the object's existing `length`, including legacy
  values below 1 mm. Underlays retain their own length. The design check warns
  above 5 mm on jersey, rib and fleece.
- **Pull compensation** keeps Threadroom's total extension, half per side. Ember
  specifies extension per side: convert with **Threadroom = 2 × Ember**.
- **Underlays** (`fillUnderlays`) holds up to three ordered row passes, each with
  relative angle (−180…180°), row space (1–4 mm), length (1–5 mm) and inset (0–2 mm).
  Angles remain relative when the cover angle changes. Add uses +90°, +45°, +135°
  by index, row space 2 mm and inset 0.4 mm. Delete removes a pass; an empty list
  disables row underlay. Reset returns to the current underlay preset, marked
  **From fabric** while inherited. Edge walk is a separate flag in the existing
  `underlay` setting and sews first. The unset row preset is exactly the previous
  perpendicular tatami (2 mm rows, run length, 0.4 mm inset); no preset silently
  changes existing PES output. Thin parts still skip underlay.
- **Hand stitch** (`handStitch`, integer 0–5) adds deterministic sideways jitter to
  cover-row interior penetrations, keyed by shape ID and stitch index. It uses
  the spec's intensity/length formula with a correct perpendicular direction,
  reduces displacement near holes, and keeps row ends and underlays fixed.
  Zero and unset give identical output.
- **Gradient** (`gradient`) varies row spacing perpendicular to the cover angle.
  Ramp uses Start/End percentages, including reversed ramps; Plateau uses Center
  and Width percentages, with base spacing in the plateau and linear ramps to
  End row space (0.3–4 mm) at the edges. Disabling removes the setting. Gradient
  lanes step by local spacing from the minimum edge instead of the centroid.

All fields are optional, validated by both editor and API, retained in JSON,
autosave and undo/redo, and exported as `data-threadroom-*` SVG attributes when
set (structured values use JSON). Unset fields preserve existing PES bytes.
**Underpath off is deferred:** the current interior raster router and the compiler's
short-jump joining rule cannot guarantee edge-only travel around holes and narrow
parts. A faithful toggle needs both a boundary travel graph and corresponding
jump handling; interior routing remains the current behaviour.

## Design check and travel view

The badge at the top right shows the number of issues (or **Ready to stitch**); click it
for the list. Shape checks run a moment after each edit; stitch checks run on a
background compile about a second after you stop editing (and on Play, Realistic view or
Export). Each warning has a title, why it matters and one fix, marked **Will
likely fail** or **Worth checking**. Clicking one selects the object, pans to
it and rings the problem on the canvas; where it is safe a button fixes it
(Use running / bean stitch, Split at 7 mm, Make 6 mm tall, Move inside, Sew
earlier / Sew others later, Trim above 3 mm). Export is never blocked; the check
pill turns red and shows how many issues will likely fail.

| Check | Where | Worth checking | Will likely fail |
|---|---|---|---|
| Fill too small | editor | under 6 mm² | under 3 mm² |
| Fill too thin (widest part) | editor | under 2 mm (no underlay) | under 1 mm (cross: 2 / 1 cells) |
| Thin parts in a fill | editor | ≥ 1 mm² thinner than 1 mm | — |
| Satin, zigzag, E-stitch width | editor | over 7 mm (split) | under 1 mm; bites over 7 mm unsplit |
| Text height | editor | fill 6, satin 5, outline 4 mm | under two-thirds of that |
| Hoop | editor | within 3 mm of the edge | outside (incl. satin half-width) |
| Same colour sewn twice | editor | any colour sewn, left and resumed | — |
| Stitches under 0.3 mm | compiler | 3 in one 2 mm square | 10 % of an object, or 12 clustered |
| Sewn stitches over 7 mm | compiler | any (satin bites excluded) | — |
| Density (3 × 3 mm windows) | compiler | 7 holes/mm² or 3 thread layers | 10 holes/mm² or 5 layers |
| Same-colour jump between objects | compiler | over 30 mm | — |
| Trims | compiler | more than 25 | — |

A layer is sewn thread per mm² × 0.42 mm, so one woven fill is about one
layer: two stacked fills pass, three are worth checking, three with full
underlay or four fail. The compile result has `warnings` (`code`,
`objectId`, `bounds` [x0, y0, x1, y1] mm, `severity`, `values`); preview
commands carry `trim` and `travel` flags.

**Travel** in the playback bar dims the stitches and shows jumps (blue dashes),
sewn connecting stitches (orange) and trims (red ✕ at the cut), with counts.
The bear sample and the stitch-library fixture have no warnings on woven cotton.

## Thread preview

The editor always shows compiled stitches. **Lines** is the default: thin needle
paths in the thread colour. **Realistic view** (the eye in the toolbar) toggles
Lines ↔ **Thread**, a simulation of the sewn design on the project's fabric. The reference image
always sits under the stitches, at any opacity: in Thread it is painted between the fabric and the threads.
Selection, drawing, dragging, point editing and entry/exit handles work in both
looks. The toggle only changes the stitch rendering.

A background compile runs 350 ms after edits settle and supplies both the view
and design check. Stale requests are aborted and their revisions ignored; export
shares the same request. While stitches are out of date, shapes appear faintly
in their thread colours, with transparent shape hit targets always available.
If the engine is offline, normal shapes and a small note remain visible. The bear
sample compiled in 179–196 ms (five Python runs; median 182.4 ms) when choosing
this debounce.

- Each sewn stitch is a rounded thread 0.4 mm wide at true scale, in its thread
  colour, with darker flanks, a sheen along its length (light from the top
  left, stopping short of the needle holes) and a small shadow. Satin reads as
  glossy and directional; fill shows its rows. Later stitches lie on top.
  Zoomed out, a thread stays at least 0.7 px wide and drops its shading.
- Jumps and trims are hidden; **Travel** dims the thread and overlays them.
- The background is the hoop and a light texture per fabric profile (plain
  weave, gauze, jersey and rib knit, fleece, terry loops, denim twill), shown
  once a repeat is at least 8 device pixels.
- Playback draws only the new stitches each frame and marks the needle.
  Zoom and pan work as in the editor. Imported PES files render the same way.
- *Simulation: fabric pull and puckering aren't shown.*

Rendering is Canvas 2D (`lib/thread.ts`, `app/thread-view.tsx`; no new
dependency) under the transparent SVG overlay. Stitches of one colour are
stroked together per shading pass in batches of up to 240; a stitch that
crosses one already in the batch (satin over its centre walk, top fill over
underlay) starts a new batch so it lies on top. Batch breaks are computed once
per design. When a full redraw takes over 12 ms, pan and zoom scale the last
render and redraw sharp 120 ms after the view settles. Measured in Chrome
(Apple Silicon, device pixel ratio 2): bear (3,432 stitches) full redraw
4.8 ms in a 900 × 620 benchmark, 6.3 ms in the 1,440 px editor (with satin
eyes, 3,475 stitches); a
32,171-stitch design 48 ms at fit and 15 ms at 400 % (benchmark), 42–44 ms in
the editor, with 0.2 ms scaled frames while zooming; playback frames 0.1 ms
median, 1.3 ms p95; batch breaks once: 5 ms (bear), 75 ms (32k).

## Text

Choose **Text** (T) and click the hoop. Type in the Text panel; the canvas
updates as you type, and each field coalesces into one undo step.

- **Fonts:** 1,972 open-licence Google Fonts via Fontsource, searchable, with
  live previews and a *Best for stitching* shortlist of solid, rounded and bold
  faces. Font files download on demand from jsDelivr (an internet connection is
  needed for fonts not yet loaded). Characters outside Latin load the matching
  subset (Latin Extended, Cyrillic, Greek, Vietnamese); missing characters are
  listed. **Upload font…** accepts TTF, OTF and WOFF; uploads stay in this
  browser (IndexedDB) and must be re-uploaded on another device.
  `node scripts/update-font-catalog.mjs` refreshes `public/fonts/catalog.json`.
- **Style:** weight, italic, letter height (capital height, mm), letter spacing,
  multiple lines with line spacing, and alignment.
- **Shape:** Straight, Arc (−100…100 %, ±100 % is a full circle; negative arches
  down), Wave (height and length), and Path. Path either draws a new curve for
  the text or follows an existing line or shape, with position, reverse and
  below-path options. Letters bend continuously, so joined scripts stay joined.
- **Stitches:** any stitch style. Fills use the nonzero rule so overlapping script
  letters merge; borders (running, bean or satin) follow the merged outline.
  **Convert to shapes** turns text into ordinary editable objects.
- Moving or resizing text keeps it editable. Use letters of 6 mm or more for fill;
  smaller or thin script text sews better as bean outline. Arabic, Hebrew and
  Indic scripts are not shaped and are not supported.

## Drawing and tracing

The canvas fills the window and the controls float over it: the project name
and menu (import, samples, save project, SVG export) top left; the design check
and **Export PES** top right; the current tool's name, hint and actions (Undo
point, Cancel, Done, point editing) top centre; zoom and undo/redo bottom left;
the toolbar at the bottom. While an object is selected its settings (and, for
text, the text panel) float at the left; the arrow collapses them to a header and
the bin deletes the object. The side panel's rail opens **Layers** (the object
list with previews, selection, visibility, reordering and groups), **Artwork**,
**Setup** (machine, hoop, fabric, ties and trims) and **Info** (size, stitch
counts, design width, engine status); the last rail button hides the panel.

Toolbar, left to right (shortcut in brackets), as in Ember:

| Tool | | |
|---|---|---|
| Select (S or V) | Pan (H, or hold Space) | Measure (M): drag to read a distance in mm; cleared when you change tools |
| Open shape (1) | Closed shape (2) | Blocks (3): an open shape sewn as a satin column |
| Freehand (4) | Points (P) | Text (T) |
| Shapes (R) | Play | Realistic view |

**Play** shows the timeline and plays the stitch-out from the start in the
current look; click it again to hide the bar and return to full progress. The
bar has play/pause, a slider, the stitch counter and **Travel**, which works in
both looks. Any edit stops playback and restores full progress.

The **Layers** panel shows sew-order numbers, small shape previews, names and
stitch types. Click to select, Ctrl/⌘-click to add or remove an object, and
Shift-click to select a range. Ctrl/⌘-click also toggles objects on the canvas;
dragging a selected object moves the entire selection as one undo step.
Double-click a layer name to rename it (Enter or blur saves; Escape cancels).
Drag a row at least 5 px to reorder; the insertion line shows the destination,
and dragging a selected row moves all selected rows. Footer buttons move the
selection to the top, up, down or bottom, or delete it. With several objects
selected, the left overlay offers a shared thread colour, Group/Ungroup and
Delete.

**Group** (Ctrl/⌘ G) gathers the selection into one contiguous block;
**Ungroup** (Ctrl/⌘ Shift G) releases selected members. Groups have one level:
click a header to select its members, double-click its name to rename it (up to
40 characters), use its arrow to collapse its rows, or drag the header to move
the whole block. Drop objects between a group's rows to join it, or outside its
rows to leave it; the insertion line identifies the destination group. Collapse
state stays in the UI. Groups, names, order and visibility are saved in project
JSON, autosave and undo/redo; group membership is normalized on load and edits.

An eye hides an object, or all members of a group, from the canvas and hit
testing in both Lines and Thread. **Hidden is view-only:** hidden objects still
compile, contribute to stitch counts and design checks, and export. Preview
commands carry object indices and IDs so shapes, stitches and connecting travel
can be filtered together, including text borders.

Open **Artwork** in the side panel to import an image, then choose **Auto trace** for colour regions, **Trace outline**
(closed shape) or **Trace line** (open shape) to trace by hand. Import fits
the image automatically and starts a closed shape; use **Reference opacity** to see your tracing clearly.
Colour count and background removal are under **Trace settings**.

For thread colour, use the colour input or palette in the object settings. The
**eyedropper** beside it picks from the reference image: click the image to apply
its original RGB colour, regardless of reference opacity or stitches drawn over
it. It averages a small neighbourhood at the image’s original resolution and
ignores fully transparent pixels. With several objects selected it colours all
of them in one undo step. Clicking outside the image keeps the picker active;
Escape, the eyedropper button, or choosing a tool cancels. Import reference
artwork first to enable the button.

- **Open shape / Closed shape / Blocks:** left-click plots a corner (straight
  lines meet sharply); right-click, or double-click, plots a curve point (the path
  bends smoothly through it). Drag draft points to adjust; Enter or **Done** /
  **Close shape** finishes, and clicking the first point closes a closed shape.
  Corners show as squares, curve points as circles. Closed shapes are fills, open
  shapes running stitch and blocks satin; change the stitch style afterwards.
- **Shapes:** pick circle, rectangle, star, triangle, diamond, hexagon or heart
  above the toolbar (the last one is remembered). Rectangle: click one corner,
  then the opposite corner (hold Ctrl/⌘ for a square). The others: click the
  centre, then click again to set the size. Press-drag-release also works, and
  Escape cancels. The preview shows the outline and the radius; shapes stop at
  the hoop edge. Each becomes an ordinary editable closed curve with a fill.
- **Points:** click to place stitch points, then **Done**.
- **Freehand:** draw and release to save the stroke; tiny jitter is simplified.
- **Undo point / Backspace:** remove the last draft point. **Cancel / Escape:**
  discard the unfinished path. Exports wait until the path is finished.
- **Select:** move an object. **Edit points** or double-click the object exposes
  draggable anchors. Drag points
  to reshape; click a small **+** between points or choose **Add point** and click
  the curve. **Remove** lets you click points to delete them; Delete/Backspace
  removes the selected point. Double-click a point, or select it and use
  **Corner / Curve**, to switch it between a sharp corner and a smooth curve
  point. Arrow keys nudge a focused point (Shift for larger
  steps). **Done editing** or Enter/Escape exits without deleting the curve.
- **Continue:** extend an open curve from its last point, or select its first point
  to extend that end. Done updates the existing object. Cancel restores the
  original curve; undoing the extension restores its previous anchors.
- **Pan:** drag the canvas. During a trace, toggle Pan and toggle it again to
  continue with the same points, or click the drawing tool to resume. Space-drag
  and middle-drag pan without changing tools, and so does right-drag except in
  the shape tools, where right-click plots a curve point. Scroll zooms around the cursor;
  horizontal scroll, Alt-scroll and Shift-scroll pan. Trackpad pinch or
  Ctrl/⌘-scroll zooms. Two-finger touch gestures pan and pinch-zoom without adding
  drawing points. The zoom buttons and +/− keys work during a trace as well.
- Ctrl/⌘ Z undo and Ctrl/⌘ Shift Z redo. Text fields keep normal typing.

Curve previews use fine samples; running/bean PES exports sample the curve at
the selected stitch length. Resizing and moving keep anchors and geometry in sync.

The stitch selector includes a small path preview beside every style. Use arrow
keys to browse (skipping group headings), type a letter to jump to a style,
Enter to select, and Escape to close. Closed shapes and text offer **Fill**
(tatami and cross stitch) and **Outline** groups. Open paths offer **Line**
stitches, including manual needle points. Switching a closed shape to an outline
sews its closing segment; switching back to fill keeps the shape closed. Older
projects with an open fill still load and show that saved style as **Current**
until you choose a line style. Running and straight stitching share one style because both use
a single sequence of needle positions. Underlay can be a standalone foundation
line or a layer sewn before a fill or satin object. For cross stitch, **Cross size**
sets the grid cell size; incomplete crosses at edges or holes are omitted.

Stitch styles are digitizing patterns, not a finite PR1X feature list. This POC
implements the ten styles above; it does not claim to include every decorative
pattern the machine could embroider from a PES file. References:
[Brother PR1X](https://www.brother-usa.com/p/embroidery/PR1X) and the
[Ink/Stitch stitch library](https://inkstitch.org/docs/stitch-library/).

## Run locally

Use Node 22 or 24 and Python 3.12+ (Vercel is pinned to 3.12).

```sh
cd threadroom-poc
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm run dev
```

Open the URL printed by Next.js (normally http://localhost:3000). The launcher
starts Python on an available localhost port, waits until it is listening, then
starts Next.js with that exact API port. Next proxies `/api/export` to Python
during development. Set `THREADROOM_API_PORT` to request a particular port, or
`THREADROOM_PYTHON` if your Python executable is elsewhere. If Python fails,
the launcher stops the web server instead of leaving a disconnected editor.
Neither process should be exposed publicly as a development server.
Restart `npm run dev` after changing Python files; the Python process does not
hot-reload its imported compiler.

## Deploy to Vercel

**Deploy this directory**, not the parent embroidery workspace.

```sh
cd threadroom-poc
vercel
```

The CLI will ask you to choose your account/team and a new project. Keep the
checked-in configuration. This POC deliberately uses:

- `framework: null`, `npm run build`, and output directory `.next-build`:
  Next.js exports the static application there; Vercel serves its assets.
- `api/export.py`: a separate Vercel Python Function at `/api/export`.
- `requirements.txt`: installs `pystitch==1.0.1`; `.python-version`: Python 3.12.
- `includeFiles`: bundles `embroidery/` for the Python Function.
- No external service, API key, account system, database, Docker, or Ink/Stitch
  installation is needed for the POC runtime.

For a Git deployment, set the Vercel project's **Root Directory** to
`threadroom-poc` and **Framework Preset** to **Other**. Do not override it to
Next.js: the static build plus the Python Function are intentional.

After the preview deployment is ready:

1. Visit `/api/export`; expect `{"ok":true,"engine":"threadroom-poc+pystitch","python":true}`.
2. Open the editor, choose **Bear sample**, then **Realistic view** (the eye in the toolbar).
3. Check that **Info** in the side panel says **Engine connected**.
4. Download **Export PES** and reopen it in the editor or another PES viewer.
5. Import an image, trace it, change a region's stitch style, and export again.

Keep a preview deployment until the machine stitch-out has been assessed.
The endpoint is intentionally public for this POC, with a 2 MB request limit,
geometry limits, a 100,000-command generation budget, and a 60-second Function
limit. Add authentication, rate limiting, and job handling before a public product.

## Verification

```sh
npm run typecheck
npm test
npm run build
```

Tests exercise physical dimensions, PES v6 colours, holes in fill/underlay,
disconnected travel, every stitch style, underlay modes, cross-fill holes,
automatic and explicit entry/exit points (fills, closed outlines, open paths),
hidden travel and underlay staying inside, underlay inset and narrow-object
skipping, the bear's trim count, tie-in/tie-off types and sizes around trims,
trim thresholds, trims read back from the PEC flags, cross-stitch routing,
every design-check code (compiler and editor), one-click fixes, warning copy,
one undo step per drag, thread shading and fabric-look mapping, batch
breaks for crossing stitches,
curve-resolution-independent satin density, short stitches on tight arcs,
staggered satin splitting with pull compensation, stitch lengths, hoop checks,
malformed input, request limits, and independent PES decoding. Tests use the
virtual environment if present and regenerate their own small fixtures.

The live local editor was checked in a browser at desktop and mobile sizes,
including API health, real Python generation, and a downloaded PES independently
read back as PES v6: 3,249 stitches, four thread blocks, 58.8 × 51.4 mm.
After entry/exit routing (2026-10-05) the bear sample compiled to 3,383
stitches and 25 reported trims; 13 of those were spurious: a JUMP followed by
the first tie stitch made pystitch write a second trim-jump (and drop that tie
stitch). Runs now land with a stitch. With locks and a 3 mm trim threshold the
bear reads back as 3,432 stitches, 11 jumps, 10 trims and 199 mm of jumps (1 mm:
11 trims; 7 mm: 9 trims). The stitch-library fixture went from 905 trims (906
jumps, 3,213 stitches) to 10 trims (11 jumps, 2,371 stitches) with production
cross routing. Lock settings, trim threshold, object overrides, autosave,
undo and the compile payload were checked in the browser, as were undo after
a move, a marker drag, and drags whose pointer-up was lost.
Browser interaction checks also cover Done/Enter completion, Backspace, Escape,
click-first-point closure, pan during a trace, freehand release, undo/redo, and
auto tracing the bear image into 35 regions. Finished-curve checks cover inserting
and dragging anchors, removing points, reopening editing, extending either end,
cancelling continuation, undo/redo, and live PES generation after edits. Browser
event checks cover cursor-centered wheel zoom, Space/right-drag pan and touch
pinch/pan while retaining draft points; mobile controls fit without horizontal
overflow. The layout has no footer.
`scripts/browser-harness.mjs` also supports file-based checks when local server
binding is unavailable; its transport fixtures are excluded from deployment.
**A live Vercel deployment has not been verified in this environment.**

## Deliberate limitations

This is an experimental compiler, not an Ink/Stitch integration or a production
auto-digitizer. The first deployable version proves the browser/Python boundary.
It has straight patterned scanline fills, ordered sparse fill underlays, constant-width
satin foundations, cross-fill grids, and tie stitches. An untrimmed connector
(shorter than the trim threshold) is a straight stitch even where it crosses a
hole or sewn stitches; do not set the threshold above a float you would accept.
Triangle locks reach half the lock size to each side of the path. Pull compensation is a fixed amount per object; it does not scale with
column width or offset fill outlines in other directions. Short stitches use a
fixed threshold and inset; they do not handle self-overlapping columns on curves
tighter than half the width. Fill rows can only end where they meet the
outline, so an exit on an edge parallel to the rows ends at the nearest row
end. Top-fill travel may run up to 1.5 mm over just-sewn rows where a section
ends at the edge; otherwise a trim is used. Satin with an even number of passes
(e.g. centre walk + top) ends where it started, so its entry decides both ends.
It does **not** have turning or guided fills, overlap compensation between
independent objects, or satin rails. Fabric profiles are starting points, not
tested production presets. Freehand and point paths are subdivided
to keep sewn segments near or below 3 mm (allowing 0.1 mm format rounding);
wide-column bites follow the split length instead.

The 80-pixel tracing grid is designed for simple illustrations; small details
and photographs need manual correction. Automatic tracing assigns fill to all
regions. Regions are grouped in colour order initially; review/change their
sewing order. Traced pixel boundaries still produce more trims than drawn
shapes (the traced bear: 185 trims, down from 763). Counts are shown in the preview.

Resizing editable objects regenerates stitches. Imported PES is a stitch
preview; it cannot recover original editable regions. The thread preview does
not model fabric pull, puckering, thread tension, sinking into pile (terry,
fleece) or thread flattening; shading uses one fixed light direction. **Test-stitch on matching scrap fabric
before using the output on baby clothing.**

## Layout

```text
app/                 Next.js/Astryx interface and SVG editor
lib/project.ts       Editable, millimetre-based project model
lib/trace.ts         Browser colour tracing with holes
lib/thread.ts        Thread preview shading, fabric textures and Canvas renderer
lib/pes-parser.js    Independent PES/PEC reader (shared from the existing viewer)
embroidery/          Headless experimental Python stitch compiler
api/export.py        Vercel Function / local HTTP handler
scripts/             Development launcher and verification helpers
tests/               Compiler, API, and independent reader checks
```

The Python service takes geometry, not the reference image, and returns both
PES bytes (base64) and decoded stitch commands. Nothing is written to persistent
server storage. The frontend stores projects on the user's own device.

References: [Vercel Python Functions](https://vercel.com/docs/functions/runtimes/python/api-directory),
[Astryx setup](https://astryx.atmeta.com/docs/getting-started),
[Pystitch](https://github.com/inkstitch/pystitch),
[Brother PR1X](https://www.brother-usa.com/p/sewing-embroidery/PR1X).
