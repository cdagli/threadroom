---
name: embroidery-digitizing
description: Hand-digitise a reference image into an editable, sewable Threadroom embroidery design through the editor's WebMCP tools — trace the silhouette, build layered fills and line details, choose threads, order the sewing, add artistic stitch work, and review visual fidelity and stitch issues. Can first generate digitise-ready artwork from a text description with Codex imagegen when the user asks. Use when the user asks to digitise, trace, "turn this image into embroidery", or create an embroidery design from a description in Threadroom, or to clean up a design's issues, thread colours or sew order.
---

# Embroidery digitising in Threadroom

Threadroom (`npm run dev`, http://localhost:3000) exposes its editor as WebMCP tools on
`document.modelContext`. This skill is the process that produced a clean, 0-warning, 7-colour rabbit from a
photo-like PNG. Read `references/lessons.md` before starting; it explains *why* each step exists.

## Calling the tools

- **Native WebMCP client:** call the tools directly.
- **agent-browser:** use `scripts/webmcp-call.py --session SESSION TOOL --args @params.json --output result.json`.
  Read the tool schema first; the helper also handles large parameters and image exports.
- **Claude in Chrome:** run `scripts/webmcp-bridge.js` once with `javascript_tool`, then `await __J('tool', {...})`.
  The bridge stores itself in `localStorage`, so after an HMR reload run
  `eval(localStorage.getItem('__claude_bridge')); await __setup()`.
- Keep each `javascript_tool` call short (< ~30 s). Long loops or pixel scans freeze the renderer and time out.
- `javascript_tool` truncates results at about 1,000 characters. Return compact summaries, e.g. issue
  `code / object name / bounds`, not whole objects.
- HMR reloads wipe your own helpers too. Store them in `localStorage` the way the bridge stores itself
  (`__save` / `__load` for data).
- Keep ordered lists in arrays. A JS object keyed by Brother code reorders numeric keys and silently
  scrambles a `set_sew_order` list.
- Load `scripts/path-helpers.js` the same way for ellipse / mirror / paw-and-toe / retraced-line /
  fuzzy-edge / satin-crescent builders.
- **A background tab stalls the editor.** Chrome reports `visibilityState:'hidden'` and tool calls hang until
  the tab is painted, which shows up as 45 s CDP timeouts. The edits usually still apply, so check with
  `get_design` before retrying. Pattern: start work without awaiting it (`runQ([...])` that pushes results into
  `window.LOG`), take a small screenshot (`scale` 0.2) to wake the tab, then read `LOG`.
- Variables declared with `const` don't survive between `javascript_tool` calls. Put helpers on `window`.
- Budget the whole project: 80 objects and 12,000 ring points. Curve paths allow 200 anchors;
  manual `points` paths allow 2,000 input points. Sampled curves and satin rails can exhaust the
  compiler's point budget before the anchor count suggests it. Keep some headroom.
- `knife` needs `from` and `to` outside the shape. Extend the line 3–5 mm past both ends and retry with
  longer extensions.
- Object names show in the layers panel. Name objects in the user's UI language.

Keep the user informed: call `set_status` with one short sentence (in the UI language) at the start of each
phase below, and `tone:'done'` at the end.

**Preserve editability.** Keep independently editable parts as separate, named objects: one whisker
per path, separate eyes, highlights, spots and logical fur regions. Group related paths with `group`;
do not union, concatenate or convert distinct parts into one redwork object just to reduce trims.
Temporary cutter copies may be combined. Merge final parts only when the user explicitly requests it.

## No image yet? Generate one (on request)

If the user asks you to create the artwork from a description ("make a fox and digitise it"), generate it
first with Codex's `imagegen` skill, shaped for embroidery: transparent background, one centred subject,
4–6 flat colours mapped to Brother threads, bold shapes, no gradients or tiny details. Follow
`references/generate-artwork.md` (prompt template, Codex hand-off, checks, import), then continue with the
workflow below. Ask before generating if the user only described a design without asking for an image.

## Workflow

1. **Read the scene.** `get_reference` (once), `get_design` (image id, placement, objects). If the image
   sticks out of the hoop, move it inside with `update_reference_image`.
2. **Ask for the scope if unclear.** Auto-digitise (`auto_digitise`, `colours` 9–12) is a fast draft but
   blocky and full of holes; hand digitising (this skill) is the quality path.
3. **Look closely.** `view_reference` crops with a mm grid: whole image at ~8 px/mm, then face / ears / feet at
   20–35 px/mm. Write down coordinates for every feature before drawing anything.
4. **Trace the silhouette.** `trace_outline` (mode `alpha` for transparent PNGs, `colour` + point otherwise,
   `simplify` 0.3). Smooth obvious zig-zags by hand: they become short-stitch and thin-part warnings later.
5. **Plan layers and colours** (bottom → top) and one thread block per colour, e.g.
   base fill → inner details (pink) → light areas (beige) → shadows → accent fills + accent lines (rust) →
   dark details (eyes, nose, mouth, outline) → white highlights/whiskers. `sample_colors` + `find_threads`
   pick Brother codes; consolidate near-identical shades only when the visual match permits it.
6. **Build the base.** `add_path` closed with the silhouette, `kind:'fill'`, a fur-direction `angle`.
7. **Build edge regions with "extend and clip".** Any region touching the outline (ears, paws, sides,
   tail, shadows) is drawn *past* the silhouette and then clipped:
   `shape_operation intersect [region, silhouetteCopy]` (the first object in sew order keeps its settings;
   add the copy right after). Inner regions limited by another region (inner ear inside ear) intersect with
   that region's raw polygon too. Keep final editable parts separate, even when their colours match.
8. **Interior regions** (chest, muzzle, eyes, nose) as smooth closed paths.
9. **Cut the base cleanly** — don't rely on flatten for the base. Re-create the base from the silhouette,
   add temp copies of *all* raw region polygons, `union` them, `offset` +0.6 then −1.0 (closes slivers and
   leaves a 0.4 mm interlock), then `subtract [base, union]`. Include every region that sits on the base,
   including regions enclosed by other regions (a panel inside a border). Base left under a region stacks
   layers and triggers `dense`. Flatten only the inner pieces among themselves
   (`shape_operation flatten` with explicit ids).
10. **Lines.** Running/bean on top. Keep each whisker and other independently removable detail as its
    own path. A whisker may sew root → tip → root within that one object. Group related objects; use
    entry/exit and sew order to reduce travel. Use `length` ≈ 1.1 mm on short detail lines.
11. **Threads.** `update_objects` with `settings.threadCode` per colour group.
12. **Sew order.** `set_sew_order` with the full id list: colour blocks in layer order; inside a block,
    put neighbours next to each other and orient chains so one ends where the next starts.
13. **Stitch-art pass.** A trace isn't artwork yet. Before fixing warnings, add direction zones, fishbone
    leaves, fuzzy fur edges, rope cords and hand-stitch accents, then check coverage gaps. Follow
    `references/stitch-art.md`. Do it when the user wants a "nicer/cozier" result, or offer it.
14. **Check and fix** — `list_issues` (wait for stitches), fix failures and reduce advisories while
    preserving fidelity and editable parts; see `references/lessons.md`. Report unresolved advisories.
    `trimJump` 3–4 mm is a fine project setting; don't go higher to hide trims.
15. **Compare and look.** Compare the reference and stitch render at the same millimetre bounds, then
    inspect proportions, coverage, negative space, colours and fur direction. Zero check warnings do
    not establish fidelity. Hide the source image when done. For detailed matching, export safeguards
    and grouped-child verification, read [references/fidelity-and-editability.md](references/fidelity-and-editability.md).

## Rules of thumb

- Fills ≥ 2 mm wide and ≥ 6 mm²; satin 1–7 mm wide; anything smaller becomes a line or a satin dot.
- Never stack small fills on the base: cut them out (step 9) or the density check fires.
- Satin on tight closed curves (rings around eyes) makes short stitches; avoid or use a bean outline.
- Eyes and dots: ≥ 2.8 mm across → a small fill with `underlay:'none'` (≥ 6 mm²). Use a satin dot only
  below that; a 2.4 mm satin "dot" looks like a zigzag.
- Don't set satin `spacing` below the fabric default. It produced "invalid design", and once froze the
  renderer for 45 s inside a batch.
- Budget: ≤ 80 objects. Aim for colour changes = colours − 1, no jump > 30 mm and ≤ 25 trims while
  preserving the artwork and separate editable parts. Grouping organizes objects; it does not itself
  reduce cuts. Report remaining travel/cut advisories and their cost rather than merging parts or
  deleting requested detail to obtain a clean counter. The check limit cannot be changed by `update_project`.
- Edit in one script per phase, but keep the raw polygons (in `localStorage` or a file) so a phase can be
  rebuilt from scratch instead of patched — rebuilding was always faster than patching slivers.
