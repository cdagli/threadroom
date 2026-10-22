"""Angle guides (Ember's Edit angles): straight guide lines drawn across a fill.

One guide only sets the fill angle. With two or more, rows follow a smooth direction field:
each guide i has its own straight-row level l_i(p) = L_i + n_i.(p - c_i), and the fill's
level is their inverse-square blend (Shepard weights 1/d_i^2, d_i = distance to the guide
segment). Rows are level lines of that blend, so they run parallel to each guide near it
and turn smoothly in between; the offsets L_i are line integrals of the blended normal
along a spanning tree of the guide centres, so neighbouring guides agree. Levels are spaced
so the widest gap between neighbouring rows is the row spacing (Ember's SweepFill). Where
rows converge below trigger x spacing, the two rows sharing a turn there both stop short
(Ember's row shortening), recursively: a turn whose pair index has k trailing zero bits
goes on down to trigger / 2^k, so the retained turns inside a bend keep about the row
spacing between them and every turn stays a short step. Crossing or touching guides are
invalid and fall back to the first guide's angle (Ember falls back to straight rows).
Rows are contoured on a grid (marching squares) and clipped exactly to the outline; the
along-row coordinate psi blends each guide's tangent coordinate the same way.
"""
import math
from . import compiler as C
from .engines import clean, clear, route_pieces

TRIGGER = .5


def guide_angle(g):
    a, b = g["a"], g["b"]
    return math.degrees(math.atan2(b[1]-a[1], b[0]-a[0]))


