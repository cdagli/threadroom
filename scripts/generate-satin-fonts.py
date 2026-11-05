#!/usr/bin/env python3
"""Convert the vendored public-domain Hershey strokes and the OFL EMS
single-line SVG fonts to Threadroom em polylines.
Run: .venv/bin/python scripts/generate-satin-fonts.py [--check]
Source/mappings and acknowledgements: THIRD-PARTY-NOTICES.md. No Ember data.
"""
import hashlib
import html
import json
import math
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

# EMS single-line fonts (SIL OFL 1.1, scripts/ems/OFL.txt), chosen because they
# offset into satin columns without stacking: clear print styles plus a
# name script. Each file carries its own credits in <metadata>.
EMS = {
    'readability': ('EMSReadability.svg', 'EMS Readability', 'f922afa80fdab77ddc8f960d8ce32ebba907aa483c3d8c661676fe0bed942094'),
    'delight': ('EMSDelight.svg', 'EMS Delight', 'c872917c15d9ac4a54a13eba4ce30cc134f50f4a11fbff1945a7de755b39b488'),
    'pancakes': ('EMSPancakes.svg', 'EMS Pancakes', '89801412f013128c27179bc1bc0eb686ab3bdb8825280e53ecda55a55ad46c02'),
    'tech': ('EMSTech.svg', 'EMS Tech', '6da30b0e44022a07043204f6936ba929a3cf756609921a48ce1a7309a5270775'),
    'herculean': ('EMSHerculean.svg', 'EMS Herculean', '61f138ab57323291e5414a92d8804ae5842b990563ff915253144cd35fd0bbbf'),
    'osmotron': ('EMSOsmotron.svg', 'EMS Osmotron', 'f123a79e1aeac310be89b511ab2f224d1f2866ca0074018494c7a0b188f346fd'),
    'allure': ('EMSAllure.svg', 'EMS Allure', 'd9ef1032a2059d3b90189b9cacc26124812962503d6e7bdfe8b09b09904ce379'),
}
# Characters kept from EMS fonts: printable ASCII, Turkish and typographic quotes/dashes.
EMS_CHARS = [chr(c) for c in range(32, 127)]+list('çÇşŞğĞöÖüÜİı’‘“”–—')
DOT = .14   # em: strokes clustered inside this box are a dot, cedilla tip or similar mark


def simplify(points, tolerance):
    """Ramer-Douglas-Peucker on one open polyline, keeping both ends."""
    if len(points) < 3:
        return points
    keep = [False]*len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points)-1)]
    while stack:
        a, b = stack.pop()
        (x0, y0), (x1, y1) = points[a], points[b]
        dx, dy = x1-x0, y1-y0
        d = dx*dx+dy*dy
        best, index = tolerance, -1
        for i in range(a+1, b):
            x, y = points[i]
            t = max(0, min(1, ((x-x0)*dx+(y-y0)*dy)/d)) if d else 0
            e = math.hypot(x-x0-dx*t, y-y0-dy*t)
            if e > best:
                best, index = e, i
        if index >= 0:
            keep[index] = True
            stack += [(a, index), (index, b)]
    return [p for p, k in zip(points, keep) if k]


def collapse_dots(strokes):
    """Dots drawn as tiny squares, crosses or stars become one short vertical
    stroke, which offsets into a single small satin column."""
    box = lambda s: (min(p[0] for p in s), min(p[1] for p in s), max(p[0] for p in s), max(p[1] for p in s))
    small = [i for i, s in enumerate(strokes) if (lambda b: b[2]-b[0] < DOT and b[3]-b[1] < DOT)(box(s))]
    clusters = []
    for i in small:
        b = box(strokes[i])
        for c in clusters:
            if b[0] <= c['box'][2]+.02 and c['box'][0] <= b[2]+.02 and b[1] <= c['box'][3]+.02 and c['box'][1] <= b[3]+.02:
                c['members'].append(i)
                c['box'] = (min(b[0], c['box'][0]), min(b[1], c['box'][1]), max(b[2], c['box'][2]), max(b[3], c['box'][3]))
                break
        else:
            clusters.append({'members': [i], 'box': b})
    drop, extra = set(), []
    for c in clusters:
        x0, y0, x1, y1 = c['box']
        closed = len(c['members']) == 1 and math.dist(strokes[c['members'][0]][0], strokes[c['members'][0]][-1]) < .01
        if len(c['members']) > 1 or closed:
            drop.update(c['members'])
            cx, cy, h = (x0+x1)/2, (y0+y1)/2, max(.06, y1-y0)
            extra.append([[cx, cy-h/2], [cx, cy+h/2]])
    return [s for i, s in enumerate(strokes) if i not in drop]+extra


