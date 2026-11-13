"""Long & short stitch (needle painting).

Straight thread lines run either toward a centre point (radial, the default) or at the
fill angle. Each line is sewn as a run of long stitches whose needle points are staggered
from line to line, so no row of holes forms and the surface reads as brushed thread.

Shading: a layer covers a band of every line, as a fraction from the centre side (0) to
the outer side (1). Where two layers meet, both cut the line at the same staggered point
(the cut is keyed by the line and the meeting position, not by the object), so the
colours split into each other like hand long & short instead of leaving a seam or a gap.
"""
import math
from . import compiler as C
from .engines import clip_lines, route_pieces

MIN_STITCH = .6   # shorter pieces of a line are merged or dropped
OVERLAP = .25     # mm each layer reaches past a shared cut, so no fabric shows between colours
LEVEL_GROWTH = 1.25  # radial rays split once their gap reaches this many spacings


def unit(*keys):
    """Deterministic value in [0, 1) from integer/str keys (FNV-1a, then mixed)."""
    seed = 2166136261
    for byte in "|".join(map(str, keys)).encode():
        seed = ((seed ^ byte)*16777619) & 0xffffffff
    seed ^= seed >> 16
    seed = (seed*0x7feb352d) & 0xffffffff
    seed ^= seed >> 15
    seed = (seed*0x846ca68b) & 0xffffffff
    seed ^= seed >> 16
    return seed/2**32


def settings(obj):
    p = obj.get("patternParams") or {}
    start, end = p.get("bandStart", 0)/100, p.get("bandEnd", 100)/100
    return {
        "radial": p.get("radial", 1) == 1,
        "variation": p.get("variation", 60)/100,
        "blend": p.get("blend", 3),
        "start": min(start, end), "end": max(start, end),
        "length": obj.get("fillLength", 4),
        "spacing": obj["spacing"],
    }


def radial_lines(center, radius, spacing):
    """(key, origin, direction, start distance) for evenly spaced rays from the centre.
    Each level doubles the rays where the previous level's gap reaches LEVEL_GROWTH
    spacings; the new rays start there (with a little jitter so their starts form no ring)."""
    count, rays, level = 8, [], 0
    for j in range(count):
        a = 2*math.pi*j/count
        rays.append((round(a*1e5), (math.cos(a), math.sin(a)), 0))
    while True:
        start = LEVEL_GROWTH*spacing*count/(2*math.pi)
        if start >= radius:
            break
        count *= 2
        level += 1
        if count > 40_000:
            raise ValueError('This fill is too dense. Increase spacing or reduce the design size.')
        for j in range(1, count, 2):
            a = 2*math.pi*j/count
            key = round(a*1e5)
            rays.append((key, (math.cos(a), math.sin(a)), start*(1+.3*(unit("ray", key)-.5))))
    rays.sort(key=lambda r: r[0])
    # Rank is the key: neighbours alternate long/short, and layers sharing the outline,
    # centre and spacing number their rays identically.
    return [(rank, center, d, r0) for rank, (_, d, r0) in enumerate(rays)]


def straight_lines(rings, angle, spacing):
    t = math.radians(angle)
    d, n = (math.cos(t), math.sin(t)), (-math.sin(t), math.cos(t))
    points = [p for r in rings for p in r]
    across = [p[0]*n[0]+p[1]*n[1] for p in points]
    along = [p[0]*d[0]+p[1]*d[1] for p in points]
    lo, hi = min(along)-1, max(along)+1
    out = []
    for k in range(math.ceil(min(across)/spacing), math.floor(max(across)/spacing)+1):
        o = k*spacing
        out.append((k, (n[0]*o+d[0]*lo, n[1]*o+d[1]*lo), d, 0, hi-lo))
    if len(out) > 40_000:
        raise ValueError('This fill is too dense. Increase spacing or reduce the design size.')
    return out


def cut(edge, key, blend, line_length):
    """Where a layer edge at fraction `edge` meets line `key` (mm along the line): alternating
    long/short with jitter, at most `blend` mm deep and kept clear of both line ends."""
    u = ((key % 2) + unit("cut", key, round(edge*1000)))/2
    depth = min(blend, 1.6*min(edge, 1-edge)*line_length)
    return edge*line_length+depth*(u-.5)


def stitches(a, b, key, length, variation, salt):
    """Needle distances from a to b: a staggered first stitch, then near-equal long stitches."""
    span = b-a
    if span <= length*1.15:
        return [a, b]
    classic = length*(.5 if key % 2 else 1)
    first = classic+(length*(.3+.7*unit("phase", key, salt))-classic)*variation
    out, s, k = [a], a+max(MIN_STITCH, first), 0
    while s < b-MIN_STITCH:
        out.append(s)
        k += 1
        s += length*(1+.3*variation*(2*unit("len", key, salt, k)-1))
    if b-out[-1] < MIN_STITCH and len(out) > 1:
        out.pop()
    out.append(b)
    return out


def segments(obj):
    """Sewn straight pieces as (key, points) in sewing order."""
    rings, rule = obj["rings"], obj.get("fillRule", "evenodd")
    s = settings(obj)
    if s["radial"]:
        center = obj.get("center") or C.fill_centroid(rings, rule)
        radius = max(math.dist(center, p) for r in rings for p in r)+1
        lines = [(key, o, d, r0, radius) for key, o, d, r0 in radial_lines(center, radius, s["spacing"])]
    else:
        lines = straight_lines(rings, obj.get("angle", 0), s["spacing"])
    blend = s["blend"]
    out = []
    for key, o, d, r0, reach in lines:
        far = [o[0]+d[0]*reach, o[1]+d[1]*reach]
        near = [o[0]+d[0]*r0, o[1]+d[1]*r0]
        pieces = clip_lines([[near, far]], rings, rule)
        if not pieces:
            continue
        dist = lambda p: (p[0]-o[0])*d[0]+(p[1]-o[1])*d[1]
        spans = [(dist(piece[0]), dist(piece[-1])) for piece in pieces]
        # Fractions run from where the line could start (the centre, or the shape's first
        # crossing for straight lines) to its last exit from the shape.
        base = 0 if s["radial"] else spans[0][0]
        full = spans[-1][1]-base
        if full <= 0:
            continue
        lo = base+cut(s["start"], key, blend, full)-OVERLAP if s["start"] > 0 else -math.inf
        hi = base+cut(s["end"], key, blend, full)+OVERLAP if s["end"] < 1 else math.inf
        for i, (a, b) in enumerate(spans):
            a, b = max(a, lo), min(b, hi)
            if b-a < MIN_STITCH:
                continue
            ts = stitches(a, b, key, s["length"], s["variation"], i)
            out.append((key, [[o[0]+d[0]*t, o[1]+d[1]*t] for t in ts]))
    return out


def route_long_short(obj, at, entry, target):
    s = settings(obj)
    limit = min(C.SATIN_MAX-.15, s["length"]*(1+.3*s["variation"])+MIN_STITCH+1.2)
    pieces = [[(path, limit)] for _, path in segments(obj)]
    return route_pieces(obj, pieces, at, entry, target, ordered=True, reorient=True)
