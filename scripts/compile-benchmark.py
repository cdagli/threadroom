#!/usr/bin/env python3
"""Deterministic compile fixtures, unprofiled medians, phase timers and cProfile.

Run with .venv/bin/python scripts/compile-benchmark.py --record baseline
Then --compare scripts/compile-baseline.json --record after. No browser needed.
Phase/profile passes are separate from uninstrumented wall-clock measurements.
"""
import argparse
import base64
import copy
import cProfile
import hashlib
import io
import json
import math
from pathlib import Path
import pstats
import platform
import statistics
import subprocess
import sys
import time
from contextlib import ExitStack
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from embroidery import compiler as C, engines, cross, streamlines
from embroidery.patterns import FILL_PATTERNS


def fixtures():
    bear = json.loads(subprocess.check_output(['node', 'tests/editor.mjs', 'demo'], cwd=ROOT))
    for i, o in enumerate(bear['objects']):
        o['id'] = f'bear-{i}'
    base = dict(kind='fill', color='#c99d72', spacing=.45, length=2.5,
                underlay='none', pullCompensation=.2, tieIn='tack', tieOff='tack',
                lockSize=1, splitLength=7, shortStitches=True)
    def obj(i, x, y, size=12, **settings):
        return {**base, 'id':f'object-{i}', 'name':f'Object {i}',
                'rings':[[[x,y],[x+size,y],[x+size,y+size],[x,y+size]]], **settings}
    def project(name, objects):
        return dict(version=1, name=name, machine='brother-pr1x', hoop='180x130', trimJump=3, objects=objects)
    traced = []
    for i in range(60):
        x,y = 10+i%10*16, 10+i//10*19
        ring = [[x+6*math.cos(j*math.tau/128)*(1+.06*math.sin(j*5*math.tau/128)),
                 y+7*math.sin(j*math.tau/128)] for j in range(128)]
        o = obj(i,x,y,fillPattern='tatami',underlay='tatami')
        o['rings'] = [ring]
        traced.append(o)
    patterns = [obj(i, 8+i%9*18, 8+i//9*21, fillPattern=p,
                    **({'spacing':.32,'underlay':'center'} if p=='sweepSatin' else {}))
                for i,p in enumerate(FILL_PATTERNS)]
    for style in ('upright','double','smyrna','half'):
        i = len(patterns)
        patterns.append(obj(i,8+i%9*18,8+i//9*21,fillPattern='crossStitchFill',crossStyle=style,crossSize=3))
    runs = []
    for i in range(12):
        x,y = 10+i%4*40,12+i//4*30
        if i%3 == 0:
            left = [[x,y],[x+10,y+4],[x+24,y]]
            right = [[x,y+4],[x+10,y+10],[x+24,y+7]]
            runs.append(obj(i,x,y,kind='satin-block',rings=[left],railPaths=[left,right],underlay='edge-zigzag',spacing=.4))
        else:
            runs.append(obj(i,x,y,kind='double-rope' if i%3==1 else 'triple-rope',
                            rings=[[[x,y],[x+8,y+8],[x+16,y+2],[x+25,y+7]]],length=1.5))
    library = json.loads(subprocess.check_output(['node','tests/editor.mjs','payload'],
                         input=(ROOT/'tests/stitch-library.project.json').read_bytes(),cwd=ROOT))
    return {'bear':bear,'traced-60':project('Traced 60',traced),
            'all-patterns':project('All patterns',patterns),'blocks-ropes':project('Blocks and ropes',runs),
            'stitch-library':library}


def hashes(result):
    stable = copy.deepcopy(result)
    stable['stats'].pop('durationMs',None)
    return {'pes':hashlib.sha256(base64.b64decode(result['pes'])).hexdigest(),
            'result':hashlib.sha256(json.dumps(stable,sort_keys=True,separators=(',',':')).encode()).hexdigest()}


def phases(project):
    """Exclusive nested timers. Residual covers command emission and preview.
    Geometry and fill generation are subtracted from their enclosing routers.
    PES includes writer + reader; warnings include the full design check.
    """
    times = dict.fromkeys(('geometry','fills','routing','ties/trims + preview','PES write/read','warnings'),0.)
    stack = []
    def wrap(fn, phase):
        def timed(*args, **kwargs):
            started = time.perf_counter()
            frame = [phase,0.]
            stack.append(frame)
            try:
                return fn(*args,**kwargs)
            finally:
                elapsed = time.perf_counter()-started
                stack.pop()
                times[phase] += elapsed-frame[1]
                if stack:
                    stack[-1][1] += elapsed
        return timed
    groups = [(C,'geometry',['validate','rotate','scan_spans','fill_sections','inset_rings','fill_centroid']),
              (C,'fills',['line_passes','block_passes','rope_passes','pattern_cycle']),
              (C,'routing',['plan_object']), (C,'PES write/read',['write_pes','read_pes']),
              (C,'warnings',['design_check']),
              (engines,'fills',['circular_arms','clip_lines','satin_columns']),
              (cross,'fills',['cells']), (streamlines,'fills',['generate'])]
    with ExitStack() as scope:
        for module,phase,names in groups:
            for name in names:
                scope.enter_context(patch.object(module,name,wrap(getattr(module,name),phase)))
        for cls,phase,names in [(C.Region,'geometry',['__init__']), (C.Grid,'geometry',['__init__']), (C.Rows,'fills',['paths'])]:
            for name in names:
                scope.enter_context(patch.object(cls,name,wrap(getattr(cls,name),phase)))
        started = time.perf_counter()
        C.compile_project(project)
        times['ties/trims + preview'] = time.perf_counter()-started-sum(times.values())
    return {k:round(v*1000,3) for k,v in times.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--record',choices=['baseline','after'])
    parser.add_argument('--compare',type=Path)
    parser.add_argument('--runs',type=int,default=5)
    parser.add_argument('--top',type=int,default=12)
    args = parser.parse_args()
    if args.runs < 1:
        parser.error('--runs must be positive')
    report = {'runs':args.runs,'environment':{'python':sys.version.split()[0], 'platform':platform.platform()},'fixtures':{},'library_sha256':hashlib.sha256((ROOT/'tests/stitch-library.json').read_bytes()).hexdigest()}
    for name,project in fixtures().items():
        samples = []
        result = None
        for _ in range(args.runs):
            started = time.perf_counter()
            result = C.compile_project(project)
            samples.append((time.perf_counter()-started)*1000)
        entry = dict(ms=round(statistics.median(samples),3),hashes=hashes(result),phases_ms=phases(project),
                     objects=len(project['objects']), stitches=result['stats']['stitches'])
        if hasattr(C,'ObjectPlanCache'):
            cache = C.ObjectPlanCache()
            C.compile_project(project,cache=cache)
            warm = []
            for _ in range(args.runs):
                started = time.perf_counter()
                cached = C.compile_project(project,cache=cache)
                warm.append((time.perf_counter()-started)*1000)
                assert hashes(cached)==entry['hashes']
            edited = copy.deepcopy(project)
            edited['objects'][-1]['length'] = 1.8
            started = time.perf_counter()
            with patch.object(C,'plan_object',wraps=C.plan_object) as planner:
                incremental = C.compile_project(edited,cache=cache)
            entry['edit_replanned_objects'] = planner.call_count
            assert planner.call_count == 1
            entry.update(warm_ms=round(statistics.median(warm),3),edit_ms=round((time.perf_counter()-started)*1000,3))
            assert hashes(incremental)==hashes(C.compile_project(edited))
        profile = cProfile.Profile()
        profile.runcall(C.compile_project,project)
        output = io.StringIO()
        pstats.Stats(profile,stream=output).strip_dirs().sort_stats('cumulative').print_stats(args.top)
        entry['profile'] = output.getvalue()
        report['fixtures'][name] = entry
        print(name,json.dumps({k:v for k,v in entry.items() if k!='profile'}),flush=True)
        print(entry['profile'],flush=True)
    if args.compare:
        baseline = json.loads(args.compare.read_text())
        assert report['library_sha256']==baseline['library_sha256'], 'Stitch library changed'
        for name,entry in report['fixtures'].items():
            assert entry['hashes']==baseline['fixtures'][name]['hashes'], f'{name} output changed'
        print('All PES, full-result (excluding durationMs), and stitch-library hashes match.')
    if args.record:
        (ROOT/f'scripts/compile-{args.record}.json').write_text(json.dumps(report,indent=2)+'\n')


if __name__=='__main__':
    main()
