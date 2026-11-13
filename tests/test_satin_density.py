import copy
import math
import unittest

from embroidery import compiler as C
from tests.test_compiler import project


class SatinDensityTests(unittest.TestCase):
    def assert_rail_pitch(self, path, spacing, horizontal=True):
        along = 0 if horizontal else 1
        # Alternating needle penetrations return to the same rail every two points.
        gaps = [abs(b[along]-a[along]) for rail in (path[::2], path[1::2])
                for a, b in zip(rail, rail[1:])]
        self.assertGreater(len(gaps), 20)
        for gap in gaps[:-2]:
            self.assertAlmostEqual(gap, spacing, delta=.015)

    def test_lines_blocks_and_native_letters_use_the_same_rail_pitch(self):
        for spacing in (.32, .4, .5):
            with self.subTest(spacing=spacing):
                line = C.satin_path([[20, 30], [60, 30]], spacing, 4)
                block = C.block_path([[20, 28], [60, 28]], [[20, 32], [60, 32]], spacing)
                self.assert_rail_pitch(line, spacing)
                self.assert_rail_pitch(block, spacing)
                self.assertEqual(len(line), len(block))
                # Test the actual quantized machine output, including lettering's planner.
                base = project('satin', [[[20, 30], [60, 30]]], satinWidth=4,
                               spacing=spacing, tieIn='none', tieOff='none', shortStitches=False)
                letter = copy.deepcopy(base)
                letter['objects'][0].update(kind='satin-block', satinColumns=[{
                    'character': 0, 'railPaths': [[[20, 28], [60, 28]], [[20, 32], [60, 32]]]}])
                a, b = C.compile_project(base), C.compile_project(letter)
                self.assertEqual(a['pes'], b['pes'])
                rail = sorted({c['x'] for c in a['commands'] if c['type'] == 'stitch' and c['y'] == 28})
                self.assertAlmostEqual((rail[-1]-rail[0])/(len(rail)-1), spacing, delta=.003)

    def test_sparse_zigzag_e_stitch_and_foundations_keep_their_advance(self):
        line = [[20, 30], [60, 30]]
        for style in ('zigzag', 'e-stitch'):
            points = C.satin_path(line, 1.5, 4, style)
            if style == 'e-stitch':
                points = points[::3]
            for a, b in zip(points, points[1:-1]):
                self.assertAlmostEqual(b[0]-a[0], 1.5)
        obj = project('satin', [line], satinWidth=4, spacing=.4, underlay='zigzag')['objects'][0]
        self.assertEqual(C.line_passes(obj, line)[0][0], C.satin_path(line, 2, 3.5, 'zigzag'))
        obj.update(kind='satin-block', railPaths=[[[20, 28], [60, 28]], [[20, 32], [60, 32]]])
        self.assertEqual(C.block_passes(obj, line)[0][0], C.block_path(
            [[20, 28.25], [60, 28.25]], [[20, 31.75], [60, 31.75]], 2, style='zigzag'))

    def test_satin_fills_with_and_without_guides_follow_the_same_pitch(self):
        p = project(rings=[[[20, 20], [26, 20], [26, 40], [20, 40]]],
                    fillPattern='sweepSatin', angle=0, spacing=.4, shortStitches=False)
        for extra in ({}, {'followStroke': True}, {'angleGuides': [
                {'a': [20, 23], 'b': [26, 23]}, {'a': [20, 37], 'b': [26, 37]}]}):
            with self.subTest(extra=extra):
                obj = {**p['objects'][0], **extra}
                plan = C.plan_object(obj, None, None)
                cover = max((path for run in plan for path, _ in run), key=len)
                self.assert_rail_pitch(cover, .4, horizontal=False)

    def test_single_satin_column_has_coverage_without_density_failures(self):
        r = C.compile_project(project('satin', [[[20, 30], [60, 30]]], satinWidth=4,
                                      spacing=.4, underlay='edge-zigzag'))
        self.assertFalse([w for w in r['warnings'] if w['severity'] == 'fail'])
        self.assertGreater(r['stats']['stitches'], 200)
        self.assertLessEqual(r['stats']['maxStitch'], math.hypot(4, .2)+.15)
