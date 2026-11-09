# Fidelity and editable paths

Use this when matching supplied artwork closely or repairing a design that looks too simplified.

- Compare source and stitches in the same mm frame before chasing check counts. Inspect face/eye
  positions, silhouette, filled coverage, negative space and colour first; texture comes after these.
  Preserve the source aspect ratio. Thread width is physical: changing design size changes its visual
  weight, so agree on size before a detailed texture pass.
- Keep semantic parts independent. One whisker = one named object, including an optional retraced
  return within that object. Keep highlights and spots separately selectable where practical. Use
  groups for organization; do not union or merge distinct parts to improve cut statistics.
  Test one grouped child: select it in Layers, delete, verify only that ID disappears, then undo.
- Threadroom groups must occupy contiguous sew-order slots. Sorting members apart silently removes
  later memberships. Prefer related groups within colour blocks, or accept additional colour changes
  when an anatomical group is more useful. Re-read `get_design.groups` after reordering.
- A photo of embroidery already contains highlights, shadows and antialiasing. Pixel skeletons can
  become meshes; broad hand-built ribbons can become a different illustration. Treat automatic stroke
  traces as drafts, review them against the source, and simplify image noise below thread width rather
  than sewing every pixel corner. Don't promote source-specific colour thresholds into general defaults.
- Brother PEC's 64 colours can shift muted browns substantially. Compare the sewn render. Use explicit
  custom RGB when fidelity needs it, and distinguish custom colours from assigned catalogue threads.
- `export_design(format:'json', download:false)` abbreviates image `src` values. It is a geometry
  snapshot, not a round-trip backup. Download the full JSON, or restore sources from a known full backup
  before `load_project`. Never load ellipsis-truncated data URLs.
- CLI WebMCP parameter files have a 1 MiB limit. `scripts/webmcp-call.py` handles larger arguments via
  the documented native WebMCP API, saves image/binary results without printing base64, and rejects
  abbreviated image sources on load. Use a named browser session.
- `scripts/compare-reference.py` builds a standalone, aligned SVG from a full project, its PES export
  and a `capture_preview` PNG. It derives actual stitch bounds from PES rather than stretching pictures
  to fit. Run it with the repository's `.venv/bin/python` (pystitch is required):

  ```bash
  .venv/bin/python .agents/skills/embroidery-digitizing/scripts/compare-reference.py \
    --project full-project.json --pes design.pes --preview stitches.png \
    --image-id IMAGE_ID --out comparison.svg
  ```

The comparison is visual QA, not a similarity score or evidence of a physical test sew. Report remaining
material differences and production advisories accurately.
