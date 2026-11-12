"""Compile review payloads with the real engine: python compile.py entries.json out.json"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from embroidery.compiler import compile_project  # noqa: E402

out = []
for e in json.load(open(sys.argv[1])):
    r = compile_project(e['project'])
    cmds = [[round(c['fromX'], 2), round(c['fromY'], 2), round(c['x'], 2), round(c['y'], 2), c.get('block', 0), 1 if c.get('travel') else 0]
            for c in r['commands'] if c['type'] == 'stitch'] if e['render'] else []
    out.append({'id': e['id'], 'hoop': e['hoop'], 'warnings': r.get('warnings', []), 'stats': r['stats'], 'threads': [t['color'] for t in r['threads']], 'cmds': cmds})
json.dump(out, open(sys.argv[2], 'w'))
