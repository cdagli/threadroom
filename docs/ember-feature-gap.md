# Ember feature gap and backlog

Research date: 2026-10-22. Sources: Ember's public minified client bundle (v2.emberdesign.net), its English
UI dictionary, `/colors.json` and one `/embroidery_block_fonts/*.json` (structure only). This document describes
Ember's behaviour in our own words. It does not copy Ember code or data. Threadroom status comes from
README.md, PLAN.md, TODO.md, `app/studio.tsx`, `app/layers-panel.tsx` and `lib/`.

Not repeated here, because other docs already cover them: fills, fill settings, underlays, gradient, Edit angles,
row and tile patterns, run types, drawing mechanics, splines and Blocks. See `docs/ember-fill-spec.md`,
`docs/ember-patterns-spec.md` and `docs/ember-drawing-spec.md`.

Out of scope: cloud saving, accounts, community, publishing and sharing, payments, Ember Link/Bridge (sending to
the machine), and every machine format except PES.

**File key.** `page` = `app/editor/[authorId]/[projectId]/page-99122af94fe2a2da.js` (the editor). `2723`,
`3865`, `5729` and `6407` are `c/<n>-*.js` chunks. `3865` holds the editor state machine (xstate handlers),
`2723` the command factory (`K0` static methods), `5729` the shape classes, and `6407` the i18n strings and
plan features. Offsets are character offsets into `page`, useful because the file is a single line.

**Free / Pro.** `page` `r6()` gates five actions behind a subscription: `click-to-stitch`, `auto-digitize-all`,
`convert-to-redwork`, `edit-gradient` and `along-path`. The plan list in `6407` also marks these as Pro:
custom font upload, version history, cloud auto-save, 34 fills (the free plan has 7), 7 run types (the free
plan has 3), unlimited projects and commercial use. Everything else listed below is free, including the 23
built-in satin fonts and the pixel-art editor.

**Units.** Ember's canvas units are probably 0.1 mm, the native PES unit. The bundle doesn't state this; it is
inferred from the duplicate offset and the font sizes. Values below marked "units" are canvas units.

---

## 1. Feature table

Status: **yes** = equivalent exists · **partial** = some of it · **no** = missing · **n/a** = out of scope or
not applicable.

### 1.1 Keyboard shortcuts (`page` `ll` action-key table at ~170.5k, `lb` keymap, `lv` key-up map)

| Key | Ember action | Threadroom |
|---|---|---|
| S | Select tool | yes (S / V) |
| M | Measure tool | yes |
| T | Text tool | yes |
| 1 / 2 / 3 / 4 | Open shape / closed shape / Blocks / freehand ("pen") | yes |
| 5 / 6 | Circle / rectangle, directly (no flyout) | partial: R opens the Shapes flyout |
| Space (hold) | Pan; released on key-up | yes |
| Ctrl/⌘ Z, Ctrl/⌘ ⇧ Z, Ctrl/⌘ Y | Undo, redo, redo | partial: Ctrl+Y is missing |
| Ctrl/⌘ A | Select every object and image that is not locked | **no** |
| Ctrl/⌘ C / X / V | Copy / cut / paste. Uses the system clipboard and real `copy`/`cut`/`paste` DOM events | **no** |
| Ctrl/⌘ D | Duplicate | **no** |
| Ctrl/⌘ L | Toggle lock on the selection | **no** |
| Ctrl/⌘ G, Ctrl/⌘ ⇧ G | Group, ungroup | yes |
| Ctrl/⌘ S | Save to the cloud | n/a (Threadroom autosaves locally) |
| Arrow keys | Nudge the selected objects one unit per key event (auto-repeat continues). The whole nudge is one undo step, committed on key-up (`3865` `handleNudge` / `handleFinishNudge`) | **no** (arrows only nudge a focused point) |
| Enter | Complete the current mode (draw, knife, cut holes, map to path…). Ignored in Edit angles and the flow-field editor | yes for drawing and point editing |
| Backspace / Delete | Delete the selection, or the last draft point while drawing | yes |
| R | Reshape (point editing) | partial: Edit points by double-click or button. In Threadroom R opens Shapes |
| H | Cut holes | **no** |
| K | Knife | **no** |
| E | Start/end editing | partial: entry/exit handles are always visible on the selection |
| A | Edit angles | **no** (see the fill spec) |
| G | Edit gradient | **no** (see the fill spec) |
| F | Edit the streamline flow field | **no** (see the patterns spec) |
| P | Map to path | yes via object settings; P remains the Points tool |
| W | Convert to redwork | **no** |
| 7 | Click to stitch (one image selected) | yes (selected or top visible image) |
| 8 | Auto digitize (one image selected) | partial (Auto trace button) |

