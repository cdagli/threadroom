# Design rules for library motifs

## Look

- **Hand-crafted, never clip art.** The catalog sells designs for a small embroidery business: stock-looking
  shapes don't stand out. Give each motif a style: folk/kilim geometry, İznik tile, Scandinavian, storybook
  whimsy, patch/badge, calligraphic line. Use craft cues: direction zones (different fill angles per part),
  a running-stitch "hand-stitched" inset line, concentric `circular` fills, tapered satin strokes, small
  whimsical extras (a bee's looping flight trail, a pumpkin tendril).
- **Composable.** Clean silhouette, centred, generous negative space. Frames and labels (wreath, ribbon,
  badge, bubble) leave a calm area for text. Keep detail readable at panel-thumbnail size.
- **Distinct.** A new motif must differ in subject, composition or purpose from everything in the catalog,
  including `basic-shapes`. Recolours, resizes, mirrors and "same shape plus an outline" are duplicates.
- **Families.** When making several motifs of a theme, share palette, stroke weights and level of detail.

## Threads and palette

- 2–4 threads per motif, chosen by role: base, accent, dark detail, light highlight. One colour block per
  thread; each extra thread costs a colour change.
- Palettes that worked: İznik (575 Ultramarine, 483 Teal Green, 149 Red, 000 White); kilim (149 Red, 575,
  354 Deep Gold); honey (322 Pumpkin, 354 Deep Gold, 334 Harvest Gold); botanical (446 Moss, 463 Leaf Green);
  patch (012 Beige or 150 Light Blue base + 588 Prussian / 575 Ultramarine edge).
- White fills disappear on white fabric: give them a coloured outline (speech bubble, bee wings).

## Sewability minimums (in the 100 × 100 hoop, and after shrinking to 60 × 40)

| Element | Rule |
| --- | --- |
| Fill | ≥ 6 mm² and ≥ 2 mm wide; tips/wedges < 1 mm wide total < 1 mm² → round them with `opened(g,.45–.8)` |
| Satin line | 1–7 mm wide (1.2–1.6 for stems/branches, 3 for patch edges) |
| Tapered satin | 0.8–2.6 mm; thin ends are fine |
| Eyes/dots | ≥ 2.8 mm → small fill; smaller → `b.dot` (size 1.3–1.9) |
| Lines | `running` length 2.2–2.6 for decorative stitching, 1.2–1.6 for small details; `bean` for bold outlines |
| Shrinking | The 60 × 40 hoop may shrink a motif to ~60–90 %. Fills must stay ≥ 3 mm² there (fail), so avoid tiny fills on large motifs |
| Budget | ≤ 80 objects, ≤ 12,000 ring points per project; keep motifs ≤ ~40 objects so they combine |

## Warning → fix

| Warning | Fix |
| --- | --- |
| `fill-thin-part` | Round tips with `opened`; end zigzags with perpendicular caps; extend-and-clip regions so no sliver remains between neighbours and the outline |
| `fill-small` / `fill-narrow` | Enlarge, merge into a neighbour, or turn into a `dot`/line |
| `dense` | Two fills stacked: cut the lower one (`difference` with a −0.4 mm offset of the upper one) |
| `short-stitches` on lines | Avoid back-and-forth retraces in `bean`; use a simple open path with one corner (bird feet) |
| `short-stitches` on closed `bean` with sharp corners | Use a `satin` outline (1.4 mm) instead |
| `many-trims` (> 25) | Fewer separate parts (5 leaf pairs per wreath side, not 6), neighbours sewn consecutively |
| `long-jump` (> 30 mm, same thread) | Reorder within the block; if two same-thread parts must be far apart (ribbon folds), merge the thread with a neighbouring block and use fill angle for contrast |
| `colour-order` | One block per thread: move the stray object into its colour's block |
| Insert fails in 60 × 40 | No fixed `center` on fills; check bounds aren't extreme |

## Lessons from the first batch

- Satin on closed curves is fine at radius ≥ ~10 mm (badge edges); V-shaped satin branches with one corner
  sew well (snowflake).
- Leaves on a stem: base 0.1 mm off the stem centre so they tuck under the satin; lean them 35–40° toward the
  branch tip; vary size along the branch.
- Ribbon folds read best as separate fills with a crossing fill angle in the same thread.
- Zero warnings ≠ good: check the stitch sheet for gaps at joins, see-through fills and travel crossing open
  fabric, and the thumbnail sheet for readability.
