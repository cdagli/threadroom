# Stitch-art pass: from a trace to embroidery artwork

A clean trace looks like a flat sticker. Do this pass after the regions exist and before clearing warnings.
Each step was tried on a generated cats-and-pothos scene (Nov 2026); results are marked ✅ keep / ❌ avoid.

## What worked, best first

| Technique | How | Result |
| --- | --- | --- |
| Direction zones | `shape_operation knife` a region into parts (head / back / haunch / tail), then a different `angle` per part following fur or leaf growth. Then `offset` +0.3 on every part (see gaps). | ✅ Biggest gain. Seams read as fur partings. |
| Fishbone leaves | Knife each leaf along its midrib (notch → tip). Per half: `angle = atan2(n + 0.9·d)`, where d = midrib unit vector and n = normal toward that half's centre (y-down degrees, mod 180). | ✅ Veins appear without extra objects or colours. |
| Fuzzy edges | Along the outline, short strokes (in 1.3–2.5 mm, out 0.5–1.6 mm) on the local normal, retraced in→out→in, as one running path in the fill colour (`length` 1.2). Skip edges that touch another region. `__paths.fuzzEdge`. | ✅ Soft, furry silhouette. |
| Rope hanger | Cord as `triple-rope`, `ropeWidth` ≈ 1.1, with a small loop knot at the top, instead of a thin traced fill. | ✅ |
| Hand-stitch accents | White `running`, `length` 2.6, as a band on the pot. Small `bean` "z Z" above a sleeping animal. Tabby stripes as short `satin` 1.5 mm, `underlay:'none'`. | ✅ Cosy, cheap: one object each. |
| Sheen on black | Tapered `satin-block` crescents (width 0.7 → 1.6 → 0.7) in Pewter (19), 3 mm inside the edge. `__paths.satinCrescent`. | ✅ Subtle depth. |
| Fill texture | `fillPattern:'rainfall'` (chaos 5, density 55, `spacing` 0.38) on fur. | ✅ Furry, but slow to stitch (see SKILL.md). |
| Satin fill on leaves | `fillPattern:'sweepSatin'` | ⚠️ Pretty, but shows fabric between rows. Tighter spacing and any underlay give "invalid design". Use Tatami + `underlay:'tatami'`, `fillLength` 4. |
| Satin fill on big shapes | `sweepSatin` on a 40 mm cat | ❌ "invalid design". |
| Scattered fur strands | Random 3–5 mm strokes chained by nearest neighbour | ❌ The travel stitches between strokes read as a scribbly web. Barely visible tone-on-tone. Use fuzzy edges or crescents instead. |

## Gaps: check before you finish

- **Knifed parts meet exactly edge to edge.** Pull compensation then opens a visible seam: `offset` +0.3 on all parts.
- **Connection gaps.** Stems, petioles and midribs drawn from skeletons or by eye stop short. Every join
  needs ≥ 0.5 mm overlap, with the covering object sewn later: extend stem ends along their tangent 1.2 mm into
  the neighbour, add a petiole when a leaf reaches < 0.5 mm into its stem, and clip midribs inside the leaf.
  See lessons.md "Fourth run".
- **See-through fills.** Inspect a `capture_preview` zoomed at the seams and leaf interiors. Fix with `spacing` 0.36–0.38
  or a tatami underlay. Don't stop at "0 warnings": coverage gaps aren't a check.

## Colours and order

- Check threads in the stitch render, not only by ΔE. Brother 6 rendered as the same rust as the terracotta pot;
  52 Tangerine fixed it.
- Accents on a region need their colour block after it. Choose the block order so that every accent comes
  later (ginger cat → terracotta stripes + pot → greens → black → white). Regions that don't overlap can
  move freely.
- Adding a near shade costs one colour change. Drop it if it's barely visible (the Pumpkin strands were).
