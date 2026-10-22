import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import parser from '../lib/pes-parser.js';

test('Independent browser parser agrees with Python export and custom colours',()=>{
  const expected=JSON.parse(readFileSync(new URL('./generated.json',import.meta.url)));
  const actual=parser.parse(readFileSync(new URL('./generated.pes',import.meta.url)));
  assert.equal(actual.signature,'#PES0060');
  assert.equal(actual.stitches,expected.stats.stitches);
  assert.equal(actual.blocks[0].color,'#c99d72');
  assert.ok(Math.abs(actual.width-expected.stats.width)<0.11);
  assert.ok(actual.commands.filter(c=>c.type==='stitch').every(c=>Math.hypot(c.x-c.fromX,c.y-c.fromY)<=3.15));
});

test('Every stitch style survives export and independent PES decoding',()=>{
  const expected=JSON.parse(readFileSync(new URL('./stitch-library.json',import.meta.url)));
  const actual=parser.parse(readFileSync(new URL('./stitch-library.pes',import.meta.url)));
  assert.equal(actual.signature,'#PES0060');
  assert.equal(actual.stitches,expected.stats.stitches);
  assert.deepEqual(actual.blocks.map(b=>b.color),['#c99d72','#849984']);
  assert.ok(Math.abs(actual.width-expected.stats.width)<.11);
  assert.ok(Math.abs(actual.height-expected.stats.height)<.11);
  assert.ok(actual.commands.filter(c=>c.type==='stitch').every(c=>Math.hypot(c.x-c.fromX,c.y-c.fromY)<=3.15));
});

test('Every non-row fill and cross style survives independent PES decoding within the machine limit',async()=>{
  const {spawnSync}=await import('node:child_process'),{existsSync}=await import('node:fs');
  const python=process.env.THREADROOM_PYTHON||(existsSync('.venv/bin/python')?'.venv/bin/python':'python3');
  const result=spawnSync(python,['-c',`import json
from tests.test_compiler import project,compile_project
cases=[{'fillPattern':p,'spacing':.32 if p=='sweepSatin' else .45,'fillLength':6,'angle':37} for p in ('sweepSatin','circular','streamlines')]
cases += [{'fillPattern':'crossStitchFill','crossStyle':s,'crossSize':12,'threadCount':4,'dense':True,'fillLength':6,'angle':37} for s in ('cross','upright','double','smyrna','half')]
print(json.dumps([compile_project(project(**c)) for c in cases]))`],{encoding:'utf8',maxBuffer:32*1024*1024});
  assert.equal(result.status,0,result.stderr);
  for(const expected of JSON.parse(result.stdout)){
    const actual=parser.parse(Buffer.from(expected.pes,'base64'));
    assert.equal(actual.signature,'#PES0060');assert.equal(actual.stitches,expected.stats.stitches);
    assert.equal(actual.blocks[0].color,'#c99d72');
    assert.ok(actual.commands.filter(c=>c.type==='stitch').every(c=>Math.hypot(c.x-c.fromX,c.y-c.fromY)<=12.7));
    assert.ok(Math.abs(actual.width-expected.stats.width)<.11);
  }
});
