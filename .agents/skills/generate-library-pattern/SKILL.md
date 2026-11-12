---
name: generate-library-pattern
description: Design and add new motifs (patterns, shapes, frames, animals, symbols, seasonal art…) to Threadroom's built-in Library catalog as code — search the catalog for duplicates first, draw the motif with the shared kit, build it, review it through the real stitch compiler and rendered pictures, and iterate until it sews cleanly and looks hand-crafted. Use when the user asks to add, generate or design library patterns/motifs/shapes, fill a library category, or grow the catalog in bulk.
---

# Generate library patterns

Library motifs are code. Each motif is one file, `scripts/library/motifs/<category>/<slug>.mjs`, drawn with
`scripts/library/kit.mjs`. `scripts/library/build.mjs` writes `lib/library-samples/motifs/<id>.json` plus a
generated `index.ts`, which the catalog (`lib/library-assets.ts`) imports. Never hand-edit the JSON or index.

The bar for every motif: **not a duplicate, looks hand-crafted (never clip art), composes well with text and
other motifs, and sews cleanly**: no design or stitch warnings in the 100 × 100 hoop and no failures when it
is shrunk into the 60 × 40 hoop.

## Tools

| Command | Use |
| --- | --- |
| `node scripts/library/search.mjs list [category]` | Category counts, or every item in a category |
| `node scripts/library/search.mjs find <words…>` | Items matching any word, ranked; Turkish/English, accents optional |
| `node scripts/library/search.mjs similar <id>` | Nearest silhouettes to an item (colour-blind, mirror-aware) |
| `node scripts/library/build.mjs [words…]` | Build all motifs, or those whose id contains a word |
| `node scripts/library/review.mjs <words…>` | Insert → checks → real compiler → `agent-out/library-review/sheet.png` (stitches) and `thumbs.png` (panel previews); exit 1 if not ready |

## Workflow

1. **Survey.** `search.mjs list` to see which categories are thin. Prefer under-filled categories and subjects
   that complement what exists (a frame family, a season, an animal set) over random one-offs.
2. **Search before you design.** For every idea, `search.mjs find` with the subject in both languages plus
   synonyms and near-concepts (e.g. `find kuş bird serçe sparrow robin kumru dove`). Then decide:
   - Nothing close → design it.
   - Something close → design it only if it is a **distinct** motif (different subject, composition or
     purpose: a "bird on a branch" next to a "little bird"), not a recolour, resize, mirror or restyle.
     If in doubt, pick another idea.
   - When working in bulk, write the planned list down first and search each item, so parallel batches
     don't pick the same subject.
3. **Art-direct.** Decide the style before coordinates: folk/kilim, İznik tile, Scandinavian, storybook,
   line-art, patch/badge. Pick 2–4 Brother threads by role (base, accent, dark, light). See
   `references/design-rules.md` for the style and palette guidance.
4. **Draw.** Copy the closest existing motif file as a template, rename it (`<slug>-01` style ids:
   `<category>.<slug>`), and draw with the kit (`references/kit.md`). Objects are returned in sew order.
5. **Build and review.** `node scripts/library/build.mjs <slug> && node scripts/library/review.mjs <slug>`.
   Fix every `✗` line. Then **look at both pictures** (Read the PNGs): proportions, gaps at joins,
   negative space, colour balance, whether it reads at thumbnail size. Zero warnings is necessary,
   not sufficient. The sheet draws travel stitches dashed; they are usually covered when sewn.
6. **Duplicate check.** The review prints the three nearest silhouettes. A score ≥ 0.80 (`DUPLICATE?`)
   means you must compare the two pictures and either justify the difference in your report or drop the
   motif. Generic blobs (badges vs. ovals) can score 0.6–0.7 without being duplicates.
7. **Iterate** until the motif is something you would sell. Typical: 2–4 rounds.
8. **Verify the catalog.** `node --test tests/library.test.mjs` and
   `.venv/bin/python -m unittest tests.test_library` (or the full `npm test`), `npm run typecheck`.
   For large batches also run `npm run build`.
9. **Report** per motif: id, names, threads, stitch count, nearest similar item and score, and any
   advisory you could not remove with its reason.

## Working in bulk

- Batch by category or theme (10–20 motifs per batch) and review the batch sheet together, so style stays
  consistent within a family.
- One file per motif keeps parallel work mergeable. After merging, rerun `node scripts/library/build.mjs`
  so the index lists everything.
- Keep names unique within a category and tags rich (both languages, synonyms, occasions, style words):
  search is the only way customers find things in a large catalog.
- The catalog is bundled into the editor today (~20 KB per motif). Before going past a few hundred motifs,
  the catalog needs lazy loading (manifest + per-motif JSON); raise this with the user rather than letting
  the bundle grow silently.

## References

- `references/kit.md` — kit API, builder options, patterns for cuts and tapered strokes, a template.
- `references/design-rules.md` — sewability rules, fixes for each warning, style and palette guidance,
  and lessons from the first catalog batch.
- `.agents/skills/embroidery-digitizing/references/lessons.md` — deeper digitising lessons (joins, slivers, density).
