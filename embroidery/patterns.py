"""Ember row descriptors: (offset, cyclic lengths), in Ember's along-row frame.

The JSON schema is shared with the editor. Tables contain the unmerged crossings;
Rows merges tiny fragments only after clipping to the actual polygon.
"""
import json
import math
from functools import lru_cache
from pathlib import Path

FILL_PATTERNS = {p['id']: p for p in json.loads(Path(__file__).with_name('fill-patterns.json').read_text())}


def jsround(x):
    return math.floor(x+.5)


def descriptor(xs, width):
    points = []
    for x in sorted(xs):
        if -1e-6 <= x <= width+1e-6 and (not points or x-points[-1] > 1e-4):
            points.append(x)
    if not points:
        return 0, [width]
    return points[0], [b-a for a,b in zip(points,points[1:])]+[max(width-points[-1]+points[0],.01)]


def heart_crossings(y, size):
    f = lambda e: e**3+e**2-2*y*e+y*y-1
    roots = []
    for i in range(65):
        a = i/64
        if abs(f(a)) < 1e-9:
            roots.append(a)
        if i == 64 or f(a)*f(a+1/64) >= 0:
            continue
        b = a+1/64
        for _ in range(40):
            m = (a+b)/2
            if abs(f(m)) < 1e-9:
                a = b = m
                break
            if f(a)*f(m) < 0:
                b = m
            else:
                a = m
        roots.append((a+b)/2)
    unique = []
    for e in sorted(roots):
        if not unique or e-unique[-1] > 1e-6:
            unique.append(max(0,min(1,e)))
    return [(x+1)/2*size for e in unique for x in ([-e**1.5,e**1.5] if e**1.5 >= 1e-8 else [0])]


def pattern_cycle(pattern, length, spacing, params=None):
    return _cycle(pattern, length, spacing, tuple(sorted((params or {}).items())))


