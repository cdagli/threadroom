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
- **Trims are object transitions.** 27 objects ≈ 30 trims; the check allows 25. Chain lines that are close
  (leg + paw top + toes in one path, all whiskers per side in one retraced path, mouth as one path), merge
  touching same-colour fills, and drop low-value decorative objects before raising `trimJump`.
  Raising `trimJump` from 3 to 4 mm saved two more trims; 6–7 mm hides trims as visible floats.
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
| `fill-thin-part` on a region | Pointed tips, notches, shallow-angle corners | Blunt the corner, move the shared edge onto the notch point, end inner regions where they are ≥ 2 mm wide. |
| `fill-small` / `fill-narrow` (fail) | Tiny fills (highlights, < 6 mm² or < 1 mm wide) | Satin dot (`kind:'satin'` 0.3 mm open path, `satinWidth` 1.0, `underlay:'none'`) or running stitch. |
| `fill-narrow` (check) | 1–2 mm fills (eye rings, small nose) | Enlarge to ≥ 2 mm (nose base 5 mm × 3.2 mm) or switch to a line. |
| `satin-narrow` | Satin < 1 mm | `satinWidth` ≥ 1.0. |
| `short-stitches` on lines | Line length not divisible by stitch length; closed loops' seam | `length` 1.1 on short lines; avoid tiny closed bean/satin loops. |
| `short-stitches` on satin rings | Satin on tight closed curves | Don't use satin rings around eyes. |
| `short-stitches` on a fill edge | Zig-zag in the traced outline | Smooth the outline points there. |
| `dense` | Fill + underlay + highlight stacked | Cut the base under small fills; `underlay:'none'` on small fills (eyes). |
| `colour-order` | Same thread in two blocks | `set_sew_order` into one block per colour. |
| `long-jump` | Same-colour objects far apart in sequence | Reorder inside the colour block by proximity. |
| `many-trims` | Too many separate objects | Chain lines, union touching fills, drop decorations, then `trimJump` 3–4. |

## Coordinates and reading the image

- `view_reference` grids are the ground truth. Reading coordinates off a plain screenshot was off by 3–4 mm.
- Read features at 20–35 px/mm. Record them as lists of points before any drawing call.
- A 0.25 mm alpha grid + Douglas–Peucker 0.3 mm gave an 85-point silhouette that matched the artwork.
