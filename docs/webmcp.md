# AI agent tools (WebMCP)

Threadroom registers its editor actions as [WebMCP](https://developer.chrome.com/docs/ai/webmcp) tools on
`document.modelContext`. A browser agent can call them to read the design, read and explain issues the way
the check panel shows them, digitise artwork, edit, fix and export, without scraping the page. Each change
goes through the editor's normal commit path: one undo step, the same validation as the UI, and an
"AI agent: …" toast so you can see what happened.

The tools live in `app/agent-tools.tsx` (registration, via `lib/use-webmcp.ts`, a local backport of
[`use-webmcp-tool`](https://github.com/GoogleChromeLabs/use-webmcp-tool)'s async registration fix)
and `lib/agent-tools.ts` (pure summaries, issue reports and validated edits, tested in `tests/agent-tools.test.mjs`).
Where `document.modelContext` doesn't exist, registration does nothing.

## Enable

- Chrome 149 or later. For local development, open `chrome://flags/#enable-webmcp-testing`, set it to
  **Enabled** and relaunch. Deployed origins can join the WebMCP origin trial instead.
- To inspect and call tools by hand, install the **Model Context Tool Inspector** extension, open
  Threadroom (`npm run dev`) and pick a tool. DevTools also shows how Chrome parses each JSON Schema.
- Tools are available only in the top-level page or same-origin frames (the `tools` permissions policy).

## Conventions

- Lengths are millimetres. The hoop's top-left corner is `(0, 0)`; x grows right and y grows down. Angles are degrees.
- Objects are identified by `id` (from `get_design`). Tools that act on objects take `ids`; when you omit
  it they use the user's current selection, except `set_sew_order`, which requires a nonempty list.
- A design holds at most 80 objects. Everything must stay inside the hoop.
- Reading tools are marked `readOnlyHint`. Tools that return object names, text or file names are also marked
  `untrustedContentHint`, so agents treat that content as data. `load_project` and `new_design` replace the
  open design and are marked `consequentialHint`. They stay undoable.
- Results and errors are always English, whatever the UI language (editor messages are mapped back from
  Turkish). The "AI agent: …" toast the user sees follows the UI language.
- Arguments are validated against each tool's schema before the tool runs, because browsers don't enforce
  it. Unknown keys, missing required keys, wrong types, enum values, ranges and nested items return an error
  such as `Unknown argument 'size'. Allowed: shape, center, width, height, kind, color, name.`

## Tools

| Tool | What it does |
| --- | --- |
| `get_reference` | Stitch kinds, fill patterns, underlays, hoops, fabrics, lock types, limits, shapes, commands, suggested workflow |
| `find_threads` | Brother PEC catalogue: nearest colours by CIEDE2000, case-insensitive name substring or exact code; combine filters; default five search results (max 64), or the whole catalogue without filters. Apply with `update_objects` `settings.threadCode` |
| `get_design` | Project setup and every object in stitch order, with bounds, colour, thread and key settings |
| `get_objects` | Full and resolved (inherited) settings; with `geometry: true`, point lists too |
| `list_issues` | The check panel: severity, object, bounds, title, why it matters, how to fix it, one-click fix; can wait for stitch-level checks |
| `get_stitch_report` | Stitches, jumps, trims, colour changes, size, estimated sewing time, thread sequence |
| `get_editor_state` | Tool, selection, panel, zoom, view toggles, undo depth, engine status, last message or error |
| `capture_preview` | PNG of the design: a realistic stitch render, or shapes on the hoop |
| `select_objects` | Select objects or a reference image, optionally panning to them |
| `edit_objects` | Right-click commands: copy, cut, paste, duplicate, delete, group, lock, hide, redwork, order, flip, rotate… |
| `set_sew_order` | Listed ids fill their existing slots in the given order; unlisted objects stay in place. All ids give a full permutation in one undo step. Sew order is layer order; later objects sew on top. Group colours and minimise jumps |
| `update_objects` | Stitch settings, colour or Brother thread, stitch kind, density, underlay, ties, entry and exit |
| `add_shape` | Circle, rectangle, star, triangle, diamond, hexagon, heart |
| `add_path` | Open line, closed fill, satin block or manual points, with corner or smooth anchors |
| `add_text` / `update_text` | Lettering with catalogue or satin fonts, layout, size and position; convert to shapes |
| `get_points` | The editable anchors of one object, by ring and index: curve anchors with corner flags, satin-block rails (rung k is index k on both rails) or polyline points, plus the start and end points |
| `edit_points` | One undo step of point edits: `move` (`to` or `by`), `insert` (`afterIndex`, `at`, `corner`), `remove`, `set_corner`, `set_end` (entry/exit, `null` for automatic) |
| `transform_objects` | Move, scale, rotate, set position or size, align |
| `shape_operation` | Union, subtract, intersect, flatten, cut holes, offset, knife, cut a hole |
| `apply_issue_fix` | Apply one issue's one-click fix, or every available fix |
| `focus_issue` | Show an issue in the UI (select, pan, open the check panel) |
| `update_project` | Name, hoop, fabric, sewing speed, locks, trim distance, resize the design |
| `history` | Undo or redo |
| `import_reference_image` / `update_reference_image` | Add artwork from a URL or data URL; move, size, fade, hide or delete it |
| `auto_digitise` | Trace a reference image into colour fills |
| `stitch_region` | Click to stitch: fill or outline the colour area under a point |
| `set_view` | Tool, zoom or fit, grid, rulers, jumps, density map, realistic view, panel, sewing simulation |
| `export_design` | PES, SVG, PNG or project JSON: download it, or return the content |
| `load_project` / `new_design` | Replace the open design (undoable) |

## Example flows

**Digitise a logo.** `import_reference_image` → `update_reference_image` to the target size →
`auto_digitise` (`colours: 4`) → `list_issues` → `apply_issue_fix` (`all: true`) → `update_objects`
for anything left (for example, `kind: "running"` for hairlines) → `capture_preview` → `export_design` (`pes`).

**Explain a problem.** `list_issues` → `focus_issue` on the first `fail` → `get_objects` for that object
→ explain `why` and `howToFix` with the resolved spacing, underlay and fabric → offer the `autoFix`.

**Reshape an outline.** `get_points` on the object → `edit_points` with, for example,
`[{op:"move",index:2,by:[0,-3]},{op:"set_corner",index:2,corner:false},{op:"insert",afterIndex:4,at:[42,61]}]`.
Operations apply in order, so later indices refer to the result of earlier ones. The edit keeps the editor's
minimums (3 points for closed shapes, 2 for lines, 2 rungs for satin blocks) and stays inside the hoop.
Locked, hidden, text and redwork objects are refused.

**Analyse the design.** `get_stitch_report` (sewing time, colour changes, trims) → `set_view`
(`density: true`) → `capture_preview` (`mode: "stitches"`) → suggest merging colours or reordering
with `set_sew_order` to reduce thread changes and jumps. Use `find_threads` to choose colours, then
apply the returned code with `update_objects` (`settings: {threadCode: "2"}`).
