# Lessons from digitising the rabbit (Nov 2026)

Source: a 1280×1920 transparent PNG of a sitting rabbit, placed at 64×96 mm in a 100×100 hoop on woven
cotton. Result: 25 objects, 7 Brother threads, 6 colour changes, ~3,700 stitches, 23 trims, 0 warnings.

## What did not work

| Attempt | Problem |
| --- | --- |
| `auto_digitise` 6 colours | Ears lost, blocky 1.5 mm grid look, 30 objects. |
| `auto_digitise` 9 colours | Light cream fur merged with the background → holes in the face. |
| `auto_digitise` 12 colours | Fuller, but pixelated; `apply_issue_fix all` then turned narrow fills into running outlines, so light areas looked hollow. Don't blanket-apply fixes. |
| First hand version | Looked good but 23 warnings: everything layered on one base with `flatten`, separate toe/whisker objects, satin highlights < 1 mm, 11 colours in arbitrary order. |

## Why each workflow step exists

- **Extend past the silhouette, then intersect.** Regions drawn by eye stop ~0.3 mm short of the outline and
  leave an orange sliver → `fill-thin-part` on the base. Drawing past the edge and clipping makes the
  region and the outline share the exact same boundary.
- **Don't let `flatten` cut the base.** `flatten` removes later fills from earlier ones *inset by 0.4 mm*
  so edges interlock — but it also leaves a 0.4 mm rim of base along the outer silhouette wherever an edge
  region reaches it (85 mm² of thin parts on the rabbit). (A fix to `flattenOverlaps` may land; check
  whether the rim still appears before using the manual method.)
- **Union the cutters before shrinking.** Subtracting each region shrunk separately leaves body slivers
  wherever two regions overlap or nearly touch (paw/shadow seams, the ear notch). Union first, then offset.
- **Close before shrinking (+0.6 / −1.0).** Remaining spikes sit in narrow gaps between cutters (ear base
  corners, side tips). Growing then shrinking the union fills those gaps; the net −0.4 keeps the interlock.
- **A notch needs a filler.** Where two raw regions meet at a point (between the ears) add a small triangle
  to the cutter union, and put both regions' shared edge exactly on the notch point.
- **Blunt corners.** A region boundary meeting the outline at a shallow angle makes a thin wedge. End inner
  regions where they are ≥ 2 mm wide (the inner ear stops 2 mm below the tip and at the ear base) and run
  head lines roughly perpendicular to the outline.
- **Trims are sewing transitions, not a reason to merge editable parts.** An object can contain multiple
  trimmed runs; grouping does not alter them. Optimize ends and nearby sew order first. Keep whiskers
  individually removable, even if an older design chained them. Raising `trimJump` from 3 to 4 mm saved
  two cuts; 6–7 mm hides cuts as visible floats.
- **Colour order.** Build objects in final sew order and use one block per thread. Layering only matters
  where regions overlap; after the base is cut, most inner pieces don't overlap, so blocks can be reordered
  freely. Inside a block, order by proximity (a 33 mm jump from the paws back up to the muzzle is a warning).
- **Thread choice.** The PEC palette has 64 colours; the nearest match can be ΔE 10–17 for pinks/browns. Pick
  by role, not by ΔE alone: one base, one accent, one light, one dark, one white. Merging the eye colour
  into dark brown and the peach into beige saved two colour changes with no visible loss.

## Warning → fix table

| Warning | Typical cause | Fix |
| --- | --- | --- |
| `fill-thin-part` on the base | Slivers between regions and the outline | Extend-and-clip regions; rebuild the base with union + close + subtract (step 9). Locate parts via `values.parts` when available. |
| `fill-thin-part` on a region | Pointed tips, notches, shallow-angle corners | Blunt the corner, move the shared edge onto the notch point, end inner regions where they are ≥ 2 mm wide. For traced shapes, open them: `offset` −0.35 then +0.35 (base: −0.5 / +0.5). `values.parts` gives each sliver's bounds. |
| `short-stitches` at an acute notch | A narrow gap such as between legs | Close the shape: `offset` +0.4 then −0.4, before cutting. |
| `dense` under an enclosed panel | Base not cut under a region enclosed by another region | Include enclosed regions in the base cutter union. For small panels with motifs, keep the panel whole and put the motifs on top, all with `underlay:'none'`. |
| `fill-small` / `fill-narrow` (fail) | Tiny fills (highlights, < 6 mm² or < 1 mm wide) | Satin dot (`kind:'satin'` 0.3 mm open path, `satinWidth` 1.0, `underlay:'none'`) or running stitch. |
| `fill-narrow` (check) | 1–2 mm fills (eye rings, small nose) | Enlarge to ≥ 2 mm (nose base 5 mm × 3.2 mm) or switch to a line. |
| `satin-narrow` | Satin < 1 mm | `satinWidth` ≥ 1.0. |
| `short-stitches` on lines | Line length not divisible by stitch length; closed loops' seam | `length` 1.1 on short lines; avoid tiny closed bean/satin loops. |
| `short-stitches` on satin rings | Satin on tight closed curves | Don't use satin rings around eyes. |
| `short-stitches` on a fill edge | Zig-zag in the traced outline | Smooth the outline points there. |
| `dense` | Fill + underlay + highlight stacked | Cut the base under small fills; `underlay:'none'` on small fills (eyes). |
| `colour-order` | Same thread in two blocks | `set_sew_order` into one block per colour. |
| `long-jump` | Same-colour objects far apart in sequence | Reorder inside the colour block by proximity. |
| `many-trims` | Many disconnected sewing runs | Optimize entry/exit and order; use `trimJump` 3–4. Preserve separately editable parts and report unavoidable cuts. |

