"""Incremental plans must preserve the cold compiler's bytes and metadata."""
import copy
from concurrent.futures import ThreadPoolExecutor
import json
from unittest import TestCase
from unittest.mock import patch

import embroidery.compiler as C
from embroidery.cache import ObjectPlanCache
from tests.test_compiler import project


def stable(result):
    result = copy.deepcopy(result)
    result['stats'].pop('durationMs')
    return result


def fixture():
    p = project()
    p['objects'] = [dict(p['objects'][0], id=f'fill-{i}',
                         rings=[[[15+i*24,20],[30+i*24,20],[30+i*24,35],[15+i*24,35]]])
                    for i in range(3)]
    return p


class IncrementalCompileTests(TestCase):
    def test_one_object_edit_replans_only_that_object_and_matches_cold(self):
        p, cache = fixture(), ObjectPlanCache()
        expected = stable(C.compile_project(p))
        self.assertEqual(stable(C.compile_project(p, cache=cache)), expected)
        with patch.object(C, 'plan_object', wraps=C.plan_object) as planner:
            self.assertEqual(stable(C.compile_project(p, cache=cache)), expected)
            planner.assert_not_called()
        # Changing stitch length inside the middle fill keeps the routing
        # endpoints, so both its neighbours can reuse their existing blocks.
        p['objects'][1]['length'] = 1.8
        with patch.object(C, 'plan_object', wraps=C.plan_object) as planner:
            incremental = C.compile_project(p, cache=cache)
            self.assertEqual([call.args[0]['id'] for call in planner.call_args_list], ['fill-1'])
        self.assertEqual(stable(incremental), stable(C.compile_project(p)))

    def test_context_settings_reorder_insertion_and_removal_match_cold(self):
        original = fixture()
        variants = []
        def changed(edit):
            p = copy.deepcopy(original)
            edit(p)
            variants.append(p)
        changed(lambda p: p['objects'][0]['rings'][0][0].__setitem__(0, 12))
        changed(lambda p: p['objects'][1].update(entry=[39,20], exit=[54,35]))
        changed(lambda p: p['objects'][1].update(spacing=.7, underlay='tatami', pullCompensation=.4))
        changed(lambda p: p['objects'][1].update(tieIn='triangle', tieOff='none', lockSize=1.4))
        changed(lambda p: p.update(trimJump=10))
        changed(lambda p: p.update(hoop='180x130'))
        changed(lambda p: p.update(name='Renamed project'))
        changed(lambda p: p['objects'].reverse())
        changed(lambda p: p['objects'].pop(1))
        changed(lambda p: p['objects'].insert(1, dict(p['objects'][0], id='inserted', color='#849984')))
        changed(lambda p: p['objects'][1].update(id='new-id', name='New name', color='#849984'))
        for p in variants:
            with self.subTest(project=json.dumps(p)):
                cache = ObjectPlanCache()
                C.compile_project(original, cache=cache)
                actual = C.compile_project(p, cache=cache)
                self.assertEqual(stable(actual), stable(C.compile_project(p)))

    def test_routing_context_change_invalidates_unchanged_neighbour(self):
        p, cache = fixture(), ObjectPlanCache()
        C.compile_project(p, cache=cache)
        # A new entry on object 2 changes object 1's target even though object 1
        # has the same resolved payload. Reusing its old route would be wrong.
        p['objects'][1]['entry'] = [39, 35]
        with patch.object(C, 'plan_object', wraps=C.plan_object) as planner:
            actual = C.compile_project(p, cache=cache)
            self.assertIn('fill-0', [call.args[0]['id'] for call in planner.call_args_list])
        self.assertEqual(stable(actual), stable(C.compile_project(p)))

    def test_cached_requests_still_validate_and_responses_cannot_poison_plans(self):
        p, cache = fixture(), ObjectPlanCache()
        first = C.compile_project(p, cache=cache)
        first['commands'][0]['x'] = -100
        self.assertEqual(stable(C.compile_project(p, cache=cache)), stable(C.compile_project(p)))
        with patch.object(C, 'validate', wraps=C.validate) as validate:
            C.compile_project(p, cache=cache)
            validate.assert_called_once()
        p['objects'][0]['spacing'] = .01
        with self.assertRaises(ValueError):
            C.compile_project(p, cache=cache)

    def test_entry_and_point_bounds_lru_and_immutable_values(self):
        calls = []
        def planner(obj, at, target):
            calls.append(obj['id'])
            return [[(obj['rings'][0], 3)]]
        objects = [dict(id=i, rings=[[[1,2],[3,4]]]) for i in range(3)]
        cache = ObjectPlanCache(max_entries=2, max_points=4)
        def get(i):
            return cache.plan(objects[i], None, None, (100,100,3), planner)
        value = get(0)
        get(1)
        get(0)  # recently used 0 survives, 1 is evicted by 2
        get(2)
        get(0)
        get(1)
        self.assertEqual(calls, [0,1,2,1])
        self.assertLessEqual(cache._points, 4)
        objects[0]['rings'][0][0][0] = 99
        self.assertEqual(value[0][0][0][0], (1,2))
        with self.assertRaises(TypeError):
            value[0][0][0][0][0] = 99
        cache.clear()
        self.assertEqual(cache._points, 0)
        self.assertEqual(len(cache._entries), 0)
        # The point bound applies even when the entry bound has spare room.
        small = ObjectPlanCache(max_entries=10, max_points=1)
        small.plan(objects[1], None, None, (), planner)
        self.assertEqual(len(small._entries), 0)

    def test_shared_api_process_cache_is_safe_for_concurrent_requests(self):
        p, cache = fixture(), ObjectPlanCache()
        expected = stable(C.compile_project(p))
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: stable(C.compile_project(p, cache=cache)), range(8)))
        self.assertTrue(all(result == expected for result in results))

    def test_api_reuses_process_cache(self):
        from api.export import PLAN_CACHE
        from tests.test_api import ApiTests
        PLAN_CACHE.clear()
        p = fixture()
        body = json.dumps(p).encode()
        api = ApiTests()
        self.assertEqual(api.invoke(body)[0], 200)
        with patch.object(C, 'plan_object', wraps=C.plan_object) as planner:
            status, cached = api.invoke(body)
            planner.assert_not_called()
        self.assertEqual(status, 200)
        self.assertEqual(stable(cached), stable(C.compile_project(p)))


