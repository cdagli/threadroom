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
