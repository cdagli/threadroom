# Motif kit (`scripts/library/kit.mjs`)

Coordinates are millimetres, y down, drawn around (50, 50). Draw at the size the motif should insert at
in a 100 × 100 hoop: most motifs are 30–60 mm on their long side. Wide borders can be up to ~90 mm; they
shrink to fit smaller hoops automatically (satin widths do not shrink, so keep details ≥ the minimums).

## A motif file

```js
import {motif,circle,region,disc,difference,offsetRegion} from '../../kit.mjs';

export default motif('symbols.evil-eye-01','symbols',
  {tr:'Nazar boncuğu',en:'Evil eye'},                  // shown in the panel; both required
  ['nazar','boncuk','göz','şans','evil eye','bead','luck'], // search tags, both languages + synonyms
  'Nazar boncuğu',                                      // group name in the layers panel (Turkish)
  b=>[                                                  // objects in sew order
    b.fill('Lacivert halka','586',difference(disc([50,50],18),disc([50,50],11.6)),{pattern:'circular'}),
    ...
  ]);
```

The id must be `<category folder>.<file name>`. Object names are Turkish (the UI language of the catalog).
Thread codes are Brother codes from `embroidery/threads.json` (e.g. `'000'` White, `'100'` Black).

## Geometry helpers

| Helper | Returns |
| --- | --- |
| `polar(c,r,deg)`, `rotate(p,c,deg)`, `mirror(p,cx=50)`, `lerp(a,b,t)`, `add(a,b)`, `deg` | points / maths |
| `circle(c,r,n=8)`, `ellipse(c,rx,ry,n=8,start=-90,rot=0)` | anchor lists for smooth closed curves |
| `curve(points,{closed,corners})` | a Levien curve; `corners` = `true`, `false` or anchor indices |
| `ring(points,opts)` | the sampled ring of a curve |
| `region(points,opts)`, `polyRegion(points)`, `disc(c,r)` | regions for boolean work |
| `union`, `intersection`, `difference`, `offsetRegion(g,mm)` | boolean ops and round offsets |
| `opened(g,r)` | shrink then grow by r: rounds tips/wedges thinner than 2r (stars, crescents, zigzags) |
| `simplify(g,tol)`, `regionRings(g)` | tidy region rings / get them as point lists |

## Builder `b`

| Call | Makes |
| --- | --- |
| `b.fill(name,code,anchorsOrRegion,{angle,corners,underlay,pattern,fillLength,entry,exit})` | Tatami (or `pattern`) fill. Anchors keep an editable curve; a region (from boolean ops) stores rings only. |
| `b.line(name,code,anchors,{kind,closed,corners,length,width,underlay})` | `running` (default), `bean`, `satin` (`width`) lines. Closed lines are re-closed for you. |
| `b.path(name,code,points,{kind,length})` | A line through raw points (e.g. an inset outline from `offsetRegion`). |
| `b.taper(name,code,anchors,width(t),{anchors})` | Tapered `satin-block` stroke: calligraphic flourishes, stems. Keep width 0.8–2.6 mm. |
| `b.dot(name,code,p,{size,along,angle})` | A tiny satin bar: eyes, highlights, berries. |

Defaults: `underlay:'none'`, fills `fillLength:3`, satin `underlay:'center'`. Use `underlay:'tatami'` on large
fills (≥ ~30 mm across) so they don't show fabric.

Fill patterns worth using: `tatami` (default), `circular` (concentric rows; rings, moons, eyes, flower centres).
Do **not** pass `center` to `circular` fills: a fixed centre outside the small hoop makes the motif
un-insertable there; the centroid is used instead.

## Recipes

**Layered regions without stacking** (body + stripe + wing). Draw each region past the silhouette, clip it,
and cut it out of the base with a 0.4 mm interlock:

```js
const wing=intersection(body,wingRaw);
const breast=difference(intersection(body,breastRaw),offsetRegion(wing,-.4));
const base=difference(body,offsetRegion(union(breastRaw,wingRaw),-.4)); // raw, so no rim stays on the outline
```

**Bands/segments** (bee stripes, pumpkin lobes, fish head): intersect the shape with cutter polygons,
then `offsetRegion(part,.3)` and intersect with the shape again, so neighbours overlap 0.3 mm (seams close).

**Ring with a hole** (badges, nazar, kilim frames): `difference(outer,inner)`; holes need region rings, so the
object loses its editable curve. Prefer curves when there is no hole.

**Inset decorative stitch line** (a "hand-stitched" ring inside a patch):
`const inset=simplify(offsetRegion(shapeRegion,-3),.04)[0][0]; b.path(name,code,[...inset,inset[0]],{length:2.4})`.

**Repeated parts** (petals, leaves, snowflake arms): loop with `rotate`/`polar`/`mirror`; number names
(`Yaprak 1…`), and order them by proximity so travel stays short.

**Sew order**: one block per thread, blocks in layer order (things on top sewn later). Inside a block, put
neighbours next to each other and run chains end-to-start; set `entry`/`exit` on fills when a block runs
left → right then back (see `geometric-patterns/chevron-band-01.mjs`).


## Traced motifs (from reference plates)

For motifs copied from a public-domain plate, trace outlines in millimetres and describe the motif as layers;
`drawLayers(b,layers,{start})` digitizes them in order (see the `botanical/*-01.mjs` files from BHL plates).

| Layer kind | Becomes |
| --- | --- |
| `auto` | slim parts (< 5.5 mm) as satin columns via `b.ribbon(outline)`, broad parts as fills along their long axis |
| `leaf` | leaves ≥ `splitMin` (4.6 mm) split at the midrib into two herringbone halves; slimmer ones as satin |
| `petals` | one flower mass cut into `count` petals around `centre` (radial stitch direction); `notches` to place cuts; fans (centre on the outline) spread cuts across their angle; `edge:{code}` adds a running rim per petal for pale petals |
| `fill` | plain fills (`pattern`, `angle`, `round` for tip rounding) |
| `stem` | open centrelines as tapered satin, `width:[start,end]`; the compiler picks the sewing direction |
| `spray` | stalks from shared roots as one running path out and back (no trims between stalks) |
| `dot` | specks merged within `merge` mm into satin dots (anthers, flower eyes) |
| `outline` | running lines (closed unless `closed:false`) |

Layer options: `covers:[i…]` cuts later layers' shapes out of this one (no stacking); `smooth:true` turns sparse
hand anchors into Levien curves. Kit helpers behind it: `b.ribbon`, `outlineRails`, `maxWidth`, `axisAngle`,
`leafHalves`, `petalCuts`, `evenly`, `nearestOrder`.

Lessons: watercolour washes trace well for saturated petals and dark leaves, but white or pale parts are paper
coloured, so draw those (and most stems) by hand from a mm grid over the plate. Tall motifs shrink to ~60 % in
the 60 × 40 hoop: satin columns need a widest point ≥ 1.7 mm and fills ≥ ~8 mm² to survive it. Trims add up fast
with many small parts (leaves, dots); merge pairs (twin bells), sew leaf halves back to back, and drop fragments.
