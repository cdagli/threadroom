# Threadroom editor performance, 2026-10-22

Worktree: `feperf`, branch `ember-feperf`. Baseline source:
`5e389ec97f968dd09b1ff857fc39eca240acb653`; after: uncommitted worktree.
Node v24.14.0, Next 16.3.8 / React 19.3.0, webpack, no browser, no new dependencies.

## Production JS

Unique modern script tags in prerendered route HTML, decimal kB, gzip per file.
This includes framework/runtime and page/layout chunks, excludes the legacy-only
polyfill and lazy chunks. Settings chunks can load on client project restoration.
Build output (Next prints routes rather than chunk sizes) is embedded verbatim in
the size JSON reports. Hashes vary between builds; stable chunk names are used below.

| Route | Before kB | After kB | Before gzip kB | After gzip kB |
|---|---:|---:|---:|---:|
| `/_global-error` | 446.4 | 446.9 | 131.7 | 132.0 |
| `/_not-found` | 586.8 | 587.3 | 173.2 | 173.5 |
| `/` | 1,387.5 | 1,015.9 | 406.8 | 313.9 |

Editor initial raw JS fell 26.8%; gzip fell 22.8%.

Every emitted JS chunk (raw / gzip kB; “—” means absent). An emitted chunk need
not be fetched by the editor. Shared files are counted once in the route totals.

| Chunk (hash omitted) | Before raw / gzip | After raw / gzip | Deferred import / role |
|---|---:|---:|---|
| `app/page.js` | 447.0 / 131.5 | 307.9 / 102.5 |  |
| `858.js` | 241.4 / 66.4 | 241.4 / 66.4 |  |
| `a3bc2aad.js` | 236.0 / 65.2 | 236.0 / 65.2 | lib/fonts.ts -> opentype.js |
| `framework.js` | 218.9 / 69.0 | 218.9 / 69.0 |  |
| `0937d497.js` | 201.1 / 63.3 | 201.1 / 63.3 |  |
| `814.js` | — | 142.2 / 42.4 | Browser worker entry / runtime / translation dictionary |
| `886.js` | 140.1 / 41.3 | 140.2 / 41.3 |  |
| `main.js` | 139.2 / 40.4 | 139.2 / 40.4 |  |
| `675.js` | — | 120.7 / 37.9 |  |
| `656.js` | 117.7 / 37.0 | — |  |
| `polyfills.js` | 112.6 / 39.6 | 112.6 / 39.6 |  |
| `225.js` | — | 54.7 / 6.7 | lib/satin-lettering.ts -> ./fonts-satin/script.json |
| `942.js` | — | 32.9 / 4.2 | lib/satin-lettering.ts -> ./fonts-satin/simplex.json |
| `171.js` | — | 27.6 / 9.5 | lib/editor-jobs.ts -> ./pixel-cross; lib/editor-jobs.ts -> ./svg-import; lib/editor-jobs.ts -> ./trace |
| `483.js` | — | 13.8 / 5.7 | app/studio.tsx -> @/lib/svg-import; lib/editor-jobs.ts -> ./svg-import |
| `342.js` | — | 9.8 / 3.2 | app/studio.tsx -> ./text-panel |
| `200.js` | — | 6.5 / 3.0 | app/pixel-cross.tsx -> ./pixel-cross-dialog |
| `368.js` | — | 6.2 / 2.6 | app/text-panel.tsx -> ./font-picker |
| `8.js` | — | 5.7 / 2.7 | lib/editor-jobs.ts -> ./click-to-stitch |
| `479.js` | — | 4.2 / 2.1 | lib/editor-jobs.ts -> ./trace |
| `871.js` | — | 4.2 / 1.7 | app/worksheet.tsx -> ./worksheet-dialog |
| `266.js` | — | 4.0 / 1.6 | app/map-to-path-control.tsx -> ./map-to-path |
| `952.js` | — | 3.9 / 1.9 | app/io-controls.tsx -> ./image-options |
| `webpack.js` | 3.4 / 1.7 | 3.9 / 2.1 |  |
| `497.js` | — | 3.4 / 1.7 | lib/editor-jobs.ts -> ./pixel-cross |
| `411.js` | — | 3.1 / 1.3 | app/fill-settings.tsx -> ./pattern-picker |
| `527.js` | — | 2.9 / 1.2 | app/studio.tsx -> ./shape-tools |
| `app/_not-found/page.js` | 2.7 / 1.0 | 2.7 / 1.0 |  |
| `581.js` | — | 2.5 / 1.1 | app/studio.tsx -> ./thread-picker |
| `650.js` | 1.9 / 0.9 | 1.9 / 0.9 | ../../../node_modules/@astryxdesign/core/dist/Text/Text.js -> ../Tooltip/Tooltip.js |
| `36.js` | — | 1.7 / 0.9 | lib/editor-jobs.ts -> ./density |
| `954.js` | — | 1.5 / 0.7 | app/thread-picker.tsx -> ./thread-catalogue |
| `550.js` | — | 1.1 / 0.6 | app/io-controls.tsx -> ./svg-import-choice |
| `main-app.js` | 0.5 / 0.2 | 0.5 / 0.2 |  |
| `app/layout.js` | 0.2 / 0.2 | 0.2 / 0.2 |  |
| `next/dist/client/components/builtin/global-error.js` | 0.2 / 0.2 | 0.2 / 0.2 |  |
| `app/_global-error/page.js` | 0.1 / 0.1 | 0.1 / 0.1 |  |
| `next/dist/client/components/builtin/not-found.js` | 0.1 / 0.1 | 0.1 / 0.1 |  |
| `next/dist/client/components/builtin/forbidden.js` | 0.1 / 0.1 | 0.1 / 0.1 |  |
| `next/dist/client/components/builtin/unauthorized.js` | 0.1 / 0.1 | 0.1 / 0.1 |  |
| `next/dist/client/components/builtin/app-error.js` | 0.1 / 0.1 | 0.1 / 0.1 |  |