class RasterRegressionTests(TestCase):
    def test_span_masks_equal_original_per_cell_geometry(self):
        # Include holes, overlapping nonzero rings and rotated floating-point
        # boundaries. The reference deliberately retains the original tests.
        shell = [[10,10],[25,10],[25,25],[10,25]]
        hole = [[14,14],[14,20],[20,20],[20,14]]
        cases = [([shell,hole],'evenodd',0), ([shell,hole],'nonzero',37),
                 ([shell,[[20,15],[30,15],[30,30],[20,30]]],'nonzero',-29),
                 ([[[10,10],[10.3,10],[10.3,24],[10,24]]],'evenodd',0)]
        for rings, rule, angle in cases:
            rings = [C.rotate(r,angle) for r in rings]
            grid = C.Grid(rings,rule)
            m,d,q = C.TRAVEL_MARGIN,C.MIN_UNDERLAY_FILL/2,C.MIN_UNDERLAY_FILL/2/C.SQRT2
            expected = {k:bytearray(grid.nx*grid.ny) for k in ('inside','safe','deep')}
            covers = lambda spans,x:any(a<=x<=b for a,b in spans)
            for j in range(grid.ny):
                y = grid.y0+(j+.5)*grid.cell
                row = C.scan_spans(rings,y,rule)
                near = [C.scan_spans(rings,y+o,rule) for o in (-m,m)]
                far = {o:C.scan_spans(rings,y+o,rule) for o in (-d,-q,q,d)}
                for a,b in row:
                    import math
                    for i in range(max(0,math.ceil((a-grid.x0)/grid.cell-.5)),min(grid.nx-1,math.floor((b-grid.x0)/grid.cell-.5))+1):
                        x,k = grid.x0+(i+.5)*grid.cell,j*grid.nx+i
                        expected['inside'][k] = 1
                        expected['safe'][k] = a+m<=x<=b-m and all(covers(s,x) for s in near)
                        expected['deep'][k] = (a+d<=x<=b-d and covers(far[-d],x) and covers(far[d],x)
                                               and all(covers(far[o],x+e) for o in (-q,q) for e in (-q,q)))
            for name,value in expected.items():
                self.assertEqual(getattr(grid,name),value,(name,rule,angle))

    def test_constant_time_row_endpoints_equal_full_ordering(self):
        for n in (1,2,9,10):
            for angle in (0,37,-45):
                rows = C.Rows([(i*.45,i*.2,10+i*.3) for i in range(n)],angle)
                for variant in rows.variants:
                    ordered = rows.ordered(variant)
                    self.assertEqual(rows.start(variant),C.rotate([list(ordered[0][0])],angle,True)[0])
                    self.assertEqual(rows.end(variant),C.rotate([list(ordered[-1][1])],angle,True)[0])
