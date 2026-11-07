"""Non-row fills. Legacy row and cross planners are deliberately untouched."""
import math
from . import compiler as C


def clear(a, b, region, tolerance=.001):
    return all(region.contains(p, tolerance) for p in [a]+C.interpolate(a, b, .1))


def connector(a, b, rings, region, grid, tolerance=.001):
    if clear(a,b,region,tolerance):
        return C.line_path([a,b],3)
    # Adjacent clipped rows should follow the short boundary arc, rather than
    # each diving into the travel raster and stacking thread along the edge.
    ra,ia,pa = C.nearest_on(rings,a,True)
    rb,ib,pb = C.nearest_on(rings,b,True)
    boundary = None
    if ra==rb and math.dist(a,pa)<=.6+tolerance and math.dist(b,pb)<=.6+tolerance:
        ring = rings[ra]
        def arc(i,j,p,q):
            points = [p]
            for k in range(len(ring)+1):
                if (i+k)%len(ring)==j:
                    return points+[q]
                points.append(ring[(i+k+1)%len(ring)])
        options = [arc(ia,ib,pa,pb),arc(ib,ia,pb,pa)[::-1]]
        for path in sorted(options,key=lambda ps:sum(math.dist(u,v) for u,v in zip(ps,ps[1:]))):
            points = [a]+path+[b]
            if all(clear(u,v,region,tolerance) for u,v in zip(points,points[1:])):
                boundary = C.line_path(points,3)
                if sum(math.dist(u,v) for u,v in zip(points,points[1:]))<=3:
                    return boundary
                break
    goals = grid.near(b,1.5,grid.safe)
    if goals is not None:
        for _,_,way in grid.reach(a,{goals:[0]},False):
            points = way()+[b]
            if all(clear(u,v,region,tolerance) for u,v in zip(points,points[1:])):
                return C.line_path(points,3)
            break
    return boundary


def clean(path, region=None, tolerance=.001, minimum=.35):
    """Merge penetrations closer than minimum (default 0.35 mm, leaving room for PES rounding)."""
    if not path:
        return []
    out = [path[0]]
    for p in path[1:]:
        if math.dist(out[-1],p) >= minimum:
            out.append(p)
    if len(out)>1 and math.dist(out[-1],path[-1]) > 1e-7:
        if math.dist(out[-2],path[-1]) >= minimum and (region is None or clear(out[-2],path[-1],region,tolerance)):
            out[-1] = path[-1]
    return out


def route_pieces(obj, pieces, at, entry, target, ordered=False, travel=None, reorient=False, tolerance=None):
    """Nearest-first pieces; safe interior/boundary travel or a forced trim.
    Each piece is a list of (needle path, split limit) passes (underlay first);
    reorient lets each pass start at either end."""
    rings, rule = obj['rings'], obj.get('fillRule','evenodd')
    region, grid = C.Region(rings,rule), C.Grid(rings,rule)
    if tolerance is None:
        tolerance = .001+obj['pullCompensation']/2 if obj.get('fillPattern') == 'sweepSatin' else .001
    out, cur = [], entry or at
    pending = list(pieces)
    last = min(pending,key=lambda ps:min(math.dist(p,target) for p in (ps[-1][0][0],ps[-1][0][-1]))) if target and pending and not ordered else None
    while pending:
        candidates = [i for i,p in enumerate(pending) if p is not last or len(pending)==1] or [0]
        index = candidates[0] if ordered or cur is None else min(candidates,key=lambda i:min(math.dist(cur,p) for p in (pending[i][0][0][0],pending[i][0][0][-1])))
        passes = pending.pop(index)
        if not pending and target and obj.get('fillPattern') == 'sweepSatin' and math.dist(passes[-1][0][0],target)<math.dist(passes[-1][0][-1],target):
            passes = passes[:-1]+[(passes[-1][0][::-1],passes[-1][1])]
        if reorient or obj.get('fillPattern') in ('sweepSatin','circular') or obj.get('crossStyle')=='half':
            oriented, prev = [], cur
            for j,(path,limit) in enumerate(passes):
                aim = target if not pending and j==len(passes)-1 else None
                if aim:
                    if math.dist(path[0],aim)<math.dist(path[-1],aim):
                        path = path[::-1]
                elif prev and math.dist(prev,path[-1])<math.dist(prev,path[0]):
                    path = path[::-1]
                oriented.append((path,limit))
                prev = path[-1]
            passes = oriented
        if obj.get('fillPattern') == 'crossStitchFill' or obj.get('crossStyle'):
            path,limit = passes[-1]
            aim = target if not pending else cur
            if aim and math.dist(path[0],path[-1])<1e-7:
                k = min(range(len(path)-1),key=lambda k:math.dist(path[k],aim))
                path = path[k:-1]+path[:k+1]
                passes = passes[:-1]+[(path,limit)]
        # Underlays stay unjittered; cover jitter is bounded and deterministic.
        if obj.get('handStitch'):
            path, limit = passes[-1]
            path = C.hand_stitch(path,0 if obj.get('fillPattern') in ('circular','streamlines') else obj.get('angle',0),obj.get('fillLength',4),obj['handStitch'],obj.get('id',''),sum(len(p) for run in out for p,_ in run),region)
            passes = passes[:-1]+[(clean(path,region,tolerance),limit)]
        start = passes[0][0][0]
        hop = (travel(cur,start) if travel else connector(cur,start,rings,region,grid,tolerance)) if cur is not None else None
        if out and hop is not None:
            out[-1].append((clean(hop,region,tolerance),3))
        else:
            out.append([(clean(hop,region,tolerance),3)] if entry and not out and hop else [])
        for j,(path,limit) in enumerate(passes):
            if j:
                link = connector(passes[j-1][0][-1],path[0],rings,region,grid,tolerance)
                if link is None:
                    out.append([])
                else:
                    out[-1].append((clean(link,region,tolerance),3))
            out[-1].append((path,limit))
        cur = passes[-1][0][-1]
    if out and target:
        target = target if region.contains(target) else C.nearest_on(rings,target,True)[2]
        hop = connector(cur,target,rings,region,grid,tolerance)
        if hop:
            out[-1].append((clean(hop,region,tolerance),3))
    return out


