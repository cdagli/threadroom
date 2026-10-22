"""Evenly spaced RK4 streamlines. Ember's unknown noise table is not copied.
The default smooth angle field is translation-invariant around the shape bbox.
"""
import math
from collections import deque
from . import compiler as C
from .engines import clip_lines,clean,route_pieces


class SpatialHash:
    def __init__(self, size):
        self.size,self.cells = size,{}

    def key(self, p):
        return tuple(math.floor(v/self.size) for v in p)

    def add(self, p):
        self.cells.setdefault(self.key(p),[]).append(p)

    def near(self, p, distance):
        x,y = self.key(p)
        n = math.ceil(distance/self.size)
        return any(math.dist(p,q)<distance-1e-8 for i in range(x-n,x+n+1) for j in range(y-n,y+n+1) for q in self.cells.get((i,j),()))


def flow_field(angle, center):
    base = math.radians(angle)
    def field(p):
        a = base+.35*math.sin((p[0]-center[0])/20)+.25*math.sin((p[1]-center[1])/20)
        return math.cos(a),math.sin(a)
    return field


def rk4(p, step, field):
    add = lambda p,v,h:[p[i]+v[i]*h for i in (0,1)]
    k1 = field(p)
    k2 = field(add(p,k1,step/2))
    k3 = field(add(p,k2,step/2))
    k4 = field(add(p,k3,step))
    return [p[i]+step*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6 for i in (0,1)]


def generate(rings, angle, separation):
    points = [p for r in rings for p in r]
    lo,hi = [min(p[i] for p in points) for i in (0,1)],[max(p[i] for p in points) for i in (0,1)]
    center = [(lo[i]+hi[i])/2 for i in (0,1)]
    field,h,test = flow_field(angle,center),.1,separation/2
    accepted,lines,queue = SpatialHash(separation),[],deque([center])
    fallback = ([lo[0]+(i+.5)*separation,lo[1]+(j+.5)*separation] for j in range(math.ceil((hi[1]-lo[1])/separation)) for i in range(math.ceil((hi[0]-lo[0])/separation)))
    in_box = lambda p:all(lo[i]<=p[i]<=hi[i] for i in (0,1))
    steps,guard = 0,math.ceil(test/h)+1
    while True:
        seed = queue.popleft() if queue else next(fallback,None)
        if seed is None:
            return lines
        if not in_box(seed) or accepted.near(seed,separation):
            continue
        def integrate(sign):
            nonlocal steps
            path,old = [seed],SpatialHash(separation)
            for _ in range(10_000):
                steps += 1
                if steps>200_000:
                    raise ValueError('This fill is too dense. Increase spacing or reduce the design size.')
                q = rk4(path[-1],sign*h,field)
                if not in_box(q) or accepted.near(q,test) or old.near(q,test):
                    break
                path.append(q)
                if len(path)>guard:
                    old.add(path[-guard-1])
            return path
        backward,forward = integrate(-1),integrate(1)
        line = backward[:0:-1]+forward
        if len(line)<2:
            continue
        lines.append(line)
        for p in line:
            accepted.add(p)
        for p in line[::max(1,round(separation/h))]:
            dx,dy = field(p)
            for sign in (-1,1):
                queue.append([p[0]-sign*dy*separation,p[1]+sign*dx*separation])


def route_streamlines(obj, at, entry, target):
    rings,rule = obj['rings'],obj.get('fillRule','evenodd')
    separation = obj.get('patternParams',{}).get('separation',1.5)
    lines = clip_lines(generate(rings,obj.get('angle',0),separation),rings,rule)
    # Ember's redwork router doubles every streamline and every boundary ring.
    # Nearest-first routing with safe in-shape travel replaces its Euler router.
    lines += [r+[r[0]] for r in rings]
    pieces,region,length = [],C.Region(rings,rule),obj.get('fillLength',4)
    for line in lines:
        path = clean(C.tolerant_path(line,length,.1),region)
        if len(path)>1:
            pieces.append([(path+path[-2::-1],length)])
    return route_pieces(obj,pieces,at,entry,target)
