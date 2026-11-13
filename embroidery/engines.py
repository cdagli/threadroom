"""Non-row fills. Legacy row and cross planners are deliberately untouched."""
import itertools
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


def route_pieces(obj, pieces, at, entry, target, ordered=False, travel=None, reorient=False, tolerance=None, minimum=.35):
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
    plan = satin_order(pending,cur,last) if obj.get('fillPattern') == 'sweepSatin' and travel is None and not ordered and len(pending)>1 else None
    while pending:
        candidates = [i for i,p in enumerate(pending) if p is not last or len(pending)==1] or [0]
        index = candidates[0] if ordered or cur is None else min(candidates,key=lambda i:min(math.dist(cur,p) for p in (pending[i][0][0][0],pending[i][0][0][-1])))
        finish = None
        if plan:
            index, finish = plan.pop(0)
            index = next(i for i,p in enumerate(pending) if p is pieces[index])
        passes = pending.pop(index)
        if not pending and target and obj.get('fillPattern') == 'sweepSatin' and math.dist(passes[-1][0][0],target)<math.dist(passes[-1][0][-1],target):
            passes = passes[:-1]+[(passes[-1][0][::-1],passes[-1][1])]
        if reorient or obj.get('fillPattern') in ('sweepSatin','circular') or obj.get('crossStyle')=='half':
            def orient(flip=None):
                oriented, prev = [], cur
                for j,(path,limit) in enumerate(passes):
                    aim = target if not pending and j==len(passes)-1 else None
                    if aim:
                        if math.dist(path[0],aim)<math.dist(path[-1],aim):
                            path = path[::-1]
                    elif flip if j==0 and flip is not None else prev and math.dist(prev,path[-1])<math.dist(prev,path[0]):
                        path = path[::-1]
                    oriented.append((path,limit))
                    prev = path[-1]
                return oriented
            passes = min(orient(False),orient(True),key=lambda oriented:math.dist(oriented[-1][0][-1],finish)) if finish else orient()
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
            out[-1].append((clean(hop,region,tolerance,minimum),3))
        else:
            out.append([(clean(hop,region,tolerance,minimum),3)] if entry and not out and hop else [])
        for j,(path,limit) in enumerate(passes):
            if j:
                link = connector(passes[j-1][0][-1],path[0],rings,region,grid,tolerance)
                if link is None:
                    out.append([])
                else:
                    out[-1].append((clean(link,region,tolerance,minimum),3))
            out[-1].append((path,limit))
        cur = passes[-1][0][-1]
    if out and target:
        target = target if region.contains(target) else C.nearest_on(rings,target,True)[2]
        hop = connector(cur,target,rings,region,grid,tolerance)
        if hop:
            out[-1].append((clean(hop,region,tolerance),3))
    return out