def satin_columns(obj):
    angle, rule = obj.get('angle',0), obj.get('fillRule','evenodd')
    rotated = [C.rotate(r,angle) for r in obj['rings']]
    # Each span has exactly two boundary hits; splits/merges start new columns.
    return C.fill_sections(rotated,obj['spacing'],rule)


def route_satin(obj, at, entry, target):
    angle, spacing, pull = obj.get('angle',0), obj['spacing'], obj['pullCompensation']
    pieces = []
    for rows in satin_columns(obj):
        centres = [[(a+b)/2,y] for y,a,b in rows]
        cover = []
        for i,(y,a,b) in enumerate(rows):
            side = i%2
            x = b+pull/2 if side else a-pull/2
            if obj.get('shortStitches',True) and i>=2 and i%4>=2:
                prev = rows[i-2]
                delta = math.hypot(x-(prev[2]+pull/2 if side else prev[1]-pull/2),y-prev[0])
                centre_delta = math.hypot((a+b-prev[1]-prev[2])/2,y-prev[0])
                if delta < centre_delta*C.SHORT_RATIO and delta < C.SHORT_HIT:
                    x += (-1 if side else 1)*(b-a)*C.SHORT_INSET
            cover.append([x,y])
        if len(cover)<2:
            y,a,b = rows[0]
            cover = [[a-pull/2,y],[b+pull/2,y]]
        passes, underlay = [], obj['underlay']
        if underlay == 'center' and len(centres)>1:
            passes.append((C.tolerant_path(C.rotate(centres,angle,True),1.5,.1),3))
        if 'edge' in underlay:
            for side in (0,1):
                rail = [[min(b-.1,a+.5) if not side else max(a+.1,b-.5),y] for y,a,b in rows if b-a>=1]
                if len(rail)>1:
                    passes.append((C.tolerant_path(C.rotate(rail,angle,True),1.5,.1),3))
        if 'zigzag' in underlay:
            zig = [[(a+b)/2+(-1 if i%2==0 else 1)*max(0,(b-a)/2-.5),y] for i,(y,a,b) in enumerate(rows[::max(1,round(1.5/spacing))])]
            if len(zig)>1:
                passes.append((C.line_path(C.rotate(zig,angle,True),1.5),3))
        cover = C.rotate(cover,angle,True)
        if passes and math.dist(passes[-1][0][-1],cover[-1]) < math.dist(passes[-1][0][-1],cover[0]):
            cover.reverse()
        cover = clean(C.split_bites(cover,obj.get('splitLength',7)))
        if len(cover)>1:
            passes.append((cover,C.SATIN_MAX-.15))
            pieces.append(passes)
    return route_pieces(obj,pieces,at,entry,target)


