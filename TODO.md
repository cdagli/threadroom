# Threadroom TODO

Gaps against standard embroidery software (Wilcom EmbroideryStudio, Brother PE-Design 11, Hatch, Ink/Stitch), ordered from most to least important for PR1X stitch-outs on baby clothing. Researched 2026-10-05.

Each item must work end to end: editor UI, project validation, compiler, PES export, and SVG export.

## 1. Stitch quality

- [x] **Pull compensation.** Add a per-object setting (mm, with a fabric default) that widens satins and fills against the pull direction. This is the largest risk for real stitch-outs.
- [x] **Fabric profiles.** Replace the woven/jersey preset with profiles (woven, jersey/knit, fleece, terry, …) that set density, underlay and compensation, and that recommend a stabilizer.
- [x] **Short stitches on inner curves, plus automatic satin splitting** for columns too wide to stitch safely.
- [ ] **Entry and exit points.** Let the user choose where each object starts and ends, so travel stitches get shorter.
- [ ] **Lock stitches and trims.** Expose the tie-in/tie-off type and size, and let the user set the jump length at which a trim is used instead.

## 2. Digitizing tools

- [ ] **Two-rail satin columns** with direction lines, for borders and lettering.
- [ ] **Shape tools:** union, cut and offset (for outlines and appliqué allowances), plus rectangle, ellipse and star shapes.
- [ ] **Fill styles:** turning or guided fills, contour/spiral fills, radial fills, gradient (varying density) fills, and motif/pattern fills.
- [ ] **Editing individual stitches** after generating: insert, move or delete a stitch point.
- [ ] **Appliqué workflow:** placement line, stop, tack-down, stop, then cover satin.
- [ ] **Thread colors from real brands:** Brother Embroidery and Madeira catalogs, with matching to the nearest thread.

## 3. Lettering

- [ ] **Embroidery fonts digitized as satin** for small text (4–6 mm), which TTF outline fills render poorly.
- [ ] **Monogram templates, plus text inside a shape or on an envelope.**

## 4. Sequencing and production

- [ ] **Automatic color sort and route optimization**, to reduce color changes and trims.
- [ ] **Object list panel** with grouping, locking and hiding.
- [ ] **Production worksheet:** thread order, stitch count, estimated sewing time and hoop position.
- [ ] **Realistic 3D thread preview.**
- [ ] **Multi-hoop splitting** with alignment marks.

## 5. Import, export and automation

- [ ] **Import other stitch formats** to edit them: DST, EXP, JEF and VP3, beyond the current PES preview.
- [ ] **Auto-digitizing** of colored regions (like PE-Design's Auto Punch), plus photo stitch and cross-stitch wizards.
- [ ] **Sending designs to the machine directly** over WiFi or USB. On the PR1X this usually means a USB stick.