OpenType, font JSON and optional UI were part of the eager graph before; their new
chunks are deferred, rather than new feature payload. Worker imports share their
own pure helper chunk; its runtime/dictionary is paid when a worker is first used.

## Drag benchmark

`editor-benchmark.mjs`, development React hooks/memo/Profiler with minimal host nodes.
200 measured moves after 40 warm-up moves; bear 7 objects / 561 points; large
60 objects / 9,600 points. Compiled mode uses synthetic commands and checks stale
shape/stitch visibility, exporting a fresh plan after an edit, pointer-up flushing,
whole-gesture undo and pointer cancellation. Assertions also require mounted fill
controls after lazy loading. Storage, checks and background timers are suppressed.
No browser layout/paint, real API compilation or worker wall time is measured.

| Fixture / mode | Before host ms/move | After host ms/move | Before React ms/move | After React ms/move |
|---|---:|---:|---:|---:|
| bear / uncompiled | 19.87 | 3.70 | 11.07 | 1.91 |
| large / uncompiled | 19.26 | 2.24 | 11.34 | 1.08 |
| bear / compiled Objects | 20.10 | 3.74 | 11.13 | 1.89 |
| large / compiled Objects | 20.48 | 3.48 | 11.83 | 2.19 |
| bear / compiled Colours | 19.97 | 3.48 | 11.21 | 1.95 |
| large / compiled Colours | 19.53 | 2.19 | 11.50 | 1.10 |
| bear / compiled burst ×4 | 5.22 | 0.78 | 2.93 | 0.27 |
| large / compiled burst ×4 | 5.06 | 0.68 | 3.01 | 0.34 |

Renders/move (before → after):

- Objects view, both fixtures: Studio 1 → 1; canvas object 1 → 1; object row 1 → 1;
  preview 1 → 1. Existing per-object isolation was already effective.
- Compiled burst ×4, both fixtures: all four counts 0.25 → 0.25 (one render/frame).
- Colours view: Studio/canvas 1 → 1; hidden object rows/previews 0 → 0;
  colour-run rows bear 4 → 0, large 1 → 0.
- Remaining CPU savings come from memoised fill thumbnails, deferred hidden UI and
  collapsed map previews, stable colour runs and selection-keyed overlay paths.

## Verification

- `npm run typecheck`: passed.
- `THREADROOM_PYTHON=.venv/bin/python npm test`: 132 Python and 237 Node tests passed.
- `THREADROOM_PYTHON=.venv/bin/python npm run build`: passed.
- `node --test tests/i18n.test.mjs`: 10 passed.
- `node scripts/editor-worker-smoke.mjs`: emitted webpack worker, its importScripts
  URLs and all lazy imports executed in a Node worker adapter; six job outputs match
  pure functions (including Float32 density transfer), and translated SVG error keys
  survive structured cloning. This supplements, but does not replace, browser tests.
- All eight before/after benchmark rows passed render and behaviour assertions.
- All 40 JS chunks match the static export, including worker and lazy dependencies.
- `git diff --check`: passed. Git was only read; no commits.

