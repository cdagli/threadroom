"""Ember cross cycles on an integer half-cell lattice; legacy rows stay in compiler.py."""
import math
import heapq
from . import compiler as C
from .engines import route_pieces


def box_area(rings, x, y, size, rule='evenodd'):
    """Exact area of the clipped region, also for overlapping/nonzero rings.
    Scanline width is linear between vertex/edge-intersection events, so its
    midpoint integral is exact in each slab (unlike coverage sampling).
    """
    events,edges = {y,y+size},[]
    for ring in rings:
        for a,b in zip(ring,ring[1:]+ring[:1]):
            if y<a[1]<y+size:
                events.add(a[1])
            if max(a[1],b[1])<=y or min(a[1],b[1])>=y+size or a[1]==b[1]:
                continue
            edges.append((a,b))
            if a[0]!=b[0]:
                for bound in (x,x+size):
                    t = (bound-a[0])/(b[0]-a[0])
                    yy = a[1]+t*(b[1]-a[1])
                    if 0<t<1 and y<yy<y+size:
                        events.add(yy)
    for i,(a,b) in enumerate(edges):
        dx,dy = b[0]-a[0],b[1]-a[1]
        for c,d in edges[:i]:
            ex,ey = d[0]-c[0],d[1]-c[1]
            den = dx*ey-dy*ex
            if abs(den)<1e-12:
                continue
            t = ((c[0]-a[0])*ey-(c[1]-a[1])*ex)/den
            u = ((c[0]-a[0])*dy-(c[1]-a[1])*dx)/den
            yy = a[1]+t*dy
            if 0<t<1 and 0<u<1 and y<yy<y+size:
                events.add(yy)
    ys,area = sorted(events),0
    for lo,hi in zip(ys,ys[1:]):
        spans = C.scan_spans(rings,(lo+hi)/2,rule)
        area += (hi-lo)*sum(max(0,min(b,x+size)-max(a,x)) for a,b in spans)
    return area


def cells(obj):
    params = obj.get('patternParams',{})
    size = obj.get('crossSize',params.get('crossSize',3))
    coverage = obj.get('coverage',params.get('coverage',50))
    style = obj.get('crossStyle','cross')
    angle = obj.get('angle',0)+(90 if obj.get('flipped') and style!='half' else 0)
    rings = [C.rotate(r,angle) for r in obj['rings']]
    points = [p for r in rings for p in r]
    x0,y0 = min(p[0] for p in points),min(p[1] for p in points)
    x1,y1 = max(p[0] for p in points),max(p[1] for p in points)
    if (x1-x0)*(y1-y0)/size**2*(2 if obj.get('dense') else 1)>C.MAX_STITCHES/16:
        raise ValueError('This cross-stitch grid is too dense. Increase the cross size or reduce the design size.')
    selected = []
    for shift in (0,-1) if obj.get('dense') else (0,):
        for j in range(math.ceil((y1-y0)/size)+1):
            for i in range(math.ceil((x1-x0)/size)+1):
                x,y = x0+(i+shift/2)*size,y0+(j+shift/2)*size
                area = box_area(rings,x,y,size,obj.get('fillRule','evenodd'))
                if area/size**2*100+1e-4>=coverage:
                    selected.append((2*i+shift,2*j+shift))
    return selected,(x0,y0),size,angle


def cross_cycle(i,j,style,repeats,entry=None):
    tl,tr,br,bl = (i,j),(i+2,j),(i+2,j+2),(i,j+2)
    ml,mt,mr,mb,c = (i,j+1),(i+1,j),(i+2,j+1),(i+1,j+2),(i+1,j+1)
    g = lambda a,b,n:[p for _ in range(max(0,n)) for p in (a,b)]
    if style in ('cross','double'):
        p = entry or tr
        extras = g(ml,mr,repeats)+[c]+g(mt,mb,repeats)+[c] if style=='double' else []
        if p in (tr,bl):
            a,b = (tl,br) if p==tr else (br,tl)
            q = bl if p==tr else tr
            return [p,c]+g(a,b,repeats)+[c]+extras+g(q,p,repeats)
        e = br if p==tl else tl
        return [p]+g(e,p,repeats-1)+[e,c]+extras+g(tr,bl,repeats)+[c,p]
    if style=='upright':
        p = entry or mt
        if p in (mt,mb):
            return [p,c]+g(ml,mr,repeats)+[c]+g(mb if p==mt else mt,p,repeats)
        e = mr if p==ml else ml
        return [p]+g(e,p,repeats-1)+[e,c]+g(mt,mb,repeats)+[c,p]
    # Smyrna: diagonal cross below an upright cross, closing at an edge midpoint.
    return [mt,c]+g(tl,br,repeats)+[c]+g(tr,bl,repeats)+[c]+g(ml,mr,repeats)+[c]+g(mb,mt,repeats)


