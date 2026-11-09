# Generating digitise-ready artwork with Codex imagegen

Use only when the user asks for it ("draw / generate / make me an image of … and digitise it"). Never
generate an image just because no reference exists — ask first.

## 1. Turn the description into a spec

Keep the user's subject, pose, mood and any colours they named. Then write the prompt in two layers: an
**art direction** that makes it look designed by an illustrator, and **sewability guardrails** that keep
it digitisable. The guardrails don't cause the clip-art look. Certain prompt words do: "flat vector",
"sticker", "icon", "patch", "bold simple shapes" with nothing else, a dead-centre symmetrical mascot, an
even black outline, and default primary colours. Together those reliably produce stock clip art.

### 1a. Art direction: pick one, describe it like an illustrator's brief

| Direction | Looks like | Prompt phrases | Stitches as |
| --- | --- | --- | --- |
| Linocut / block print | Carved chunky shapes, white gouge marks cutting into colour, 2–4 inks on paper, slightly wobbly edges | "hand-carved linocut print look, chunky carved shapes with a few bold gouge marks, imperfect hand-cut edges, ink colours" | Angled fills; gouge marks become gaps or running-stitch lines |
| Folk art (Scandinavian, Otomi, Polish paper-cut) | Stylised flowers, birds and leaves, ornamental rhythm, dot-and-petal decoration | "contemporary folk-art illustration, stylised ornamental flowers and leaves, decorative dots and petal motifs, gentle near-symmetry" | Fills, satin dots, bean details |
| Mid-century storybook | Gouache shapes, playful proportions, quirky characters, slight colour offset | "1950s–60s children's-book illustration, gouache-like flat shapes, playful exaggerated proportions, whimsical and charming" | Fills with few lines; offset colour patches stay separate fills |
| Cut-paper collage | Layered cut or torn shapes, organic edges, overlaps | "cut-paper collage, layered hand-cut shapes with organic edges, overlapping pieces, Matisse-era cut-out spirit" | Overlapping fills in layer order |
| Inked line + spot colour | Confident brush line with varying weight, 1–2 loose colour patches slightly off the line | "confident hand-inked brush line with natural weight variation, loose spot-colour shapes slightly offset from the line, risograph feel" | Bean or satin lines over a few fills |
| Crewelwork / sampler | Jacobean scrolls, sampler motifs, shapes drawn with stitch-direction marks | "modern crewelwork design, Jacobean-inspired leaves and scrolls, stitch-direction lines drawn inside shapes" | Direction zones, fishbone, satin, running stitch (see stitch-art.md) |

Pick the direction that suits the subject and the product. Whimsy works for gifts and kids; linocut,
crewel and line-plus-spot read as more grown-up and stylish. For a new product design, generate **two
contrasting directions** and let the user choose before digitising.

Always add 2–4 craft cues:

- **Hand-made edges:** "organic, slightly irregular hand-drawn edges, not vector-perfect".
- **One charming detail or story:** a robin on the tree, a dog's head out of the truck window, a tiny
  wrapped gift. One detail, not ten.
- **Composed, not centred:** "asymmetric but balanced composition, intentional negative space, slight
  tilt or movement". The subject still sits fully inside the canvas.
- **A considered palette:** muted, harmonious colours (brick red, pine, oat, ink navy, mustard) rather
  than pure red, green and blue. Name the Brother hexes.
- **Decorative marks inside shapes:** dots, dashes, stripes or hatching drawn as lines at least 1/100 of
  the image width. They become running stitch and stitch-art texture, which is where the hand-made feel comes from.
- **Line character:** if there are lines, give them natural weight variation (≥ 1/100 width at the thinnest).

Always avoid: "clip art, stock vector, icon, emoji, sticker, mascot, logo style, glossy highlights,
3D render, uniform thick black outline around every shape, pure primary colours, perfect symmetry,
generic cartoon faces with big shiny eyes".

### 1b. Sewability guardrails