Single-letter action keys work only in Select mode with a selection, only when the action is available
(`le()`), and never while viewing an old version. A paywalled key opens the upgrade modal instead. Shortcuts
are ignored while focus is in an INPUT, a TEXTAREA or an editable element, or while a modal is open
(`documentElement.dataset.editorModalOpen`).

### 1.2 Context menus (`page` `e7` object menu at ~44k, `th` empty-canvas menu at ~50k, `tp` container)

| Ember item | Behaviour | Threadroom |
|---|---|---|
| Delete (⌫/Del) | Delete the selection | yes (panel and key) |
| Copy / Cut | Serialise the selection as `EMBER_SHAPES_DATA:` + base64 JSON (`format:"ember-shapes-v2"`, with objects, group parents, group names, group start/end points and map-to-path bindings; `tc`/`td`/`tu`). On paste every object gets a new id and group ids are remapped, so a paste never collides with the original | **no** |
| Paste (empty canvas) | Reads the clipboard. An image becomes a new uploaded image; Ember text data is pasted at its original coordinates (no offset) | **no** |
| Selected colors ▸ | Submenu of swatches for the colours used in the design; a click recolours the selection | **no** |
| Show / Hide needle points | Toggles needle-penetration dots for the selection | yes via Setup and playback overlay controls |
| Hide / Show (all) | "Hidden" means transparency 0, and it is still exported | yes (layer eye) |
| Lock / Unlock (n) | Locked objects can't be selected by marquee or Ctrl+A, moved, resized or edited; most actions are disabled | yes (layer padlock, Ctrl/⌘ L) |
| Reshape | Enter point editing | yes (Edit points) |
| Cut holes | Only for one fill object (see 1.4) | **no** |
| Move up / down / first / last (n) | Change the sew order | yes (layers footer) |
| Sort by selected (n ≥ 2) | Reorder the selected objects (or their whole groups) into the order they were clicked, placed together at the position of the first one in that order | **no** |
| Transparency slider (0–1, step 0.01) | Display opacity per object; 0 also sets hidden | **no** |
| Select all / Unlock all / Toggle grid / grid snap on-off / object snap on-off | Empty-canvas menu | **no** |

### 1.3 Selection transform (`page` resize handles ~196–200k, `RotateHandle` ~203k, size panel ~594–599k)

| Feature | Ember behaviour (precise enough to implement) | Threadroom |
|---|---|---|
| Bounding box with 8 resize handles | Round dots are drawn only at the corners; the edge midpoints are invisible hit strips along each edge. Dragging scales the selection about the **opposite** handle. **Shift** scales about the centre (pressing or releasing Shift mid-drag re-applies at once). **Ctrl/⌘** inverts the current aspect-lock setting while dragging. With aspect lock on a corner, scaleX = scaleY = the mean of the two. Corner dots become rounded squares when the aspect is locked. One undo step is recorded on release. | **no** (only the whole-design width field in Info) |
| Rotate handle | A stalk 15 px (screen) above the top-centre ends in a white circle (hit radius 16 px). Rotation is free (no snap) about the selection centre. A degree readout follows the cursor. One command is recorded on release. | **no** |
| Size panel W / H | Number inputs in in/cm (2 decimals, step 0.1). With the aspect lock on, editing one value derives the other. A lock toggle shows "Lock / Unlock aspect ratio". Disabled when a single locked object is selected. | **no** (per object) |
| Position panel X / Y | Collapsible row. Moves the selection so its bounding-box top-left lands on the typed value. | **no** |
| Flip horizontal / vertical | Mirror the selection about its own bounding box (`nZ.$Y` / `nZ.Fy` commands) | **no** |
| Duplicate | Copy the selection, offset the copy by +10 units in x and y (about 1 mm), paste it and select it (`lt()`) | **no** |
| Lock shape | Toggles `locked` on every selected object | **no** |
| Group / ungroup | Nested groups are supported (`groupParents`) | partial: one level, by design |

### 1.4 Floating object toolbar (`page` `al` at ~235k; availability in `le()`, dispatch in `lr()`)

