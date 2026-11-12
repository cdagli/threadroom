# Design library

The editor's **Library** panel browses the built-in catalog. It has eight categories, all 13 ready-made shapes under **Basic shapes**, and four starter motifs: **Yaprak dalı / Leaf sprig**, **Lale / Tulip**, **Papatya / Daisy** (Flowers & plants) and **Kalp / Heart** (Symbols). The remaining categories stay visible and empty. No database migration or remote storage is required: category metadata lives in `lib/library.ts`, and `lib/library-assets.ts` is the single catalog entry point.

Basic shapes reuse the former Shapes tool’s editable curve anchors and insert as tatami fills. Open and Closed drawing are separate dock buttons, alongside Points.

The starter motifs were hand-digitised through the editor's WebMCP tools and exported into `lib/library-samples/*.json`. Each has its own group, stable source IDs, named editable parts, Brother thread references and an intentional sew order. Stems, leaves, petals, centres and highlights remain separate objects. Source geometry is stored at its original size in millimetres. The library checks each imported JSON snapshot before exposing it in the catalog.

## Adding content later

Add entries to `libraryAssets`, importing larger collections from separate data files as needed. Each entry follows `LibraryAsset`:

```ts
{
  version: 1,
  id: 'botanical.leaf-01', // unique, stable; used in drag payloads
  categoryId: 'botanical',
  name: {tr: 'Yaprak', en: 'Leaf'},
  tags: ['leaf', 'yaprak', 'botanical'],
  design: {
    objects: [/* valid editable StitchObject geometry in millimetres */],
    groups: [/* optional {id, name}, referenced by objects' group fields */],
  },
}
```

The stable category IDs are `basic-shapes`, `botanical`, `animals`, `geometric-patterns`, `ornaments`, `borders-frames`, `symbols`, and `seasonal`. Categories remain visible when empty. Names and tags are searchable, including Turkish letters and unaccented input. Preview paths are rendered from the same geometry that is inserted.

Use unique asset IDs across the catalog and unique object/group IDs inside each entry. Catalog v1 supports ordinary stitch objects and groups; path-bound groups and layout-only helpers must be converted to independent geometry first. Do not include reference images or project settings. Validate entries with `validLibraryAsset`. `tests/library.test.mjs` checks catalog validity, IDs, editability, insertion into every hoop, and source immutability. `tests/test_library.py` compiles the inserted motifs in standard and small hoops and checks stitch warnings.

## Inserting into a project

Click, Enter or Space inserts at the hoop centre; native drag and drop inserts at the canvas point under the pointer, using the current pan and zoom. Touch users can tap an item. The mobile panel closes after insertion.

`insertLibraryAsset` clones source geometry, remaps object and group IDs, preserves target project settings, shrinks oversized artwork proportionally, clamps placement to the hoop, and checks project limits (80 objects / 12,000 ring points). Fitting and clamping reserve the actual stitch reach of satin columns and borders, including the target fabric's pull compensation. The editor commits insertion as one undo step and selects the added objects. Existing autosave persists the resulting ordinary project data; no catalog dependency is needed to reopen or edit an inserted design. The source asset remains unchanged.

Only a catalog ID travels in `application/x-threadroom-library-asset`; arbitrary dropped JSON is never interpreted as an asset. File imports keep their existing drop behavior. Adding is disabled while a drawing is in progress or the editor is busy.

Run `npm run typecheck`, `npm test`, and `npm run build`, then inspect the panel at desktop and mobile widths. `tests/library.test.mjs` covers search, independent copies, group IDs, placement, proportional fit and rejection at project limits.
