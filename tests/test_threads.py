import base64
import copy
import hashlib
import io
import json
from pathlib import Path
import unittest
from pystitch import read_pes
from pystitch.EmbThreadPec import get_thread_set
from embroidery.compiler import compile_project
from embroidery.threads import THREADS, delta_e_2000, nearest_brother, rgb_to_lab
from test_compiler import project


class ThreadTests(unittest.TestCase):
    def test_ciede2000_reference_pairs(self):
        for a, b, expected in json.loads(Path('tests/ciede2000-pairs.json').read_text())["pairs"]:
            self.assertAlmostEqual(delta_e_2000(a, b), expected, delta=.00005)
            self.assertAlmostEqual(delta_e_2000(b, a), expected, delta=.00005)
            self.assertEqual(delta_e_2000(a, a), 0)
        self.assertEqual(rgb_to_lab('#000000'), (0, 0, 0))

    def test_catalogue_is_the_installed_pystitch_pec_table(self):
        actual = [t for t in get_thread_set() if t]
        self.assertEqual(len(THREADS), 64)
        for t, source in zip(THREADS, actual):
            self.assertEqual((t['code'], t['name'], t['color']), (source.catalog_number, source.description, source.hex_color()))
            self.assertEqual(nearest_brother(t['color']), t)

    def test_metadata_survives_real_pes_write_and_read(self):
        t = THREADS[42]
        p = project(color=t['color'], thread={'brand': 'brother', 'code': t['code'], 'name': t['name']})
        result = compile_project(p)
        decoded = read_pes(io.BytesIO(base64.b64decode(result['pes'])))
        actual = decoded.threadlist[0]
        self.assertEqual((actual.brand, actual.chart, actual.catalog_number, actual.description), ('Brother', 'Brother', t['code'], t['name']))
        self.assertEqual(result['threads'][0]['thread'], p['objects'][0]['thread'])
        # A custom first object in the same RGB block must not swallow catalogue metadata.
        p['objects'].insert(0, {**copy.deepcopy(p['objects'][0]), 'name': 'Custom', 'thread': None})
        del p['objects'][0]['thread']
        result = compile_project(p)
        self.assertEqual(result['stats']['colorChanges'], 0)
        self.assertEqual(result['threads'][0]['thread']['code'], t['code'])

    def test_unset_metadata_keeps_legacy_pes_bytes(self):
        data = base64.b64decode(compile_project(project())['pes'])
        self.assertEqual(hashlib.sha256(data).hexdigest(), '919979d842b4a22d2cef4b693536a90482ee02f24873008e956c47547e466c33')

    def test_invalid_thread_is_rejected(self):
        for thread in (None, {}, {'brand': 'brother', 'code': [], 'name': 'Pink'}, {'brand': 'other', 'code': '43', 'name': 'Pink'}, {'brand': 'brother', 'code': '43', 'name': 'Wrong'}, {'brand': 'brother', 'code': '43', 'name': 'Pink'}):
            with self.subTest(thread=thread), self.assertRaisesRegex(ValueError, 'valid Brother PEC'):
                compile_project(project(thread=thread))