@lru_cache(maxsize=256)
def _cycle(pattern, L, s, items):
    p = FILL_PATTERNS[pattern]
    v = {f['key']: f['default'] for f in p.get('params', [])}
    v.update(dict(items))
    for key in ('steps', 'stepsPerFlight', 'density'):
        if key in v:
            v[key] = int(v[key])
    mode = p['mode']
    rows, shear = [], 0
    offsets = lambda values: [(o,[L]) for o in values]
    if mode == 'engine':
        return [], 0
    if mode == 'even':
        rows = [(0,[L])]
    elif mode == 'offsets':
        rows = offsets(o*(1 if p.get('absolute') else L) for o in p['offsets'])
    elif mode == 'waves':
        n, a = v['steps'], v['amplitude'] or 2
        rows = offsets((math.sin(2*math.pi*i/n)+1)/2*a for i in range(n))
    elif mode == 'zigzag':
        x = 0
        while x < 2*L:
            rows.append((0 if x <= L else x-L,[L]))
            x += s
    elif mode == 'heartbeat':
        rows = offsets(x*v['intensity'] for x in [0,0,0,0,.3,.5,.3,0,-.4,2,2.5,2,-.6,0,.4,.7,.7,.4,0,0,0])
    elif mode == 'spiral':
        n = jsround(20*v['rotations'])
        rows = offsets(i/n*v['tightness']*math.sin(2*math.pi*v['rotations']*i/n) for i in range(n))
    elif mode == 'staircase':
        n = v['stepsPerFlight']
        rows = offsets(e*v['stepHeight'] for e in list(range(n))+list(range(n-1,-1,-1)) for _ in range(4))
    elif mode == 'rainfall':
        phi, c = 1.618033988749, v['chaos']
        for i in range(v['density']):
            o = (7*i*phi % 1)*c-.5*c*(13*i*phi % 1)+.3*c*math.sin(.3*i)+( .8*c*(i*phi % 1) if i % 7 == 0 else 0)
            rows.append((o,[L*(.7+.6*(11*i*phi % 1))]))
    elif mode == 'tornado':
        n = jsround(25*v['rotations'])
        for i in range(n):
            t, a = i/n, 2*math.pi*v['rotations']*i/n
            amp = v['tightness']*(1-t**1.5)*(1+.3*t)
            rows.append((amp*math.sin(a)+.15*v['tightness']*math.sin(7*a),[L*(.6+.4*(1-t))]))
    elif mode == 'wavy-walk':
        rows = offsets((i % 7+1)/7*L+(math.sin(2*math.pi*i/21)+1)/2*.4*L for i in range(21))
    elif mode == 'partition':
        digits = [int(c) for c in p['seed'] if c in '01234567'][:8] or list(range(1,8))
        for i,d in enumerate(digits):
            ls = [L]
            if pattern == 'partitionInterlocked' and d == 1:
                ls = [L/3]*3
            elif pattern == 'partitionRails':
                ls = [L*.22,L*.78] if d == 0 else [L*.78,L*.22]
            elif pattern == 'partitionTwill':
                ls = [L/4,3*L/4]
            elif pattern == 'partitionHoundstooth':
                ls = [L/4,L/4,L/2] if i % 2 == 0 else [L/2,L/4,L/4]
            rows.append((d/len(digits)*L,ls))
        a = math.radians(p['shear'])
        shear = s*max(-20,min(20,math.cos(a)/math.sin(a))) if abs(math.sin(a)) >= 1e-6 and abs(math.cos(a)) >= 1e-12 else 0
    elif mode == 'heart':
        n, size = max(1,jsround(p['size']/s)), p['size']
        rows = [descriptor(heart_crossings(1.51-2.51*i/n,size),size) for i in range(n)]
    elif mode == 'diamond':
        w = p['size']
        h = max(1,jsround(w/s)//2)
        rows = [(w/2,[w])]+[(w/2*(1-i/h),[w*i/h,w*(1-i/h)]) for i in range(1,h)]+[(0,[w])]
        rows += rows[1:h][::-1]
    elif mode == 'circle':
        d = p['size']
        m, r = max(2,jsround(d/(2*s))), d/2
        rows = [(r,[d])]
        for i in range(1,m-1):
            c = 2*math.sqrt(r*r-(r*i/m-r)**2)
            rows.append((r-c/2,[c,2*r-c]))
        rows += [(0,[d])]+rows[1:][::-1]
    elif mode == 'hexweave':
        c = v['cellSize']
        n = 2*math.ceil(c*math.sin(math.pi/3)/s)
        rows = [(c*min(i/n,1-i/n) if i % 2 == 0 else c-c*min(i/n,1-i/n),[c]) for i in range(n)]
    elif mode == 'chain':
        n = max(4,jsround(8/max(s,.05)))
        for i in range(n):
            a = math.asin(((i+.5)/n*8-4)/4)
            rows.append(descriptor([((b-phase) % (2*math.pi))/(2*math.pi)*8 for phase in (0,math.pi) for b in (a,math.pi-a)],8))
    elif mode == 'stars':
        n = max(4,4*jsround(max(4,jsround(8/max(s,.05)))/4))
        vertices = [[math.cos(-math.pi/2+i*math.pi/5)*(1 if i % 2 == 0 else .38),math.sin(-math.pi/2+i*math.pi/5)*(1 if i % 2 == 0 else .38)] for i in range(10)]
        lo = [min(v[j] for v in vertices) for j in (0,1)]
        hi = [max(v[j] for v in vertices) for j in (0,1)]
        vertices = [[(v[j]-lo[j])/(hi[j]-lo[j])*8 for j in (0,1)] for v in vertices]
        for i in range(n):
            y = (i+.5)/n*8
            xs = sorted(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]) for a,b in zip(vertices,vertices[1:]+vertices[:1]) if abs(a[1]-b[1]) > 1e-9 and min(a[1],b[1])-1e-9 <= y <= max(a[1],b[1])+1e-9)
            x = (L*[.25,.5,.75,1][i % 4]) % L
            grid = []
            while x < 8:
                if sum(a < x-1e-6 for a in xs) % 2 == 0:
                    grid.append(x)
                x += L
            rows.append(descriptor(xs+grid,8))
    else:
        raise ValueError('Unknown fill pattern.')
    return rows, shear