def clip_lines(lines, rings, rule):
    """Exact segment/polygon intersections, retaining line order and hole gaps."""
    region, out = C.Region(rings,rule), []
    edges = [(a,b) for r in rings for a,b in zip(r,r[1:]+r[:1])]
    for line in lines:
        active = []
        for a,b in zip(line,line[1:]):
            dx,dy = b[0]-a[0],b[1]-a[1]
            cuts = [0,1]
            for u,v in edges:
                if max(a[0],b[0])<min(u[0],v[0]) or min(a[0],b[0])>max(u[0],v[0]) or max(a[1],b[1])<min(u[1],v[1]) or min(a[1],b[1])>max(u[1],v[1]):
                    continue
                ex,ey = v[0]-u[0],v[1]-u[1]
                den = dx*ey-dy*ex
                if abs(den)<1e-12:
                    continue
                t = ((u[0]-a[0])*ey-(u[1]-a[1])*ex)/den
                q = ((u[0]-a[0])*dy-(u[1]-a[1])*dx)/den
                if 1e-9<t<1-1e-9 and -1e-9<=q<=1+1e-9:
                    cuts.append(t)
            cuts = sorted(set(cuts))
            at = lambda t:[a[0]+t*dx,a[1]+t*dy]
            for lo,hi in zip(cuts,cuts[1:]):
                if region.contains(at((lo+hi)/2),0):
                    p,q = at(lo),at(hi)
                    if active and math.dist(active[-1],p)>1e-6:
                        if len(active)>1:
                            out.append(active)
                        active = []
                    if not active:
                        active = [p]
                    active.append(q)
                elif active:
                    if len(active)>1:
                        out.append(active)
                    active = []
        if len(active)>1:
            out.append(active)
    return out


def circular_arms(center, radius, spacing, length):
    # Ember uses b=s, producing pi*s between arms. Here row space is the
    # true radial separation: b=s/pi. Sagitta is bounded before clipping.
    b, theta = spacing/math.pi, math.pi
    arms = [[],[]]
    while b*theta <= radius+spacing:
        r = b*theta
        for arm,sign in zip(arms,(1,-1)):
            arm.append([center[0]+sign*r*math.cos(theta),center[1]+sign*r*math.sin(theta)])
        theta += min(.35,length/(b*math.sqrt(1+theta*theta)),math.sqrt(8*min(.1,spacing/2)/max(r,.001)))
        if sum(map(len,arms))>200_000:
            raise ValueError('This fill is too dense. Increase spacing or reduce the design size.')
    return arms


def route_circular(obj, at, entry, target):
    rings, rule = obj['rings'],obj.get('fillRule','evenodd')
    center = obj.get('center') or C.fill_centroid(rings,rule)
    length = obj.get('fillLength',4)
    radius = max(math.dist(center,p) for r in rings for p in r)
    arms = circular_arms(center,radius,obj['spacing'],length)
    lines = clip_lines([arms[1][::-1]+arms[0]],rings,rule)
    region = C.Region(rings,rule)
    # Spiral arms clipped by the outline leave short ends; merge them to the 0.5 mm floor.
    paths = [clean(C.tolerant_path(line,length,min(.2,obj["spacing"]/2)),region,minimum=.5) for line in lines]
    pieces = [[(p,min(length,C.SATIN_MAX-.15))] for p in paths if len(p)>1]
    return route_pieces(obj,pieces,at,entry,target)


# Satin fill that follows each stroke (fill text). A direction field gives, inside the
# outline, the direction of the shortest chord through each point: across the stroke.
# The outline is cut into scan-line sections at the fill angle; a section whose rows
# stray from the field is cut again at the field's mean direction over it (and once
# more inside the result), so diagonal and horizontal strokes get bites across them.
# Each section's row ends become two rails; bites pair the rails by arc length where
# that turns them with a curving stroke, otherwise they keep the rows.
TURN_LIMIT, CHORD_DIRECTIONS = 15, 12


