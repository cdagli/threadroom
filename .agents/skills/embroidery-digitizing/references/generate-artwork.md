# Generating digitise-ready artwork with Codex imagegen

Use only when the user asks for it ("draw / generate / make me an image of … and digitise it"). Never
generate an image just because no reference exists — ask first.

## 1. Turn the description into a spec

Keep the user's subject, pose, mood and any colours they named. Add only what makes the result sewable:

| Embroidery need | Why | Put in the prompt |
| --- | --- | --- |
| Transparent background | `trace_outline` mode `alpha` gives the exact silhouette | "transparent background (real alpha), no ground, no shadow, no backdrop" |
| One centred subject, fully in frame | One outline, nothing cropped | "single subject, centred, whole figure visible with margin on all sides" |
| 4–6 flat colours | One region per thread, `trace_outline` mode `colour` per area | "flat solid colours only, at most N colours, no gradients, no shading, no texture, no highlights" |
| Big, simple shapes | Fills must be ≥ 2 mm wide at hoop size | "bold simple shapes, smallest detail at least 1/30 of the image width" |
| Clear separation | Colour regions must not blend | "hard edges between colour areas, no anti-aliased soft blending, no fur strands" |
| Optional outline | Becomes one bean/satin outline object | "even dark outline about 1/60 of the image width" (skip if the user wants a soft look) |
| No text | Lettering is done with `add_text` | "no text, letters or logos" |

Pick N from the subject: 4 for an icon, 5–6 for a character. Map the planned colours to Brother threads up
front with `find_threads` and name them in the prompt ("tangerine orange #fe9e32, beige #efe3b9, …"), so
the art already uses colours you can stitch.

Prompt template (fill the brackets, keep the labels):

```
Use the imagegen skill (built-in image_gen tool) to create one image.
Use: artwork that will be converted to machine embroidery.
Subject: [user's subject, pose, expression].
Style: flat vector sticker / embroidery-patch illustration, bold simple shapes, [optional: even dark outline about 1/60 of the image width].
Colours: flat solid fills only, at most [N] colours: [name #hex, …]. No gradients, shading, texture, highlights or fur strands.
Detail: smallest feature at least 1/30 of the image width; hard edges between colour areas.
Composition: single subject centred, whole figure visible, generous margin, [square / portrait] canvas.
Background: transparent (real alpha channel), no ground line, no shadow, no backdrop.
Avoid: text, letters, logos, photorealism, thin lines, tiny details.
After generating, copy the final PNG to [ABSOLUTE PROJECT PATH]/agent-out/[slug].png
(create the folder; never overwrite — add -v2, -v3) and reply with that path and the prompt you used.
```

## 2. Run it through Codex

- Spawn the `codex:codex-rescue` agent with the prompt above (no worktree isolation). It returns a job id;
  wait for the job to finish (`node <codex plugin>/scripts/codex-companion.mjs status <job>` in a
  background loop), then read the result with `… result <job>`.
- Check the file exists and look at it (Read the PNG). Reject and regenerate with **one** targeted change
  if it has a background, gradients, more colours than asked, cropped parts or details that are too small.
- `agent-out/` (repo root) is git-ignored and not served by the app. Don't use `out/` (the
  `next build` static export writes and clears it) or `public/` (it would ship with the site).

## 3. Import and digitise

1. `set_status` "Importing the generated artwork…".
2. Load the file into the editor (pick one):
   - **Claude in Chrome:** `find` the hidden file input labelled "Import artwork or project"
     (accepts .png/.jpg/.webp/.svg), then `file_upload` with the absolute `agent-out/<slug>.png` path.
     Don't click the input — that opens a native picker.
   - **Native WebMCP client:** read the file, then `import_reference_image` with
     `url: "data:image/png;base64,…"` (keep the PNG under 8 MB; ask for a 1024 px image).
   Then `get_design` for the new image id and `update_reference_image` to size it for the hoop
   (leave ≥ 3 mm margin).
3. Follow the main workflow. Flat art makes it much faster:
   - Silhouette: `trace_outline` mode `alpha`.
   - Each colour area: `trace_outline` mode `colour` with a point inside it (and `holes:true` where needed)
     instead of reading coordinates by eye; use `view_reference` only to check and to place line details.
   - `sample_colors` on each area → `find_threads` → `threadCode`.
   - Still apply extend-and-clip for regions on the outline and the clean base cut (SKILL.md steps 7–9):
     traced neighbours share edges only approximately.
4. Tell the user the image path (`agent-out/<slug>.png`) and that it is a generated reference.