The installed Next lazy-loading/client-boundary/bundling/webpack guides were read.
The lazy-loading guide explicitly supports `new Worker()` expressions; the exact
`new Worker(new URL('./editor.worker.ts', import.meta.url))` pattern was verified by
webpack output and the production worker smoke test, without custom configuration.

## Manual browser checks still needed

1. Cold cache in Turkish and English: open worksheet, pixel art, SVG choice, PNG,
   shape tools, thread catalogue, text/font picker and fill settings; check tiny
   loading states, dialog focus/close, first T click and context-menu Offset focus.
   Exercise O/K/A/F/W/7 and normal drawing shortcuts before panels finish loading.
2. Trace bear art; start another trace or edit/delete the reference during a job.
   Tool 7: hover, rapid successive clicks (including Shift outlines), change
   tolerance, switch tools and undo; inspect holes, order and no late insertions.
3. Large pixel input: rapidly change grid/colour/Brother options, paint/erase, close
   during computation, reopen, create and undo; confirm the newest preview wins.
4. Import a large transformed/compound SVG and SVG with CSS colours; test both
   choices, groups, editable points, undo and concurrent edits during import.
   Browser XML decoding/CSS resolution still run on the main thread; all SVG path
   parsing/flattening/transforms/joining/validation run on the worker snapshot.
5. Density: radius changes, pan/zoom, playback scrub, recompilation and quick toggle
   off/on; inspect alignment, stable heat image and no stale grid appearing.
6. Satin lettering: cold style switch, type Turkish characters, both fonts and all
   layouts, transform, save/reload/autosave, convert and PES/SVG export. Search and
   upload outline fonts; verify text input focus after the first chunk loads.
7. PNG: fabric/transparency/reference-image options and large resolutions.
   Worksheet: A4/Letter preview, print and unit labels. Drag/scale/rotate/nudge in
   Objects and Colours views, hide/lock/group/reorder and undo in Lines and Thread.

## Files changed

- `PLAN.md`
- `README.md`
- `app/density-view.tsx`
- `app/fill-settings.tsx`
- `app/font-picker.tsx`
- `app/image-options.tsx`
- `app/io-controls.tsx`
- `app/io-modal.tsx`
- `app/knife-overlay.tsx`
- `app/layers-panel.tsx`
- `app/map-to-path-control.tsx`
- `app/map-to-path.tsx`
- `app/panel-loading.tsx`
- `app/pattern-picker.tsx`
- `app/pixel-cross-dialog.tsx`
- `app/pixel-cross.tsx`
- `app/shape-tools.tsx`
- `app/stitch-overlays.tsx`
- `app/studio.tsx`
- `app/svg-import-choice.tsx`
- `app/text-panel.tsx`
- `app/thread-catalogue.tsx`
- `app/thread-picker.tsx`
- `app/worksheet-dialog.tsx`
- `app/worksheet.tsx`
- `lib/artwork-color.ts`
- `lib/editor-jobs.ts`
- `lib/editor-task.ts`
- `lib/editor.worker.ts`
- `lib/fonts.ts`
- `lib/satin-lettering.ts`
- `lib/svg-import.ts`
- `lib/trace.ts`
- `performance/editor-benchmark-after.jsonl`
- `performance/editor-benchmark-before.jsonl`
- `performance/editor-performance.md`
- `performance/editor-sizes-after.json`
- `performance/editor-sizes-before.json`
- `scripts/editor-benchmark.mjs`
- `scripts/editor-sizes.mjs`
- `scripts/editor-worker-smoke.mjs`
- `scripts/test.mjs`
- `tests/angle-guides.test.mjs`
- `tests/editor-worker.test.mjs`
- `tests/load-lib.mjs`
- `tests/project.test.mjs`
- `tests/satin-lettering.test.mjs`

## Raw records and reproduction

- [Before sizes/build output](editor-sizes-before.json)
- [After sizes/build output](editor-sizes-after.json)
- [Before all benchmark modes](editor-benchmark-before.jsonl)
- [After all benchmark modes](editor-benchmark-after.jsonl)

```sh
THREADROOM_PYTHON=.venv/bin/python npm run build
node scripts/editor-sizes.mjs .next
node scripts/editor-worker-smoke.mjs
node scripts/editor-benchmark.mjs --revision=5e389ec97f968dd09b1ff857fc39eca240acb653 --compiled
node scripts/editor-benchmark.mjs --compiled
node scripts/editor-benchmark.mjs --compiled --colours
node scripts/editor-benchmark.mjs --compiled --burst
```

Omit `--compiled` for the uncompiled mode; add `--revision=...` to each mode for
the baseline. Source is read from git without changing this worktree. Absolute ms
vary with machine load; these reports are individual warmed runs, not browser FPS.
