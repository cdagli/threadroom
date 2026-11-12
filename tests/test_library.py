"""Compile the actual catalog after editor insertion, including its smallest hoop."""
import json
import subprocess
import unittest

from embroidery.compiler import compile_project


class LibraryTests(unittest.TestCase):
    def test_catalog_samples_compile_without_failures_or_default_size_advisories(self):
        script = """
import {load} from './tests/load-lib.mjs';
const {libraryAssets}=load('library-assets');
const {insertLibraryAsset}=load('library');
const {blankProject,hoops}=load('project');
const {geometryPayload}=load('curves');
const entries=[];
for(const asset of libraryAssets)for(const hoop of ['100x100','60x40']){
  const h=hoops[hoop];let n=0;
  const result=insertLibraryAsset(blankProject(asset.name.en,hoop),asset,[h.width/2,h.height/2],()=>`copy-${++n}`);
  if(!result)throw new Error(`Could not insert ${asset.id} into ${hoop}`);
  entries.push({id:asset.id,categoryId:asset.categoryId,hoop,project:geometryPayload(result.project)});
}
process.stdout.write(JSON.stringify(entries));
"""
        result = subprocess.run(['node', '--input-type=module', '-e', script], check=True, capture_output=True, text=True)
        for entry in json.loads(result.stdout):
            with self.subTest(asset=entry['id'], hoop=entry['hoop']):
                compiled = compile_project(entry['project'])
                self.assertGreater(compiled['stats']['stitches'], 0)
                self.assertTrue(compiled['pes'])
                warnings = compiled.get('warnings', [])
                self.assertFalse([w for w in warnings if w.get('severity') == 'fail'], warnings)
                if entry['hoop'] == '100x100' and entry['categoryId'] != 'basic-shapes':
                    self.assertEqual(warnings, [])