def path_strokes(d, file, ch):
    """Absolute M/L polylines; the few cubic C segments are flattened."""
    tokens = re.findall(r'[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?', d)
    strokes, cmd, i = [], None, 0
    while i < len(tokens):
        if tokens[i].isalpha():
            cmd = tokens[i]
            assert cmd in 'MLC', (file, ch, cmd)
            i += 1
            continue
        if cmd == 'C':
            (x1, y1, x2, y2, x, y), (x0, y0) = map(float, tokens[i:i+6]), strokes[-1][-1]
            for k in range(1, 9):
                t = k/8
                a, b, c, e = (1-t)**3, 3*(1-t)**2*t, 3*(1-t)*t*t, t**3
                strokes[-1].append([a*x0+b*x1+c*x2+e*x, a*y0+b*y1+c*y2+e*y])
            i += 6
            continue
        point = [float(tokens[i]), float(tokens[i+1])]
        i += 2
        if cmd == 'M':
            strokes.append([point])
            cmd = 'L'
        else:
            strokes[-1].append(point)
    return strokes


def generate_ems(kind):
    file, name, sha = EMS[kind]
    data = (ROOT/'scripts/ems'/file).read_bytes()
    assert hashlib.sha256(data).hexdigest() == sha, f'Unexpected {file} checksum'
    text = data.decode('utf8')
    default = float(re.search(r'<font\b[^>]*horiz-adv-x="([^"]+)"', text)[1])
    raw = {}
    for m in re.finditer(r'<glyph\b([^>]*)/?>', text):
        attrs = m[1]
        u = re.search(r'unicode="([^"]*)"', attrs)
        ch = html.unescape(u[1]) if u else ''
        if len(ch) != 1 or ch not in EMS_CHARS:
            continue
        adv = re.search(r'horiz-adv-x="([^"]+)"', attrs)
        d = re.search(r'\sd="([^"]*)"', attrs)
        strokes = [s for s in path_strokes(d[1] if d else '', file, ch) if len(s) > 1]
        raw[ch] = (float(adv[1]) if adv else default, strokes)
    # Like the Hershey fonts, absent typographic marks reuse their ASCII form.
    for c, base in [('’',"'"),('‘',"'"),('“','"'),('”','"'),('–','-'),('—','-')]:
        raw.setdefault(c, raw[base])
    missing = [c for c in EMS_CHARS if c not in raw]
    assert not missing, (file, missing)
    # Capital height: median top of flat-topped capitals; SVG y points up.
    tops = sorted(max(p[1] for s in raw[c][1] for p in s) for c in 'HIEL')
    cap = (tops[1]+tops[2])/2
    glyphs = {}
    for ch in EMS_CHARS:
        adv, strokes = raw[ch]
        strokes = [[[x/cap, -y/cap] for x, y in s] for s in strokes]
        strokes = [simplify(s, .004) for s in collapse_dots(strokes)]
        glyphs[ch] = {'advance': adv/cap, 'strokes': strokes}
    result = {'name': name, 'unitsPerEm': 1, 'capHeight': 1, 'license': 'OFL-1.1', 'sourceSha256': sha, 'glyphs': glyphs}
    return re.sub(r'-?\d+\.\d+(?:e[+-]?\d+)?', lambda m: str(round(float(m[0]), 4)), json.dumps(result, ensure_ascii=False, separators=(',', ':'))) + '\n'


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
    # Hershey dots are small multi-stroke polygons; sew each as one short column.
    for ch, g in glyphs.items():
        strokes = collapse_dots(g['strokes'])
        if strokes != g['strokes']:
            glyphs[ch] = {**g, 'strokes': strokes}
    # Canonical decimal rounding and ordering make regeneration byte deterministic.
    data = {'name':'Hershey '+('Simplex' if kind=='simplex' else 'Script'), 'unitsPerEm':1, 'capHeight':1,
            'sourceSha256':SHA,'glyphs':glyphs}
    return re.sub(r'-?\d+\.\d+(?:e[+-]?\d+)?', lambda m: str(round(float(m[0]),6)), json.dumps(data,ensure_ascii=False,separators=(',',':'))) + '\n'


if __name__ == '__main__':
    records = read_source()
    for kind in [*MAPS, *EMS]:
        target = ROOT / f'lib/fonts-satin/{kind}.json'
        data = generate(kind,records) if kind in MAPS else generate_ems(kind)
        if '--check' in sys.argv:
            assert target.read_text() == data, f'Regenerate {target.name}'
        else:
            target.write_text(data)
        print(f'{target.name}: generated from verified {"Hershey" if kind in MAPS else "EMS"} strokes')
