"""POC stitch generation. All geometry is in mm; Pystitch uses 0.1 mm.

Deliberately independent of Inkscape and GUI/native dependencies. Fill uses
even-odd scan lines (including holes), with jumps across disconnected spans.
Fill rows are grouped into sections (e.g. one per letter) and each section
is sewn before the next; sections are ordered for the fewest trims and joined
by travel hidden inside the shape (route_fill). Objects start nearest the
previous exit and end near the next object unless entry/exit points are set. Text fills use the nonzero rule so overlapping glyph
contours merge. Pull compensation widens satin bites and extends fill rows
and cross diagonals along their stitch direction (half on each side).
Wide columns (satin, zigzag, E-stitch) sew each bite as one stitch; bites
longer than the object's split length are split with staggered penetrations,
and satin/zigzag bites on a compressed inner curve alternately stop short.
Spacing, underlay and pull compensation arrive resolved from the editor's
fabric profile (lib/project.ts); the compiler has no fabric defaults.
Runs that change colour or start more than trimJump mm away are tied off,
trimmed and tied in (per-object tack/triangle locks); nearer runs join with
one stitch. Cross fills sew rows of half-crosses and return over them.
This is an experimental digitizer, not Ink/Stitch's production fill engine.
"""
import base64
import io
import math
import re
import heapq
import time
import json
from pathlib import Path

FILL_PATTERNS = {p["id"]: p for p in json.loads(Path(__file__).with_name("fill-patterns.json").read_text())}

from pystitch import (EmbPattern, EmbThread, STITCH, JUMP, TRIM,
                      COLOR_CHANGE, END, COMMAND_MASK, read_pes, write_pes)

HOOPS = {"100x100": (100, 100), "180x130": (180, 130), "300x200": (300, 200), "60x40": (60, 40)}
MAX_STITCHES = 100_000
CONNECT_TOLERANCE = 0.1
FILL_KINDS = ("fill", "cross")
WIDE_KINDS = ("satin", "zigzag", "e-stitch")
KINDS = (*FILL_KINDS, "running", "bean", "backstitch", "satin", "zigzag", "e-stitch", "underlay", "manual")
SATIN_MAX = 12.7  # PR1X / PES single stitch limit
# Short stitches: shorten alternate inner bites by SHORT_INSET of the width where the
# inner rail is compressed below SHORT_RATIO of the centre line and its needle hits
# are closer than SHORT_HIT mm. Split points step by the golden ratio (no lines).
SHORT_RATIO, SHORT_HIT, SHORT_INSET, GOLDEN = .8, 1.0, .25, (math.sqrt(5)-1)/2
SQRT2 = math.sqrt(2)
# Underlay stays EDGE_INSET mm inside the fill edge so it never shows outside it.
# Parts of a fill narrower than MIN_UNDERLAY_FILL get no underlay; satin narrower than
# MIN_UNDERLAY_SATIN gets a centre walk at most. Hidden travel keeps TRAVEL_MARGIN
# from the edge; a route longer than TRAVEL_LIMIT mm trims instead.
EDGE_INSET, MIN_UNDERLAY_FILL, MIN_UNDERLAY_SATIN, TRAVEL_MARGIN, TRAVEL_LIMIT = .4, 2.0, 1.5, .3, 60
ORDER_BUDGET = 20_000  # section-order search steps per part
LOCKS = ("none", "tack", "triangle")
UNDERLAYS = {"fill": ("none", "edge", "tatami", "edge-tatami"), "satin": ("none", "center", "edge", "zigzag", "edge-zigzag")}


