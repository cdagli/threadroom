import copy
import math
import unittest

from embroidery import sweep
from embroidery import compiler as C
from embroidery.compiler import compile_project, plan_object
from test_compiler import node, project

SQUARE = [[20, 20], [80, 20], [80, 80], [20, 80]]
FAN = [{"a": [25, 30], "b": [75, 30]}, {"a": [30, 75], "b": [70, 60]}]


def direction(points):
    a, b = points[0], points[-1]
    return math.degrees(math.atan2(b[1]-a[1], b[0]-a[0])) % 180


class AngleGuideTests(unittest.TestCase):
    def test_one_guide_is_the_stitch_angle_and_unset_guides_change_nothing(self):
        plain = compile_project(project(angle=30))["pes"]
        self.assertEqual(compile_project(project(angle=30, angleGuides=[]))["pes"], plain)
        guide = {"a": [40, 50], "b": [40+math.cos(math.radians(30))*10, 50+math.sin(math.radians(30))*10]}
        self.assertEqual(compile_project(project(angle=-70, angleGuides=[guide]))["pes"], plain)
        # Crossing guides are invalid: the first one sets the angle (Ember falls back to straight rows).
        crossing = {"a": [40, 60], "b": [48, 45]}
        self.assertEqual(sweep.usable({"angleGuides": [guide, crossing]}), [guide])
        self.assertEqual(compile_project(project(angle=-70, angleGuides=[guide, crossing]))["pes"], plain)
        self.assertTrue(sweep.crossing({"a": [0, 0], "b": [10, 0]}, {"a": [5, 0], "b": [5, 5]}))
        self.assertFalse(sweep.crossing({"a": [0, 0], "b": [10, 0]}, {"a": [0, 1], "b": [10, 2]}))

    def test_parallel_guides_give_straight_evenly_spaced_rows(self):
        o = project(rings=[SQUARE], spacing=.5)["objects"][0]
        rows = sweep.Rows(o, [{"a": [30, 30], "b": [70, 50]}, {"a": [30, 60], "b": [70, 80]}], .5)
        angle = math.degrees(math.atan2(20, 40))
        self.assertAlmostEqual(rows.step, .5, places=6)
        for piece in rows.pieces:
            self.assertAlmostEqual(direction(piece["points"]), angle, delta=.2)
        levels = sorted({p["k"] for p in rows.pieces})
        self.assertEqual(levels, list(range(levels[0], levels[-1]+1)))

    def test_rows_follow_each_guide_and_turn_between_them(self):
        o = project(rings=[SQUARE])["objects"][0]
        rows = sweep.Rows(o, FAN, .45)
        field = rows.field
        for g in FAN:
            mid = [(g["a"][0]+g["b"][0])/2, (g["a"][1]+g["b"][1])/2]
            n, t = field.directions(mid)
            self.assertLess(abs((math.degrees(math.atan2(t[1], t[0]))-sweep.guide_angle(g)+90) % 180-90), .5)
        # Between the guides the direction lies between theirs.
        middle = (math.degrees(math.atan2(*field.directions([50, 52])[1][::-1]))+90) % 180-90
        self.assertTrue(sweep.guide_angle(FAN[1])+1 < middle < -1)
        # The widest gap between rows is the row spacing.
        self.assertLessEqual(max(rows.ratio([x, y]) for x in range(21, 80, 3) for y in range(21, 80, 3)), 1+1e-6)

    def test_row_shortening_trims_turns_where_rows_converge(self):
        def plan(**settings):
            return plan_object(project(rings=[SQUARE], spacing=.6, angleGuides=FAN, **settings)["objects"][0], None, None)
        on, off = plan(), plan(rowShortening=False)
        stitches = lambda p: sum(len(path)-1 for run in p for path, _ in run)
        sewn = lambda p: sum(math.dist(a, b) for run in p for path, _ in run for a, b in zip(path, path[1:]))
        self.assertLess(sewn(on), sewn(off)*.97)
        self.assertLess(stitches(on), stitches(off))
        low = plan(densityTrigger=.1)
        self.assertLess(sewn(on), sewn(low))
        o = project(rings=[SQUARE], spacing=.6, angleGuides=FAN)["objects"][0]
        rows = sweep.Rows(o, FAN, .6)
        trimmed = [p for s in rows.sections() for p in rows.shortened(s, .5)]
        self.assertTrue(any(not all(p["ends"]) for p in trimmed))
        self.assertTrue(all(all(p["ends"]) for s in rows.sections() for p in s))
        # Turns stay short steps between neighbouring rows; only turns along the outline are long.
        edge = lambda p: min(abs(p[0]-20), abs(p[0]-80), abs(p[1]-20), abs(p[1]-80)) < .05
        for run in on:
            for path, _ in run:
                for a, b in zip(path, path[1:]):
                    self.assertTrue(math.dist(a, b) < 6 or edge(a) and edge(b) and edge(C.lerp(a, b, .5)))

    def test_sweep_compiles_deterministically_within_limits_and_validates(self):
        p = project(rings=[SQUARE], angleGuides=FAN, fillPattern="tatami", underlay="tatami", pullCompensation=.2)
        r = compile_project(p)
        self.assertEqual(r["pes"], compile_project(copy.deepcopy(p))["pes"])
        self.assertLessEqual(r["stats"]["maxStitch"], 12.7)
        self.assertEqual([w for w in r["warnings"] if w["code"] != "dense"], [])
        satin = compile_project(project(rings=[SQUARE], angleGuides=FAN, fillPattern="sweepSatin", spacing=.32, underlay="center", pullCompensation=.4))
        self.assertGreater(satin["stats"]["stitches"], 500)
        self.assertNotEqual(satin["pes"], compile_project(project(rings=[SQUARE], fillPattern="sweepSatin", spacing=.32, underlay="center", pullCompensation=.4))["pes"])
        for bad in ([FAN[0]]*9, [{"a": [30, 30], "b": [30, 30]}], [{"a": [30, 30]}], "x"):
            with self.assertRaises(ValueError):
                compile_project(project(angleGuides=bad))
        for key, value in (("densityTrigger", .05), ("densityTrigger", 1.5), ("rowShortening", 1)):
            with self.assertRaises(ValueError):
                compile_project(project(angleGuides=FAN, **{key: value}))

    def test_streamlines_follow_guides_as_a_flow_field(self):
        field = sweep.guide_field([{"a": [30, 50], "b": [70, 50]}])
        self.assertAlmostEqual(field([50, 50.5])[0], 1, places=6)
        reverse = sweep.guide_field([{"a": [70, 50], "b": [30, 50]}])
        self.assertAlmostEqual(reverse([50, 52])[0], -1, places=6)
        crossed = sweep.guide_field([{"a": [30, 30], "b": [30, 70]}, {"a": [70, 30], "b": [70, 70]}])
        self.assertAlmostEqual(crossed([31, 50])[1], 1, places=3)
        plain = compile_project(project(fillPattern="streamlines", angle=0))
        guided = compile_project(project(fillPattern="streamlines", angle=0, angleGuides=[{"a": [30, 35], "b": [60, 55]}]))
        self.assertNotEqual(plain["pes"], guided["pes"])
        self.assertEqual(guided["warnings"], [])

    def test_demo_bear_with_a_gentle_sweep_is_quiet(self):
        p = node("demo", None)
        guide = lambda c, a: {"a": [c[0]-8*math.cos(math.radians(a)), c[1]-8*math.sin(math.radians(a))], "b": [c[0]+8*math.cos(math.radians(a)), c[1]+8*math.sin(math.radians(a))]}
        # The face's rows turn 20 degrees from the forehead to the chin.
        p["objects"][0]["angleGuides"] = [guide([50, 30], 20), guide([50, 65], 40)]
        self.assertEqual(compile_project(p)["warnings"], [])
        p["objects"][0]["fillPattern"] = "tatami"
        self.assertEqual(compile_project(p)["warnings"], [])


if __name__ == "__main__":
    unittest.main()
