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

const {frameQueue}=load('drag');
const {keyBurst}=load('drag');
test('Nudge bursts coalesce taps and a long held key, splitting after a pause or selection change',()=>{
  const b=keyBurst();assert.equal(b.step('a',0),false);assert.equal(b.step('a',200),true);
  assert.equal(b.step('a',1800,true),true);assert.equal(b.step('a',1850,true),true);
  assert.equal(b.step('a',2400),false);assert.equal(b.step('b',2450,true),false);
  b.clear();assert.equal(b.step('b',2500),false);
});
function scheduler(){let id=0;const frames=new Map();return {frames,request:fn=>{frames.set(++id,fn);return id;},cancel:n=>frames.delete(n),tick(){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());}};}
test('Moves coalesce per animation frame and the final pending move flushes into one undo step',()=>{
  const s=scheduler(),q=frameQueue(s.request,s.cancel),h=dragHistory(),a={n:0};let current=a,updates=0;
  h.begin(a);
  const move=n=>q.push(()=>{current={n};updates++;h.update(current);});
  move(1);move(2);move(3);assert.equal(s.frames.size,1);assert.equal(updates,0);
  s.tick();assert.equal(updates,1);assert.deepEqual(current,{n:3});
  move(4);q.flush();assert.equal(updates,2);assert.deepEqual(current,{n:4});assert.equal(s.frames.size,0);
  assert.equal(h.end(),a);q.flush();assert.equal(h.end(),null);assert.equal(updates,2);
});
test('Cancelling or unmounting drops queued work; flushing a click adds no undo step',()=>{
  const s=scheduler(),q=frameQueue(s.request,s.cancel),h=dragHistory(),a={n:0};let current=a;
  h.begin(a);q.flush();assert.equal(h.end(),null);
  h.begin(a);q.push(()=>{current={n:1};h.update(current);});q.cancel();current=h.cancel();s.tick();assert.equal(current,a);assert.equal(h.end(),null);
  q.push(()=>assert.fail('unmounted update'));q.cancel();q.cancel();s.tick();assert.equal(s.frames.size,0);
});