def number(value, minimum, maximum, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be a finite number.")
    if not minimum <= value <= maximum:
        raise ValueError(f"{label} must be between {minimum} and {maximum}.")
    return float(value)


def validate(project):
    if not isinstance(project, dict) or project.get("version") != 1:
        raise ValueError("Choose a supported Threadroom project (version 1).")
    if project.get("machine") != "brother-pr1x":
        raise ValueError("This prototype supports the Brother PR1X.")
    hoop = project.get("hoop")
    if hoop not in HOOPS:
        raise ValueError("Choose a supported PR1X hoop.")
    width, height = HOOPS[hoop]
    trim_jump = number(project.get("trimJump"), 1, 10, "Trim jump length")
    objects = project.get("objects")
    if not isinstance(objects, list) or not 1 <= len(objects) <= 80:
        raise ValueError("Add between 1 and 80 embroidery objects.")
    count = 0
    for obj in objects:
        if not isinstance(obj, dict) or obj.get("kind") not in KINDS:
            raise ValueError("Unknown stitch type.")
        if not isinstance(obj.get("color"), str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", obj["color"]):
            raise ValueError("Thread colours must use six-digit hex values.")
        rings = obj.get("rings")
        if not isinstance(rings, list) or not 1 <= len(rings) <= 500:
            raise ValueError("An object needs at least one path.")
        for ring in rings:
            if not isinstance(ring, list) or len(ring) < (3 if obj["kind"] in FILL_KINDS else 2):
                raise ValueError("A fill needs three points; a line needs two.")
            count += len(ring)
            if count > 12_000:
                raise ValueError("Simplify this design to fewer than 12,000 control points.")
            for point in ring:
                if not isinstance(point, list) or len(point) != 2:
                    raise ValueError("Invalid path coordinate.")
                number(point[0], 0, width, "X position")
                number(point[1], 0, height, "Y position")
        number(obj.get("spacing"), 0.3, 2, "Stitch spacing")
        number(obj.get("length", 2.5), 0.5, 3, "Stitch length")
        for key, lo, hi in (("fillLength", 1, 6), ("handStitch", 0, 5)):
            if key in obj:
                v = number(obj[key], lo, hi, key)
                if key == "handStitch" and not v.is_integer():
                    raise ValueError("Hand stitch must be an integer.")
        if "gradient" in obj:
            g = obj["gradient"]
            if not isinstance(g, dict) or g.get("mode") not in ("ramp", "plateau"):
                raise ValueError("Choose a ramp or plateau gradient.")
            number(g.get("endSpacing"), .3, 4, "Gradient end spacing")
            for key in (("start", "end") if g["mode"] == "ramp" else ("center", "width")):
                number(g.get(key), 0, 1, "Gradient "+key)
        if "fillUnderlays" in obj:
            underlays = obj["fillUnderlays"]
            if not isinstance(underlays, list) or len(underlays) > 3:
                raise ValueError("Choose up to three fill underlays.")
            for u in underlays:
                if not isinstance(u, dict):
                    raise ValueError("Invalid fill underlay.")
                for key, lo, hi in (("angle", -180, 180), ("spacing", 1, 4), ("length", 1, 5), ("inset", 0, 2)):
                    number(u.get(key), lo, hi, "Underlay "+key)
        if "fillPattern" in obj and (not isinstance(obj["fillPattern"], str) or obj["fillPattern"] not in FILL_PATTERNS):
            raise ValueError("Unknown fill pattern.")
        if "patternParams" in obj:
            params = obj["patternParams"]
            if not isinstance(params, dict) or set(params)-{"steps", "amplitude"}:
                raise ValueError("Invalid fill pattern parameters.")
            if "steps" in params and not number(params["steps"], 1, 100, "Wave steps").is_integer():
                raise ValueError("Wave steps must be an integer.")
            if "amplitude" in params:
                number(params["amplitude"], 0, 10, "Wave amplitude")
        if "tolerance" in obj:
            number(obj["tolerance"], .1, 1, "Stitch tolerance")
        number(obj.get("angle", 0), -180, 180, "Fill angle")
        number(obj.get("satinWidth", 2), 0.5, 10, "Satin width")
        number(obj.get("pullCompensation"), 0, 1, "Pull compensation")
        if obj["kind"] in WIDE_KINDS:
            number(obj.get("splitLength"), 3, 12, "Split length")
            if not isinstance(obj.get("shortStitches"), bool):
                raise ValueError("Short stitches must be on or off.")
        if obj.get("underlay") not in UNDERLAYS.get("fill" if obj["kind"] in FILL_KINDS else obj["kind"], ("none",)):
            raise ValueError("Choose an underlay suited to this stitch style.")
        for key in ("entry", "exit"):
            point = obj.get(key)
            if point is not None:
                if not isinstance(point, list) or len(point) != 2:
                    raise ValueError("Entry and exit points need two coordinates.")
                number(point[0], 0, width, "Entry/exit X position")
                number(point[1], 0, height, "Entry/exit Y position")
        if obj.get("fillRule", "evenodd") not in ("evenodd", "nonzero"):
            raise ValueError("Unknown fill rule.")
        if obj.get("tieIn") not in LOCKS or obj.get("tieOff") not in LOCKS:
            raise ValueError("Choose a tie-in and tie-off: none, tack or triangle.")
        number(obj.get("lockSize"), 0.5, 1.5, "Lock stitch size")
    return width, height, trim_jump, objects


def inside(point, rings, rule="evenodd", tolerance=0.001):
    x, y = point
    winding = 0
    for ring in rings:
        for a, b in zip(ring, ring[1:] + ring[:1]):
            # A connector along the region boundary is allowed. Without this,
            # alternating rows of a rectangle would trim at every right edge.
            length_sq = (b[0]-a[0])**2 + (b[1]-a[1])**2
            if length_sq:
                t = max(0, min(1, ((x-a[0])*(b[0]-a[0])+(y-a[1])*(b[1]-a[1]))/length_sq))
                if math.hypot(x-a[0]-t*(b[0]-a[0]), y-a[1]-t*(b[1]-a[1])) < tolerance:
                    return True
            if (a[1] > y) != (b[1] > y):
                crossing = a[0] + (y-a[1]) * (b[0]-a[0]) / (b[1]-a[1])
                if x < crossing:
                    winding += 1 if b[1] > a[1] else -1
    return winding != 0 if rule == "nonzero" else winding % 2 == 1


def interpolate(a, b, max_length):
    count = max(1, math.ceil(math.dist(a, b) / max_length))
    return [[a[0]+(b[0]-a[0])*i/count, a[1]+(b[1]-a[1])*i/count] for i in range(1, count+1)]


def line_path(ring, length):
    result = [ring[0]]
    for a, b in zip(ring, ring[1:]):
        result.extend(interpolate(a, b, length))
    return result


def tolerant_path(ring, length, tolerance):
    """Keep sharp corners; divide each smooth piece equally by arc length.
    Bisect intervals whose skipped points stray outside the tolerance tube."""
    points = [ring[0]]
    for p in ring[1:]:
        if math.dist(points[-1], p) > 1e-9:
            points.append(p)
    cuts = [0]
    for i in range(1, len(points)-1):
        a, b, c = points[i-1:i+2]
        dot = sum((b[k]-a[k])*(c[k]-b[k]) for k in (0, 1))
        if dot/(math.dist(a, b)*math.dist(b, c)) < math.cos(math.pi/4):
            cuts.append(i)
    cuts.append(len(points)-1)
    out = [points[0]]
    for start, end in zip(cuts, cuts[1:]):
        piece = points[start:end+1]
        distances = [0]
        for a, b in zip(piece, piece[1:]):
            distances.append(distances[-1]+math.dist(a, b))
        total = distances[-1]
        if not total:
            continue
        def at(d):
            i = next((i for i in range(1, len(distances)) if distances[i] >= d-1e-9), len(piece)-1)
            t = (d-distances[i-1])/(distances[i]-distances[i-1])
            return [piece[i-1][k]+t*(piece[i][k]-piece[i-1][k]) for k in (0, 1)]
        def interval(lo, hi):
            a, b = at(lo), at(hi)
            error = max((segment_distance(p, a, b) for p, d in zip(piece, distances) if lo < d < hi), default=0)
            if error > tolerance and hi-lo > 1e-6:
                mid = (lo+hi)/2
                interval(lo, mid)
                interval(mid, hi)
            else:
                out.append(b)
        n = math.ceil(total/length)
        for i in range(n):
            interval(total*i/n, total*(i+1)/n)
    return out


def sample_path(ring, spacing):
    """Sample by arc distance, independent of curve display tessellation."""
    result = [ring[0]]
    remaining = spacing
    for a, b in zip(ring, ring[1:]):
        distance = math.dist(a, b)
        while distance >= remaining and distance > 1e-9:
            t = remaining/distance
            a = [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]
            result.append(a)
            distance = math.dist(a, b)
            remaining = spacing
        remaining -= distance
    if math.dist(result[-1], ring[-1]) > 1e-6:
        result.append(ring[-1])
    return result


def scan_spans(rings, y, rule):
    crossings = []
    for ring in rings:
        for a, b in zip(ring, ring[1:] + ring[:1]):
            if (a[1] <= y < b[1]) or (b[1] <= y < a[1]):
                crossings.append((a[0] + (y-a[1]) * (b[0]-a[0])/(b[1]-a[1]), 1 if b[1] > a[1] else -1))
    crossings.sort()
    if rule != "nonzero":
        xs = [x for x, _ in crossings]
        return list(zip(xs[::2], xs[1::2]))
    spans, winding, start = [], 0, 0
    for x, direction in crossings:
        if winding == 0:
            start = x
        winding += direction
        if winding == 0:
            spans.append((start, x))
    return spans


def extend_spans(spans, pull):
    """Lengthens each row by pull/2 at both ends, never past the midpoint of
    the gap to a neighbouring span, so separate parts stay separate."""
    if pull <= 0:
        return spans
    return [(left - min(pull/2, (left-spans[i-1][1])/2 if i else pull/2),
             right + min(pull/2, (spans[i+1][0]-right)/2 if i+1 < len(spans) else pull/2))
            for i, (left, right) in enumerate(spans)]


def eroded_spans(rotated, y, rule, inset):
    """Spans at y shrunk by inset, also clipped to the spans inset above and
    below, so rows near a horizontal edge or a hole stay inside too."""
    spans = scan_spans(rotated, y, rule)
    for other in (scan_spans(rotated, y-inset, rule), scan_spans(rotated, y+inset, rule)):
        spans = [(max(a, c), min(b, d)) for a, b in spans for c, d in other if max(a, c) < min(b, d)]
    return [(a+inset, b-inset) for a, b in spans if b-a > 2*inset]


def gradient_spacing(g, t, spacing):
    if g["mode"] == "ramp":
        a, b = g["start"], g["end"]
        # A reversed ramp runs from end spacing at the low edge to base at the high edge.
        u = (t-a)/(b-a) if abs(b-a) > 1e-9 else (1 if t >= a else 0)
    else:
        lo, hi = max(0, g["center"]-g["width"]/2), min(1, g["center"]+g["width"]/2)
        u = (lo-t)/lo if t < lo and lo > 0 else (t-hi)/(1-hi) if t > hi and hi < 1 else 0
    return spacing+(g["endSpacing"]-spacing)*max(0,min(1,u))


def fill_sections(rotated, spacing, rule, pull=0, inset=0, anchor=None, gradient=None):
    """Groups scan-line spans into sections that can be sewn back and forth
    without leaving the shape: a span continues a section only when the two
    overlap exclusively. Letters, and parts split by holes, become sections."""
    ys = [p[1] for r in rotated for p in r]
    y = min(ys)+spacing/2 if anchor is None or gradient else anchor+math.ceil((min(ys)-anchor)/spacing)*spacing
    sections, active = [], []
    while y < max(ys):
        row = eroded_spans(rotated, y, rule, inset) if inset else scan_spans(rotated, y, rule)
        spans = [span for span in extend_spans(row, pull) if span[1]-span[0] >= 0.15]
        overlaps = lambda a, b: a[0] < b[1] and b[0] < a[1]
        following = []
        for span in spans:
            matches = [section for section in active if overlaps(section[-1][1:], span)]
            if len(matches) == 1 and sum(overlaps(matches[0][-1][1:], other) for other in spans) == 1:
                matches[0].append((y, *span))
                following.append(matches[0])
            else:
                section = [(y, *span)]
                sections.append(section)
                following.append(section)
        active = following
        y += gradient_spacing(gradient, (y-min(ys))/max(1e-9,max(ys)-min(ys)), spacing) if gradient else spacing
    return sections


def rotate(points, angle, back=False):
    t = math.radians(-angle if back else angle)
    c, s = math.cos(t), math.sin(t)
    return [[x*c+y*s, -x*s+y*c] for x, y in points]


class Region:
    """Point-in-region test with edges bucketed by height (fast for text)."""
    PAD = 1.0

    def __init__(self, rings, rule):
        self.rule = rule
        edges = [(a, b) for ring in rings for a, b in zip(ring, ring[1:]+ring[:1]) if a != b]
        ys = [p[1] for r in rings for p in r]
        self.y0, self.h = min(ys)-self.PAD, max(.5, (max(ys)-min(ys)+2*self.PAD)/256)
        self.buckets = [[] for _ in range(int((max(ys)+self.PAD-self.y0)/self.h)+1)]
        for a, b in edges:
            for i in range(int((min(a[1], b[1])-self.PAD-self.y0)/self.h), int((max(a[1], b[1])+self.PAD-self.y0)/self.h)+1):
                if 0 <= i < len(self.buckets):
                    self.buckets[i].append((a, b))

    def contains(self, point, tolerance=0.001):
        i = int((point[1]-self.y0)/self.h)
        if not 0 <= i < len(self.buckets):
            return False
        x, y = point
        winding = 0
        for a, b in self.buckets[i]:
            length_sq = (b[0]-a[0])**2 + (b[1]-a[1])**2
            t = max(0, min(1, ((x-a[0])*(b[0]-a[0])+(y-a[1])*(b[1]-a[1]))/length_sq))
            if math.hypot(x-a[0]-t*(b[0]-a[0]), y-a[1]-t*(b[1]-a[1])) < tolerance:
                return True
            if (a[1] > y) != (b[1] > y) and x < a[0] + (y-a[1]) * (b[0]-a[0]) / (b[1]-a[1]):
                winding += 1 if b[1] > a[1] else -1
        return winding != 0 if self.rule == "nonzero" else winding % 2 == 1

    def clear(self, point, distance):
        """True when no edge is within distance (at most PAD) of point."""
        i = int((point[1]-self.y0)/self.h)
        return not 0 <= i < len(self.buckets) or not any(
            segment_distance(point, a, b) < distance for a, b in self.buckets[i])


def segment_distance(p, a, b):
    length_sq = (b[0]-a[0])**2 + (b[1]-a[1])**2
    t = max(0, min(1, ((p[0]-a[0])*(b[0]-a[0])+(p[1]-a[1])*(b[1]-a[1]))/length_sq)) if length_sq else 0
    return math.hypot(p[0]-a[0]-t*(b[0]-a[0]), p[1]-a[1]-t*(b[1]-a[1]))


def inset_rings(rings, region, inset):
    """Offsets every ring into the filled side (holes grow outward) by inset.
    Points that would leave the region (parts narrower than 2 x inset) are dropped."""
    result = []
    for ring in rings:
        ring = [p for i, p in enumerate(ring) if math.dist(p, ring[i-1]) > 1e-6]
        if len(ring) < 3:
            continue
        a, b = max(zip(ring, ring[1:]+ring[:1]), key=lambda e: math.dist(*e))
        d = math.dist(a, b)
        probe = [(a[0]+b[0])/2-(b[1]-a[1])/d*.05, (a[1]+b[1])/2+(b[0]-a[0])/d*.05]
        side = 1 if region.contains(probe, 0) else -1
        out = []
        for i, p in enumerate(ring):
            normals = []
            for u, v in ((ring[i-1], p), (p, ring[(i+1) % len(ring)])):
                length = math.dist(u, v)
                normals.append((-(v[1]-u[1])/length, (v[0]-u[0])/length))
            m = [normals[0][0]+normals[1][0], normals[0][1]+normals[1][1]]
            norm = math.hypot(*m)
            if norm < 1e-6:
                continue
            m = [m[0]/norm, m[1]/norm]
            miter = inset/max(.5, m[0]*normals[0][0]+m[1]*normals[0][1])
            q = [p[0]+side*m[0]*miter, p[1]+side*m[1]*miter]
            if region.contains(q, 0) and region.clear(q, inset*.7):
                out.append(q)
        if len(out) >= 3:
            result.append(out)
    return result


NEIGHBOURS = [(1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1), (1, 1, SQRT2), (1, -1, SQRT2), (-1, 1, SQRT2), (-1, -1, SQRT2)]


class Grid:
    """Raster of a fill in its row frame. Hidden travel runs through cells at
    least TRAVEL_MARGIN inside; top-fill travel also avoids cells already sewn.
    Components are the separately filled parts; deep cells are at least half
    of MIN_UNDERLAY_FILL from every edge."""

    def __init__(self, rotated, rule):
        xs, ys = [p[0] for r in rotated for p in r], [p[1] for r in rotated for p in r]
        self.cell = c = max(.25, math.sqrt((max(xs)-min(xs))*(max(ys)-min(ys))/30000))
        self.x0, self.y0 = min(xs)-c, min(ys)-c
        self.nx, self.ny = int((max(xs)-self.x0)/c)+2, int((max(ys)-self.y0)/c)+2
        size = self.nx*self.ny
        self.inside, self.safe, self.deep, self.sewn = bytearray(size), bytearray(size), bytearray(size), bytearray(size)
        m, d = TRAVEL_MARGIN, MIN_UNDERLAY_FILL/2
        q = d/SQRT2
        covers = lambda spans, x: any(a <= x <= b for a, b in spans)
        for j in range(self.ny):
            y = self.y0+(j+.5)*c
            row = scan_spans(rotated, y, rule)
            if not row:
                continue
            near = [scan_spans(rotated, y+o, rule) for o in (-m, m)]
            far = {o: scan_spans(rotated, y+o, rule) for o in (-d, -q, q, d)}
            for a, b in row:
                for i in range(max(0, math.ceil((a-self.x0)/c-.5)), min(self.nx-1, math.floor((b-self.x0)/c-.5))+1):
                    x, k = self.x0+(i+.5)*c, j*self.nx+i
                    self.inside[k] = 1
                    self.safe[k] = a+m <= x <= b-m and all(covers(s, x) for s in near)
                    self.deep[k] = (a+d <= x <= b-d and covers(far[-d], x) and covers(far[d], x)
                                    and all(covers(far[o], x+e) for o in (-q, q) for e in (-q, q)))
        self.label = [-1]*size
        count = 0
        for start in range(size):
            if self.inside[start] and self.label[start] < 0:
                stack = [start]
                self.label[start] = count
                while stack:
                    k = stack.pop()
                    i, j = k % self.nx, k // self.nx
                    for kk, ok in ((k-1, i > 0), (k+1, i < self.nx-1), (k-self.nx, j > 0), (k+self.nx, j < self.ny-1)):
                        if ok and self.inside[kk] and self.label[kk] < 0:
                            self.label[kk] = count
                            stack.append(kk)
                count += 1

    def centre(self, k):
        return [self.x0+(k % self.nx+.5)*self.cell, self.y0+(k//self.nx+.5)*self.cell]

    def near(self, p, radius, mask):
        """The cell in mask (a sequence or test) nearest to p, within radius mm."""
        test = mask if callable(mask) else mask.__getitem__
        c, best = self.cell, None
        ci, cj, r = int((p[0]-self.x0)/c), int((p[1]-self.y0)/c), math.ceil(radius/c)
        for j in range(max(0, cj-r), min(self.ny, cj+r+1)):
            for i in range(max(0, ci-r), min(self.nx, ci+r+1)):
                k = j*self.nx+i
                if test(k):
                    d = math.dist(p, self.centre(k))
                    if d <= radius and (best is None or d < best[0]):
                        best = (d, k)
        return best and best[1]

    def component(self, p):
        k = self.near(p, 3*self.cell+.5, self.inside)
        return -1 if k is None else self.label[k]

    def mark(self, rows, spacing):
        c = self.cell
        for y, a, b in rows:
            for j in range(max(0, math.ceil((y-spacing/2-self.y0)/c-.5)), min(self.ny-1, math.floor((y+spacing/2-self.y0)/c-.5))+1):
                for i in range(max(0, math.ceil((a-self.x0)/c-.5)), min(self.nx-1, math.floor((b-self.x0)/c-.5))+1):
                    self.sewn[j*self.nx+i] = 1

    def reach(self, a, goals, avoid):
        """Goals (cell -> values) in order of hidden travel distance from a:
        yields (value, distance, waypoints()). Cells sewn already are avoided,
        except near a where the previous row ended."""
        s = self.near(a, 1.5, self.safe)
        if s is None:
            return
        free = lambda k: not avoid or not self.sewn[k] or math.dist(a, self.centre(k)) <= 1.5
        dist, previous, heap = {s: 0.0}, {}, [(0.0, s)]
        def waypoints(k):
            cells = [k]
            while cells[-1] in previous:
                cells.append(previous[cells[-1]])
            return self.pull([a]+[self.centre(cell) for cell in reversed(cells)], free)
        while heap:
            d, k = heapq.heappop(heap)
            if d > dist[k]:
                continue
            if d > TRAVEL_LIMIT:
                return
            for value in goals.get(k, ()):
                yield value, d, lambda k=k: waypoints(k)
            i, j = k % self.nx, k // self.nx
            for di, dj, w in NEIGHBOURS:
                ii, jj = i+di, j+dj
                if not (0 <= ii < self.nx and 0 <= jj < self.ny):
                    continue
                kk = jj*self.nx+ii
                if not (self.safe[kk] and free(kk)) or (di and dj and not (self.safe[j*self.nx+ii] and self.safe[jj*self.nx+i])):
                    continue
                nd = d+w*self.cell
                if nd < dist.get(kk, math.inf):
                    dist[kk], previous[kk] = nd, k
                    heapq.heappush(heap, (nd, kk))

    def pull(self, points, free):
        """Straightens a cell path while every sample stays in free safe cells."""
        def clear(p, q):
            for t in interpolate(p, q, self.cell/2):
                i, j = int((t[0]-self.x0)/self.cell), int((t[1]-self.y0)/self.cell)
                k = j*self.nx+i
                if not (0 <= i < self.nx and 0 <= j < self.ny and self.safe[k] and free(k)):
                    return False
            return True
        result, i = [points[0]], 0
        while i < len(points)-1:
            j = i+1
            while j+1 < len(points) and math.dist(points[i], points[j+1]) < 10 and clear(points[i], points[j+1]):
                j += 1
            result.append(points[j])
            i = j
        return result


def hand_stitch(path, angle, length, intensity, shape_id, index=0, region=None):
    if not intensity:
        return path
    out = [path[0]]
    t = math.radians(angle)
    for k, p in enumerate(path[1:-1], index+1):
        seed = 2166136261
        for byte in (str(shape_id)+"-"+str(k)).encode():
            seed = ((seed ^ byte)*16777619) & 0xffffffff
        # Mix the keyed FNV seed; neighbouring stitch indices must not correlate.
        seed ^= seed >> 16
        seed = (seed*0x7feb352d) & 0xffffffff
        seed ^= seed >> 15
        seed = (seed*0x846ca68b) & 0xffffffff
        seed ^= seed >> 16
        r = seed/2**32-.5
        offset = .1*(math.copysign(abs(r)**1.5,r)*length**2+.02*intensity)*(intensity/5)**1.2
        q = [p[0]-math.sin(t)*offset, p[1]+math.cos(t)*offset]
        # Near holes or a curved edge, reduce jitter until the needle stays inside.
        if region is not None:
            for _ in range(12):
                if region.contains(q, 0):
                    break
                offset /= 2
                q = [p[0]-math.sin(t)*offset, p[1]+math.cos(t)*offset]
            else:
                q = p
        out.append(q)
    return out+[path[-1]]


def pattern_offset(pattern, row, length, params=None):
    p, params = FILL_PATTERNS[pattern], params or {}
    if p["mode"] == "even":
        return 0
    if p["mode"] == "waves":
        steps = params.get("steps", p["steps"])
        return (math.sin(2*math.pi*(row % steps)/steps)+1)/2*params.get("amplitude", p["amplitude"])
    offsets = p["offsets"]
    return offsets[row % len(offsets)]*(1 if p.get("absolute") else length)


def fill_centroid(rings, rule):
    """Area-weighted centroid, subtracting holes for even-odd regions."""
    total, cx, cy = 0, 0, 0
    for ring in rings:
        cross = [a[0]*b[1]-b[0]*a[1] for a, b in zip(ring, ring[1:]+ring[:1])]
        area = sum(cross)
        if abs(area) < 1e-9:
            continue
        x = sum((a[0]+b[0])*v for a, b, v in zip(ring, ring[1:]+ring[:1], cross))/(3*area)
        y = sum((a[1]+b[1])*v for a, b, v in zip(ring, ring[1:]+ring[:1], cross))/(3*area)
        if rule == "evenodd":
            depth = sum(inside(ring[0], [other], tolerance=0) for other in rings if other is not ring)
            area = abs(area)*(-1 if depth % 2 else 1)
        total, cx, cy = total+area, cx+x*area, cy+y*area
    return [cx/total, cy/total] if abs(total) > 1e-9 else list(rings[0][0])


class Rows:
    """A fill section: rows (y, left, right) in the frame rotated by angle.
    Variants start at either end of the first or the last row."""
    variants = ((False, 0), (False, 1), (True, 0), (True, 1))

    def __init__(self, rows, angle, pattern=None, anchor=None, spacing=None, params=None, stitch_length=None, lanes=None):
        self.rows, self.angle = rows, angle
        self.pattern, self.anchor, self.spacing, self.params = pattern, anchor, spacing, params
        self.stitch_length, self.lanes = stitch_length, lanes

    def subset(self, rows):
        return Rows(rows, self.angle, self.pattern, self.anchor, self.spacing, self.params, self.stitch_length, self.lanes)

    def ordered(self, variant):
        reverse, side = variant
        rows = self.rows[::-1] if reverse else self.rows
        return [[(l if (side+i) % 2 == 0 else r, y), (r if (side+i) % 2 == 0 else l, y)] for i, (y, l, r) in enumerate(rows)]

    def start(self, variant):
        return rotate([list(self.ordered(variant)[0][0])], self.angle, True)[0]

    def end(self, variant):
        return rotate([list(self.ordered(variant)[-1][1])], self.angle, True)[0]

    def paths(self, variant, length):
        if not self.pattern or self.pattern == "even":
            return [rotate([a]+interpolate(a, b, length), self.angle, True) for a, b in self.ordered(variant)]
        paths = []
        for a, b in self.ordered(variant):
            row = self.lanes[round(a[1],9)] if self.lanes else round((a[1]-self.anchor[1])/self.spacing)
            offset = pattern_offset(self.pattern, row, length, self.params)
            base = self.anchor[0]+offset
            lo, hi = sorted((a[0], b[0]))
            xs = [base+i*length for i in range(math.floor((lo-base)/length)+1, math.ceil((hi-base)/length))]
            xs = [x for x in xs if x-lo >= .3-1e-9 and hi-x >= .3-1e-9]
            points = [[lo, a[1]]]
            for x in xs+[hi]:
                points.extend(interpolate(points[-1], [x, a[1]], length))
            paths.append(rotate(points if a[0] <= b[0] else points[::-1], self.angle, True))
        return paths


class Loop:
    """A closed edge walk; it can start at any of its points."""

    def __init__(self, ring):
        self.ring = ring
        self.variants = range(0, len(ring), max(1, len(ring)//48))

    def start(self, variant):
        return self.ring[variant]

    end = start

    def paths(self, variant, length):
        return [line_path(self.ring[variant:]+self.ring[:variant+1], length)]


def nearest_on(rings, p, closed):
    """(ring index, segment index, point) of the nearest point on the outline."""
    best = None
    for ri, ring in enumerate(rings):
        for i, (a, b) in enumerate(zip(ring, ring[1:]+ring[:1] if closed else ring[1:])):
            length_sq = (b[0]-a[0])**2 + (b[1]-a[1])**2
            t = max(0, min(1, ((p[0]-a[0])*(b[0]-a[0])+(p[1]-a[1])*(b[1]-a[1]))/length_sq)) if length_sq else 0
            q = [a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1])]
            if best is None or math.dist(p, q) < best[0]:
                best = (math.dist(p, q), ri, i, q)
    return best[1:]


def route_fill(obj, at, entry, target, underlay_only=False):
    """Plans a fill as polylines; each starts after a trim and jump. Each
    separate part sews its underlay then its top rows. Sections are taken
    nearest-first and joined by hidden travel through the part (for top
    rows, only where no top stitches are yet), else by a trim. An entry
    starts with hidden travel from that point; the section nearest the exit
    is sewn last, split at the exit row so its final row ends there."""
    rings, rule, length = obj["rings"], obj.get("fillRule", "evenodd"), obj.get("length", 2.5)
    angle, spacing, pull, underlay = obj.get("angle", 0), obj["spacing"], obj["pullCompensation"], obj["underlay"]
    region, rotated = Region(rings, rule), [rotate(r, angle) for r in rings]
    grid = Grid(rotated, rule)
    to_grid = lambda p: rotate([p], angle)[0]
    phases = ("edge", "tatami", "underlay1", "underlay2")
    parts = {}
    def add(piece, phase, point):
        label = grid.component(to_grid(point))
        if label >= 0:
            parts.setdefault(label, {phase: [] for phase in (*phases, "top")})[phase].append(piece)
    pattern = obj.get("fillPattern") if obj["kind"] == "fill" else None
    anchor = fill_centroid(rotated, rule) if pattern and pattern != "even" else None
    gradient = obj.get("gradient") if obj["kind"] == "fill" else None
    sections = fill_sections(rotated, spacing, rule, pull, anchor=anchor[1] if anchor else None, gradient=gradient)
    lanes = {y:i for i,y in enumerate(sorted({round(row[0],9) for rows in sections for row in rows}))} if gradient else None
    for rows in sections:
        add(Rows(rows, angle, pattern, anchor, spacing, obj.get("patternParams"), lanes=lanes), "top", rotate([[(rows[0][1]+rows[0][2])/2, rows[0][0]]], angle, True)[0])
    if "edge" in underlay:
        for ring in inset_rings(rings, region, EDGE_INSET):
            add(Loop(ring), "edge", ring[0])
    underlays = obj.get("fillUnderlays") if obj["kind"] == "fill" else None
    if underlays is None:
        underlays = [{"angle":90,"spacing":2,"length":length,"inset":EDGE_INSET}] if "tatami" in underlay else []
    for i, u in enumerate(underlays):
        ua = angle+u["angle"]
        for rows in fill_sections([rotate(r, ua) for r in rings], u["spacing"], rule, 0, u["inset"]):
            add(Rows(rows, ua, stitch_length=u["length"]), "tatami" if i == 0 else "underlay"+str(i), rotate([[(rows[0][1]+rows[0][2])/2, rows[0][0]]], ua, True)[0])
    wide = {grid.label[k] for k, deep in enumerate(grid.deep) if deep}
    for label, part in parts.items():
        if label not in wide:
            for phase in phases:
                part[phase] = []
    parts = {k: v for k, v in parts.items() if v["top"]}
    if not parts:
        return []
    top_length = obj.get("fillLength", length) if obj["kind"] == "fill" else length
    tolerance = CONNECT_TOLERANCE+pull/2
    out, state, links = [], {"at": at, "jump": True, "stitch": 0}, {}
    base = min(row[0] for part in parts.values() for piece in part["top"] for row in piece.rows)
    def sew(path):
        if state["jump"]:
            out.append([])
            state["jump"] = False
        out[-1].extend(path)
        state["at"] = out[-1][-1]
    def travel(goals, avoid):
        """Hidden travel to the nearest goal: (value, stitches) or None."""
        cells, open_ = {}, (lambda k: grid.safe[k] and not grid.sewn[k]) if avoid else grid.safe
        for point, value in goals:
            k = grid.near(to_grid(point), 1.5, open_)
            if k is not None:
                cells.setdefault(k, []).append((point, value))
        for (point, value), _, waypoints in grid.reach(to_grid(state["at"]), cells, avoid):
            return value, line_path(rotate(waypoints(), angle, True)+[point], length)[1:]
        return None
    def sew_piece(piece, variant, top):
        rows = piece.rows[::-1] if top and variant[0] else getattr(piece, "rows", None)
        for i, path in enumerate(piece.paths(variant, top_length if top else getattr(piece, "stitch_length", None) or length)):
            if top and obj["kind"] == "fill" and obj.get("handStitch", 0):
                path = hand_stitch(path, angle, top_length, obj["handStitch"], obj.get("id", ""), state["stitch"], region)
            if top:
                state["stitch"] += len(path)
            # Top rows may turn along the edge; underlay turns stay clear of it.
            inward = (lambda p: region.contains(p, tolerance)) if top else (lambda p: region.contains(p, 0) and region.clear(p, .25))
            if not state["jump"] and not all(inward(p) for p in interpolate(state["at"], path[0], .1)):
                hop = travel([(path[0], None)], top)
                if hop:
                    sew(hop[1][:-1])
                else:
                    state["jump"] = True
            sew(path)
            if top:
                grid.mark([rows[i]], spacing)
    lane = lambda y: lanes[round(y,9)] if lanes else round((y-base)/spacing)
    def link(pieces):
        """links[p]: sections adjoining p's first row and its last row, as
        (section, its adjoining span), and the set of all its neighbours."""
        rows_at = {}
        for piece in pieces:
            for y, l, r in piece.rows:
                rows_at.setdefault(lane(y), []).append((piece, l, r))
        touching = lambda piece, row: [(other, a, b) for dk in (-1, 1) for other, a, b in rows_at.get(lane(row[0])+dk, ())
                                       if other is not piece and a < row[2] and row[1] < b]
        for piece in pieces:
            first, end = touching(piece, piece.rows[0]), touching(piece, piece.rows[-1])
            links[piece] = (first, end, {other for other, _, _ in first+end})
    def after(piece, variant):
        """Neighbours that travel can enter where this variant ends: travel may
        not run back along the sewn last row, so their span must reach its end."""
        x = piece.ordered(variant)[-1][1][0]
        return {other for other, a, b in links[piece][0 if variant[0] else 1] if a-.8 <= x <= b+.8}
    def plan(pieces, last):
        """Sewing order of top sections as (section, variant), needing
        the fewest trims: a section follows without one when unsewn sections
        join it to where the previous one ended (travel may cross the section
        itself). Best-first depth-first search, bounded below by the groups of
        sections already cut off; within ORDER_BUDGET steps, else the best so far."""
        steps, best = [0], [None]
        def flood(seed, rest):
            seen = set(seed & rest)
            queue = list(seen)
            while queue:
                steps[0] += 1
                for other in (links[queue.pop()][2] & rest)-seen:
                    seen.add(other)
                    queue.append(other)
            return seen
        def cut_off(seed, rest):
            seen, groups = flood(seed, rest), 0
            for other in rest:
                if other not in seen:
                    groups += 1
                    seen |= flood({other}, rest)
            return groups
        def visit(rest, end, point, trims, length, order):
            if not rest:
                if best[0] is None or (trims, length) < best[0][:2]:
                    best[0] = (trims, length, order)
                return
            if steps[0] > ORDER_BUDGET and best[0]:
                return
            reach = rest if end is None else flood(end, rest)
            options = []
            for piece in rest if not last else [last[0]] if rest == {last[0]} else rest-{last[0]}:
                for variant in ([last[1]] if last and piece is last[0] else piece.variants):
                    d = math.dist(point, piece.start(variant)) if point is not None else 0
                    cost = trims + (piece not in reach or d > TRAVEL_LIMIT)
                    options.append((cost+cut_off(after(piece, variant), rest-{piece}), d, cost, piece, variant))
            options.sort(key=lambda o: o[:2])
            for bound, d, cost, piece, variant in options:
                if best[0] and (bound, length+d) >= best[0][:2]:
                    continue
                visit(rest-{piece}, after(piece, variant), piece.end(variant), cost, length+d, order+[(piece, variant)])
        visit(set(pieces), None, state["at"], 0, 0, [])
        return best[0][2]
    def sequence(pieces, top, last=None):
        pieces = list(pieces)+([last[0]] if last else [])
        if top:
            for piece, variant in plan(pieces, last):
                hop = None if state["jump"] else travel([(piece.start(variant), variant)], True)
                if hop:
                    sew(hop[1][:-1])
                else:
                    state["jump"] = True
                sew_piece(piece, variant, True)
            return
        while pieces:
            options = [(piece.start(v), (piece, v)) for piece in pieces for v in piece.variants]
            found = None if state["jump"] else travel(options, False)
            if found:
                (piece, variant), hop = found
                sew(hop[:-1])
            else:
                state["jump"] = True
                piece, variant = min((value for _, value in options), key=lambda pv: 0 if state["at"] is None else math.dist(state["at"], pv[0].start(pv[1])))
            pieces.remove(piece)
            sew_piece(piece, variant, False)
    # The exit part is sewn last; its section nearest the exit is split so the
    # final piece ends on the exit row, at the exit side.
    exit_part, split = None, None
    if target is not None:
        best = None
        for label, part in parts.items():
            for piece in part["top"]:
                for j, (y, l, r) in enumerate(piece.rows):
                    for side, x in ((0, l), (1, r)):
                        d = math.dist(target, rotate([[x, y]], angle, True)[0])
                        if best is None or d < best[0]:
                            best = (d, label, piece, j, side)
        _, exit_part, piece, j, side = best
        rows = piece.rows
        before, final = (rows[:j], rows[j:][::-1]) if len(rows)-j <= j+1 else (rows[j+1:], rows[:j+1])
        final = piece.subset(final)
        split = (piece, piece.subset(before) if before else None, (final, (False, side if (len(final.rows)-1) % 2 else 1-side)))
    first_phase = lambda part: next((part[phase] for phase in phases if part[phase]), part["top"])
    distance = lambda label: min(math.dist(state["at"], piece.start(v)) for piece in first_phase(parts[label]) for v in piece.variants)
    entry_part = grid.component(to_grid(entry)) if entry is not None else -1
    pending = list(parts)
    while pending:
        options = [k for k in pending if k != exit_part or len(pending) == 1]
        label = entry_part if entry_part in pending else options[0] if state["at"] is None else min(options, key=distance)
        if label == entry_part:
            out.append([entry])
            state.update(at=entry, jump=False)
        else:
            state["jump"] = True
        pending.remove(label)
        part = parts[label]
        for phase in phases:
            sequence(part[phase], False)
        tops, last = part["top"], None
        if split and label == exit_part:
            piece, before, last = split
            tops = [p for p in tops if p is not piece]+([before] if before else [])
        link(tops+([last[0]] if last else []))
        if not underlay_only:
            sequence(tops, True, last)
    return [path for path in out if len(path) > 1]


def satin_path(ring, spacing, width, style="satin", split=0, short=False):
    # Constant-width satin along a user-drawn centre line.
    points = sample_path(ring, spacing)
    closed = len(ring) > 2 and math.dist(ring[0], ring[-1]) < 1e-6
    # Direction from neighbours ~0.8 mm away keeps columns from fanning into
    # spikes at sharp corners; closed outlines wrap around their seam.
    k = max(1, round(0.8/spacing))
    n = len(points)-1 if closed else len(points)
    frames = []
    for i, point in enumerate(points):
        if closed:
            a, b = points[(i-k) % n], points[(i+k) % n]
        else:
            a, b = points[max(0, i-k)], points[min(len(points)-1, i+k)]
        distance = math.dist(a, b)
        if distance >= 0.001:
            frames.append((i, point, [-(b[1]-a[1])/distance, (b[0]-a[0])/distance]))
    at = lambda f, side, offset=width/2: [f[1][0]+f[2][0]*offset*side, f[1][1]+f[2][1]*offset*side]
    def compression(j, side):
        a, b = frames[(j-1) % len(frames) if closed else max(0, j-1)], frames[(j+1) % len(frames) if closed else min(len(frames)-1, j+1)]
        centre = math.dist(a[1], b[1])
        return math.dist(at(a, side), at(b, side))/centre if centre > 1e-9 else 1
    result = []
    for j, f in enumerate(frames):
        i = f[0]
        if style == "e-stitch":
            # Walk one rail; each bite goes across and back to that rail.
            result.extend([at(f, -1), at(f, 1), at(f, -1)])
            continue
        side = 1 if i % 2 else -1
        ratio = compression(j, side) if short and (i//2) % 2 else 1
        result.append(at(f, side, width/2-SHORT_INSET*width) if ratio < SHORT_RATIO and 2*spacing*ratio < SHORT_HIT else at(f, side))
    return split_bites(result, split)


def split_bites(path, limit):
    """Splits stitches longer than limit into pieces of at most limit. Each
    split bite shifts its penetrations by up to a third of a piece (golden-ratio
    sequence), so neighbouring bites never line up into a visible groove.
    Offsets are mirrored for bites sewn the other way, so the stagger holds
    across the column rather than per direction."""
    if not limit or len(path) < 2:
        return path
    result, count, ref = [path[0]], 0, None
    for a, b in zip(path, path[1:]):
        d = math.dist(a, b)
        if d > limit:
            pieces = math.ceil(d/(limit*.75))
            v = [b[0]-a[0], b[1]-a[1]]
            flip = ref is not None and v[0]*ref[0]+v[1]*ref[1] < 0
            ref = [-v[0], -v[1]] if flip else v
            offset = ((count*GOLDEN) % 1-.5)*2/3*(-1 if flip else 1)
            count += 1
            result.extend([a[0]+(b[0]-a[0])*(j+offset)/pieces, a[1]+(b[1]-a[1])*(j+offset)/pieces] for j in range(1, pieces))
        result.append(b)
    return result


def rail_paths(ring, width, length):
    points = sample_path(ring, length)
    rails = [[], []]
    for i, p in enumerate(points):
        a, b = points[max(0, i-1)], points[min(len(points)-1, i+1)]
        d = math.dist(a, b)
        if d < 0.001:
            continue
        for rail, side in zip(rails, (-1, 1)):
            rail.append([p[0]-(b[1]-a[1])/d*width/2*side, p[1]+(b[0]-a[0])/d*width/2*side])
    return rails


def cross_cells(rings, cell, angle, rule="evenodd"):
    """Grid cells (i, j) holding a complete cross, in the frame rotated by
    angle; cell (i, j) spans corners (x0+i*cell, y0+j*cell) to (+cell, +cell)."""
    rotated = [rotate(r, angle) for r in rings]
    points = [p for ring in rotated for p in ring]
    min_x, max_x = min(p[0] for p in points), max(p[0] for p in points)
    min_y, max_y = min(p[1] for p in points), max(p[1] for p in points)
    if (max_x-min_x)*(max_y-min_y)/cell**2 > MAX_STITCHES/8:
        raise ValueError("This cross-stitch grid is too dense. Increase the cross size or reduce the design size.")
    # Keep complete crosses inside the region, including concavities and holes.
    region, cells = Region(rotated, rule), set()
    for j in range(int((max_y-min_y)/cell+1e-9)):
        for i in range(int((max_x-min_x)/cell+1e-9)):
            x, y = min_x+i*cell, min_y+j*cell
            corners = [[x, y], [x+cell, y+cell], [x+cell, y], [x, y+cell]]
            if all(region.contains(p) for a, b in ((corners[0], corners[1]), (corners[2], corners[3])) for p in interpolate(a, b, 0.1)+[a]):
                cells.add((i, j))
    return cells, (min_x, min_y)


def route_cross(obj, at, entry, target):
    """Production cross stitch: each row run sews its "/" half-crosses, then
    returns over them with the "\\" legs, so every top leg lies the same way.
    Travel between legs, runs and rows passes through cell centres along
    cross legs (covered or doubled by them), never across empty cells; only
    parts that hidden travel cannot reach start a new path (after a jump)."""
    cell, angle, e = obj["spacing"], obj.get("angle", 0), obj["pullCompensation"]/2/SQRT2
    cells, (x0, y0) = cross_cells(obj["rings"], cell, angle, obj.get("fillRule", "evenodd"))
    if not cells:
        return []
    corner = lambda v: [x0+v[0]*cell, y0+v[1]*cell]
    centre = lambda i, j: [x0+(i+.5)*cell, y0+(j+.5)*cell]
    def leg(i, j, slash, right):
        """(corner, needle point) at each end, sewn rightwards or leftwards; pull extends both ends."""
        a, b = (((i, j+1), (-e, e)), ((i+1, j), (e, -e))) if slash else (((i, j), (-e, -e)), ((i+1, j+1), (e, e)))
        return [(v, [corner(v)[0]+d[0], corner(v)[1]+d[1]]) for v, d in ((a, b) if right else (b, a))]
    def travel(a, b):
        """Corner-to-corner moves through filled cells' centres (breadth-first), or None."""
        if a == b:
            return []
        previous, queue, limit = {a: None}, [a], int(TRAVEL_LIMIT/(cell*SQRT2))+1
        depth = {a: 0}
        for v in queue:
            if depth[v] >= limit:
                break
            for ci, cj in ((v[0]-1, v[1]-1), (v[0], v[1]-1), (v[0]-1, v[1]), (v[0], v[1])):
                if (ci, cj) not in cells:
                    continue
                for w in ((ci, cj), (ci+1, cj), (ci, cj+1), (ci+1, cj+1)):
                    if w not in previous:
                        previous[w], depth[w] = (v, (ci, cj)), depth[v]+1
                        if w == b:
                            path = []
                            while previous[w]:
                                v0, c = previous[w]
                                path[:0] = [centre(*c), corner(w)]
                                w = v0
                            return path
                        queue.append(w)
        return None
    def plan(up):
        """Rows bottom to top starting at the left, or top to bottom from the
        right, so each run ends at the corner where the next row starts."""
        rows = {}
        for i, j in cells:
            rows.setdefault(j, []).append(i)
        runs = []
        for j in sorted(rows, reverse=up):
            xs = sorted(rows[j], reverse=not up)
            run = [xs[0]]
            for i in xs[1:]:
                if abs(i-run[-1]) == 1:
                    run.append(i)
                else:
                    runs.append((j, run))
                    run = [i]
            runs.append((j, run))
        paths, at_v = [], None
        for j, run in runs:
            right = up
            legs = [(i, leg(i, j, True, right)) for i in run]+[(i, leg(i, j, False, not right)) for i in run[::-1]]
            hop = None if at_v is None else travel(at_v, legs[0][1][0][0])
            if hop is None:
                paths.append([legs[0][1][0][1]])
            else:
                paths[-1].extend(hop[:-1]+[legs[0][1][0][1]])
            for k, (i, ((_, a), (v, b))) in enumerate(legs):
                if k:
                    paths[-1].extend([centre(legs[k-1][0], j), a])
                paths[-1].append(b)
                at_v = v
        return [rotate(path, angle, True) for path in paths]
    start = entry or at
    cost = lambda paths: (math.dist(start, paths[0][0]) if start else 0)+(math.dist(paths[-1][-1], target) if target else 0)+len(paths)*1000
    return [[(path, 3)] for path in min((plan(True), plan(False)), key=cost)]


LINE_PASSES = {"none": 0, "center": 1, "edge": 2, "zigzag": 1, "edge-zigzag": 3}


def satin_underlay(obj):
    width = obj.get("satinWidth", 2)
    return "center" if obj["kind"] == "satin" and width < MIN_UNDERLAY_SATIN and obj["underlay"] != "none" else obj["underlay"]


def line_passes(obj, ring):
    """Underlay passes then the top pass, alternating direction so each starts
    where the previous ended: [(points, longest stitch)]."""
    kind, length, width = obj["kind"], obj.get("length", 2.5), obj.get("satinWidth", 2)
    underlay, inset = satin_underlay(obj), max(0.1, width-0.5)
    passes = []
    oriented = lambda: ring if len(passes) % 2 == 0 else ring[::-1]
    if underlay == "center":
        passes.append((line_path(oriented(), length), 3))
    if "edge" in underlay:
        for rail in rail_paths(ring, inset, length):
            passes.append((rail if len(passes) % 2 == 0 else rail[::-1], 3))
    if "zigzag" in underlay:
        passes.append((satin_path(oriented(), 2, inset), 3))
    r = oriented()
    if kind in WIDE_KINDS:
        pull = obj["pullCompensation"]
        passes.append((satin_path(r, obj["spacing"], width+pull, kind, obj["splitLength"], obj["shortStitches"] and kind != "e-stitch"), SATIN_MAX))
        return passes
    use_tolerance = kind in ("running", "bean", "backstitch") and "tolerance" in obj
    path = r if kind == "manual" else tolerant_path(r, length, obj["tolerance"]) if use_tolerance else line_path(r, length)
    if kind == "bean":
        triple = [path[0]]
        for a, b in zip(path, path[1:]):
            triple.extend([b, a, b])
        path = triple
    elif kind == "backstitch":
        # Sew back one interval, then move forward two intervals.
        reverse = [path[1], path[0]] if len(path) > 1 else path
        for i in range(1, len(path)-1):
            reverse.extend([path[i+1], path[i]])
        if len(path) > 1:
            reverse.append(path[-1])
        path = reverse
    passes.append((path, length if use_tolerance else 3))
    return passes


def closed_ring(ring):
    return len(ring) > 3 and math.dist(ring[0], ring[-1]) < 1e-6


def ring_from(ring, p, manual=False):
    """A closed ring restarted at the point nearest p (a vertex for manual stitches)."""
    body = ring[:-1]
    if manual:
        k = min(range(len(body)), key=lambda i: math.dist(p, body[i]))
        return body[k:]+body[:k]+[body[k]]
    _, i, q = nearest_on([body], p, True)
    return [q]+body[i+1:]+body[:i+1]+[q]


def route_lines(obj, at, entry, exit, target):
    """Rings nearest-first. Open rings may sew in reverse; closed rings start at
    the nearest point. An entry picks the first ring and its start, an exit the
    last ring and its end; on a closed running outline the exit is reached by
    retracing the shorter way along the outline."""
    rings, kind = obj["rings"], obj["kind"]
    count = LINE_PASSES.get(satin_underlay(obj), 0)+1 if kind in WIDE_KINDS or kind == "satin" else 1
    def options(ring, start):
        if closed_ring(ring):
            r = ring_from(ring, start, kind == "manual")
            return [(r, r[0], r[0])]
        return [(r, r[0], r[-1] if count % 2 else r[0]) for r in (ring, ring[::-1])]
    pending, plan, cur = list(range(len(rings))), [], entry or at
    nearest = lambda p: min(pending, key=lambda i: min(math.dist(p, q) for q in ((rings[i][0], rings[i][-1]) if not closed_ring(rings[i]) else [nearest_on([rings[i]], p, False)[2]])))
    last = nearest(exit) if exit and len(rings) > 1 else None
    if last is not None and entry and nearest(entry) == last:
        last = None
    while pending:
        candidates = [i for i in pending if i != last or len(pending) == 1]
        first = not plan
        if first and entry:
            index = nearest(entry) if entry else None
        elif cur is None:
            index = candidates[0]
        else:
            index = min(candidates, key=lambda i: min(math.dist(cur, o[1]) for o in options(rings[i], cur)))
        pending.remove(index)
        final = not pending
        ring = rings[index]
        if closed_ring(ring) and final and exit and not (first and entry):
            start = exit
        else:
            start = entry if first and entry else cur if cur is not None else ring[0]
        choices = options(ring, start)
        if final and exit and not closed_ring(ring) and not (first and entry):
            r, _, _ = min(choices, key=lambda o: math.dist(o[2], exit))
        elif first and entry:
            r, _, _ = min(choices, key=lambda o: math.dist(o[1], entry))
        else:
            r, _, _ = min(choices, key=lambda o: (math.dist(cur, o[1]) if cur else 0)+(math.dist(o[2], target) if final and target else 0))
        passes = line_passes(obj, r)
        if closed_ring(r) and final and exit and first and entry and kind not in WIDE_KINDS and math.dist(r[0], exit) > 1e-6:
            _, i, q = nearest_on([r], exit, False)
            forward, backward = r[:i+1]+[q], r[i+1:][::-1]+[q]
            arc = min((forward, backward), key=lambda a: sum(math.dist(u, v) for u, v in zip(a, a[1:])))
            passes.append((line_path(arc, obj.get("length", 2.5)), 3))
        plan.append(passes)
        cur = passes[-1][0][-1]
    return plan


def next_target(obj, nxt):
    """Where the next object will likely start: its entry, or its nearest
    start candidate (line ends, or any outline point) to this object."""
    if nxt is None:
        return None
    if nxt.get("entry"):
        return nxt["entry"]
    points = [p for r in obj["rings"] for p in r]
    centre = [sum(p[0] for p in points)/len(points), sum(p[1] for p in points)/len(points)]
    line = nxt["kind"] not in FILL_KINDS
    candidates = [p for r in nxt["rings"] for p in ((r[0], r[-1]) if line and not closed_ring(r) else r)]
    return min(candidates, key=lambda p: math.dist(p, centre))


def plan_object(obj, at, target):
    """Polylines for one object; each is [(points, longest stitch)] and starts after a jump."""
    kind, entry, exit = obj["kind"], obj.get("entry"), obj.get("exit")
    if kind in FILL_KINDS:
        snap = lambda p: p and nearest_on(obj["rings"], p, True)[2]
        entry, exit = snap(entry), snap(exit)
        if kind == "cross":
            foundation = [[(path, 3)] for path in route_fill(obj, at, entry, None, True)]
            return foundation+route_cross(obj, foundation[-1][-1][0][-1] if foundation else at, None if foundation else entry, exit or target)
        return [[(path, max(3, obj.get("fillLength", 0), *(u["length"] for u in obj.get("fillUnderlays", []))))] for path in route_fill(obj, at, entry, exit or target)]
    return route_lines(obj, at, entry, exit, exit or target)


# Design check thresholds (mm). Stitches under SHORT_STITCH fray or break the thread; a warning needs
# SHORT_CLUSTER of them within one SHORT_CELL square (a few at fill row tips are normal), or SHORT_MANY of
# the object's stitches. Sewn stitches over LONG_STITCH (satin's default split) snag; planned satin
# bites, jumps and landings are excluded. Density is averaged over DENSE_WINDOW mm squares: needle
# penetrations per mm2 and thread layers (sewn thread per mm2 x the woven fill spacing, so one fill is
# ~1 layer). Two stacked woven fills stay below the check level, three reach it and four (or three with
# full underlay) fail; clusters smaller than 4 mm2 at the check level are noise. Same-colour jumps
# between objects over LONG_JUMP (reordering can shorten them) and more than MANY_TRIMS trims (each
# slows the machine and leaves a tail that can pull out) are worth checking.
SHORT_STITCH, SHORT_CELL, SHORT_CLUSTER, SHORT_MANY, LONG_STITCH = .3, 2, 3, .1, 7
DENSE_HITS, DENSE_LAYERS, LAYER_SPACING, LONG_JUMP, MANY_TRIMS = (7, 10), (3, 5), .42, 30, 25
DENSE_WINDOW = 3


def design_check(trace, cuts, objects):
    """Warnings from the stitches as written: [{code, objectId, bounds [x0, y0, x1, y1], severity, values}]."""
    ident = lambda i: str(objects[i].get("id", i))
    def box(points, pad=0):
        xs, ys = [p[0] for p in points], [p[1] for p in points]
        return [round(min(xs)-pad, 2), round(min(ys)-pad, 2), round(max(xs)+pad, 2), round(max(ys)+pad, 2)]
    warnings, short, long_, sewn, hits, thread = [], {}, {}, {}, {}, {}
    def add(grid, x, y, i, n):
        cell = grid.setdefault((int(x//1), int(y//1)), {})
        cell[i] = cell.get(i, 0)+n
    for a, b in zip(trace, trace[1:]):
        if b[3] == "jump":
            continue
        add(hits, b[0], b[1], b[2], 1)
        if b[3] == "land":
            continue
        sewn[b[2]] = sewn.get(b[2], 0)+1
        d = math.dist(a[:2], b[:2])
        for p in interpolate(a[:2], b[:2], .5):
            add(thread, p[0], p[1], b[2], d/max(1, math.ceil(d/.5)))
        if d < SHORT_STITCH-.01 and b[3] != "lock":
            short.setdefault(b[2], []).append((d, a, b))
        elif d > LONG_STITCH and b[3] != "bite":
            long_.setdefault(b[2], []).append((d, a, b))
    for i, found in short.items():
        cells = {}
        for item in found:
            cells.setdefault((int(item[2][0]//SHORT_CELL), int(item[2][1]//SHORT_CELL)), []).append(item)
        hot = [item for group in cells.values() if len(group) >= SHORT_CLUSTER for item in group]
        share = len(found)/sewn[i]
        if hot or share >= SHORT_MANY:
            hot = hot or found
            warnings.append({"code": "short-stitches", "objectId": ident(i), "bounds": box([p[:2] for _, a, b in hot for p in (a, b)], .5),
                             "severity": "fail" if share >= SHORT_MANY or len(hot) >= 4*SHORT_CLUSTER else "check",
                             "values": {"count": len(found), "shortest": round(min(d for d, _, _ in found), 2), "limit": SHORT_STITCH, "share": round(share*100, 1)}})
    for i, found in long_.items():
        warnings.append({"code": "long-stitches", "objectId": ident(i), "bounds": box([p[:2] for _, a, b in found for p in (a, b)]),
                         "severity": "check", "values": {"count": len(found), "longest": round(max(d for d, _, _ in found), 1), "limit": LONG_STITCH}})
    # Density: 2 x 2 mm windows over 1 mm cells, credited to the object with the most penetrations there.
    dense = {}
    for cx, cy in hits:
        for k in ((cx-u, cy-v) for u in range(DENSE_WINDOW) for v in range(DENSE_WINDOW)):
            if k in dense:
                continue
            window = [(k[0]+u, k[1]+v) for u in range(DENSE_WINDOW) for v in range(DENSE_WINDOW)]
            n = sum(sum(hits.get(c, {}).values()) for c in window)/DENSE_WINDOW**2
            layers = sum(sum(thread.get(c, {}).values()) for c in window)/DENSE_WINDOW**2*LAYER_SPACING
            level = 2 if n >= DENSE_HITS[1] or layers >= DENSE_LAYERS[1] else 1 if n >= DENSE_HITS[0] or layers >= DENSE_LAYERS[0] else 0
            if level:
                owners = {}
                for c in window:
                    for i, m in hits.get(c, {}).items():
                        owners[i] = owners.get(i, 0)+m
                dense[k] = (level, n, layers, max(owners, key=owners.get), len(owners))
            else:
                dense[k] = None
    flagged, seen = {k: v for k, v in dense.items() if v}, set()
    for start in flagged:
        if start in seen:
            continue
        group, stack = [], [start]
        seen.add(start)
        while stack:
            k = stack.pop()
            group.append(k)
            for n in ((k[0]+u, k[1]+v) for u in range(-3, 4) for v in range(-3, 4)):
                if n in flagged and n not in seen:
                    seen.add(n)
                    stack.append(n)
        values = [flagged[k] for k in group]
        if len(group) < 4 and all(v[0] < 2 for v in values):
            continue
        owners = {}
        for k in group:
            for c in ((k[0]+u, k[1]+v) for u in range(DENSE_WINDOW) for v in range(DENSE_WINDOW)):
                for i, m in hits.get(c, {}).items():
                    owners[i] = owners.get(i, 0)+m
        warnings.append({"code": "dense", "objectId": ident(max(owners, key=owners.get)), "severity": "fail" if any(v[0] == 2 for v in values) else "check",
                         "bounds": box([(k[0]+u, k[1]+v) for k in group for u in (0, DENSE_WINDOW) for v in (0, DENSE_WINDOW)]),
                         "values": {"hits": round(max(v[1] for v in values), 1), "layers": round(max(v[2] for v in values), 1), "hitLimit": DENSE_HITS[0],
                                    "layerLimit": DENSE_LAYERS[0], "area": len(group), "objects": max(v[4] for v in values)}})
    # Jumps: from each trim to the next landing, between objects sewn in the same colour.
    lands = {}
    for t in trace:
        if t[3] == "land":
            lands.setdefault(t[2], t)
    for point, before, after, changes in cuts:
        if after is None or after == before or changes:
            continue
        d = math.dist(point, lands[after][:2])
        if d > LONG_JUMP:
            warnings.append({"code": "long-jump", "objectId": ident(after), "bounds": box([point, lands[after][:2]]), "severity": "check",
                             "values": {"length": round(d, 1), "limit": LONG_JUMP}, "fromId": ident(before)})
    trims = [c for c in cuts if c[2] is not None]
    if len(trims) > MANY_TRIMS:
        per = {}
        for _, before, _, _ in trims:
            per[before] = per.get(before, 0)+1
        worst = max(per, key=per.get)
        warnings.append({"code": "many-trims", "objectId": ident(worst), "bounds": box([c[0] for c in trims if c[1] == worst], 1), "severity": "check",
                         "values": {"count": len(trims), "limit": MANY_TRIMS, "objectCount": per[worst]}})
    return warnings


def compile_project(project):
    started = time.perf_counter()
    width, height, trim_jump, objects = validate(project)
    pattern = EmbPattern()
    # PES short strings are byte-length fields; keep metadata ASCII here.
    name = re.sub(r"[^a-zA-Z0-9 _-]", "", str(project.get("name", "Threadroom")))[:40] or "Threadroom"
    pattern.metadata("name", name)
    pattern.metadata("author", "Threadroom")
    total = 0
    previous = None

    # Every needle move as written (0.1 mm units): (x, y, object index, role) for the design check.
    trace, owner = [], 0

    def move(command, point, role="run"):
        nonlocal total, previous
        x, y = point
        if not math.isfinite(x+y) or not (-0.001 <= x <= width+0.001 and -0.001 <= y <= height+0.001):
            raise ValueError("Some generated stitches extend outside the selected hoop. Move the object inward or reduce its satin width.")
        total += 1
        if total > MAX_STITCHES:
            raise ValueError("This prototype supports up to 100,000 stitch commands. Reduce the size or increase spacing.")
        qx, qy = round((x-width/2)*10), round((y-height/2)*10)
        pattern.add_stitch_absolute(command, qx, qy)
        trace.append((qx/10+width/2, qy/10+height/2, owner, role if command == STITCH else "jump"))
        previous = point

    def sew_to(point, limit=3, role="run"):
        if previous is None:
            move(JUMP, point)
        elif math.dist(previous, point) > 1e-6:
            for p in interpolate(previous, point, limit):
                move(STITCH, p, role)

    def lock(points, kind, size):
        """Lock stitches at points[0], where the needle is, heading along the
        path: a tack sews size along it and back twice; a triangle sews an
        arrow size long and wide pointing along it. Ends at points[0]."""
        a, q, run = points[0], points[0], 0
        for u, v in zip(points, points[1:]):
            d = math.dist(u, v)
            if run+d >= size:
                q = [u[0]+(v[0]-u[0])*(size-run)/d, u[1]+(v[1]-u[1])*(size-run)/d]
                break
            run, q = run+d, v
        d = math.dist(a, q)
        if kind == "none" or d < .3:
            return
        n = [-(q[1]-a[1])/2, (q[0]-a[0])/2]
        for p in [q, a, q, a] if kind == "tack" else [[q[0]+n[0], q[1]+n[1]], [q[0]-n[0], q[1]-n[1]], a]:
            sew_to([min(max(p[0], 0), width), min(max(p[1], 0), height)], role="lock")

    # Runs: stitch paths that each start after a jump in the plan.
    runs, at = [], None
    for index, obj in enumerate(objects):
        target = obj.get("exit") or next_target(obj, objects[index+1] if index+1 < len(objects) else None)
        clamp = obj["kind"] in FILL_KINDS  # compensation may reach past a ring that touches the hoop edge
        for chunks in plan_object(obj, at, target):
            chunks = [([[min(max(x, 0), width), min(max(y, 0), height)] for x, y in points] if clamp else points, limit) for points, limit in chunks]
            points = [p for chunk, _ in chunks for p in chunk]
            runs.append((index, obj, chunks, points))
            at = points[-1]
    # A run that changes colour or starts more than trim_jump away trims: tie
    # off, trim, jump, tie in. Nearer runs join with one connecting stitch and
    # no ties: pystitch writes every PEC jump after the first with the trim flag
    # (0x20) and drops TRIM itself, so a jump that must not trim is a stitch.
    color, last, trims, cuts = None, None, 0, []
    for index, obj, chunks, points in runs:
        changes = obj["color"].lower() != color
        trim = last is not None and (changes or math.dist(previous, points[0]) > trim_jump)
        if trim:
            lock(last[1][::-1], last[0]["tieOff"], last[0]["lockSize"])
            pattern.add_command(TRIM)
            trims += 1
            cuts.append((previous, owner, index, changes))
        owner = index
        if changes:
            if color is not None:
                pattern.add_command(COLOR_CHANGE)
            color = obj["color"].lower()
            thread = EmbThread()
            thread.set_hex_color(color)
            thread.description = str(obj.get("name", "Thread"))[:40].encode("ascii", "ignore").decode()
            thread.brand = "Threadroom"
            pattern.add_thread(thread)
        if last is None or trim:
            # Land with a stitch: pystitch encodes the first stitch after a trim as
            # trim-jump + penetration. A JUMP here would add a second trim-jump.
            move(STITCH, points[0], "land")
            lock(points, obj["tieIn"], obj["lockSize"])
        for k, (chunk, limit) in enumerate(chunks):
            for i, point in enumerate(chunk):
                if i:
                    sew_to(point, limit, "bite" if limit == SATIN_MAX else "run")
                else:
                    sew_to(point, 3 if k or last is None or trim else trim_jump+.01, "run" if k or last is None or trim else "connect")
        last = (obj, points)
    if last:
        lock(last[1][::-1], last[0]["tieOff"], last[0]["lockSize"])
        cuts.append((previous, owner, None, False))
    pattern.add_command(TRIM)
    pattern.add_command(END)
    output = io.BytesIO()
    write_pes(pattern, output, {"version": 6, "max_stitch": 127, "max_jump": 2047, "full_jump": True})
    data = output.getvalue()
    # Preview the file that was actually written, including quantisation and
    # format normalisation. This also detects writer/reader disagreement.
    decoded = read_pes(io.BytesIO(data))
    connectors = {(round(a[0], 1), round(a[1], 1), round(b[0], 1), round(b[1], 1)) for a, b in zip(trace, trace[1:]) if b[3] == "connect"}
    commands, threads = [], []
    for thread in decoded.threadlist:
        threads.append({"color": thread.hex_color(), "name": thread.description or "Thread"})
    block, cut = 0, False
    last = [width/2, height/2]
    sewn = []
    max_length = 0
    counts = {"stitches": 0, "jumps": 0, "trims": 0, "colorChanges": 0}
    jump_length = 0
    # PES inserts jumps at landings. Sewn destinations retain trace order, including
    # repeated holes; coordinate maps would misattribute overlapping same-colour objects.
    stitch_trace = [t for t in trace if t[3] != "jump"]
    trace_at, last_owner = 0, stitch_trace[0][2] if stitch_trace else 0
    for x, y, command in decoded.stitches:
        flag = command & COMMAND_MASK
        p = [x/10+width/2, y/10+height/2]
        if flag == END:
            break
        if flag == COLOR_CHANGE:
            block += 1
            counts["colorChanges"] += 1
            continue
        if flag == TRIM:
            counts["trims"] += 1
            cut = True
            continue
        if flag not in (STITCH, JUMP):
            continue
        kind = "stitch" if flag == STITCH else "jump"
        t = stitch_trace[min(trace_at, len(stitch_trace)-1)]
        owner = t[2]
        commands.append({"objectIndex": owner, "objectId": str(objects[owner].get("id", owner)), "fromObjectId": str(objects[last_owner].get("id", last_owner)), "x": p[0], "y": p[1], "fromX": last[0], "fromY": last[1], "type": kind, "block": block, "trim": cut and flag == JUMP,
                         "travel": flag == STITCH and (round(last[0], 1), round(last[1], 1), round(p[0], 1), round(p[1], 1)) in connectors})
        if flag == STITCH:
            if abs(p[0]-t[0]) < .001 and abs(p[1]-t[1]) < .001:
                trace_at += 1
            last_owner = owner
        cut = cut and flag != JUMP
        counts["stitches" if flag == STITCH else "jumps"] += 1
        if flag == JUMP and commands[1:]:
            jump_length += math.dist(last, p)
        if flag == STITCH:
            sewn.extend([last, p])
            max_length = max(max_length, math.dist(last, p))
        last = p
    if not sewn:
        raise ValueError("This design produced no stitches. Enlarge the regions or use a running stitch.")
    if counts["trims"] != trims:
        raise ValueError("The PES writer changed the trims; this design cannot be exported safely.")
    xs, ys = [p[0] for p in sewn], [p[1] for p in sewn]
    return {"pes": base64.b64encode(data).decode(), "filename": name.replace(" ", "-").lower()+".pes",
            "commands": commands, "threads": threads, "stats": {**counts,
            "jumpLength": round(jump_length, 1), "width": round(max(xs)-min(xs), 1), "height": round(max(ys)-min(ys), 1),
            "maxStitch": round(max_length, 2), "bytes": len(data),
            "durationMs": round((time.perf_counter()-started)*1000)},
            "warnings": design_check(trace, cuts, objects),
            "engine": "threadroom-poc+pystitch", "pesVersion": "6"}
