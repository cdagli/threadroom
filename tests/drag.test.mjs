import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {dragHistory}=load('drag');

test('Each drag yields exactly one undo step, even when pointer-up is lost',()=>{
  const h=dragHistory(),a={n:0},b={n:1},c={n:2},d={n:3};
  h.begin(a);h.update(b);h.update(c);
  assert.equal(h.end(),a);assert.equal(h.end(),null);assert.equal(h.active,false); // pointer-up, then lost capture / window pointer-up
  h.begin(c);assert.equal(h.end(),null); // a click without movement adds nothing
  h.begin(c);h.update(d);
  // Pointer-up lost: the next drag's start ends the previous one first.
  assert.equal(h.end(),c);h.begin(d);h.update(a);assert.equal(h.end(),d);
  h.begin(a);h.update(b);assert.equal(h.cancel(),a);assert.equal(h.end(),null); // cancel restores, no step
  h.update(c);assert.equal(h.end(),null); // moves after the drag ended are ignored
});
