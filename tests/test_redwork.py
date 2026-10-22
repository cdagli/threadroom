import math
import unittest
from collections import Counter

from embroidery import redwork
from embroidery.compiler import compile_project
from test_compiler import project, resolved

CROSS = [[20, 50], [80, 50]], [[50, 20], [50, 80]]
SQUARE = [[30, 30], [70, 30], [70, 70], [30, 70], [30, 30]]
TRIANGLE = [[85, 85], [95, 85], [95, 95], [85, 85]]
BRANCH = [[50, 80], [60, 90]]  # T-junction on the vertical line's end


def segments(path):
    return Counter(tuple(sorted(((round(a[0], 6), round(a[1], 6)), (round(b[0], 6), round(b[1], 6))))) for a, b in zip(path, path[1:]) if math.dist(a, b) > 1e-9)


class RedworkTests(unittest.TestCase):
    def test_lines_are_noded_at_crossings_t_junctions_and_ends(self):
        nodes, edges = redwork.graph([*CROSS, SQUARE, BRANCH])
        degree = Counter(n for u, v, _ in edges for n in (u, v))
        centre = min(range(len(nodes)), key=lambda i: math.dist(nodes[i], [50, 50]))
        self.assertEqual(degree[centre], 4)
        # Each line crosses the square twice: 4 crossing nodes of degree 4.
        self.assertEqual(sorted(degree.values()).count(4), 5)
        end = min(range(len(nodes)), key=lambda i: math.dist(nodes[i], [50, 80]))
        self.assertEqual(degree[end], 2)
        loop_nodes, loop = redwork.graph([TRIANGLE])
        self.assertEqual((len(loop_nodes), len(loop), loop[0][0] == loop[0][1]), (1, 1, True))

    def test_tarry_walk_sews_every_edge_once_each_way_and_returns(self):
        nodes, edges = redwork.graph([*CROSS, SQUARE, BRANCH, TRIANGLE])
        for start in range(len(nodes)):
            order = redwork.walk(nodes, edges, start)
            seen = Counter(order)
            self.assertTrue(all(n == 1 for n in seen.values()))
            reached = {e for e, _ in order}
            self.assertTrue(all((e, d) in seen for e in reached for d in (0, 1)))
            last_edge, last_dir = order[-1]
            self.assertEqual(edges[last_edge][0 if last_dir else 1], start)

    def test_each_segment_is_sewn_exactly_twice_with_one_run_per_group(self):
        plan = redwork.plan({"rings": [*CROSS, SQUARE, BRANCH, TRIANGLE], "length": 2}, [20, 50], None, None)
        self.assertEqual(len(plan), 2)  # the cross-and-square group, then the triangle
        for run in plan:
            self.assertEqual(len(run), 1)
            path, limit = run[0]
            self.assertTrue(all(n == 2 for n in segments(path).values()))
            self.assertLessEqual(max(math.dist(a, b) for a, b in zip(path, path[1:])), 2+1e-9)
            self.assertLess(math.dist(path[0], path[-1]), 1e-9)
        self.assertLess(math.dist(plan[0][0][0][0], [20, 50]), 1e-9)

    def test_redwork_compiles_without_trims_inside_a_group(self):
        p = project("redwork", rings=[*CROSS, SQUARE, BRANCH], length=2, underlay="none", spacing=.5)
        r = compile_project(p)
        self.assertEqual(r["stats"]["trims"], 0)
        self.assertEqual(r["warnings"], [])
        self.assertEqual(r["pes"], compile_project(p)["pes"])
        stitched = [c for c in r["commands"] if c["type"] == "stitch"]
        self.assertEqual(len([c for c in r["commands"] if c["type"] == "jump"]), 1)
        self.assertGreater(len(stitched), 200)
        two = compile_project(project("redwork", rings=[*CROSS, TRIANGLE], length=2, underlay="none", spacing=.5))
        self.assertEqual(two["stats"]["trims"], 1)  # between the groups, far apart
        with self.assertRaises(ValueError):
            compile_project(project("redwork", rings=[[[30, 30]]], underlay="none", spacing=.5))

    def test_editor_redwork_payload_compiles(self):
        o = {"id": "r", "name": "Redwork", "kind": "redwork", "color": "#aa3333", "rings": [*CROSS, SQUARE], "length": 2, "angle": 35, "satinWidth": 2,
             "sources": [{"id": "s", "name": "Line", "kind": "running", "color": "#aa3333", "rings": [CROSS[0]], "length": 2, "angle": 35, "satinWidth": 2}]}
        p = resolved({"version": 1, "name": "Redwork", "machine": "brother-pr1x", "hoop": "100x100", "fabric": "woven",
                      "locks": {"tieIn": "tack", "tieOff": "tack", "lockSize": 1}, "trimJump": 3, "objects": [o]})
        self.assertNotIn("sources", p["objects"][0])
        self.assertEqual(compile_project(p)["warnings"], [])


if __name__ == "__main__":
    unittest.main()
