import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {threadShades,threadStyle,sheenSegment,fabricLooks,luminance,rgb,threadWidth}=load('thread');
const {fabrics}=load('project');

test('Thread shades: darker edge, lighter sheen, valid hex for any thread',()=>{
  assert.deepEqual(rgb('#fa0'),[255,170,0]);assert.deepEqual(rgb('#123456'),[18,52,86]);
  for(const c of ['#000000','#ffffff','#c4453a','#2f6fd6','#f6d7a7','#5a3e2b']){
    const s=threadShades(c);for(const v of Object.values(s))assert.match(v,/^#[0-9a-f]{6}$/);
    assert.equal(s.body,c);assert.ok(luminance(s.edge)<luminance(c)||luminance(c)===0,c);
    assert.ok(luminance(s.sheen)>luminance(c)||luminance(c)===1,c);
  }
  assert.ok(luminance(threadShades('#000000').sheen)>.05,'black thread still shows a sheen');
  assert.ok(luminance(threadShades('#ffffff').edge)<.75,'white thread still shows its edges');
});

test('Thread style: 0.4 mm at true scale, readable when zoomed out, more detail when zoomed in',()=>{
  assert.equal(threadWidth,.4);
  const far=threadStyle(1),mid=threadStyle(5),near=threadStyle(40);
  assert.equal(far.detail,0);assert.equal(mid.detail,1);assert.equal(near.detail,2);
  assert.ok(Math.abs(mid.width-.4)<1e-9&&Math.abs(near.width-.4)<1e-9);
  assert.ok(Math.abs(far.width-.7)<1e-9,'at least 0.7 px wide');
  for(const s of [far,mid,near]){assert.ok(s.body<s.width&&s.sheen<s.body);assert.ok(s.shadow[1]*[1,5,40][[far,mid,near].indexOf(s)]>=.6-1e-9,'shadow at least 0.6 px');}
  assert.ok(near.shadow[1]>=.06&&near.shadow[1]<.1,'shadow is about a fifth of the thread at high zoom');
});

test('Sheen: on the lit side, inset from both needle holes, absent on knots',()=>{
  const [x0,y0,x1,y1]=sheenSegment(0,0,4,0,.4);
  assert.ok(y0<0&&y1<0,'horizontal stitch: sheen above (light from the top left)');
  assert.ok(x0>0&&x1<4&&Math.abs(x0-.22)<1e-9&&Math.abs(4-x1-.22)<1e-9);
  const back=sheenSegment(4,0,0,0,.4);assert.ok(back[1]<0,'direction does not flip the lit side');
  const v=sheenSegment(0,0,0,3,.4);assert.ok(v[0]<0,'vertical stitch: sheen on the left');
  assert.equal(sheenSegment(1,1,1.2,1,.4),null);assert.equal(sheenSegment(1,1,1,1,.4),null);
  const short=sheenSegment(0,0,.5,0,.4);assert.ok(short[2]-short[0]>.15&&short[0]>0);
});

test('Fabric looks: every profile, light enough for thread, knit/terry/fleece distinct',()=>{
  assert.deepEqual(Object.keys(fabricLooks).sort(),Object.keys(fabrics).sort());
  for(const [k,f] of Object.entries(fabricLooks)){
    assert.match(f.base,/^#[0-9a-f]{6}$/);assert.ok(luminance(f.base)>.5,k);assert.ok(luminance(f.yarn)<luminance(f.base),k);
    assert.ok(f.period>=.3&&f.period<=4,k);
  }
  const p=['jersey','terry','fleece'].map(k=>fabricLooks[k].pattern);assert.equal(new Set(p).size,3);
  assert.equal(fabricLooks.jersey.pattern,'knit');assert.equal(fabricLooks.terry.pattern,'terry');assert.equal(fabricLooks.fleece.pattern,'fleece');
  assert.notEqual(fabricLooks.jersey.base,fabricLooks.fleece.base);
});

test('Stitch batches: crossing stitches start a new batch so later thread lies on top',()=>{
  const {crosses,stitchBatch}=load('thread');
  assert.ok(crosses(0,0,2,2,0,2,2,0));assert.ok(!crosses(0,0,2,0,2,0,2,2),'shared needle hole');
  assert.ok(!crosses(0,0,2,0,0,.4,2,.4),'parallel satin bites');assert.ok(!crosses(0,0,1,0,2,-1,2,1),'apart');
  const b=stitchBatch();
  // Centre walk along y=1, then satin bites across it.
  assert.ok(b.add(0,1,3,1));assert.ok(b.add(3,1,6,1));
  assert.equal(b.add(.5,0,.5,2),false,'a bite over the walk must wait for a new batch');
  b.clear();assert.ok(b.add(.5,0,.5,2));assert.ok(b.add(.5,2,.9,0),'zigzag bites share a hole');assert.ok(b.add(.9,0,1.3,2));
  assert.equal(b.segs.length,12);
  const full=stitchBatch(2);assert.ok(full.add(0,0,1,0)&&full.add(1,0,2,0));assert.equal(full.add(2,0,3,0),false,'size limit');
});

test('Batch breaks: cached per design, new batch on colour change and on crossing',()=>{
  const {batchBreaks}=load('thread');
  const st=(fromX,fromY,x,y,block=0,type='stitch')=>({type,fromX,fromY,x,y,block});
  const cmds=[st(0,1,3,1),st(3,1,6,1),st(6,1,.5,0,0,'jump'),st(.5,0,.5,2),st(.5,2,.9,0),st(.9,0,.9,2,1)];
  const b=batchBreaks(cmds);assert.deepEqual([...b],[1,0,0,1,0,1]);assert.equal(batchBreaks(cmds),b);
});
