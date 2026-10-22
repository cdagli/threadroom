#!/usr/bin/env python3
"""Convert the vendored public-domain Hershey strokes to Threadroom em polylines.
Run: .venv/bin/python scripts/generate-satin-fonts.py [--check]
Source/mappings and acknowledgements: THIRD-PARTY-NOTICES.md. No Ember data.
"""
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'scripts/hershey/hershey.txt'
SHA = 'f64628825b4bc40461cc8c7cd3868b9a765969c738fea7a541ccc17fb7f77ef9'
# Original ASCII maps (32 through 126), standard romans.hmp / scripts.hmp.
MAPS = {
    'simplex': '699 714 717 733 719 2271 734 731 721 722 2219 725 711 724 710 720 700-709 712 713 2241 726 2242 715 2273 501-526 2223 804 2224 2262 999 730 601-626 2225 723 2226 2246',
    'script': '699 2764 2778 733 2769 2271 2768 2767 2771 2772 2773 725 2761 724 710 2770 2750-2759 2762 2763 2241 726 2242 2765 2273 551-576 2223 804 2224 2262 999 2766 651-676 2225 723 2226 2246',
}

def read_source():
    data = SOURCE.read_bytes()
    assert hashlib.sha256(data).hexdigest() == SHA, 'Unexpected Hershey source checksum'
    records = {}
    ident = None
    for line in data.decode('ascii').splitlines():
        if re.match(r'^\s*\d', line[:5]):
            ident = int(line[:5])
            records[ident] = line[5:]
        elif line and ident is not None:
            records[ident] += line
    result = {}
    for ident, record in records.items():
        count = int(record[:3])
        coords = record[3:]
        assert len(coords) == count * 2, (ident, count, len(coords))
        left, right = [ord(c)-ord('R') for c in coords[:2]]
        strokes, stroke = [], []
        for i in range(2, len(coords), 2):
            pair = coords[i:i+2]
            if pair == ' R':
                if stroke: strokes.append(stroke)
                stroke = []
            else:
                # Capital height 21 Hershey units; baseline y=9, y points down.
                stroke.append([(ord(pair[0])-ord('R')-left)/21, (ord(pair[1])-ord('R')-9)/21])
        if stroke: strokes.append(stroke)
        result[ident] = {'advance': (right-left)/21, 'strokes': strokes, 'source': ident}
    return result


def fit(strokes, cx, top, width, height):
    points = [p for s in strokes for p in s]
    x0, y0 = [min(p[k] for p in points) for k in (0, 1)]
    x1, y1 = [max(p[k] for p in points) for k in (0, 1)]
    return [[[cx-width/2+(x-x0)/(x1-x0 or 1)*width, top+(y-y0)/(y1-y0 or 1)*height] for x, y in s] for s in strokes]


def generate(kind, records):
    ids = []
    for token in MAPS[kind].split():
        ends = list(map(int, token.split('-')))
        ids.extend(range(ends[0], ends[-1]+1))
    assert len(ids) == 95
    glyphs = {chr(32+i): records[ident] for i, ident in enumerate(ids)}
    # Compose Turkish using actual Hershey marks; no newly digitised glyphs.
    dot = glyphs['.']['strokes']
    comma = glyphs[',']['strokes']
    # A breve is the lower half of Hershey's o, fitted above g/G.
    oval = glyphs['o']['strokes'][0]
    mid = (min(y for x,y in oval)+max(y for x,y in oval))/2
    breve = [[p for p in oval if p[1] >= mid]]
    for ch, base, mark in [('ç','c','cedilla'),('Ç','C','cedilla'),('ş','s','cedilla'),('Ş','S','cedilla'),('ğ','g','breve'),('Ğ','G','breve'),('ö','o','diaeresis'),('Ö','O','diaeresis'),('ü','u','diaeresis'),('Ü','U','diaeresis'),('İ','I','dot')]:
        src = glyphs[base]
        strokes = src['strokes']
        pts = [p for s in strokes for p in s]
        cx = (min(x for x,y in pts)+max(x for x,y in pts))/2
        top, bottom = min(y for x,y in pts), max(y for x,y in pts)
        if mark == 'cedilla': extra = fit(comma,cx,bottom+.18,.18,.25)
        elif mark == 'breve': extra = fit(breve,cx,top-.4,.42,.18)
        elif mark == 'dot': extra = fit(dot,cx,top-.35,.08,.08)
        else: extra = fit(dot,cx-.19,top-.35,.08,.08)+fit(dot,cx+.19,top-.35,.08,.08)
        glyphs[ch] = {'advance':src['advance'], 'strokes':strokes+extra, 'composition':[base,mark]}
    # Both simplex i forms have their detached dot before the stem.
    src = glyphs['i']
    stem = max(src['strokes'],key=lambda s:max(p[1] for p in s)-min(p[1] for p in s))
    glyphs['ı'] = {'advance':src['advance'],'strokes':[stem],'composition':['i','remove dot']}
    for ch, base in [('’',"'"),('‘',"'"),('“','"'),('”','"'),('–','-'),('—','-')]:
        glyphs[ch] = {**glyphs[base], 'composition':[base]}
    # Canonical decimal rounding and ordering make regeneration byte deterministic.
    data = {'name':'Hershey '+('Simplex' if kind=='simplex' else 'Script'), 'unitsPerEm':1, 'capHeight':1,
            'sourceSha256':SHA,'glyphs':glyphs}
    return re.sub(r'-?\d+\.\d+(?:e[+-]?\d+)?', lambda m: str(round(float(m[0]),6)), json.dumps(data,ensure_ascii=False,separators=(',',':'))) + '\n'


if __name__ == '__main__':
    records = read_source()
    for kind in MAPS:
        target = ROOT / f'lib/fonts-satin/{kind}.json'
        data = generate(kind,records)
        if '--check' in sys.argv:
            assert target.read_text() == data, f'Regenerate {target.name}'
        else:
            target.write_text(data)
        print(f'{target.name}: generated from verified Hershey strokes')