| Tool | Ember behaviour | Free/Pro | Threadroom |
|---|---|---|---|
| Reshape (R) | "Drag points to edit. Click the path to add points. Delete removes selected points." | free | yes |
| Cut holes (H) | One unlocked fill object. You draw closed shapes (left click = corner, right/double click = curve point), and each finished shape becomes a hole in the fill (`K0.addHole`, class `ep`). Holes get their own small menu ("Delete hole"). The toolbar hides resize handles and control points while this mode is active. | free | **no**. Traced regions keep holes as extra `rings`, but you can't add, edit or delete holes on curve objects |
| Knife (K) | One or more unlocked shapes. You draw a cut path (corner/curve clicks; Ctrl/⌘ snaps). On Enter the path is sampled at 7.5 units, and each selected shape it crosses is split into separate shapes (`3865` `handleCompleteKnife`, command `sp`, `didCut`). | free | **no** |
| Start/end (E) | Set the start and end points for one fill, Blocks or outline object, or for a whole group (`groupRouteEnds`). | free | partial: per object only, no group ends |
| Edit angles (A) / Edit gradient (G) / Edit flow field (F) | See `docs/ember-fill-spec.md` §2.3 and §2.8 and `docs/ember-patterns-spec.md` | gradient Pro | no |
| Map to path (P) | Select the shapes and click an open path (hover highlights valid paths: open, ≥ 2 points, not text, not letters). Copies of the selection are placed along the path. **Repeat**: *Fill* ("Pack as many as fit and stretch across the path") or *Count* ("Place an exact number of repeats", min 1). **Rotate** ("Rotate objects to follow the path tangent"), **Reverse**, **Hide path** ("Keep the path for layout but hide it from stitches and the sequencer"). Start, end and mid handles are draggable; Accept or Reject. The result is a live binding (`pathAlongBindings`), so editing the path or the prototype re-lays the copies. Edit map to path / Detach from path. | **Pro** | yes: object settings Map to path; Fill / Count / Spacing, rotate, reverse, offset, centre alignment, hidden guide, live group binding and Unlink. Preview and numeric controls; no draggable layout handles |
| Convert to redwork (W) | ≥ 1 outline object (or existing redwork plus more). Merges them into one `redwork` object that keeps its sources, with a stitch length (default 2 mm). Stitches come from one route over all the source lines that sews each line twice with no trims (`5729` module 56547, class `c`, `canConvertSelection`). Resizing transforms the sources. | **Pro** | **no** (in TODO "More stitch types") |
| Break apart redwork | Restores the source outline objects | **Pro** | **no** |
| Flatten | ≥ 2 unlocked fill objects. For every pair whose outlines overlap by ≥ 1 unit², taken in sew order, the **later** object's outline is added as a hole in the **earlier** one, so the lower fill no longer sews under the upper one. One undo step ("Flatten N holes into shape"; `2723` class `ec`, planner `lJ` in module 43408, which uses polygon-clipping `intersection`). | free | **no** |
| Split SVG | One SVG image. Converts it into native shapes: fills become fill objects, strokes become outline objects, holes are flattened into the fills, and stroke gaps under 1 mm are joined (`rA(image,{flattenHoles:true, joinStrokeGapMm:1})`). | free | yes: native shapes (one group) or a reference image to trace; fills/holes, running/satin strokes, basic CSS and transforms |
| Click to stitch (7) | One image. Traces it into candidate regions (raster images via server `/api/vectorize`, SVG directly), then shows them. "Click on a region to convert it to stitches. Drag to select multiple regions at once." Converted regions use the current run/fill template (`rQ`). | **Pro** | yes: Click to stitch (7) flood-fills the clicked colour (tolerance slider) with a hover preview; click adds a Tatami fill, Shift-click a running outline. No drag-select of several regions |
| Auto digitize (8) | One image. Traces it (`rY`) and then: simplifies with RDP ε = clamp(0.0028 × max(w,h), 0.32, 2.5) and a touch pad of clamp(0.003 × max, 1.25, 2.5) (`rV`); filled paths become fills (with the default fill applied) and strokes become outlines; regions are grouped by colour, colour groups sorted by **hue**, and each group is ordered nearest-neighbour from its top-left centroid; the largest region with holes in a non-dominant colour keeps only the holes it needs. All regions are added in one undo step. | **Pro** | yes for ordering: dominant area first, hue colour groups, small dark detail colours last, nearest-centroid ordering and physical RDP tolerance; tracing remains an 80 px raster; only the new regions are ordered and appended after existing objects; Click to stitch keeps click order |

### 1.5 Text (`page` `ib`, `iy`, `iN`, `iC` at ~229k; text panel ~231–235k)