def crossing(g, h):
    """True when two guide segments cross or touch (T-junctions included)."""
    p, q, r, s = g["a"], g["b"], h["a"], h["b"]
    if min(C.segment_distance(p, r, s), C.segment_distance(q, r, s), C.segment_distance(r, p, q), C.segment_distance(s, p, q)) < 1e-6:
        return True
    side = lambda a, b, c: (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    return (side(r, s, p) > 0) != (side(r, s, q) > 0) and (side(p, q, r) > 0) != (side(p, q, s) > 0)


def usable(obj):
    """The guides the compiler follows: all of them, or only the first when two cross."""
    guides = obj.get("angleGuides") or []
    return guides[:1] if any(crossing(g, h) for i, g in enumerate(guides) for h in guides[:i]) else guides


class Field:
    """Blended level phi (across rows) and along-row coordinate psi from two or more guides."""

    def __init__(self, guides):
        self.g = []
        for guide in guides:
            a, b = guide["a"], guide["b"]
            d = math.dist(a, b)
            self.g.append({"a": a, "b": b, "c": C.lerp(a, b, .5), "t": [(b[0]-a[0])/d, (b[1]-a[1])/d], "L": 0.0, "U": 0.0})
        # Prim's tree over the centres: each guide is oriented like its parent.
        done, order = {0}, []
        while len(done) < len(self.g):
            j, p = min(((j, p) for j in range(len(self.g)) if j not in done for p in sorted(done)), key=lambda jp: math.dist(self.g[jp[0]]["c"], self.g[jp[1]]["c"]))
            done.add(j)
            order.append((j, p))
            tj, tp = self.g[j]["t"], self.g[p]["t"]
            if tj[0]*tp[0]+tj[1]*tp[1] < 0:
                self.g[j]["t"] = [-tj[0], -tj[1]]
        for g in self.g:
            g["n"] = [-g["t"][1], g["t"][0]]
        for j, p in order:
            a, b, steps, dl, du = self.g[p]["c"], self.g[j]["c"], 64, 0.0, 0.0
            for k in range(steps):
                n, t = self.directions(C.lerp(a, b, (k+.5)/steps))
                dl += (n[0]*(b[0]-a[0])+n[1]*(b[1]-a[1]))/steps
                du += (t[0]*(b[0]-a[0])+t[1]*(b[1]-a[1]))/steps
            self.g[j]["L"], self.g[j]["U"] = self.g[p]["L"]+dl, self.g[p]["U"]+du

    def weights(self, p):
        return [1/(C.segment_distance(p, g["a"], g["b"])**2+1e-9) for g in self.g]

    def directions(self, p):
        w = self.weights(p)
        n = [sum(wi*g["n"][k] for wi, g in zip(w, self.g)) for k in (0, 1)]
        t = [sum(wi*g["t"][k] for wi, g in zip(w, self.g)) for k in (0, 1)]
        ln, lt = math.hypot(*n) or 1, math.hypot(*t) or 1
        return [n[0]/ln, n[1]/ln], [t[0]/lt, t[1]/lt]

    def __call__(self, p):
        total = phi = psi = 0.0
        for g in self.g:
            a, b = g["a"], g["b"]
            ex, ey = b[0]-a[0], b[1]-a[1]
            u = max(0, min(1, ((p[0]-a[0])*ex+(p[1]-a[1])*ey)/(ex*ex+ey*ey)))
            w = 1/((p[0]-a[0]-u*ex)**2+(p[1]-a[1]-u*ey)**2+1e-9)
            dx, dy = p[0]-g["c"][0], p[1]-g["c"][1]
            total += w
            phi += w*(g["L"]+g["n"][0]*dx+g["n"][1]*dy)
            psi += w*(g["U"]+g["t"][0]*dx+g["t"][1]*dy)
        return phi/total, psi/total


def rank(k):
    """Trailing zero bits of a pair index: how far a turn survives row shortening."""
    return 30 if k == 0 else (abs(k) & -abs(k)).bit_length()-1


def arc(points):
    out = [0.0]
    for a, b in zip(points, points[1:]):
        out.append(out[-1]+math.dist(a, b))
    return out


def point_at(points, cumulative, s):
    i = next((i for i in range(1, len(points)) if cumulative[i] >= s-1e-12), len(points)-1)
    d = cumulative[i]-cumulative[i-1]
    return C.lerp(points[i-1], points[i], (s-cumulative[i-1])/d if d > 1e-12 else 1)


class Rows:
    """Level-line row pieces of a guided fill: dicts {k, points, psi, ends}; ends flag
    boundary ends (False where row shortening stopped the row inside the shape)."""

    def __init__(self, obj, guides, spacing):
        rings, rule = obj["rings"], obj.get("fillRule", "evenodd")
        self.field, self.region, self.spacing = Field(guides), C.Region(rings, rule), spacing
        xs, ys = [p[0] for r in rings for p in r], [p[1] for r in rings for p in r]
        cell = self.cell = max(.3, min(1.0, math.hypot(max(xs)-min(xs), max(ys)-min(ys))/150))
        x0, y0 = self.x0, self.y0 = min(xs)-2*cell, min(ys)-2*cell
        nx, ny = self.nx, self.ny = int((max(xs)-x0)/cell)+4, int((max(ys)-y0)/cell)+4
        if nx*ny > 250_000:
            raise ValueError("This fill is too dense. Increase spacing or reduce the design size.")
        phi, psi = [0.0]*(nx*ny), [0.0]*(nx*ny)
        for j in range(ny):
            for i in range(nx):
                phi[j*nx+i], psi[j*nx+i] = self.field([x0+i*cell, y0+j*cell])
        inside = bytearray(nx*ny)
        for j in range(ny):
            for a, b in C.scan_spans(rings, y0+j*cell, rule):
                for i in range(max(0, math.ceil((a-x0)/cell)), min(nx-1, math.floor((b-x0)/cell))+1):
                    inside[j*nx+i] = 1
        grad = [0.0]*(nx*ny)
        for j in range(ny):
            for i in range(nx):
                k = j*nx+i
                gx = (phi[k+1 if i < nx-1 else k]-phi[k-1 if i else k])/(cell*(2 if 0 < i < nx-1 else 1))
                gy = (phi[k+nx if j < ny-1 else k]-phi[k-nx if j else k])/(cell*(2 if 0 < j < ny-1 else 1))
                grad[k] = math.hypot(gx, gy)
        self.grad = grad
        # The widest gap between rows is the row spacing (bounded for degenerate guides).
        self.step = step = spacing*min(1.5, max(.25, min((g for g, f in zip(grad, inside) if f), default=1)))
        edges, buckets = [(a, b) for r in rings for a, b in zip(r, r[1:]+r[:1]) if a != b], {}
        for e, (a, b) in enumerate(edges):
            for j in range(int((min(a[1], b[1])-y0)/cell)-1, int((max(a[1], b[1])-y0)/cell)+2):
                for i in range(int((min(a[0], b[0])-x0)/cell)-1, int((max(a[0], b[0])-x0)/cell)+2):
                    buckets.setdefault((i, j), []).append(e)
        # Marching squares: per level, crossing edge id -> [(neighbouring edge id, cell)].
        levels, pairs = {}, ((0, 1), (1, 2), (3, 2), (0, 3))
        for j in range(ny-1):
            for i in range(nx-1):
                k = j*nx+i
                values = (phi[k], phi[k+1], phi[k+nx+1], phi[k+nx])
                lo, hi = math.ceil(min(values)/step), math.floor(max(values)/step)
                if lo > hi:
                    continue
                ids = (2*k, 2*(k+1)+1, 2*(k+nx), 2*k+1)  # bottom, right, top, left
                for level in range(lo, hi+1):
                    v = level*step
                    above = [x >= v for x in values]
                    cut = [e for e, (p, q) in enumerate(pairs) if above[p] != above[q]]
                    if len(cut) == 2:
                        segments = [cut]
                    elif len(cut) == 4:
                        segments = [(0, 1), (2, 3)] if (sum(values)/4 >= v) != above[1] else [(0, 3), (1, 2)]
                    else:
                        continue
                    graph = levels.setdefault(level, {})
                    for e, f in segments:
                        graph.setdefault(ids[e], []).append((ids[f], (i, j)))
                        graph.setdefault(ids[f], []).append((ids[e], (i, j)))
        def crossing_point(edge, v):
            k, vertical = edge//2, edge % 2
            m = k+nx if vertical else k+1
            t = (v-phi[k])/(phi[m]-phi[k]) if phi[m] != phi[k] else .5
            return [x0+(k % nx+(0 if vertical else t))*cell, y0+(k//nx+(t if vertical else 0))*cell], psi[k]+(psi[m]-psi[k])*t
        pieces = []
        for level in sorted(levels):
            graph, seen = levels[level], set()
            for start in sorted(graph, key=lambda e: (len(graph[e]) != 1, e)):
                if start in seen:
                    continue
                chain, cells, previous, current = [start], [], None, start
                seen.add(start)
                while True:
                    step_to = next(((e, c) for e, c in graph[current] if e not in seen), None)
                    if step_to is None:
                        closing = next(((e, c) for e, c in graph[current] if e == start and len(chain) > 2), None)
                        if closing:
                            chain.append(start)
                            cells.append(closing[1])
                        break
                    seen.add(step_to[0])
                    chain.append(step_to[0])
                    cells.append(step_to[1])
                    previous, current = current, step_to[0]
                if len(chain) > 1:
                    pieces.extend(self.clip([crossing_point(e, level*step) for e in chain], cells, level, edges, buckets, inside))
        for piece in pieces:
            if piece["psi"][-1] < piece["psi"][0]:
                piece["points"].reverse()
                piece["psi"].reverse()
        # Drop short pieces and level lines running along the outline itself.
        def keep(p):
            cumulative = arc(p["points"])
            return cumulative[-1] >= .3 and any(self.region.clear(point_at(p["points"], cumulative, cumulative[-1]*f), .05) for f in (.25, .5, .75))
        self.pieces = [p for p in pieces if keep(p)]

    def clip(self, points, cells, level, edges, buckets, inside):
        """Exact clipping of a contour (points with psi) to the outline, cell by cell."""
        pieces, active = [], [None]
        def flush():
            if active[0] and len(active[0]["points"]) > 1:
                pieces.append(active[0])
            active[0] = None
        for (a, sa), (b, sb), c in zip(points, points[1:], cells):
            near = buckets.get(c, ())
            cuts, dx, dy = [0, 1], b[0]-a[0], b[1]-a[1]
            for e in near:
                u, w = edges[e]
                ex, ey = w[0]-u[0], w[1]-u[1]
                den = dx*ey-dy*ex
                if abs(den) < 1e-12:
                    continue
                t, q = ((u[0]-a[0])*ey-(u[1]-a[1])*ex)/den, ((u[0]-a[0])*dy-(u[1]-a[1])*dx)/den
                if 1e-9 < t < 1-1e-9 and -1e-9 <= q <= 1+1e-9:
                    cuts.append(t)
            cuts = sorted(set(cuts))
            for lo, hi in zip(cuts, cuts[1:]):
                mid = [a[0]+(lo+hi)/2*dx, a[1]+(lo+hi)/2*dy]
                if self.region.contains(mid, 0) if near else inside[c[1]*self.nx+c[0]]:
                    if active[0] and lo > 0:
                        flush()
                    if not active[0]:
                        active[0] = {"k": level, "points": [[a[0]+lo*dx, a[1]+lo*dy]], "psi": [sa+(sb-sa)*lo], "ends": [True, True]}
                    active[0]["points"].append([a[0]+hi*dx, a[1]+hi*dy])
                    active[0]["psi"].append(sa+(sb-sa)*hi)
                    if hi < 1:
                        flush()
                else:
                    flush()
        flush()
        return pieces

    def ratio(self, p):
        """Local row gap over the row spacing."""
        fx, fy = (p[0]-self.x0)/self.cell, (p[1]-self.y0)/self.cell
        i, j = max(0, min(self.nx-2, int(fx))), max(0, min(self.ny-2, int(fy)))
        u, v, k, g = fx-i, fy-j, j*self.nx+i, self.grad
        grad = g[k]*(1-u)*(1-v)+g[k+1]*u*(1-v)+g[k+self.nx]*(1-u)*v+g[k+self.nx+1]*u*v
        return self.step/(self.spacing*max(grad, 1e-6))

    def shortened(self, section, trigger):
        """Row shortening on one boustrophedon section. Rows i and i+1 share a turn at one end;
        where the rows there are closer than the limit, both stop short at the same level so the
        turn stays a short step. The limit halves with each trailing zero bit of the turn's pair
        index (trigger / 2^rank), so retained turns keep about the row spacing between them.
        Each end is trimmed by at most 45% of its row."""
        trims = [[0.0, 0.0] for _ in section]
        for i in range(len(section)-1):
            side = 1 if i % 2 == 0 else 0
            limit = trigger/2**rank(min(section[i]["k"], section[i+1]["k"])//2)
            for j in (i, i+1):
                points = section[j]["points"] if side == 0 else section[j]["points"][::-1]
                cumulative, r = arc(points), [self.ratio(p) for p in points]
                if r[0] >= limit:
                    continue
                cut = cumulative[-1]
                for m in range(1, len(points)):
                    if r[m] >= limit:
                        cut = cumulative[m-1]+(limit-r[m-1])/(r[m]-r[m-1])*(cumulative[m]-cumulative[m-1])
                        break
                trims[j][side] = max(trims[j][side], min(cut, .45*cumulative[-1]))
        return [trim(piece, *t) for piece, t in zip(section, trims)]

    def sections(self):
        """Lanes grouped into boustrophedon sections, as compiler.fill_sections does for
        straight rows: a piece continues a section when the two overlap exclusively in psi."""
        lanes = {}
        for p in self.pieces:
            lanes.setdefault(p["k"], []).append(p)
        overlaps = lambda a, b: a["psi"][0] < b["psi"][-1] and b["psi"][0] < a["psi"][-1]
        out, active, previous = [], [], None
        for k in sorted(lanes):
            lane = sorted(lanes[k], key=lambda p: p["psi"][0])
            if previous is None or k != previous+1:
                active = []
            following = []
            for piece in lane:
                matches = [s for s in active if overlaps(s[-1], piece)]
                if len(matches) == 1 and sum(overlaps(matches[0][-1], other) for other in lane) == 1:
                    matches[0].append(piece)
                    following.append(matches[0])
                else:
                    out.append([piece])
                    following.append(out[-1])
            active, previous = following, k
        return out


def trim(piece, start, end):
    """The piece without its first start mm and last end mm; trimmed ends are not boundary ends."""
    if start <= 1e-9 and end <= 1e-9:
        return piece
    points, psi = piece["points"], piece["psi"]
    cumulative = arc(points)
    lo, hi = start, cumulative[-1]-end
    at = lambda s: (point_at(points, cumulative, s), interpolate(psi, cumulative, s))
    a, b = at(lo), at(hi)
    inner = [i for i in range(len(points)) if lo < cumulative[i] < hi]
    return {"k": piece["k"], "points": [a[0]]+[points[i] for i in inner]+[b[0]], "psi": [a[1]]+[psi[i] for i in inner]+[b[1]],
            "ends": [piece["ends"][0] and start <= 1e-9, piece["ends"][1] and end <= 1e-9]}


def interpolate(values, cumulative, s):
    i = next((i for i in range(1, len(values)) if cumulative[i] >= s-1e-12), len(values)-1)
    d = cumulative[i]-cumulative[i-1]
    return values[i-1]+(values[i]-values[i-1])*((s-cumulative[i-1])/d if d > 1e-12 else 1)


def extended(piece, pull):
    """Row points with boundary ends pushed out by pull/2 along the row (pull compensation)."""
    points = [list(p) for p in piece["points"]]
    if pull <= 0:
        return points
    for end in (0, 1):
        if not piece["ends"][end]:
            continue
        seq = points if end == 0 else points[::-1]
        tip = seq[0]
        far = next((q for q in seq[1:] if math.dist(q, tip) > .2), seq[-1])
        d = math.dist(far, tip)
        if d > 1e-9:
            moved = [tip[0]+(tip[0]-far[0])/d*pull/2, tip[1]+(tip[1]-far[1])/d*pull/2]
            if end == 0:
                points[0] = moved
            else:
                points[-1] = moved
    return points


def penetrations(piece, points, length, cycle, shear, anchor):
    """Needle points along a row (psi order): even division, or the pattern cycle placed by arc
    length from the point where psi equals anchor (the fill centroid's psi)."""
    cumulative = arc(points)
    total = cumulative[-1]
    if cycle is None:
        n = max(1, math.ceil(total/length-1e-9))
        return [points[0]]+[point_at(points, cumulative, total*i/n) for i in range(1, n)]+[points[-1]]
    psi, base_arc = piece["psi"], arc(piece["points"])
    shift = math.dist(points[0], piece["points"][0])
    if anchor <= psi[0]:
        origin = -(psi[0]-anchor)
    elif anchor >= psi[-1]:
        origin = base_arc[-1]+(anchor-psi[-1])
    else:
        i = next(i for i in range(1, len(psi)) if psi[i] >= anchor)
        origin = base_arc[i-1]+(base_arc[i]-base_arc[i-1])*((anchor-psi[i-1])/(psi[i]-psi[i-1]) if psi[i] != psi[i-1] else 0)
    origin += shift
    k = piece["k"]
    offset, lengths = cycle[k % len(cycle)]
    lengths = [max(v, .01) for v in lengths]
    width, base, prefix, xs = sum(lengths), origin-offset-shear*k, 0, []
    for step in lengths:
        start = base-prefix
        xs.extend(start+q*width for q in range(math.floor((0-start)/width)+1, math.ceil((total-start)/width)))
        prefix += step
    kept = []
    for x in sorted(x for x in xs if x >= .35-1e-9 and total-x >= .35-1e-9):
        if not kept or x-kept[-1] >= .35-1e-9:
            kept.append(x)
    return [points[0]]+[point_at(points, cumulative, x) for x in kept]+[points[-1]]


def route(obj, guides, at, entry, target):
    """Plan a fill with two or more usable angle guides."""
    if obj.get("fillPattern") == "sweepSatin":
        return route_satin(obj, guides, at, entry, target)
    rings, rule, spacing, pull = obj["rings"], obj.get("fillRule", "evenodd"), obj["spacing"], obj["pullCompensation"]
    pattern, length = obj.get("fillPattern", "even"), obj.get("fillLength", obj.get("length", 2.5))
    # Underlays stay straight at the fill angle; the gradient is not used with a sweep (Ember).
    base = {k: v for k, v in obj.items() if k not in ("gradient", "fillPattern", "patternParams")}
    foundation = [[(path, 3)] for path in C.route_fill(base, at, entry, None, True)]
    rows = Rows(obj, guides, spacing)
    shorten, trigger = obj.get("rowShortening", True), obj.get("densityTrigger", TRIGGER)
    cycle, shear = C.pattern_cycle(pattern, length, spacing, obj.get("patternParams")) if pattern != "even" else (None, 0)
    anchor = rows.field(C.fill_centroid(rings, rule))[1]
    tolerance = C.CONNECT_TOLERANCE+pull/2
    # Longer connectors (between shortened rows) are split at this length.
    limit = max(3, length) if cycle is None else min(C.SATIN_MAX-.15, max(3, length, max(v for _, ls in cycle for v in ls)+.01))
    pieces = []
    for section in rows.sections():
        current = []
        for i, piece in enumerate(rows.shortened(section, trigger) if shorten else section):
            points = penetrations(piece, extended(piece, pull), length, cycle, shear, anchor)
            points = points if i % 2 == 0 else points[::-1]
            if current and not clear(current[-1], points[0], rows.region, tolerance):
                pieces.append(current)
                current = []
            current.extend(points)
        pieces.append(current)
    paths = [path for path in (clean(p) for p in pieces) if len(path) > 1]
    start = foundation[-1][-1][0][-1] if foundation else at
    return foundation+route_pieces(obj, [[(path, limit)] for path in paths], start, None if foundation else entry, target, reorient=True, tolerance=tolerance, travel=hidden_travel(rows.region, paths, spacing, tolerance))


def hidden_travel(region, paths, spacing, tolerance):
    """Travel between sections through the shape, avoiding rows already sewn (as route_fill
    does for straight rows); None (a jump, trimmed when long) when no such way exists."""
    grid = C.Grid(region.rings, region.rule)
    ends, previous = {}, [None]
    key = lambda p: (round(p[0], 6), round(p[1], 6))
    for path in paths:
        ends[key(path[0])] = ends[key(path[-1])] = path
    reach = max(0, math.ceil(spacing/2/grid.cell))
    def mark(path):
        for a, b in zip(path, path[1:]):
            for p in [a]+C.interpolate(a, b, grid.cell/2):
                ci, cj = int((p[0]-grid.x0)/grid.cell), int((p[1]-grid.y0)/grid.cell)
                for j in range(max(0, cj-reach), min(grid.ny, cj+reach+1)):
                    for i in range(max(0, ci-reach), min(grid.nx, ci+reach+1)):
                        grid.sewn[j*grid.nx+i] = 1
    def travel(a, b):
        if previous[0]:
            mark(previous[0])
        previous[0] = ends.get(key(b))
        if math.dist(a, b) < 1.5 and clear(a, b, region, tolerance):
            return C.line_path([a, b], 3)
        goal = grid.near(b, 1.5, lambda k: grid.safe[k] and not grid.sewn[k])
        if goal is not None:
            for _, _, way in grid.reach(a, {goal: [0]}, True):
                points = way()+[b]
                if all(clear(u, v, region, tolerance) for u, v in zip(points, points[1:])):
                    return C.line_path(points, 3)
                break
        return None
    return travel


def route_satin(obj, guides, at, entry, target):
    """Satin fill along curved level lines: one bite per row, alternating ends (Ember's
    sweep satin), with its underlays, split and short stitches."""
    spacing, pull, underlay = obj["spacing"], obj["pullCompensation"], obj["underlay"]
    rows = Rows(obj, guides, spacing)
    pieces = []
    for section in rows.sections():
        rails = []
        for piece in section:
            points = extended(piece, pull)
            rails.append((points, arc(points)))
        cover = []
        for i, (points, cumulative) in enumerate(rails):
            end = points[-1] if i % 2 else points[0]
            if obj.get("shortStitches", True) and i >= 2 and i % 4 >= 2:
                before = rails[i-2][0][-1] if i % 2 else rails[i-2][0][0]
                centre = math.dist(point_at(points, cumulative, cumulative[-1]/2), point_at(rails[i-2][0], rails[i-2][1], rails[i-2][1][-1]/2))
                if math.dist(end, before) < centre*C.SHORT_RATIO and math.dist(end, before) < C.SHORT_HIT:
                    s = cumulative[-1]*C.SHORT_INSET
                    end = point_at(points, cumulative, cumulative[-1]-s if i % 2 else s)
            cover.append(end)
        if len(cover) < 2:
            cover = [rails[0][0][0], rails[0][0][-1]]
        inner = lambda points, cumulative, side: point_at(points, cumulative, max(.1, cumulative[-1]-.5) if side else min(cumulative[-1]-.1, .5))
        passes = []
        if underlay == "center" and len(rails) > 1:
            passes.append((C.tolerant_path([point_at(p, c, c[-1]/2) for p, c in rails], 1.5, .1), 3))
        if "edge" in underlay:
            for side in (0, 1):
                rail = [inner(p, c, side) for p, c in rails if c[-1] >= 1]
                if len(rail) > 1:
                    passes.append((C.tolerant_path(rail, 1.5, .1), 3))
        if "zigzag" in underlay:
            zig = [inner(p, c, i % 2) for i, (p, c) in enumerate(rails[::max(1, round(1.5/spacing))]) if c[-1] >= 1]
            if len(zig) > 1:
                passes.append((C.line_path(zig, 1.5), 3))
        if passes and math.dist(passes[-1][0][-1], cover[-1]) < math.dist(passes[-1][0][-1], cover[0]):
            cover.reverse()
        cover = clean(C.split_bites(cover, obj.get("splitLength", 7)))
        if len(cover) > 1:
            pieces.append(passes+[(cover, C.SATIN_MAX-.15)])
    return route_pieces(obj, pieces, at, entry, target)


def guide_field(guides):
    """Streamlines field from guides (Ember's flow field): the drawing directions of the guide
    segments, each weighted by the integral of 1/(d^2 + 1) along it in 0.1 mm units, per 0.5 mm
    (Ember sums resampled segments); falls back to (1, 0) where the sum vanishes."""
    parts = []
    for g in guides:
        a, b = g["a"], g["b"]
        d = math.dist(a, b)
        parts.append((a, [(b[0]-a[0])/d, (b[1]-a[1])/d], d))
    def field(p):
        x = y = 0.0
        for a, t, d in parts:
            u = (p[0]-a[0])*t[0]+(p[1]-a[1])*t[1]
            h = (p[0]-a[0])*t[1]-(p[1]-a[1])*t[0]
            c = math.sqrt(100*h*h+1)
            w = (math.atan(10*(d-u)/c)+math.atan(10*u/c))/(10*c)/.5
            x, y = x+w*t[0], y+w*t[1]
        n = math.hypot(x, y)
        return (x/n, y/n) if n > 1e-12 else (1.0, 0.0)
    return field
