import base64
import copy
import hashlib
import io
import unittest
from pystitch import read_pes
from embroidery.compiler import compile_project
from embroidery.threads import BROTHER, LABELS, valid_thread
from test_compiler import project


class ThreadTests(unittest.TestCase):
    def test_metadata_survives_real_pes_write_and_read(self):
        code, (name, color) = '155', BROTHER['155']
        p = project(color=color, thread={'brand': 'brother', 'code': code, 'name': name})
        result = compile_project(p)
        decoded = read_pes(io.BytesIO(base64.b64decode(result['pes'])))
        actual = decoded.threadlist[0]
        self.assertEqual((actual.brand, actual.chart, actual.catalog_number, actual.description), ('Brother Embroidery', 'Brother Embroidery', code, name))
        self.assertEqual(result['threads'][0]['thread'], p['objects'][0]['thread'])
        # A custom first object in the same RGB block must not swallow catalogue metadata.
        p['objects'].insert(0, {**copy.deepcopy(p['objects'][0]), 'name': 'Custom'})
        del p['objects'][0]['thread']
        result = compile_project(p)
        self.assertEqual(result['stats']['colorChanges'], 0)
        self.assertEqual(result['threads'][0]['thread']['code'], code)

    def test_other_brands_round_trip_through_pes(self):
        thread = {'brand': 'madeira-rayon', 'code': '1147', 'name': ''}
        result = compile_project(project(color='#123456', thread=thread))
        self.assertEqual(result['threads'][0]['thread'], thread)
        self.assertEqual(LABELS['madeira-rayon'], 'Madeira Rayon')

    def test_unset_metadata_keeps_legacy_pes_bytes(self):
        data = base64.b64decode(compile_project(project())['pes'])
        self.assertEqual(hashlib.sha256(data).hexdigest(), '919979d842b4a22d2cef4b693536a90482ee02f24873008e956c47547e466c33')

    def test_invalid_thread_is_rejected(self):
        name, color = BROTHER['155']
        self.assertTrue(valid_thread({'brand': 'brother', 'code': '155', 'name': name}, color))
        for thread in (None, {}, {'brand': 'brother', 'code': [], 'name': name}, {'brand': 'other', 'code': '155', 'name': name},
                       {'brand': 'brother', 'code': '155', 'name': 'Wrong'}, {'brand': 'brother', 'code': '999', 'name': name}, {'brand': 'madeira-rayon', 'code': '', 'name': ''}):
            with self.subTest(thread=thread), self.assertRaisesRegex(ValueError, 'valid catalogue thread'):
                compile_project(project(thread=thread))
        with self.assertRaisesRegex(ValueError, 'valid catalogue thread'):
            compile_project(project(color='#123456', thread={'brand': 'brother', 'code': '155', 'name': name}))


if __name__ == '__main__':
    unittest.main()