| Embroidery need | Why | Put in the prompt |
| --- | --- | --- |
| Transparent background | `trace_outline` mode `alpha` gives the exact silhouette | "transparent background (real alpha), no ground, no shadow, no backdrop" |
| One subject or small group, fully in frame | One outline, nothing cropped | "whole subject visible with margin on all sides" |
| 4–6 flat colours | One region per thread, `trace_outline` mode `colour` per area | "flat solid colour areas, at most N colours, no gradients, no soft shading, no photographic texture" (drawn decorative marks are fine) |
| Shapes big enough | Fills must be ≥ 2 mm wide at hoop size | "smallest filled shape at least 1/30 of the image width; drawn marks at least 1/100" |
| Clear separation | Colour regions must not blend | "hard edges between colour areas, no airbrush or soft blending, no fur strands" |
| Outline only where it adds character | One outline = one bean object; an outline around *every* shape of a scene adds one object and one trim per shape | single figure: "hand-inked outline with gentle weight variation, about 1/60 of the image width"; scenes: "no outlines, adjacent colour areas meet directly" |
| Small elements in a dark colour | Snowflakes, stars and dots must read on light fabric without an outline | "small elements (snowflakes) solid [dark colour]" |
| Few separate elements | Every separate element is at least one object and one trim | scenes: 3–6 elements, not many repeated tiny ones |
| No text | Lettering is done with `add_text` | "no text, letters or logos" |

Pick N from the subject: 4 for a small motif, 5–6 for a character or small scene. Map the planned colours to Brother threads up
front with `find_threads` and name them in the prompt ("brick red #b8312f, oat #efe3b9, …"), so
the art already uses colours you can stitch.

Prompt template (fill the brackets, keep the labels):

```
Use the imagegen skill (built-in image_gen tool) to create one image.
Use: original artwork for a stylish hand-crafted embroidery product; it will be converted to machine embroidery.
Subject: [user's subject, pose, expression] + [one charming detail].
Art direction: [direction from the table, written as an illustrator's brief]. [2–4 craft cues]. It should look like a piece from an independent illustrator's print shop, not clip art.
Colours: a considered palette of at most [N] flat colours: [name #hex, …]. Solid colour areas with hard edges; no gradients, airbrush, soft shading or photographic texture. Drawn decorative marks (dots, dashes, hatching) are welcome.
Detail: smallest filled shape at least 1/30 of the image width; drawn lines and marks at least 1/100 of the image width.
Composition: [asymmetric but balanced / gentle near-symmetry], intentional negative space, whole subject visible with generous margin, [square / portrait / landscape] canvas.
Background: transparent (real alpha channel), no ground line, no shadow, no backdrop.
Avoid: clip art, stock vector, icon, emoji, sticker or mascot look, glossy highlights, 3D render, uniform thick black outlines around every shape, pure primary colours, generic cartoon faces, text, letters, logos, photorealism, hairlines, tiny details.
After generating, copy the final PNG to [ABSOLUTE PROJECT PATH]/agent-out/[slug].png
(create the folder; never overwrite — add -v2, -v3) and reply with that path and the prompt you used.
```

Save the prompt next to the image as `agent-out/[slug]-prompt.txt` so a good style can be reused.

## 2. Run it through Codex

- Either route works (no worktree isolation in either):
  - **Direct (also works inside a subagent):** from the repo root run
    `node <codex plugin>/scripts/codex-companion.mjs task --write "<prompt>"`. It runs in the foreground
    and prints the result itself — about 2–3 minutes for one image.
  - **Agent:** spawn `codex:codex-rescue` with the prompt. If it hands back a background job id, wait with
    `… status <job>` in a background loop, then read `… result <job>`.
- For a revision, ask Codex to edit the previous file ("keep the composition of <file>; change only …").
- Check the file exists and look at it (Read the PNG). Reject and regenerate with **one** targeted change
  if it has a background, gradients, more colours than asked, cropped parts or details that are too small,
  or if it reads as clip art. Test: would it fit in an independent illustrator's print shop or on a
  hand-printed card? If not, push the art direction further (more hand-made edges, a better palette,
  a story detail) rather than adding complexity.
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
   - **One colour forming a connected network** (navy stems joined to dark leaf halves): flood tracing
     returns the whole network. Vectorise offline instead: label pixels by palette, `opening` with a disk wider
     than the stems → bodies; the remainder → skeleton → stem centre lines. Then fix the joins (lessons.md
     "Fourth run"), because skeleton ends stop short.
   - **Scene without outlines (no shared base): fastest path.** Add one closed fill per flood-traced
     colour region, in layer order, then `offset` +0.3 on every region that sits on top of a neighbour.
     The cats-and-pothos scene (14 regions) reached 0 fail and 4 checks with no base cutting. Use the
     180×130 hoop for scenes; leaves at 100×100 get too small.
   - Small panels with motifs inside (a 137 mm² saddle with a tulip): don't punch holes for the motifs.
     Keep the panel whole with `underlay:'none'` and lay the details on top, also with `underlay:'none'`.
4. Tell the user the image path (`agent-out/<slug>.png`) and that it is a generated reference.