def route_cross_styles(obj, at, entry, target):
    selected,origin,size,angle = cells(obj)
    style,params = obj.get('crossStyle','cross'),obj.get('patternParams',{})
    threads = int(obj.get('threadCount',params.get('threadCount',2)))
    n = threads//2 if style=='half' else max(1,threads//2)
    point = lambda v:[origin[0]+v[0]*size/2,origin[1]+v[1]*size/2]
    world = lambda path:C.rotate([point(p) for p in path],angle,True)
    pieces = []
    if style=='half':
        # Adjacent half crosses form diagonal chains; each chain out/back/out.
        edges = {}
        for i,j in selected:
            a,b = ((i,j+2),(i+2,j)) if obj.get('flipped') else ((i,j),(i+2,j+2))
            edges[a] = b
        starts = sorted(set(edges)-set(edges.values()),key=lambda p:(p[0]-p[1],p[1],p[0]))
        for start in starts:
            chain = [start]
            while chain[-1] in edges:
                chain.append(edges[chain[-1]])
            path = []
            for k in range(2*n+1):
                path += chain if k%2==0 else chain[::-1]
            pieces.append([(world(path),obj.get('fillLength',4))])
    else:
        # A directed Euler tour splices closed per-cross cycles at shared
        # lattice points. Every leg is retained, including doubled thread.
        graph = {}
        for i,j in selected:
            cycle = cross_cycle(i,j,style,n)
            for a,b in zip(cycle,cycle[1:]):
                graph.setdefault(a,[]).append(b)
        start_hint = entry or at
        while graph:
            start = min(graph,key=lambda v:(math.dist(world([v])[0],start_hint),v)) if start_hint else min(graph)
            stack,tour = [start],[]
            while stack:
                v = stack[-1]
                if graph.get(v):
                    q = graph[v].pop()
                    if not graph[v]:
                        del graph[v]
                    stack.append(q)
                else:
                    tour.append(stack.pop())
            path = world(tour[::-1])
            if len(path)>1:
                pieces.append([(path,obj.get('fillLength',4))])
                start_hint = path[-1]
    def travel(a,b):
        # Half-cross chains travel over selected cell box edges, including
        # coverage-selected edge cells. Empty cells never become travel edges.
        graph = {}
        for i,j in selected:
            corners = [(i,j),(i+2,j),(i+2,j+2),(i,j+2)]
            for u,v in zip(corners,corners[1:]+corners[:1]):
                mid = ((u[0]+v[0])//2,(u[1]+v[1])//2)
                for p,q in ((u,mid),(mid,v)):
                    graph.setdefault(p,set()).add(q)
                    graph.setdefault(q,set()).add(p)
        def key(p):
            q = C.rotate([p],angle)[0]
            return tuple(round((q[i]-origin[i])*2/size) for i in (0,1))
        start,end = key(a),key(b)
        if start not in graph or end not in graph or math.dist(world([start])[0],a)>.01:
            return None
        dist,prev,heap = {start:0},{},[(0,start)]
        while heap:
            d,p = heapq.heappop(heap)
            if d>dist[p]:
                continue
            if p==end:
                path = [end]
                while path[-1]!=start:
                    path.append(prev[path[-1]])
                return C.line_path(world(path[::-1]),3)
            for q in sorted(graph[p]):
                nd = d+math.dist(p,q)
                if nd<dist.get(q,math.inf):
                    dist[q],prev[q] = nd,p
                    heapq.heappush(heap,(nd,q))
        return None
    return route_pieces(obj,pieces,at,entry,target,travel=travel if style=='half' else None)
