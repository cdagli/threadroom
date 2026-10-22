The PES/PEC byte layout, metadata reading, and Brother thread palette used by
this independent JavaScript reader are based on the pyembroidery project:
https://github.com/EmbroidePy/pyembroidery

MIT License

Copyright (c) 2018

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

polygon-clipping 0.15.7 (https://github.com/mfogel/polygon-clipping) computes the
union, difference, intersection and XOR of polygons for the shape tools. MIT License,
Copyright (c) 2018 Mike Fogel, with portions Copyright (c) 2016 Alexander Milevski
(martinez). Its dependency splaytree 3.2.3 (https://github.com/w8r/splay-tree) is MIT
licensed, by Alexander Milevski. robust-predicates 3.0.3
(https://github.com/mourner/robust-predicates) is listed as a dependency and is in
the public domain (Unlicense).

opentype.js (https://github.com/opentypejs/opentype.js) parses font outlines in
the browser. MIT License, Copyright (c) 2020 Frederik De Bleser.

Fonts are downloaded at runtime from Fontsource (https://fontsource.org) via
jsDelivr. `public/fonts/catalog.json` lists Google Fonts metadata; each font
keeps its own licence (SIL Open Font License 1.1 or Apache 2.0) shown by
Fontsource. The test fixtures `tests/fixtures/nunito-*.ttf` are subsets of Nunito,
Copyright 2014 The Nunito Project Authors, SIL Open Font License 1.1.


---

## Hershey satin lettering

`lib/fonts-satin/simplex.json` and `script.json` are generated from the public-domain
Hershey Roman Simplex and Script Simplex stroke data, not from Ember fonts. The
vendored source is `scripts/hershey/hershey.txt`, downloaded from:
https://raw.githubusercontent.com/LingDong-/p5-hershey-js/master/hershey.txt
SHA-256: f64628825b4bc40461cc8c7cd3868b9a765969c738fea7a541ccc17fb7f77ef9

The ASCII maps are the standard `romans.hmp` / `scripts.hmp` maps, also recorded at
https://github.com/LingDong-/p5-hershey-js/blob/master/p5.hershey.data.js
and https://paulbourke.net/dataformats/hershey/scripts.hmp . The original distribution's
notice is preserved at https://github.com/bjnortier/hershey/blob/develop/HERSHEY-LICENSE .

Acknowledgements required by the original distribution:

- The Hershey Fonts were originally created by Dr. A. V. Hershey while working
  at the U. S. National Bureau of Standards.
- The format of the font data in this distribution was originally created by
  James Hurt, Cognition, Inc., 900 Technology Park Drive, Billerica, MA 01821
  (mit-eddie!ci-dandelion!hurt).

The public-domain glyphs may be used for any purpose, commercial or otherwise,
with these acknowledgements distributed with the data. Conversion into the
particular NTIS distribution format is excluded by the original notice. Our
em-unit JSON and the vendored packed coordinate data are not that format.

The download mirror also supplies this MIT licence (retained conservatively
with the data; no renderer code was copied):

MIT License

Copyright (c) 2018 Lingdong Huang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Regenerate offline with `.venv/bin/python scripts/generate-satin-fonts.py`; add `--check` to verify byte-identical JSON.
The generator verifies the source checksum and every Hershey record length.
The data retains advances and strokes in em units (capital height = 1).
Turkish forms compose the existing letters with Hershey dots, commas and the
lower half of the Hershey `o` for the breve; dotless `ı` removes the detached dot
from `i`. Curly quotes/dashes reuse the corresponding Hershey ASCII marks.
