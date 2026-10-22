"""Brother PEC data from pystitch's EmbThreadPec (see threads.json).

sRGB / D65 Lab and CIEDE2000, kL=kC=kH=1; Sharma/Wu/Dalal (2005).
Kept in sync with lib/threads.ts; both use the published reference-pair tests.
"""
import json
import math
from pathlib import Path

THREADS = json.loads(Path(__file__).with_suffix('.json').read_text())["threads"]
BY_CODE = {t["code"]: t for t in THREADS}


def valid_thread(value, color):
    if not isinstance(value, dict) or value.get("brand") != "brother":
        return False
    t = BY_CODE.get(value.get("code")) if isinstance(value.get("code"), str) else None
    return t is not None and value.get("name") == t["name"] and color.lower() == t["color"]


def rgb_to_lab(color):
    rgb = [int(color[i:i+2], 16)/255 for i in (1, 3, 5)]
    r, g, b = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    def f(v):
        return v**(1/3) if v > 216/24389 else (24389/27*v+16)/116
    x, y, z = f((.4124564*r+.3575761*g+.1804375*b)/.95047), f(.2126729*r+.7151522*g+.072175*b), f((.0193339*r+.119192*g+.9503041*b)/1.08883)
    return 116*y-16, 500*(x-y), 200*(y-z)


def delta_e_2000(lab1, lab2):
    l1, a1, b1 = lab1
    l2, a2, b2 = lab2
    def sin(v):
        return math.sin(math.radians(v))
    def cos(v):
        return math.cos(math.radians(v))
    c = (math.hypot(a1, b1)+math.hypot(a2, b2))/2
    g = .5*(1-math.sqrt(c**7/(c**7+25**7)))
    ap1, ap2 = (1+g)*a1, (1+g)*a2
    c1, c2 = math.hypot(ap1, b1), math.hypot(ap2, b2)
    def hue(a, b):
        return 0 if a == b == 0 else (math.degrees(math.atan2(b, a))+360) % 360
    h1, h2 = hue(ap1, b1), hue(ap2, b2)
    dh = h2-h1
    if c1*c2 == 0:
        dh = 0
    elif dh > 180:
        dh -= 360
    elif dh < -180:
        dh += 360
    dl, dc, dH = l2-l1, c2-c1, 2*math.sqrt(c1*c2)*sin(dh/2)
    lm, cm = (l1+l2)/2, (c1+c2)/2
    hm = h1+h2 if c1*c2 == 0 else (h1+h2)/2 if abs(h1-h2) <= 180 else (h1+h2+(360 if h1+h2 < 360 else -360))/2
    t = 1-.17*cos(hm-30)+.24*cos(2*hm)+.32*cos(3*hm+6)-.20*cos(4*hm-63)
    sl, sc, sh = 1+.015*(lm-50)**2/math.sqrt(20+(lm-50)**2), 1+.045*cm, 1+.015*cm*t
    rt = -2*math.sqrt(cm**7/(cm**7+25**7))*sin(60*math.exp(-((hm-275)/25)**2))
    return math.sqrt((dl/sl)**2+(dc/sc)**2+(dH/sh)**2+rt*(dc/sc)*(dH/sh))


LABS = [rgb_to_lab(t["color"]) for t in THREADS]


def nearest_brother(color):
    lab = rgb_to_lab(color)
    return THREADS[min(range(len(THREADS)), key=lambda i: delta_e_2000(lab, LABS[i]))]