| Feature | Ember | Free/Pro | Threadroom |
|---|---|---|---|
| Built-in embroidery fonts | 23 fonts (Algerian, Arial Black, Blenda, Calibri, Classic Block, College, Comic Sans, Creative, Elephant, Favorite, Garamond, Georgia Italic, Hobo, Magneto, Old English, Pacifico, PES, Schola, Seamaiden, Singular, Streetwear, Times Roman, Verdana Italic). Each is a JSON file of metrics (ascent, descent, emHeight, capHeight, spaceAdvance) and glyphs of `{advance, strokes}`. Each stroke is a list of points that alternate between the two rails of a **two-rail satin block** (a quad strip). "Letters insert as editable satin blocks (one group per character)." Algerian and College are uppercase-only, so lowercase input maps to capitals. | free | **no**. TTF/OTF outlines are filled or bordered; TODO §3 asks for satin fonts for 4–6 mm text |
| Sizes | 0.25 in, 0.5 in, 0.75 in (em height). The result can be resized freely afterwards. | free | yes (letter height in mm, continuous) |
| TTF/OTF/TTC fonts | Uploaded fonts insert as outline-based shapes ("Results will vary…"). The supported special characters are listed. | Pro (upload) | yes (1,972 Google Fonts plus upload; better than Ember) |
| Group letters | *Grouped* (one shape) or *Individual* (a shape per letter) | free | partial: Convert to shapes |
| Text recovery | Rebuilds text from selected letter shapes (sorted by x, space added for gaps > 0.45 × mean width) | free | n/a (Threadroom text stays editable) |

### 1.6 Sequencer and side panels (`page` `tE` sections at ~73k, `t0` tab rail)

| Panel | Ember | Threadroom |
|---|---|---|
| Sequencer: Shapes | A sortable list of objects (drag, multi-select, groups). Each row has a sequence-position chip; clicking it lets you type a number to move the row there (`eP`, clamped 1…n). | yes (Layers). Typed position is missing |
| Sequencer: Colors | Consecutive objects with the same thread (by colour id) are merged into one row with a layered 160 × 160 preview (`eF`). Dragging a row moves the whole run; a click selects the run (Shift for a range). It exposes colour changes at a glance. | **no** |
| Sequencer: Images | List of reference images: upload, reorder, select. Per-image hide, lock and transparency come from the context menu. Images can be resized and rotated with the same handles as shapes. | yes: Artwork-tab image list with thumbnails, reorder, hide, lock, delete, per-image opacity; canvas select, move, scale and rotate. Not yet: right-click image menu |
| Colors (palette) | Tabs **All** (search across every brand), **Brands** (accordion of 78 catalogues with per-brand search: Madeira, Sulky, Isacord-like polyesters, Robison-Anton, Gunold, Brother Country (61), "Default" (62)…), **Selected** (threads of the selection). Each thread has brand, code, name and RGB, and a click recolours the selection. Data: `/colors.json`. There is **no** nearest-colour matching in the UI. | **no** (colour input, 6-swatch palette, image eyedropper) |
| Visibility | Units **in / cm**; **Grid size** (min 0.1 cm / 0.05 in); **Show grid**; **Snap to grid** ("Snaps drags to the fine grid") with **Fine grid** n subdivisions per cell; **Snap to objects** ("Aligns to other shapes' edges and centers"); **Show rulers**; **Show cursor position** ("Live readout of the pointer"); overlays **Show jumps**, **Show trims** (red scissors marks), **Show tie-ons** (green markers for tie-on and tie-off), **Show selected needle points** (`nu`). | yes: persisted display units, configurable grid/snaps/rulers/cursor, independent jumps, scissors trims, tie-in/off marks and selected penetration dots in Setup and playback |
| Object snapping detail | While dragging, for each axis the moving box's edges and centre are compared with every other visible, non-reference object's left/centre/right (or top/centre/bottom), plus grid lines within ±2 cells. Candidates within the threshold are scored: object snaps beat grid snaps, then the smaller distance wins, then centre-to-centre. When the moving box lies inside a target, edge-to-centre matches are skipped and the centre threshold is 2.5×. Guides are magenta lines (0xe11d8f) spanning both boxes, plus a crosshair when the object is centred in another (`au`, `lq`). | **no** |
| Info | Project name, dimensions, shape count, colour changes, total colours, stitch count, **Open design summary**. No sewing time. | yes, mostly (size, stitches, thread changes, jumps/trims, engine). Shape and colour counts are missing |
| Version history | Every cloud save is a version: view (read-only), "Make current" | n/a (cloud, Pro). Local undo/redo only |

### 1.7 Design summary, worksheet, export (`page` ~489k and ~540–560k)

