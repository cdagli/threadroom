---
name: embroidery-digitizing
description: Hand-digitise a reference image into a clean, sewable Threadroom embroidery design through the editor's WebMCP tools — trace the silhouette, build layered fills and line details, choose Brother threads, order the sewing, and clear every check warning. Can first generate digitise-ready artwork from a text description with Codex imagegen when the user asks. Use when the user asks to digitise, trace, "turn this image into embroidery", or create an embroidery design from a description in Threadroom, or to clean up a design's issues, thread colours or sew order.
---

# Embroidery digitising in Threadroom

Threadroom (`npm run dev`, http://localhost:3000) exposes its editor as WebMCP tools on
`document.modelContext`. This skill is the process that produced a clean, 0-warning, 7-colour rabbit from a
photo-like PNG. Read `references/lessons.md` before starting; it explains *why* each step exists.

## Calling the tools

- **Native WebMCP client:** call the tools directly.
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
- Load `scripts/path-helpers.js` the same way for ellipse / mirror / paw-and-toe / retraced-line builders.

Keep the user informed: call `set_status` with one short sentence (in the UI language) at the start of each
phase below, and `tone:'done'` at the end.

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
   pick Brother codes; merge near-identical shades (fewer colour changes beats a perfect match).
6. **Build the base.** `add_path` closed with the silhouette, `kind:'fill'`, a fur-direction `angle`.
7. **Build edge regions with "extend and clip".** Any region touching the outline (ears, paws, sides,
   tail, shadows) is drawn *past* the silhouette and then clipped:
   `shape_operation intersect [region, silhouetteCopy]` (the first object in sew order keeps its settings;
   add the copy right after). Inner regions limited by another region (inner ear inside ear) intersect with
   that region's raw polygon too. Same-colour regions that touch → `union` into one object.
8. **Interior regions** (chest, muzzle, eyes, nose) as smooth closed paths.
9. **Cut the base cleanly** — don't rely on flatten for the base. Re-create the base from the silhouette,
   add temp copies of *all* raw region polygons, `union` them, `offset` +0.6 then −1.0 (closes slivers and
   leaves a 0.4 mm interlock), then `subtract [base, union]`. Include every region that sits on the base,
   including regions enclosed by other regions (a panel inside a border). Base left under a region stacks
   layers and triggers `dense`. Flatten only the inner pieces among themselves
   (`shape_operation flatten` with explicit ids).
10. **Lines.** Running/bean on top. Chain nearby lines into one path (leg line → paw top → toes, retraced
    down-and-back) and retrace whiskers from a shared root: every separate object costs a trim.
    Use `length` ≈ 1.1 mm on short detail lines.
11. **Threads.** `update_objects` with `settings.threadCode` per colour group.
12. **Sew order.** `set_sew_order` with the full id list: colour blocks in layer order; inside a block,
    put neighbours next to each other and orient chains so one ends where the next starts.
13. **Check and fix** — `list_issues` (wait for stitches) until 0 fail / 0 check; see the fix table in
    `references/lessons.md`. `trimJump` 3–4 mm is a fine project setting; don't go higher to hide trims.
14. **Look.** `capture_preview` (stitches) and a screenshot; hide the reference image when done.

## Rules of thumb

- Fills ≥ 2 mm wide and ≥ 6 mm²; satin 1–7 mm wide; anything smaller becomes a line or a satin dot.
- Never stack small fills on the base: cut them out (step 9) or the density check fires.
- Satin on tight closed curves (rings around eyes) makes short stitches; avoid or use a bean outline.
- Eyes and dots: ≥ 2.8 mm across → a small fill with `underlay:'none'` (≥ 6 mm²). Use a satin dot only
  below that; a 2.4 mm satin "dot" looks like a zigzag.
- Don't set satin `spacing` below the fabric default. It produced "invalid design", and once froze the
  renderer for 45 s inside a batch.
- Budget: ≤ 80 objects, colour changes = colours − 1, no jump > 30 mm, ≤ 25 trims. 25 trims is realistic
  for a single figure. A multi-element scene (wreath + animals + snowflakes ≈ 35) may not get under it:
  chain and merge first, then tell the user the count and ask whether it's acceptable. Don't decide for
  them. The limit can't be changed with `update_project`.
- Edit in one script per phase, but keep the raw polygons (in `localStorage` or a file) so a phase can be
  rebuilt from scratch instead of patched — rebuilding was always faster than patching slivers.
