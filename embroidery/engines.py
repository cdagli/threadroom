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


def clean(path, region=None, tolerance=.001):
    """Merge sub-0.35 mm penetrations, leaving room for PES rounding."""
    if not path:
        return []
    out = [path[0]]
    for p in path[1:]:
        if math.dist(out[-1],p) >= .35:
            out.append(p)
    if len(out)>1 and math.dist(out[-1],path[-1]) > 1e-7:
        if math.dist(out[-2],path[-1]) >= .35 and (region is None or clear(out[-2],path[-1],region,tolerance)):
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
    paths = [clean(C.tolerant_path(line,length,min(.2,obj["spacing"]/2)),region) for line in lines]
    pieces = [[(p,min(length,C.SATIN_MAX-.15))] for p in paths if len(p)>1]
    return route_pieces(obj,pieces,at,entry,target)