## Second run: generated Scandinavian winter motif (Nov 2026)

A subagent ran the skill cold: Codex imagegen, then digitising. The result was 40 objects, 5 Brother
threads, 4 colour changes, ~6,400 stitches, 0 fail. One check remained: 35 trims. The fixes above under
"thin part", "acute notch" and "enclosed panel" come from this run. The first image had a navy outline
around every shape, so it was regenerated without outlines (see generate-artwork.md). In the preview,
~2 mm pine needles and snowflake arms read as rounded blobs: draw thin decorative elements at ≥ 3 mm, or
make them running/satin lines.

## Coordinates and reading the image

- `view_reference` grids are the ground truth. Reading coordinates off a plain screenshot was off by 3–4 mm.
- Read features at 20–35 px/mm. Record them as lists of points before any drawing call.
- A 0.25 mm alpha grid + Douglas–Peucker 0.3 mm gave an 85-point silhouette that matched the artwork.

## Third run: cats-and-pothos scene, stitch-art pass (Nov 2026)

A generated flat scene (14 colour regions, 180×130 hoop) was traced region by region with no base cutting:
0 fail and 4 checks in minutes. The user then asked for "artwork, not a trace". What helped, and what
didn't, is in `stitch-art.md`. Key lessons:

- A trace with 0 warnings can still look flat and have see-through fills. Look at a zoomed `capture_preview`.
- Knife-split parts need `offset` +0.3, or the seams open.
- Background Chrome tab = stalled tools and 45 s timeouts. Run work in a background queue and wake the tab with a screenshot (SKILL.md).
- The light-leaf block had one unavoidable 30.2 mm jump: the nearest same-colour leaves sat on either side of the pot. Report it rather than distorting the art.

## Fourth run: blue botanical bouquet, connection gaps (Nov 2026)

A Codex-generated flat botanical (5 blues, 180×130 hoop) was vectorised offline (numpy/scikit-image/shapely
in a scratch venv), then sent as 68 `add_path` calls: two-tone fishbone leaf halves, radial petals,
`circular` centres and berries, satin stems and midribs. 0 fail, 4 colour changes. The user then saw
**gaps at every connection point**: stems stopped short of flowers, buds and leaves, leaf bases floated
off their stems, and midribs stuck out past the leaf base. Causes and fixes:

| Gap | Cause | Fix |
| --- | --- | --- |
| Stem ends 1–2 mm short of what they join | Skeleton centre lines retract about half a stem width at each end; a satin column also ends square at its last anchor | Extend each stem end **along its tangent** (taken over the last ~3 mm, not the last segment) until it is 1.2 mm inside the neighbour it meets. Sew stems first so the neighbour covers the tip |
| Hooked stem ends | Skeleton spurs leave an extra anchor < 1.2 mm from the end, pointing backwards | Drop end anchors closer than 1.2 mm before measuring the tangent. Two anchors 0.7 mm apart also gave a `short-stitches` check on a satin midrib |
| Leaf floats beside its stem | Separating stems from leaf bodies (opening + dilated subtraction) shaves the leaf base; geometric "touching" (overlap 0–0.3 mm) still opens after pull compensation | Measure how deep each leaf reaches into the stem: `halfWidth − distance(leaf, stemCentreLine)`. Below 0.5 mm, add a short petiole: satin 1.3 mm in the stem colour, from 1.6 mm inside the leaf to just past the stem centre line, sewn in the stem block |
| Midrib pokes out past the leaf | The midrib was traced from the art, but the halves were shrunk/opened | Clip each midrib to the leaf closed over its seam (`union(halves).buffer(1.5).buffer(-1.8)`); clipping to the plain union deletes the whole midrib, because it runs along the seam |

- **Zero warnings don't mean connected.** No check reports a 1 mm gap between two objects. Zoom into every
  junction of the stitch render (stem–flower, stem–stem, leaf–stem, bud–sepal, berry–twig) before reporting.
- **Check joins numerically too.** For each line end, cast its tangent 5 mm forward and test against every
  other object's shape (a line's shape = buffer of half its width). Fern leaflets at 0.42–0.6 mm deep
  looked joined; stems at −0.7 mm did not.
- **Edit in place.** Use `edit_points` (move/remove/insert anchors) for the fixes. Deleting and re-adding
  reorders the sewing and breaks the colour blocks.
- **"Proje başka biri tarafından değiştirildi"** (someone else changed the project) showed up mid-session
  and the page reloaded the server copy, quietly dropping the last batch of edits. After any reload,
  restore the bridge and re-check a known edit with `get_points` before going on. Watch the
  `.save-indicator` aria-label ("Kaydedildi" = saved).
- A density `gradient` ramp on a petal only exposed the underlay lattice. It didn't read as shading.
