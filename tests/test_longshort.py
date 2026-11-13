import math
import unittest

from embroidery import longshort
from embroidery.compiler import compile_project, plan_object
from test_compiler import project

FLOWER = [[50+(22+7*math.cos(5*t))*math.cos(t), 50+(22+7*math.cos(5*t))*math.sin(t)] for t in [i*2*math.pi/240 for i in range(240)]]


def layer(start=0, end=100, **extra):
    params = {k: v for k, v in (("bandStart", start), ("bandEnd", end)) if v not in (0, 100)}
    o = project(rings=[FLOWER], fillPattern="longShort", spacing=.3, fillLength=4, center=[50, 50], patternParams={**params, **extra.pop("params", {})}, **extra)["objects"][0]
    return o


def stitched(obj):
    return [s for run in plan_object(obj, [0, 0], None) for path, _ in run for s in zip(path, path[1:])]


class LongShortTests(unittest.TestCase):
    def test_radial_lines_point_at_the_centre_and_stay_inside(self):
        o = layer()
        segs = longshort.segments(o)
        self.assertGreater(len(segs), 300)
        for _, path in segs:
            a, b = path[0], path[-1]
            # Straight along a ray: the far end, the near end and the centre are collinear.
            cross = (b[0]-a[0])*(50-a[1])-(b[1]-a[1])*(50-a[0])
            self.assertLess(abs(cross)/math.dist(a, b), 1e-6)
            self.assertLessEqual(max(math.dist(p, q) for p, q in zip(path, path[1:])), 4*1.18+longshort.MIN_STITCH)

    def test_needle_points_are_staggered_between_neighbouring_lines(self):
        segs = longshort.segments(layer())
        firsts = [round(math.dist(path[0], path[1]), 2) for _, path in segs if len(path) > 2]
        self.assertGreater(len(set(firsts)), len(firsts)//3)
        regular = longshort.segments(layer(params={"variation": 0}))
        firsts = {round(math.dist(path[0], path[1]), 3) for _, path in regular if len(path) > 2 and math.dist(path[0], path[-1]) > 8}
        self.assertLessEqual(len(firsts), 2)  # a plain long/short rhythm: 2 mm and 4 mm

    def test_shading_layers_meet_without_a_gap_and_overlap_only_slightly(self):
        outer, inner = longshort.segments(layer(50, 100)), longshort.segments(layer(0, 50))
        # Rays that only begin further out (where the gaps widen) have no inner part.
        self.assertGreater(len({k for k, _ in outer} & {k for k, _ in inner}), 200)
        reach = lambda segs: {k: max(math.dist(p, [50, 50]) for p in path) for k, path in segs}
        start = lambda segs: {k: min(math.dist(p, [50, 50]) for p in path) for k, path in segs}
        out_start, in_reach = start(outer), reach(inner)
        cuts = []
        for k, r in out_start.items():
            if k in in_reach:
                overlap = in_reach[k]-r
                self.assertGreater(overlap, 0, k)  # the colours touch on every line
                self.assertLess(overlap, 2*longshort.OVERLAP+1e-6)
                cuts.append(r)
        # The meeting points are staggered by the blend width, not a straight seam.
        self.assertGreater(max(cuts)-min(cuts), 2)

    def test_straight_mode_follows_the_angle_and_compiles(self):
        o = layer(params={"radial": 0}, angle=30)
        for _, path in longshort.segments(o):
            a, b = path[0], path[-1]
            self.assertAlmostEqual(math.degrees(math.atan2(b[1]-a[1], b[0]-a[0])) % 180, 30, delta=.01)
        result = compile_project({**project(), "objects": [o]})
        self.assertLess(result["stats"]["maxStitch"], 7)

    def test_validation_and_determinism(self):
        p = {**project(), "objects": [layer(55, 100), layer(20, 55), layer(0, 20)]}
        self.assertEqual(compile_project(p)["pes"], compile_project(p)["pes"])
        with self.assertRaises(ValueError):
            compile_project({**project(), "objects": [layer(params={"blend": 9})]})
        with self.assertRaises(ValueError):
            compile_project({**project(), "objects": [{**layer(), "spacing": .1}]})


if __name__ == "__main__":
    unittest.main()