def simplified(ring, tolerance):
    """Ramer-Douglas-Peucker on a closed ring (for the direction field only)."""
    def rdp(points):
        if len(points) < 3:
            return points
        a, b = points[0], points[-1]
        k, far = max(((i, C.segment_distance(p, a, b)) for i, p in enumerate(points[1:-1], 1)), key=lambda v: v[1])
        return rdp(points[:k+1])[:-1]+rdp(points[k:]) if far > tolerance else [a, b]
    if len(ring) < 4:
        return ring
    k = max(range(len(ring)), key=lambda i: math.dist(ring[0], ring[i]))
    return rdp(ring[:k+1])[:-1]+rdp(ring[k:]+[ring[0]])[:-1]


class StrokeField:
    """Across-stroke direction (degrees, mod 180) on a grid: the shortest of
    CHORD_DIRECTIONS chords through each cell centre, chords capped at reach."""

    def __init__(self, rings, rule, reach):
        edges = [(a, b) for r in (simplified(r, .03) for r in rings) for a, b in zip(r, r[1:]+r[:1]) if a != b]
        xs, ys = [p[0] for r in rings for p in r], [p[1] for r in rings for p in r]
        self.cell = cell = max(.2, min(.6, reach/8))
        self.x0, self.y0 = min(xs), min(ys)
        self.nx, self.ny = int((max(xs)-self.x0)/cell)+1, int((max(ys)-self.y0)/cell)+1
        size = max(reach, .5)
        buckets = {}
        for e, (a, b) in enumerate(edges):
            for j in range(int((min(a[1], b[1])-self.y0)//size), int((max(a[1], b[1])-self.y0)//size)+1):
                for i in range(int((min(a[0], b[0])-self.x0)//size), int((max(a[0], b[0])-self.x0)//size)+1):
                    buckets.setdefault((i, j), []).append(e)
        directions = [(math.cos(k*math.pi/CHORD_DIRECTIONS), math.sin(k*math.pi/CHORD_DIRECTIONS)) for k in range(CHORD_DIRECTIONS)]
        self.angle = {}
        for j in range(self.ny):
            y = self.y0+(j+.5)*cell
            spans = C.scan_spans(rings, y, rule)
            for i in range(self.nx):
                x = self.x0+(i+.5)*cell
                if not any(a <= x <= b for a, b in spans):
                    continue
                bi, bj = int((x-self.x0)//size), int((y-self.y0)//size)
                near = {e for di in (-1, 0, 1) for dj in (-1, 0, 1) for e in buckets.get((bi+di, bj+dj), ())}
                chords = []
                for dx, dy in directions:
                    lo = hi = reach
                    for e in near:
                        (ax, ay), (bx, by) = edges[e]
                        ex, ey = bx-ax, by-ay
                        den = dx*ey-dy*ex
                        if abs(den) < 1e-12:
                            continue
                        t, u = ((ax-x)*ey-(ay-y)*ex)/den, ((ax-x)*dy-(ay-y)*dx)/den
                        if 0 <= u <= 1:
                            if t >= 0:
                                lo = min(lo, t)
                            else:
                                hi = min(hi, -t)
                    chords.append(lo+hi)
                k = min(range(CHORD_DIRECTIONS), key=chords.__getitem__)
                # Parabolic refinement between the neighbouring directions.
                a, b, c = chords[k-1], chords[k], chords[(k+1) % CHORD_DIRECTIONS]
                shift = (a-c)/(2*(a-2*b+c)) if a-2*b+c > 1e-9 else 0
                self.angle[(i, j)] = ((k+max(-.5, min(.5, shift)))*180/CHORD_DIRECTIONS) % 180

    def at(self, p):
        return self.angle.get((int((p[0]-self.x0)/self.cell), int((p[1]-self.y0)/self.cell)))

    def mean(self, rows, angle):
        """Length-weighted mean field direction over a section's rows (doubled angles)."""
        sx = sy = 0.0
        for y, a, b in rows:
            n = max(1, round((b-a)/self.cell))
            for q in C.rotate([[a+(b-a)*(k+.5)/n, y] for k in range(n)], angle, True):
                v = self.at(q)
                if v is not None:
                    sx, sy = sx+math.cos(math.radians(2*v)), sy+math.sin(math.radians(2*v))
        return None if sx == sy == 0 else math.degrees(math.atan2(sy, sx))/2


def section_outline(rows, spacing, angle):
    """Polygon of a scan-line section, its first and last rows pushed out half a row
    so neighbouring sections meet."""
    rows = [(rows[0][0]-spacing/2, *rows[0][1:])]+list(rows)+[(rows[-1][0]+spacing/2, *rows[-1][1:])]
    return C.rotate([[a, y] for y, a, _ in rows]+[[b, y] for y, _, b in rows[::-1]], angle, True)


def stroke_sections(rings, rule, spacing, angle, field, depth=2):
    """[(angle, rows)] covering the outline with rows across its strokes."""
    out = []
    for rows in C.fill_sections([C.rotate(r, angle) for r in rings], spacing, rule):
        target = field.mean(rows, angle) if depth and len(rows) > 1 else None
        if target is not None and abs((target-angle+90) % 180-90) > TURN_LIMIT:
            out.extend(stroke_sections([section_outline(rows, spacing, angle)], 'evenodd', spacing, target, field, depth-1))
        else:
            out.append((angle, rows))
    return out


def arc_resample(points, n):
    cumulative = [0]
    for a, b in zip(points, points[1:]):
        cumulative.append(cumulative[-1]+math.dist(a, b))
    total, out, k = cumulative[-1], [], 0
    for j in range(n+1):
        d = total*j/n
        while k < len(points)-2 and cumulative[k+1] < d:
            k += 1
        span = cumulative[k+1]-cumulative[k]
        out.append(C.lerp(points[k], points[k+1], min(1, max(0, (d-cumulative[k])/span)) if span > 1e-12 else 0))
    return out


def stroke_rails(obj, region, angle, rows):
    """Left and right rails of one section: the row ends, or the outline sides paired by
    arc length when that shortens the bites and every bite stays inside."""
    left = C.rotate([[a, y] for y, a, _ in rows], angle, True)
    right = C.rotate([[b, y] for y, _, b in rows], angle, True)
    if len(rows) < 3:
        return left, right
    n = max(len(rows), math.ceil(max(sum(math.dist(a, b) for a, b in zip(r, r[1:])) for r in (left, right))/.2))
    l2, r2 = arc_resample(left, n), arc_resample(right, n)
    mean = lambda ls, rs: sum(math.dist(a, b) for a, b in zip(ls, rs))/len(ls)
    if mean(l2, r2) < mean(left, right)*.97 and all(region.contains(p, .05) for a, b in zip(l2, r2) for p in C.interpolate(a, b, .3)[:-1]):
        return l2, r2
    return left, right


def route_stroke_satin(obj, at, entry, target):
    spacing, pull, underlay = obj['spacing'], obj['pullCompensation'], obj['underlay']
    rule, region = obj.get('fillRule', 'evenodd'), C.Region(obj['rings'], obj.get('fillRule', 'evenodd'))
    field = StrokeField(obj['rings'], rule, 6)
    pieces = []
    for angle, rows in stroke_sections(obj['rings'], rule, spacing, obj.get('angle', 0), field):
        left, right = stroke_rails(obj, region, angle, rows)
        widths = [math.dist(a, b) for a, b in zip(left, right)]
        passes = []
        if underlay == 'center' and len(left) > 1:
            passes.append((C.tolerant_path([C.lerp(a, b, .5) for a, b in zip(left, right)], 1.5, .1), 3))
        if 'edge' in underlay:
            for rail in C.inset_rails([a for a, w in zip(left, widths) if w >= 1], [b for b, w in zip(right, widths) if w >= 1], .5):
                if len(rail) > 1:
                    passes.append((C.tolerant_path(rail, 1.5, .1), 3))
        if 'zigzag' in underlay:
            edges = C.inset_rails(left, right, .5)
            zig = [edges[i % 2][j] for i, j in enumerate(range(0, len(left), max(1, round(1.5/spacing)))) if widths[j] >= 1]
            if len(zig) > 1:
                passes.append((C.line_path(zig, 1.5), 3))
        cover = C.block_path(left, right, spacing, pull, 0, obj.get('shortStitches', True), dots=False) if len(left) > 1 else [left[0], right[0]]
        if passes and math.dist(passes[-1][0][-1], cover[-1]) < math.dist(passes[-1][0][-1], cover[0]):
            cover.reverse()
        cover = clean(C.split_bites(cover, obj.get('splitLength', 7)))
        if len(cover) > 1:
            pieces.append(passes+[(cover, C.SATIN_MAX-.15)])
    return route_pieces(obj, pieces, at, entry, target)
