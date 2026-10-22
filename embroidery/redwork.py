"""Redwork (Ember's Convert to redwork): every line of the object is sewn exactly twice, out and
back over the same penetrations, with no trims inside a connected group of lines.

The lines are noded (split where they cross, where a line end touches another line within
SNAP, and at their own ends; a closed ring without other nodes gets one at its first point),
then each connected component is walked with Tarry's rule: never take an edge twice in the
same direction, and leave a node by the edge that first reached it only when nothing else is
left. That walk is an Euler circuit of the doubled graph: it returns to its start having sewn
every edge once each way. Ties prefer an edge not sewn yet, then the straightest continuation.
Components are taken nearest-first; the compiler joins or trims between them by distance.
"""
import math
from . import compiler as C
from .engines import clean

SNAP = .05


def intersect(a, b, c, d):
    """Parameters (t on ab, u on cd) of a proper or touching intersection, or None."""
    rx, ry, sx, sy = b[0]-a[0], b[1]-a[1], d[0]-c[0], d[1]-c[1]
    den = rx*sy-ry*sx
    if abs(den) < 1e-12:
        return None
    t = ((c[0]-a[0])*sy-(c[1]-a[1])*sx)/den
    u = ((c[0]-a[0])*ry-(c[1]-a[1])*rx)/den
    return (t, u) if -1e-9 <= t <= 1+1e-9 and -1e-9 <= u <= 1+1e-9 else None


def graph(rings):
    """Nodes [point] and edges [(u, v, points)] of the noded lines."""
    lines = []
    for ring in rings:
        line = [list(ring[0])]
        for p in ring[1:]:
            if math.dist(line[-1], p) > 1e-9:
                line.append(list(p))
        if len(line) > 1:
            lines.append(line)
    closed = [len(l) > 2 and math.dist(l[0], l[-1]) < 1e-6 for l in lines]
    segments = [(li, si, a, b) for li, l in enumerate(lines) for si, (a, b) in enumerate(zip(l, l[1:]))]
    cuts = {(li, si): set() for li, si, _, _ in segments}
    size, buckets = 2.0, {}
    for n, (_, _, a, b) in enumerate(segments):
        for i in range(math.floor((min(a[0], b[0])-SNAP)/size), math.floor((max(a[0], b[0])+SNAP)/size)+1):
            for j in range(math.floor((min(a[1], b[1])-SNAP)/size), math.floor((max(a[1], b[1])+SNAP)/size)+1):
                buckets.setdefault((i, j), []).append(n)
    adjacent = lambda s, o: s[0] == o[0] and (abs(s[1]-o[1]) == 1 or closed[s[0]] and {s[1], o[1]} == {0, len(lines[s[0]])-2})
    seen = set()
    for members in buckets.values():
        for x in range(len(members)):
            for y in range(x+1, len(members)):
                m, n = members[x], members[y]
                if (m, n) in seen:
                    continue
                seen.add((m, n))
                s, o = segments[m], segments[n]
                if adjacent(s, o):
                    continue
                hit = intersect(s[2], s[3], o[2], o[3])
                if hit:
                    cuts[s[:2]].add(min(1, max(0, hit[0])))
                    cuts[o[:2]].add(min(1, max(0, hit[1])))
    # A line end touching another line (T-junction) splits that line there.
    for li, l in enumerate(lines):
        if closed[li]:
            continue
        for p in (l[0], l[-1]):
            for n in buckets.get((math.floor(p[0]/size), math.floor(p[1]/size)), ()):
                oli, osi, a, b = segments[n]
                if oli == li and (osi == 0 and p is l[0] or osi == len(l)-2 and p is l[-1]):
                    continue
                if C.segment_distance(p, a, b) < SNAP:
                    d2 = (b[0]-a[0])**2+(b[1]-a[1])**2
                    cuts[(oli, osi)].add(max(0, min(1, ((p[0]-a[0])*(b[0]-a[0])+(p[1]-a[1])*(b[1]-a[1]))/d2)))
    nodes, index = [], {}
    def node(p):
        key = (round(p[0]/SNAP), round(p[1]/SNAP))
        for i in range(key[0]-1, key[0]+2):
            for j in range(key[1]-1, key[1]+2):
                for k in index.get((i, j), ()):
                    if math.dist(nodes[k], p) < SNAP:
                        return k
        nodes.append(list(p))
        index.setdefault(key, []).append(len(nodes)-1)
        return len(nodes)-1
    edges = []
    for li, l in enumerate(lines):
        # Points along the line, flagged where it splits into edges.
        points = [[l[0], not closed[li]]]
        for si, (a, b) in enumerate(zip(l, l[1:])):
            end = False
            for t in sorted(cuts[(li, si)]):
                if t <= 1e-9:
                    points[-1][1] = True
                elif t >= 1-1e-9:
                    end = True
                else:
                    points.append([C.lerp(a, b, t), True])
            points.append([b, end])
        points[-1][1] = points[-1][1] or not closed[li]
        if closed[li]:
            points[0][1] = points[-1][1] = points[0][1] or points[-1][1]
            flagged = [i for i, (_, f) in enumerate(points[:-1]) if f]
            if not flagged:
                points[0][1] = points[-1][1] = True
            elif flagged[0]:
                points = points[flagged[0]:-1]+points[:flagged[0]+1]
        piece = [points[0][0]]
        for p, flag in points[1:]:
            piece.append(p)
            if flag:
                if sum(math.dist(u, v) for u, v in zip(piece, piece[1:])) > 1e-6:
                    edges.append((node(piece[0]), node(piece[-1]), piece))
                piece = [p]
    return nodes, edges