| Feature | Ember | Threadroom |
|---|---|---|
| Design summary: Overview | Stitch preview of the complete design, or of one step; **Thread preparation** list (swatch, name, brand · catalogue code or "Custom thread · hex", and which steps use it); a step list in sew order. Reads back the exported file ("Read from this PES file"). | **no** (TODO "Production worksheet") |
| Design summary: Diagnostics | Advisory analysis of the export plan: short stitches (threshold 0.1–2 mm, default list), mean/longest stitch, stationary needles, trims/jumps and total jump distance, a stitch-length histogram, short-stitch regions clustered on a physical grid (top 20, click to magnify), a local needle-density heat map (penetrations/mm², chosen radius), and a step breakdown ranked by short stitches, trims or jumps. "Exclude export ties from length checks" option. | partial: the Design check covers short and long stitches, density, trims and travel with fixes; histogram, short-stitch counts and density heat map available in Info/timeline |
| Worksheet PDF | Download with paper size Letter/A4, "Single Sheet" option and "Include Diagnostics" | **no** |
| Export dialog | Filename, format, **Origin point** (9 positions: "Sets this point as (0, 0) in the exported file") | partial: PES export. No filename field or origin choice |
| Export image | PNG of the realistic render ("Open the realistic view to generate a preview first") | yes: Project → Export image, scale and fabric/transparency options |
| Upload embroidery | Open an existing machine file in the editor to modify it | partial: PES/PEC preview only |
| Measurements | Editor menu unit switch in/cm | yes: Setup display units mm/cm/in; geometry stays in mm |
| Measure tool | Magenta arrow; the readout shows mm, inches and the **angle** in degrees | yes: display-unit length, clockwise degrees, secondary inches; Shift snaps to 15° |

### 1.8 Playback, hoop, machine, other

| Feature | Ember | Threadroom |
|---|---|---|
| Playback speed | A button cycles 0.25×, 0.5×, 1×, 4×, 8×, 16× ("Speed: Nx") | yes (0.25×–16× selector, 1× = 450 stitches/s) |
| Hoop / machine settings | None in the editor; the machine matters only when sending ("Design is too large for this machine") | **yes** (PR1X hoops, fabric, ties, trims; ahead of Ember) |
| Estimated sewing time | None | **no** (TODO) |
| Pixel art editor | A separate 32 × 32 grid painter with a small palette; the result opens in the editor to stitch | yes: Artwork modal imports an image or uses the reference; configurable grid, quantisation, optional Brother matching, painting/erasing and cross fills per colour |
| Paste image | A clipboard image becomes a reference image | **no** |

---

## 2. Prioritised backlog

Ranked by value to a beginner digitizing for a **Brother PR1X** (PES only, desktop only), divided by effort.
Sizes: **S** ≤ 1 day · **M** 2–4 days · **L** 1–2 weeks. Each task must work end to end like the TODO says:
UI, `validProject`, compiler payload (if geometry changes), PES and SVG export, undo/redo, autosave,
tests and README.

1. **Object transform core + numeric size/position + flip** · S–M · no dependencies
   *Value:* beginners constantly need "make this 40 mm wide" or a mirrored copy; today only the whole design
   can be resized. *Scope:* `lib/transform.ts` with `translate`, `scale(ids, sx, sy, origin)`,
   `rotate(ids, deg, origin)` and `flip(ids, axis)`. These act on `curve.points`, `rings`, `entry/exit`, text
   (size/position/rotation) and `angle` (fill angle rotates with the object; flip mirrors it). Satin width and
   spacing **don't** scale; warn if width leaves 0.5–10 mm. Settings-panel row: W / H (mm, 1 decimal) with an
   aspect lock, plus a collapsible X / Y (bounding-box top-left). Flip H/V buttons. Clamp to the hoop the way
   Shapes does. One undo step per edit.

2. **Duplicate, copy/cut/paste, select all** · S · depends on 1 (translate)
   *Value:* repeating motifs (hearts, stars, name decorations) without redrawing. *Scope:* Ctrl/⌘ D duplicates
   +1 mm/+1 mm and selects the copy. Ctrl/⌘ C/X/V use the real `copy`/`cut`/`paste` events with a
   `THREADROOM_OBJECTS:` text payload (objects + groups, new UUIDs, group ids remapped). Paste inserts after the
   last selected object (sew order) at the same coordinates, or +1 mm if the originals still overlap.
   Ctrl/⌘ A selects every unlocked object. Ignore all of these while focus is in inputs.

3. **Arrow-key nudge of objects** · S · depends on 1
   *Value:* precise placement without dragging. *Scope:* in Select with a selection and no focused point,
   arrows move 0.1 mm (Shift 1 mm). Auto-repeat accumulates and a single undo step is recorded on key-up, as in
   Ember. Clamp to the hoop.

4. **Lock objects** · S · no dependencies (pairs with 2 and 6)
   *Value:* protects finished parts and the background while working on top. *Scope:* `object.locked?: boolean`
   (validated, saved, in SVG metadata). Locked objects are not hit-tested on the canvas or included by Ctrl+A,
   and can't be moved, transformed, deleted or point-edited; they can still be selected from Layers (the
   settings panel shows read-only with an Unlock button). Lock icon in the layer row; Ctrl/⌘ L toggles.
   Still compiled and exported.

