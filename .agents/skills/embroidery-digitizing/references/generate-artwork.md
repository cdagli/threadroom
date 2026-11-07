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
| Outline only for a single figure | One outline = one bean object; an outline around *every* shape of a scene adds one object and one trim per shape | single figure: "even dark outline about 1/60 of the image width"; scenes: "no outlines, adjacent colour areas meet directly" |
| Small elements in a dark colour | Snowflakes, stars and dots must read on light fabric without an outline | "small elements (snowflakes) solid [dark colour]" |
| Few separate elements | Every separate element is at least one object and one trim | scenes: 3–6 elements, not many repeated tiny ones |
| No text | Lettering is done with `add_text` | "no text, letters or logos" |

Pick N from the subject: 4 for an icon, 5–6 for a character or small scene. Map the planned colours to Brother threads up
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

- Either route works (no worktree isolation in either):
  - **Direct (also works inside a subagent):** from the repo root run
    `node <codex plugin>/scripts/codex-companion.mjs task --write "<prompt>"`. It runs in the foreground
    and prints the result itself — about 2–3 minutes for one image.
  - **Agent:** spawn `codex:codex-rescue` with the prompt. If it hands back a background job id, wait with
    `… status <job>` in a background loop, then read `… result <job>`.
- For a revision, ask Codex to edit the previous file ("keep the composition of <file>; change only …").
- Check the file exists and look at it (Read the PNG). Reject and regenerate with **one** targeted change
  if it has a background, gradients, more colours than asked, cropped parts or details that are too small.
- `agent-out/` (repo root) is git-ignored and not served by the app. Don't use `out/` (the
  `next build` static export writes and clears it) or `public/` (it would ship with the site).

## 3. Import and digitise

1. `set_status` "Importing the generated artwork…".
2. Load the file into the editor (pick one):
   - **Claude in Chrome:** locate the hidden `input[type=file]` (its label is localised, e.g. Turkish
     "Görsel veya proje içe aktar", so don't search by the English text), then `file_upload` with the
     absolute `agent-out/<slug>.png` path. Don't click the input — that opens a native picker.
   - **Native WebMCP client:** read the file, then `import_reference_image` with
     `url: "data:image/png;base64,…"` (keep the PNG under 8 MB; ask for a 1024 px image).
   Then `get_design` for the new image id and `update_reference_image` to size it for the hoop
   (leave ≥ 3 mm margin).
3. Follow the main workflow. Flat art makes it much faster:
   - Silhouette: `trace_outline` mode `alpha`.
   - Each colour area: `trace_outline` mode `colour` with a point inside it (and `holes:true` where needed)
     instead of reading coordinates by eye; use `view_reference` only to check and to place line details.
     Check every seed point with `sample_colors` first — points picked by eye often land on a neighbour.
     `tolerance` 12–18 suits flat art; 30 merged red into brown.
   - A flood trace with `holes:false` is only that colour's outer ring: a U-shaped border does not include
     the panel it surrounds. Trace enclosed areas separately.
   - `sample_colors` on each area → `find_threads` → `threadCode`.
   - Recipe that gave 0 thin parts (traced neighbours share edges only approximately):
     1. Edge regions (touching the silhouette): raw trace `offset` +0.6, then `intersect` with a silhouette copy.
     2. Interior regions: raw trace `offset` +0.3, so neighbours overlap instead of leaving gaps.
     3. Base cutters: copies of every region made *before* clipping, including enclosed ones. Then do
        SKILL.md step 9: `union`, `offset` +0.6 / −1.0, `subtract`.
   - **Scene without outlines (no shared base): fastest path.** Add one closed fill per flood-traced
     colour region, in layer order, then `offset` +0.3 on every region that sits on top of a neighbour.
     The cats-and-pothos scene (14 regions) reached 0 fail and 4 checks with no base cutting. Use the
     180×130 hoop for scenes; leaves at 100×100 get too small.
   - Small panels with motifs inside (a 137 mm² saddle with a tulip): don't punch holes for the motifs.
     Keep the panel whole with `underlay:'none'` and lay the details on top, also with `underlay:'none'`.
4. Tell the user the image path (`agent-out/<slug>.png`) and that it is a generated reference.