def satin_order(pieces, cur, last):
    """Sewing order of satin pieces as [(piece index, where its cover should end)]. A run
    sewn after a cover lies on top of it, while the run to a piece's far end before its
    cover is hidden by it. So each cover ends where it reaches the next piece (at any
    point of that piece), and the order keeps those gaps shortest; the piece nearest the
    exit stays last and ends as the exit asks (None)."""
    n = len(pieces)
    ends = [(ps[-1][0][0],ps[-1][0][-1]) for ps in pieces]
    # A sample of each cover is enough to measure to; an odd stride keeps both of its sides.
    covers = [ps[-1][0][::max(1,len(ps[-1][0])//24)|1]+[ps[-1][0][-1]] for ps in pieces]
    reach = lambda q,j:min(math.dist(q,p) for p in covers[j])
    gap = [[min((reach(e,j),k) for k,e in enumerate(ends[i])) if i!=j else (0,0) for j in range(n)] for i in range(n)]
    final = next((i for i,ps in enumerate(pieces) if ps is last),None)
    cost = lambda order:sum(gap[a][b][0] for a,b in zip(order,order[1:]))+(.25*reach(cur,order[0]) if cur else 0)
    if n <= 7:
        order = min((o for o in itertools.permutations(range(n)) if final is None or o[-1]==final),key=cost)
    else:
        free = [i for i in range(n) if i!=final]
        order = [min(free,key=lambda i:reach(cur,i)) if cur else free[0]]
        while len(order) < len(free):
            order.append(min((i for i in free if i not in order),key=lambda i:gap[order[-1]][i][0]))
        order += [] if final is None else [final]
    return [(a,ends[a][gap[a][b][1]]) for a,b in zip(order,order[1:])]+[(order[-1],None)]


def split_fill_bites(path, limit, angle):
    """Splits satin fill bites longer than limit, the split penetrations on a shared grid
    along the row direction (pitch three quarters of the limit) shifted per bite by a
    random walk of 0.3 to 0.7 pitches. Neighbouring bites never split at nearly the same
    place, and no regular offset sequence lines the splits up into a visible band over a
    large fill. A split point closer than 0.3 pitch to a bite end is dropped, so every
    piece stays within the limit."""
    if not limit or len(path) < 2:
        return path
    t, pitch = (math.cos(math.radians(angle)), math.sin(math.radians(angle))), limit*.75
    result, offset = [path[0]], 0.0
    for k, (a, b) in enumerate(zip(path, path[1:])):
        if math.dist(a, b) > limit:
            offset = (offset+.3+.4*((math.sin(k*12.9898)*43758.5453) % 1)) % 1
            ua, ub = a[0]*t[0]+a[1]*t[1], b[0]*t[0]+b[1]*t[1]
            lo, hi = min(ua, ub), max(ua, ub)
            if hi-lo > 1e-9:
                cuts = [(q+offset)*pitch for q in range(math.floor(lo/pitch)-1, math.ceil(hi/pitch)+1)]
                cuts = sorted((u-ua)/(ub-ua) for u in cuts if lo+.3*pitch < u < hi-.3*pitch)
                # A bite steep to the row direction splits evenly instead.
                if not cuts or max(f2-f1 for f1, f2 in zip([0]+cuts, cuts+[1]))*math.dist(a, b) > limit:
                    n = math.ceil(math.dist(a, b)/pitch)
                    cuts = [(j+(offset-.5)*.6)/n for j in range(1, n)]
                result.extend(C.lerp(a, b, f) for f in cuts)
        result.append(b)
    return result


# Raised satin: padding layers sewn under the cover, each smaller than the one above so the
# cover domes. The upper layer runs across the cover's bites, which then bridge it and do
# not sink between its rows; the lower one (two layers) runs with the bites. Rows PAD_SPACING
# apart: enough thread to lift the cover while the needle still finds fabric.
PAD_SPACING, PAD_LENGTH, PAD_INSET = .45, 2.5, .6


def padding(obj, at, entry):
    """Padding runs for a satin fill ([] without padding), sewn before everything else."""
    count = obj.get('padding',0)
    if not count:
        return []
    layers = [{'angle':90 if i==count-1 else 0,'spacing':PAD_SPACING,'length':PAD_LENGTH,'inset':PAD_INSET*(count-i)} for i in range(count)]
    base = {k:v for k,v in obj.items() if k not in ('fillPattern','patternParams','padding','angleGuides')}
    base.update(underlay='none',fillUnderlays=layers,length=PAD_LENGTH,pullCompensation=0)
    return [[(path,3)] for path in C.route_fill(base,at,entry,None,True)]


def padded(obj, pieces, at, entry, target, **options):
    """route_pieces over the object's padding; the cover carries on from where it ends."""
    foundation = padding(obj,at,entry)
    if not foundation:
        return route_pieces(obj,pieces,at,entry,target,**options)
    runs = route_pieces(obj,pieces,None,foundation[-1][-1][0][-1],target,**options)
    return foundation[:-1]+[foundation[-1]+runs[0]]+runs[1:] if runs else foundation


def satin_columns(obj):
    angle, rule = obj.get('angle',0), obj.get('fillRule','evenodd')
    rotated = [C.rotate(r,angle) for r in obj['rings']]
    # Each span has exactly two boundary hits; splits/merges start new columns.
    return C.fill_sections(rotated,obj['spacing']/2,rule)


def route_satin(obj, at, entry, target):
    angle, spacing, pull = obj.get('angle',0), obj['spacing'], obj['pullCompensation']
    step = spacing/2
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
            zig = [[(a+b)/2+(-1 if i%2==0 else 1)*max(0,(b-a)/2-.5),y] for i,(y,a,b) in enumerate(rows[::max(1,round(1.5/step))])]
            if len(zig)>1:
                passes.append((C.line_path(C.rotate(zig,angle,True),1.5),3))
        cover = C.rotate(cover,angle,True)
        if passes and math.dist(passes[-1][0][-1],cover[-1]) < math.dist(passes[-1][0][-1],cover[0]):
            cover.reverse()
        cover = clean(split_fill_bites(cover,obj.get('splitLength',7),angle))
        if len(cover)>1:
            passes.append((cover,C.SATIN_MAX-.15))
            pieces.append(passes)
    return padded(obj,pieces,at,entry,target)


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
TURN_LIMIT, CHORD_DIRECTIONS, MIN_TIP = 15, 12, .4


def crossing_spans(crossings, rule):
    """Inside spans from one scan line's (x, direction) crossings (as compiler.scan_spans)."""
    crossings = sorted(crossings)
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


class StrokeField:
    """Across-stroke direction (degrees, mod 180) on a grid: the shortest of
    CHORD_DIRECTIONS chords through each cell centre (chords capped at four stroke
    widths), weighted by how much shorter it is than the chord across it (about 1
    inside a stroke, near 0 at a junction or a square end). A chord is the scan-line
    span through the point in the outline turned to that direction."""

    def __init__(self, rings, rule, stroke):
        xs, ys = [p[0] for r in rings for p in r], [p[1] for r in rings for p in r]
        reach, self.cell = 4*stroke, max(.15, min(.5, stroke/5))
        cell = self.cell
        self.x0, self.y0 = min(xs), min(ys)
        self.nx, self.ny = int((max(xs)-self.x0)/cell)+1, int((max(ys)-self.y0)/cell)+1
        points = []
        for j in range(self.ny):
            y = self.y0+(j+.5)*cell
            spans = C.scan_spans(rings, y, rule)
            for i in range(self.nx):
                x = self.x0+(i+.5)*cell
                if any(a <= x <= b for a, b in spans):
                    points.append(((i, j), [x, y]))
        chords = [[reach]*CHORD_DIRECTIONS for _ in points]
        step = cell/2
        for k in range(CHORD_DIRECTIONS):
            turned = [C.rotate(r, k*180/CHORD_DIRECTIONS) for r in rings]
            bottom = min(p[1] for r in turned for p in r)
            lines = {}
            for r in turned:
                for a, b in zip(r, r[1:]+r[:1]):
                    if a[1] == b[1]:
                        continue
                    for m in range(max(0, math.ceil((min(a[1], b[1])-bottom)/step-.5)), math.floor((max(a[1], b[1])-bottom)/step-.5)+1):
                        y = bottom+(m+.5)*step
                        if (a[1] <= y < b[1]) or (b[1] <= y < a[1]):
                            lines.setdefault(m, []).append((a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]), 1 if b[1] > a[1] else -1))
            spans = {}
            for (_, p), chord in zip(points, chords):
                x, y = C.rotate([p], k*180/CHORD_DIRECTIONS)[0]
                m = round((y-bottom)/step-.5)
                if m not in spans:
                    spans[m] = crossing_spans(lines.get(m, []), rule)
                for a, b in spans[m]:
                    if a <= x <= b:
                        chord[k] = min(reach, b-a)
                        break
        self.angle = {}
        for (key, _), c in zip(points, chords):
            k = min(range(CHORD_DIRECTIONS), key=c.__getitem__)
            # Parabolic refinement between the neighbouring directions.
            a, b, d = c[k-1], c[k], c[(k+1) % CHORD_DIRECTIONS]
            shift = (a-d)/(2*(a-2*b+d)) if a-2*b+d > 1e-9 else 0
            self.angle[key] = ((k+max(-.5, min(.5, shift)))*180/CHORD_DIRECTIONS) % 180, 1-b/max(b, c[(k+CHORD_DIRECTIONS//2) % CHORD_DIRECTIONS], 1e-9)

    def at(self, p):
        return self.angle.get((int((p[0]-self.x0)/self.cell), int((p[1]-self.y0)/self.cell)))

    def mean(self, rows, angle):
        """The dominant field direction over a section's rows: the heaviest 15 degree
        bin (weights spread over neighbouring bins), refined by the weighted mean of
        the cells within 20 degrees of it; None where the field is empty."""
        values = []
        for y, a, b in rows:
            n = max(1, round((b-a)/self.cell))
            for q in C.rotate([[a+(b-a)*(k+.5)/n, y] for k in range(n)], angle, True):
                v = self.at(q)
                if v is not None and v[1] > 0:
                    values.append(v)
        if not values:
            return None
        bins = [0.0]*12
        for v, w in values:
            bins[int(v//15) % 12] += w
        top = max(range(12), key=lambda k: bins[k-1]/2+bins[k]+bins[(k+1) % 12]/2)
        centre = top*15+7.5
        sx = sy = 0.0
        for v, w in values:
            if abs((v-centre+90) % 180-90) <= 20:
                sx, sy = sx+w*math.cos(math.radians(2*v)), sy+w*math.sin(math.radians(2*v))
        return centre if math.hypot(sx, sy) < 1e-9 else math.degrees(math.atan2(sy, sx))/2


def mean_stroke(rings, rule):
    """2 x area / outline length (lib/text.ts textStroke)."""
    ys = [p[1] for r in rings for p in r]
    step = max(.05, (max(ys)-min(ys))/400)
    area = sum((b-a)*step for k in range(int((max(ys)-min(ys))/step)) for a, b in C.scan_spans(rings, min(ys)+(k+.5)*step, rule))
    perimeter = sum(math.dist(a, b) for r in rings for a, b in zip(r, r[1:]+r[:1]))
    return max(.3, 2*area/perimeter) if perimeter else 1


def section_outline(rows, spacing, angle, rotated, rule):
    """Polygon of a scan-line section (rows in the frame of rotated), its first and last
    rows pushed out half a row, within the outline, so neighbouring sections meet."""
    def pushed(row, dy):
        y, a, b = row[0]+dy, row[1], row[2]
        spans = [(max(a, c), min(b, d)) for c, d in C.scan_spans(rotated, y, rule) if max(a, c) < min(b, d)]
        return [(y, *max(spans, key=lambda s: s[1]-s[0]))] if spans else []
    rows = pushed(rows[0], -spacing/2)+list(rows)+pushed(rows[-1], spacing/2)
    return C.rotate([[a, y] for y, a, _ in rows]+[[b, y] for y, _, b in rows[::-1]], angle, True)


def stroke_sections(rings, rule, spacing, angle, field, depth=3):
    """[(angle, rows)] covering the outline with rows across its strokes."""
    out, rotated = [], [C.rotate(r, angle) for r in rings]
    for rows in C.fill_sections(rotated, spacing, rule):
        out.extend(fit_section(rows, spacing, angle, field, depth, rotated, rule))
    return out


def fit_section(rows, spacing, angle, field, depth, rotated, rule):
    """Runs of rows straying more than TURN_LIMIT from the field (at least three rows,
    or the whole section) are cut again at the field's mean direction over the run."""
    if not depth:
        return [(angle, rows)]
    stray = lambda d: d is not None and abs((d-angle+90) % 180-90) > TURN_LIMIT
    flags = [stray(field.mean([row], angle)) for row in rows]
    runs = []
    for row, flag in zip(rows, flags):
        if runs and runs[-1][0] == flag:
            runs[-1][1].append(row)
        else:
            runs.append([flag, [row]])
    # Short runs join a neighbour, so a cut never leaves a sliver.
    merged = []
    for flag, run in runs:
        if merged and (len(run) < 3 or len(merged[-1][1]) < 3):
            merged[-1][1].extend(run)
            merged[-1][0] = stray(field.mean(merged[-1][1], angle))
        else:
            merged.append([flag, run])
    out = []
    for flag, run in merged:
        target = field.mean(run, angle) if flag else None
        if target is not None and stray(target):
            out.extend(stroke_sections([section_outline(run, spacing, angle, rotated, rule)], 'evenodd', spacing, target, field, depth-1))
        else:
            out.append((angle, run))
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
    """Left and right rails of one section and whether their points pair as rungs: the
    row ends (one bite per row), or the outline sides paired by arc length when that
    shortens the bites and every bite stays inside."""
    left = C.rotate([[a, y] for y, a, _ in rows], angle, True)
    right = C.rotate([[b, y] for y, _, b in rows], angle, True)
    if len(rows) < 3:
        return left, right, True
    n = max(len(rows), math.ceil(max(sum(math.dist(a, b) for a, b in zip(r, r[1:])) for r in (left, right))/.2))
    l2, r2 = arc_resample(left, n), arc_resample(right, n)
    mean = lambda ls, rs: sum(math.dist(a, b) for a, b in zip(ls, rs))/len(ls)
    if mean(l2, r2) < mean(left, right)*.97 and all(region.contains(p, .05) for a, b in zip(l2, r2) for p in C.interpolate(a, b, .3)[:-1]):
        return l2, r2, False
    return left, right, True


def route_stroke_satin(obj, at, entry, target):
    spacing, pull, underlay = obj['spacing'], obj['pullCompensation'], obj['underlay']
    step = spacing/2
    rule, region = obj.get('fillRule', 'evenodd'), C.Region(obj['rings'], obj.get('fillRule', 'evenodd'))
    field = StrokeField(obj['rings'], rule, mean_stroke(obj['rings'], rule))
    pieces = []
    for angle, rows in stroke_sections(obj['rings'], rule, step, obj.get('angle', 0), field):
        left, right, paired = stroke_rails(obj, region, angle, rows)
        # A section cut obliquely starts in a point; its first bites would be shorter than
        # the pull compensation. The neighbouring sections' pull covers that sliver.
        widths = [math.dist(a, b) for a, b in zip(left, right)]
        lo, hi = 0, len(widths)
        while hi-lo > 2 and widths[lo] < MIN_TIP:
            lo += 1
        while hi-lo > 2 and widths[hi-1] < MIN_TIP:
            hi -= 1
        if hi-lo == 2 and max(widths[lo:hi]) < MIN_TIP:
            continue
        left, right, widths = left[lo:hi], right[lo:hi], widths[lo:hi]
        passes = []
        if underlay == 'center' and len(left) > 1:
            passes.append((C.tolerant_path([C.lerp(a, b, .5) for a, b in zip(left, right)], 1.5, .1), 3))
        if 'edge' in underlay:
            for rail in C.inset_rails([a for a, w in zip(left, widths) if w >= 1], [b for b, w in zip(right, widths) if w >= 1], .5):
                if len(rail) > 1:
                    passes.append((C.tolerant_path(rail, 1.5, .1), 3))
        if 'zigzag' in underlay:
            edges = C.inset_rails(left, right, .5)
            zig = [edges[i % 2][j] for i, j in enumerate(range(0, len(left), max(1, round(1.5/step)))) if widths[j] >= 1]
            if len(zig) > 1:
                passes.append((C.line_path(zig, 1.5), 3))
        cover = C.block_path(left, right, spacing, pull, 0, obj.get('shortStitches', True), dots=False, short_min=1.2, paired=paired) if len(left) > 1 else [left[0], right[0]]
        if passes and math.dist(passes[-1][0][-1], cover[-1]) < math.dist(passes[-1][0][-1], cover[0]):
            cover.reverse()
        cover = clean(split_fill_bites(cover, obj.get('splitLength', 7), angle))
        if len(cover) > 1:
            pieces.append(passes+[(cover, C.SATIN_MAX-.15)])
    pieces = reading_order(obj, pieces, entry or at)
    return route_pieces(obj, pieces, at, entry, target, ordered=True, travel=unsewn_travel(obj, pieces, step), minimum=.5)


def unsewn_travel(obj, pieces, spacing):
    """Travel between sections through the letter where it is not sewn yet (the satin
    sewn later covers it); strokes are often too narrow for the margin that ordinary
    fill travel keeps from the edge. None (a jump) when no such way exists."""
    rule = obj.get('fillRule', 'evenodd')
    region, grid = C.Region(obj['rings'], rule), C.Grid(obj['rings'], rule)
    grid.safe = grid.inside
    tolerance = .001+obj['pullCompensation']/2
    key = lambda p: (round(p[0], 6), round(p[1], 6))
    owner = {key(p): passes for passes in pieces for path, _ in passes for p in (path[0], path[-1])}
    previous = [None]
    reach = max(0, math.ceil(spacing/2/grid.cell))
    def mark(passes):
        for path, _ in passes:
            for a, b in zip(path, path[1:]):
                for p in [a]+C.interpolate(a, b, grid.cell/2):
                    ci, cj = int((p[0]-grid.x0)/grid.cell), int((p[1]-grid.y0)/grid.cell)
                    for j in range(max(0, cj-reach), min(grid.ny, cj+reach+1)):
                        for i in range(max(0, ci-reach), min(grid.nx, ci+reach+1)):
                            grid.sewn[j*grid.nx+i] = 1
    def travel(a, b):
        if previous[0]:
            mark(previous[0])
        previous[0] = owner.get(key(b))
        if clear(a, b, region, tolerance) and (math.dist(a, b) < 1.5 or grid.component(a) == grid.component(b)):
            return C.line_path([a, b], 3)
        if grid.component(a) != grid.component(b):
            return None
        goal = grid.near(b, 1, lambda k: grid.inside[k] and not grid.sewn[k])
        if goal is not None:
            for _, _, way in grid.reach(a, {goal: [0]}, True):
                points = way()+[b]
                if all(clear(u, v, region, tolerance) for u, v in zip(points, points[1:])):
                    return C.line_path(points, 3)
                break
        return connector(a, b, obj['rings'], region, fallback, tolerance)
    fallback = C.Grid(obj['rings'], rule)
    return travel


def reading_order(obj, pieces, at):
    """Letters (connected parts) left to right; inside one, the nearest piece next."""
    grid = C.Grid(obj['rings'], obj.get('fillRule', 'evenodd'))
    parts = {}
    for passes in pieces:
        cover = passes[-1][0]
        parts.setdefault(grid.component(cover[len(cover)//2]), []).append(passes)
    out = []
    for _, group in sorted(parts.items(), key=lambda kv: min(p[0] for ps in kv[1] for p in ps[-1][0])):
        while group:
            ends = lambda ps: (ps[0][0][0], ps[0][0][-1], ps[-1][0][0], ps[-1][0][-1])
            k = 0 if at is None else min(range(len(group)), key=lambda i: min(math.dist(at, p) for p in ends(group[i])))
            passes = group.pop(k)
            out.append(passes)
            at = min(ends(passes)[2:], key=lambda p: -math.dist(p, at)) if at else passes[-1][0][-1]
    return out