5. **Brother thread catalogue with nearest match** · M · no dependencies
   *Value:* the PR1X screen and thread stand use Brother numbers; picking "Brother 209 Pink" instead of a hex
   value is the single biggest beginner colour win. *Scope:* bundle the 64-colour Brother PEC table (name +
   index; pystitch's `EmbThreadPec` is the open-source source; do **not** copy Ember's `colors.json`).
   Thread picker tabs: *Brother*, *Design colours* (used threads, one-click recolour of the selection, like
   Ember's "Selected colors"), *Custom* (current input + eyedropper). Each custom or traced colour shows
   "≈ Brother NNN Name" (CIEDE2000 in Lab) with a one-click snap. Add `object.thread?: {brand, code, name}`
   and pass it to the compiler so PES v6 thread entries carry the catalogue code and name. Option "Snap all
   colours to Brother" for traced designs. Madeira and Isacord catalogues are a follow-up if open data exists.

6. **Canvas context menu** · S · depends on 2 and 4 (it uses their actions)
   *Value:* discoverability; beginners right-click. *Scope:* in the Select tool, a right-click without drag
   (right-drag stays pan; shape tools keep right-click = curve point) on an object opens: Delete, Copy, Cut,
   Duplicate, Flip H/V, Design colours ▸, Hide, Lock, Edit points, Group/Ungroup, Sew first/earlier/later/last,
   Sort by selection order (see 8). On empty canvas: Paste, Select all, Unlock all, Show grid, Snap toggles
   (after 10). Shortcut hints shown. Keyboard-accessible (Shift+F10 / Menu key), translated TR/EN.

7. **Production worksheet with estimated sewing time** · M · better after 5
   *Value:* answers "which threads, in what order, how long" before stitching on baby clothes. *Scope:* an Info
   button opens a printable page (print CSS, A4/Letter, no PDF library): design size, hoop, fabric + stabiliser,
   stitch count, colour changes, trims, a thread list in sew order (swatch, Brother number/name, objects,
   stitches per colour), a small preview of each colour step from the compiled commands, and the design-check
   summary. Sewing time = stitches ÷ speed (user setting, default 600 spm, PR1X max 1000) + colour changes ×
   30 s + trims × 3 s, shown as an estimate with the assumptions spelled out. Data comes from the compile
   that export uses.

8. **Colour runs view and "sort by selection order"** · M · no dependencies (5 improves the labels)
   *Value:* fewer thread changes, the most common beginner inefficiency; complements the "Same colour sewn
   twice" check. *Scope:* a Layers toggle *Objects / Colours*. Colours merges consecutive objects with the
   same thread into one row (swatch, count, stitches, thread name). Dragging a run moves its objects as a block
   with `moveObjects`, and a click selects the run. Layer rows get a sequence-number chip you can click to type
   a position. "Sort by selection order": the selected objects (whole groups when partly selected) are placed
   together at the first one's position in click order. The automatic colour sort stays the separate TODO item.

9. **Selection box: resize and rotate handles** · M · depends on 1
   *Value:* direct manipulation, which beginners expect from every drawing app. *Scope:* a bounding box around
   the selection (not while drawing or point editing). Corner dots and invisible edge strips; drag scales about
   the opposite handle; Shift about the centre; aspect locked by default on corners, with Ctrl/⌘ inverting the
   lock while dragging; a rotate stalk above the top centre. Unlike Ember, Shift snaps rotation to 15°
   (consistent with the drawing snap). Live preview of the faint shape, one undo step on release, mm and degree
   readout. Text scales its height, and hoop clamping applies.

10. **Grid, snapping, rulers, cursor readout** · M · depends on 1 (shares the drag code)
    *Value:* centred, aligned names and motifs; "is this centred in the hoop?" *Scope:* Setup or Visibility
    section: grid size (mm), show grid, snap to grid with fine subdivisions, snap to objects (edges and centres
    of other visible objects **and the hoop centre lines**, using Ember's scoring order: object > grid, then
    distance, then centre-centre, with a 2.5× centre threshold inside a target), magenta guide lines, mm rulers
    on the top and left edges, live cursor X/Y in mm. Applies to object drags, nudges (optional) and drawing
    clicks. Saved per browser, not per project.

11. **Playback speed** · S · no dependencies
    *Value:* long designs are slow to review at a fixed 450 stitches/s. *Scope:* a speed button in the playback
    bar cycling 0.25×, 0.5×, 1×, 4×, 8×, 16× (1× = the current rate), remembered per browser.

12. **Flatten overlaps (remove hidden fill underneath)** · M · depends on 13 (holes on curve objects) and a
    polygon clipper
    *Value:* traced and layered designs stack fills, which causes density warnings, stiff patches and needle
    breaks on baby clothes. One click fixes it. *Scope:* for ≥ 2 selected fills, in sew order, for each pair
    whose overlap is ≥ 0.1 mm², add the later object's outline as a hole in the earlier one, inset by a
    configurable overlap (default 0.4 mm, so the edges still interlock; Ember uses 0). One undo step. Add a
    design-check fix button "Flatten overlaps" on the density warning. Needs a polygon clipper:
    `polygon-clipping` (MIT, which Ember also uses) in the browser, or hand-written Weiler–Atherton for simple
    polygons.

13. **Holes on curve objects + Cut holes tool** · M · no dependencies
    *Value:* donut shapes, eyes and letters with counters, drawn by hand. It is a prerequisite for 12 and 14.
    *Scope:* model `curve.holes?: {points, corners, spline}[]`, included in `geometryPayload`, validation,
    transforms and SVG. The Cut holes mode (H or the toolbar) is available for one fill: draw a closed shape with
    the normal drawing mechanics, and Enter adds it as a hole. Holes have their own point editing and a
    Delete-hole action. The compiler already handles holes for traced rings, so reuse that path.

14. **Knife** · M · depends on 13 and the clipper from 12
    *Value:* split a traced blob into parts with different stitch angles or colours. *Scope:* K mode: draw an
    open cut path (corner/curve clicks, Ctrl/⌘ 15° snap), Enter splits every selected fill it fully crosses
    into separate objects that inherit the settings, named "Name 1/2…", placed next to each other in sew order.
    Lines are split at intersections.

15. **Auto-trace ordering like Ember** — **done** (2026-10-22) · S · no dependencies
    *Value:* fewer trims and colour changes straight after tracing (the traced bear still has 185 trims).
    *Scope:* after tracing, order regions by colour group (hue order, dominant/background colour first) and,
    within a group, nearest-neighbour from the top-left centroid. Add the size-proportional simplification
    tolerance (0.0028 × max dimension, clamped to 0.32–2.5 units, converted to mm). Measure the trims on the bear
    before and after.
    *Implemented:* `lib/trace-order.ts`, pure raster entry point `traceRaster`. Headless benchmark on
    `public/bear-reference.png`: 72 × 80 raster, 60 × 66.86 mm centred, 5 colours, background removed,
    woven defaults. Old RGB-sort versus new order: **51 → 52 trims**, **741.5 → 571.4 mm jumps**,
    **3 → 3 colour changes**, **5772 → 5685 stitches** (32 regions, 968 vertices both). Raster resized
    with macOS `sips`, compiled through `geometryPayload` and Python. Centroid ordering improves travel
    here; it does not guarantee fewer trims because the fill planner also chooses routes inside holes.

16. **Click to stitch (pick regions after tracing)** · M · depends on 15
    **Implemented differently** (no dependency on 15): a click flood-fills the clicked colour of the image
    (tolerance slider, hover preview) and adds it at once as a fill, Shift-click as an outline. Marquee
    multi-select of candidate regions is still open.
    *Value:* beginners usually want only part of a picture (no background, no tiny specks). *Scope:* the trace
    produces *candidate* regions drawn as a hover-highlighted overlay. Click toggles a region and drag-marquee
    adds several; Enter converts them with the current stitch template (style chosen in the banner); Escape
    cancels. Regions not converted are discarded.

17. **Native SVG import ("Split SVG") — done** · M · no dependencies (benefits from 13)
    *Value:* many beginner files are SVG cut files; tracing them through the 80 px raster loses precision.
    *Scope:* parse paths, basic shapes and transforms (no external library if possible; flatten béziers to
    curve points marked as corners or smooth), scale to mm by viewBox. Filled paths become fills with holes and
    stroked paths become running outlines; join stroke gaps < 1 mm; colours become threads (5's nearest Brother
    match offered).

18. **Overlay toggles: trims, ties, needle points** — **done** (2026-10-22) · S · no dependencies
    *Value:* see exactly where the machine cuts and ties. *Scope:* in the Travel legend, independent toggles
    for jumps, trim markers (scissors), tie-in/tie-off markers and needle-penetration dots for the selected
    objects, all from the compiled commands.
    *Implemented:* three batched SVG paths; separate persisted switches in Setup and playback. Python
    tags actual lock stitches with `tie: in/off`; no inferred ties on untrimmed connectors.

19. **Measure angle + inches** — **done** (2026-10-22) · S · no dependencies
    *Scope:* the measure readout adds the angle (0° = +x, clockwise like the stitch angle) so it can be copied
    into the fill angle, plus inches in small text.
    *Implemented:* length follows mm/cm/in view settings, degrees are clockwise from +x in [0,360),
    Shift snaps the endpoint to 15° while keeping its distance; a secondary inches line appears in mm/cm.

20. **Export PNG of the realistic view — done** · S · no dependencies
    *Value:* a local mock-up to show family before stitching (no sharing service). *Scope:* render the thread
    canvas at 300 dpi of the design bounds + 5 mm (optionally with the fabric texture) and download it.

21. **Reference images panel** · M · no dependencies · **implemented** (as `project.images[]`; clipboard paste still open)
    *Value:* tracing from several pictures, or a photo of the garment under the design for placement.
    *Scope:* `project.artworks[]` (migrated from `artwork`), each with opacity, hidden, locked, position, size and
    rotation; a list in the Artwork tab with reorder; paste an image from the clipboard; the eyedropper samples
    the top visible image.

22. **Redwork (convert outlines to a no-trim double pass)** · L · depends on 13 for closed sources
    *Value:* a classic beginner style that is clean on baby items, already in the TODO. *Scope:* a `redwork`
    object kind holding source curves and a stitch length (default 2 mm). The compiler builds the line graph,
    splits at intersections and endpoints, doubles every edge and walks an Euler circuit starting near the
    previous exit, joining components with the shortest connectors (trim only above the trim threshold). Break
    apart restores the sources. The design check flags pieces that can't be connected.

23. **Satin block fonts for small lettering** · L · depends on two-rail Blocks (drawing spec step 8)
    *Value:* TODO §3; names at 5–8 mm on baby clothes. *Scope:* the font format is metrics + glyph strokes as
    quad-strip rail pairs (the same idea as Ember, but Threadroom's own digitised data, because Ember's font JSON
    must not be copied). Start with one block alphabet (A–Z, a–z, 0–9, basic punctuation) digitised in Threadroom
    itself; letters insert as one group per character of editable two-rail satin.

24. **Map to path** — **done** (2026-10-22) · L · depends on 1 and 2
    *Value:* borders of repeated hearts or stars around a name. *Scope:* select a prototype plus an open path;
    modes Fill (as many as fit, spacing stretched) and Count (exact N, ≥ 1), rotate to tangent, reverse, hide path
    (kept but not stitched or listed). Live binding re-lays copies when the path changes; Detach makes them
    ordinary objects.
    *Implemented:* settings panel with preview/apply, Fill / Count / fixed gap, rotate, reverse,
    start offset and centre alignment. `groups[].pathBinding` stores prototypes, member IDs and settings;
    commit and drag boundaries re-layout atomically. Select Edit guide path to reveal a hidden guide for
    point edits. Unlink, deleting the guide, or breaking group membership detaches current copies.
    Clipboard/duplicate copies are ordinary groups, avoiding bindings to an absent guide. Standard 80-object,
    12,000-point and hoop limits apply; rejected layouts leave the prior project intact.

25. **Needle-density heat map in the design check — done** · M · no dependencies
    *Value:* shows *where* dense spots are. *Scope:* overlay coloured by penetrations/mm² (radius 1.5 mm,
    fixed scale per design) from the compiled stitches, toggled from the density warning.

26. **Pixel art to cross stitch** — **done** (2026-10-22) · M · low priority
    *Scope:* a 32 × 32 (configurable) painter in a modal, with the palette from 5; the result becomes cross-stitch
    fills per colour on the existing cross-stitch grid.
    *Implemented:* Artwork → Pixel art to cross stitch imports PNG/JPEG/WebP or uses the reference.
    Default 32 × 32, configurable 1–96 rows/columns, 1–32 colours, 1–20 mm cells in 0.5 mm steps.
    Nearest sampling/colour quantisation (no dithering), alpha-aware preview, optional Brother matching,
    paint/erase, and one `cross` object per used colour. Shared edges are cancelled into rings with holes;
    all colours share the same physical lattice. Existing complexity and hoop limits are checked before
    the single undo step. A coincident colour landing explicitly retains its PEC trim.

Not planned: version history and auto-save to the cloud, publishing, Ember Link/Bridge transfer, other
machine formats, and the export origin-point choice (the PR1X positions PES designs by their centre).
Local mm/cm/in display units are supported; geometry stays in mm.

### Dependency summary

```
1 transform core ─┬─ 2 duplicate/clipboard ─┬─ 6 context menu
                  ├─ 3 nudge                └─ 24 map to path
                  ├─ 9 handles
                  └─ 10 grid/snap
4 lock ── 6
5 Brother threads ── 7 worksheet, 17 SVG colours, 26 pixel art
13 holes ─┬─ 12 flatten (+ clipper) ── 14 knife
          └─ 22 redwork (closed sources)
15 trace ordering ── 16 click to stitch
two-rail Blocks ── 23 satin fonts
```
