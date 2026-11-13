# Realistic stitch rendering

`lib/thread-renderer.ts` draws the editor's realistic view and `exportImage`
(thumbnails, agent previews, PNG export). It paints a transparent thread layer onto the
2D canvas, above fabric, grid and reference artwork and below the SVG editing overlay.
Display settings never alter machine files; density is in
[stitch-density.md](stitch-density.md).

## What is drawn

One instance per sewn stitch, composited in sewing order, so later stitches cover
earlier ones exactly as they do on the machine. There is no sorting and no depth
buffer. Each instance is a strand between two needle points:

- **Width.** 40 wt thread is about 0.25 mm thick under tension; the displayed strand is
  0.30 mm, allowing for the way sewn thread flattens and blooms. At standard density
  (one thread every 0.2 mm) neighbours overlap slightly and cover. Open spacing shows
  fabric, as it will when sewn.
- **Shared needle holes.** Two stitches meeting at a hole cannot lie in the same place.
  Where the thread doubles back (satin, row turns, bean passes) each leg is pushed half
  a thread off the hole, away from the other. This is why sewn satin reads as parallel
  threads and not as the zigzag of its needle points. Straight runs are not moved.
  Lock stitches are pulled tight on top of each other and show as one thread.
- **Shape.** The strand climbs out of one hole and dives into the next: both ends are
  slightly narrower and darker. Long floats sag a little and catch the light across a
  satin column; the short stitches of a fill lie flat and keep one even tone.
- **Material.** Two plies twisted together (one turn per 0.8 mm) give diagonal ridges
  and a scalloped outline; fine filaments give streaked highlights. Sheen follows the
  fibre direction, so columns sewn at different angles differ in brightness.
- **Contact shadow.** Each strand darkens what lies beside and beneath it, which
  separates rows and lifts satin off the fill and the fabric.
- **Loft.** Thread already sewn underneath lifts a stitch: padding under raised satin
  (the satin fill's Raised setting), or a fill under a satin border. A grid over the
  design keeps the thread on top of each 0.25 mm cell: its height in layers, its
  direction and the height it lies on. A stitch rests on the threads it crosses; a
  thread running the same way is its neighbour in the same row or column, and there
  the stitch takes that neighbour's base. Its loft is the mean height under it. A
  lifted stitch arches: nearly level on top and steep down to each hole, so a raised
  column has a lit and a shaded flank, darker ends and a longer shadow past its edge.
  The little that an underlay alone leaves is not shown, and short stitches cannot
  arch, so fills keep one even tone.

All of this is fixed in millimetres. Detail too small for the current zoom fades into
the smooth strand without changing the average colour.

## How it is drawn

WebGL2, instanced: six vertices bound each strand and the fragment shader evaluates
its surface. Command prefixes select the sewn part for playback without uploading
geometry again. Only the part of the canvas the design reaches is rendered.

Below 20 px/mm a strand is under six pixels wide. Its coverage is resolved on a finer
raster first (up to 8×), anchored to design space so the material does not crawl with
fractional pan, and averaged down on the GPU by exact area. A general image filter
aliases against the regular thread pitch and the colour of a fill would pulse while
zooming. Closer in, strands are drawn directly with analytic edges.

Canvases larger than 2048 render pixels are drawn in tiles and committed together.
Unsupported contexts, shader or allocation errors and context loss fall back to the
Canvas renderer in `lib/thread.ts`, a coarser approximation; a restored context
rebuilds its resources on the next draw. The canvas compares its transform with the
requested scale relatively, because the browser keeps the matrix in single precision.
The visible canvas exposes `data-renderer`, `data-render-ms` and `data-frame-ms`.

## Limits

This is a calibrated picture of the stitches as written, not a sew-out simulation: it
does not model pull, push, fabric distortion or thread tension, and loft is an estimate
from the stitches underneath, not a measured height. Correct digitising, density and
underlay remain essential.

## Tests

`npm test` covers instance geometry (shared holes, lock stitches, playback prefixes)
and the fallback. With `agent-browser` installed, `npm run test:thread-renderer` runs a
real-GPU audit: shader compilation, sewing order, playback parity, alpha, panning,
colour stability across zoom, coverage at standard and open density, the GPU staying
selected at every zoom, tiles, 100,000 stitches and context loss. A comparison image is
saved to `tests/browser-harness/thread-renderer.png` (gitignored).
