import copy
import unittest
from embroidery.compiler import covered_column_travel, compile_project, validate


def lettering():
    left, right = [[20, 39.5], [20, 45.5]], [[21, 39.5], [21, 45.5]]
    return {'version': 1, 'name': 'Lettering', 'machine': 'brother-pr1x', 'hoop': '100x100', 'trimJump': 3,
            'objects': [{'id': 'text', 'name': 'I', 'kind': 'satin-block', 'color': '#c99d72',
                         'rings': [[[20.5, 39.5], [20.5, 45.5]]],
                         'satinColumns': [{'character': 0, 'railPaths': [left, right]}],
                         'spacing': .4, 'underlay': 'center', 'pullCompensation': .2,
                         'splitLength': 7, 'shortStitches': True, 'length': 1.5,
                         'tieIn': 'tack', 'tieOff': 'tack', 'lockSize': 1}]}


class SatinLetteringTests(unittest.TestCase):
    def test_hidden_travel_stays_on_connected_sewn_columns(self):
        covered = [[[20, 40], [20, 41], [20, 42], [20, 43], [20, 44]],
                   [[20, 42], [21, 42], [22, 42]]]
        path = covered_column_travel([20.5, 44], [22, 42], covered, 1)
        self.assertIsNotNone(path)
        self.assertEqual(path[0], [20.5, 44])
        self.assertEqual(path[-1], [22, 42])
        self.assertTrue(all(min(abs(x-20), abs(y-42)) <= .5 for x, y in path))
        self.assertIsNone(covered_column_travel([20, 44], [25, 42], covered, 1))
        self.assertIsNone(covered_column_travel([20, 44], [22, 42], [], 1))

    def test_touching_strokes_sew_without_trims_and_dots_follow_their_letter(self):
        def column(character, a, b, w=1):
            dx, dy = b[0]-a[0], b[1]-a[1]
            d = (dx*dx+dy*dy)**.5
            n = [-dy/d*w/2, dx/d*w/2]
            return {'character': character, 'railPaths': [[[a[0]+n[0], a[1]+n[1]], [b[0]+n[0], b[1]+n[1]]], [[a[0]-n[0], a[1]-n[1]], [b[0]-n[0], b[1]-n[1]]]]}, [a, b]
        # An "A" drawn leg, crossbar, leg (the crossbar first meets a leg mid-way), an "i"
        # whose dot is drawn before its stem, and a separate "l".
        parts = [column(0, [20, 50], [23, 40]), column(0, [21.2, 46], [24.8, 46]), column(0, [26, 50], [23, 40]),
                 column(1, [30, 40.5], [30, 41.5]), column(1, [30, 43], [30, 50]), column(2, [34, 40], [34, 50])]
        p = lettering()
        p['objects'][0].update(satinColumns=[c for c, _ in parts], rings=[r for _, r in parts])
        out = compile_project(p)
        self.assertEqual(out['warnings'], [])
        # Four separate parts (the "A", the dot, the stem, the "l"): three trims, none inside the "A".
        self.assertEqual(out['stats']['trims'], 3)
        order = [c['x'] for c in out['commands'] if c['type'] == 'stitch']
        dot = next(i for i, c in enumerate(out['commands']) if c['type'] == 'stitch' and 40.4 < c['y'] < 41.6 and 29 < c['x'] < 31)
        self.assertTrue(all(x < 33 for x in order[:dot]), 'the dot is sewn before the next letter')

    def test_columns_validate_and_keep_the_live_owner(self):
        p = lettering()
        validate(p)
        out = compile_project(p)
        self.assertEqual(out['warnings'], [])
        self.assertTrue(all(c['objectId'] == 'text' for c in out['commands']))
        self.assertEqual(out['pes'], compile_project(p)['pes'])

    def test_invalid_columns_are_rejected_before_sewing(self):
        for columns in [None, [], [{}], [{'character': True, 'railPaths': [[[1, 2], [1, 3]], [[2, 2], [2, 3]]]}],
                        [{'character': -1, 'railPaths': []}], [{'character': 301, 'railPaths': []}],
                        [{'character': 0, 'railPaths': [[[20, 40]], [[21, 40]]]}],
                        [{'character': 0, 'railPaths': [[[20, 40], [20, 45]], [[21, 40]]]}]]:
            with self.subTest(columns=columns):
                p = lettering()
                p['objects'][0]['satinColumns'] = columns
                with self.assertRaises(ValueError):
                    validate(p)
        p = lettering()
        p['objects'][0]['satinColumns'][0]['railPaths'][0][0][0] = float('nan')
        with self.assertRaises(ValueError):
            validate(p)
        p = lettering()
        p['objects'][0]['rings'][0][0] = [70, 70]
        with self.assertRaises(ValueError):
            validate(p)
        p = lettering()
        block = copy.deepcopy(p['objects'][0]['satinColumns'][0])
        p['objects'][0]['rings'] *= 2
        p['objects'][0]['satinColumns'] = [{**block, 'character': 1}, block]
        with self.assertRaises(ValueError):
            validate(p)
