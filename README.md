# Threadroom POC

A beginner-oriented embroidery editor built with **Next.js 16, React 19,
Astryx, and a headless Python + Pystitch exporter**. Supports the Brother PR1X.
The existing `../pes-viewer` and original bear files are unchanged.

## What works

- Import PNG/JPG/WebP/SVG reference artwork, size it in millimetres, and trace
  flat colours into editable regions. Tracing runs locally in the browser.
- Draw freehand strokes (finish on release), smooth curves, polygon fills, or individual stitch points. Curves retain draggable anchors in saved JSON projects. Move objects
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
  edge walk, light zigzag or edge + zigzag for satin lines. Fill underlay stays
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
  nearest it. Ties are only sewn where a trim follows. The preview shows jumps,
  total jump length and trims.
- Preview the **exported PES after Python reads it back**, with playback and
  jumps. Preview existing PES/PEC files using an independent browser parser.
- Save/load editable JSON projects, autosave locally, undo/redo, and export
  millimetre-sized SVG artwork. SVG retains shapes; JSON retains all editor
  settings. SVG import is rendered as artwork and traced, not native path import.

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

Machine, hoop, and fabric settings are behind the toolbar settings icon.
Switch to **Stitches** to generate a preview; play/pause and the playback slider
appear in the toolbar in that mode. There is no left sidebar or bottom preview bar.

Open **Artwork** on the toolbar to import an image, then choose **Auto trace** for colour regions, **Trace outline**
for a curved fill, or **Trace line** for a curved running-stitch path. Import fits
the image automatically; use **Reference opacity** to see your tracing clearly.
Colour count and background removal are under **Trace settings**.

- **Curve / Fill / Points:** click to place points, drag to adjust, then **Done**
  or **Close shape**. Enter also finishes. Clicking the first point closes a fill.
- **Freehand:** draw and release to save the stroke; tiny jitter is simplified.
- **Undo point / Backspace:** remove the last draft point. **Cancel / Escape:**
  discard the unfinished path. Exports wait until the path is finished.
- **Select:** move an object. **Edit points** or double-click the object exposes
  draggable anchors. Finished curves enter this mode automatically. Drag points
  to reshape; click a small **+** between points or choose **Add point** and click
  the curve. **Remove** lets you click points to delete them; Delete/Backspace
  removes the selected point. Arrow keys nudge a focused point (Shift for larger
  steps). **Done editing** or Enter/Escape exits without deleting the curve.
- **Continue:** extend an open curve from its last point, or select its first point
  to extend that end. Done updates the existing object. Cancel restores the
  original curve; undoing the extension restores its previous anchors.
- **Pan:** drag the canvas. During a trace, toggle Pan and toggle it again to
  continue with the same points, or click Curve to resume. Space-drag, right-drag
  and middle-drag pan without changing tools. Scroll zooms around the cursor;
  horizontal scroll, Alt-scroll and Shift-scroll pan. Trackpad pinch or
  Ctrl/⌘-scroll zooms. Two-finger touch gestures pan and pinch-zoom without adding
  drawing points. The zoom buttons and +/− keys work during a trace as well.
- Shortcuts: **V** select, **B** freehand, **C** curve, **F** fill, **P** points,
  **T** text, **H** pan; Ctrl/⌘ Z undo and Ctrl/⌘ Shift Z redo. Text fields keep normal typing.

Curve previews use fine samples; running/bean PES exports sample the curve at
the selected stitch length. Resizing and moving keep anchors and geometry in sync.

The stitch selector includes a small path preview beside every style. Use arrow
keys to browse, Enter to select, and Escape to close. Fill styles need at least
three points. Running and straight stitching share one style because both use
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
2. Open the editor, choose **Bear sample**, then **Stitches**.
3. Check that the status says **Engine connected**.
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
skipping, the bear's trim count,
curve-resolution-independent satin density, short stitches on tight arcs,
staggered satin splitting with pull compensation, stitch lengths, hoop checks,
malformed input, request limits, and independent PES decoding. Tests use the
virtual environment if present and regenerate their own small fixtures.

The live local editor was checked in a browser at desktop and mobile sizes,
including API health, real Python generation, and a downloaded PES independently
read back as PES v6: 3,249 stitches, four thread blocks, 58.8 × 51.4 mm.
After entry/exit routing (2026-10-05) the bear sample compiles to 3,380
stitches, 25 trims and 206 mm of jumps (before: 4,174 stitches, 87 trims,
946 mm); entry/exit markers were dragged, moved, resized, undone and previewed
in the browser.
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
It has basic scanline fill, sparse perpendicular fill underlay, constant-width
satin foundations, cross-fill grids, and tie stitches. Crosses jump between
diagonals instead of using production cross-stitch routing, so cross fills
still trim between diagonals. Pull compensation is a fixed amount per object; it does not scale with
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
preview; it cannot recover original editable regions. A thread simulation
does not predict fabric distortion. **Test-stitch on matching scrap fabric
before using the output on baby clothing.**

## Layout

```text
app/                 Next.js/Astryx interface and SVG editor
lib/project.ts       Editable, millimetre-based project model
lib/trace.ts         Browser colour tracing with holes
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