def walk(nodes, edges, start):
    """Tarry's walk from start: [(edge, direction)] covering every reachable edge once each way."""
    adjacency = {}
    for e, (u, v, _) in enumerate(edges):
        adjacency.setdefault(u, []).append((e, 0))
        adjacency.setdefault(v, []).append((e, 1))
    def heading(e, d, at_end=False):
        points = edges[e][2] if d == 0 else edges[e][2][::-1]
        seq = points[::-1] if at_end else points
        tip = seq[0]
        far = next((q for q in seq[1:] if math.dist(q, tip) > .5), seq[-1])
        dist = math.dist(far, tip) or 1
        return [(tip[0]-far[0])/dist, (tip[1]-far[1])/dist] if at_end else [(far[0]-tip[0])/dist, (far[1]-tip[1])/dist]
    used, first, order, at, incoming = set(), {start: None}, [], start, None
    while True:
        options = [o for o in adjacency.get(at, ()) if o not in used]
        if not options:
            return order
        free = [o for o in options if o[0] != first[at]] or options
        def cost(o):
            h = heading(*o)
            return ((o[0], 1-o[1]) in used, -(h[0]*incoming[0]+h[1]*incoming[1]) if incoming else 0, o)
        e, d = min(free, key=cost)
        used.add((e, d))
        order.append((e, d))
        at = edges[e][1] if d == 0 else edges[e][0]
        first.setdefault(at, e)
        incoming = heading(e, d, True)


def plan(obj, at, entry, target):
    """Polylines [(points, longest stitch)]: one per connected group of lines."""
    length = obj.get("length", 2)
    nodes, edges = graph(obj["rings"])
    if not edges:
        return []
    sampled = [C.tolerant_path(points, length, .2) for _, _, points in edges]
    parent = list(range(len(nodes)))
    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for u, v, _ in edges:
        parent[root(u)] = root(v)
    pending = {}
    for u, v, _ in edges:
        for i in (u, v):
            members = pending.setdefault(root(i), [])
            if i not in members:
                members.append(i)
    last = min(pending, key=lambda g: min(math.dist(nodes[i], target) for i in pending[g])) if target and len(pending) > 1 else None
    out, cur = [], entry or at
    while pending:
        options = [g for g in pending if g != last or len(pending) == 1]
        g = min(options, key=lambda g: min(math.dist(nodes[i], cur) for i in pending[g]) if cur else min(pending[g]))
        start = min(pending.pop(g), key=lambda i: (math.dist(nodes[i], cur) if cur else 0, i))
        path = [nodes[start]]
        for e, d in walk(nodes, edges, start):
            path.extend((sampled[e] if d == 0 else sampled[e][::-1])[1:])
        path = clean(path)
        if len(path) > 1:
            out.append([(path, 3)])
            cur = path[-1]
    return out
