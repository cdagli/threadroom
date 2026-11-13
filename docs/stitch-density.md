# Stitch spacing and density

Spacing follows the convention of professional digitising software (Wilcom, Hatch):
it is measured between threads that run the **same way**.

| Stitch | The spacing value is | At 0.4 mm |
|---|---|---|
| Satin line, satin block, satin lettering, satin fill | the distance between needle holes on the same rail | each penetration advances 0.2 mm |
| Tatami and pattern fills, fills with angle guides | the distance between two forward rows (every second row) | one row every 0.2 mm |
| Circular fill | the distance between turns of one spiral (the outward and the return spiral interleave) | one ring every 0.2 mm |
| Zigzag, E-stitch, zigzag underlay | the advance per step | unchanged |
| Streamline and cross fills | the gap between lines or crosses | unchanged |

40 wt embroidery thread (120D/2, Tex 27) is about 0.25 mm thick under sewing tension,
so standard density lays one thread every 0.2 mm: 5 lines per mm, close to Brother
PE-Design's default of 4.5. The fabric profiles (0.38–0.5 mm) are values in this
convention. A fill at 0.42 mm therefore sews twice the rows it did when the value was
used as the gap between neighbouring rows, which left fabric showing between them.

The engine converts once, where an object is planned (`plan_object`, `satin_path`,
`block_path`); pattern tables, gradients (`endSpacing` is halved with the base spacing)
and underlays work in row pitch as before. Fill underlay spacing stays the gap between
its rows.

## Satin corners

Where a satin line turns 40° or more at a single point, the two legs are mitred: each
keeps its stitches square to its own direction and is cut on the corner's bisector,
overlapping the other leg by 0.15 mm. Up to a right angle the corner comes to a full
point; sharper corners are bevelled so that no stitch reaches more than √2 half-widths
from the line (`stitchReach` in `lib/check.ts` allows for it when fitting a design into
a hoop). Curves and hairpins sharper than 150° keep turning stitches, with short
stitches on the inside.

## Running stitches

A curve sewn as running, bean or back stitch is divided into equal stitches no longer
than the stitch length. Stepping at the full length would leave a stub at the end.

## Density check

The compiler averages over 3 × 3 mm windows:

- **Thread layers**: sewn thread per mm² × 0.21 mm, so one covering fill or satin is
  about one layer whatever its underlay. A satin border or lettering over a fill
  passes, three covering layers are worth checking (3), four fail (4.2).
- **Needle holes**: a covering fill makes about 2 per mm², a small-motif fill pattern
  6 and a 1 mm satin column 5. 14 per mm² is worth checking, 20 fails.

Tests measure the physical pitch in generated paths and in decoded machine output
(`tests/test_satin_density.py`, `tests/test_compiler.py`).
