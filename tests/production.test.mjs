import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {estimatedSeconds,sewingSpeed,threadSequence,stitchBounds}=load('production');
const {demo}=load('project');
test('Time includes every exported stitch, colour change and trim at the saved speed',()=>{
  const p=demo(),stats={stitches:6500,colorChanges:2,trims:10};assert.equal(sewingSpeed(p),650);
  assert.equal(estimatedSeconds(stats),690);assert.equal(estimatedSeconds(stats,1000),480);
  assert.equal(estimatedSeconds(stats,2000),480);assert.equal(estimatedSeconds(stats,NaN),690);
  assert.equal(sewingSpeed({...p,sewingSpeed:900}),900);assert.equal(estimatedSeconds({stitches:0,colorChanges:0,trims:0}),0);
});
test('Worksheet rows follow exported blocks including repeated colours, hidden objects, borders and ties',()=>{
  const p=demo();p.objects[0].hidden=true;
  const command=(block,id,extra={})=>({type:'stitch',block,objectId:id,x:31,y:42,fromX:30,fromY:40,...extra});
  const compiled={threads:[{color:'#111111',name:'one'},{color:'#222222',name:'two'},{color:'#111111',name:'one again'}],commands:[command(0,p.objects[0].id),command(0,p.objects[0].id),command(1,p.objects[1].id,{type:'jump'}),command(1,`${p.objects[1].id}-border`),command(2,p.objects[2].id)]};
  const rows=threadSequence(compiled,p);assert.deepEqual(rows.map(r=>r.stitches),[2,1,1]);assert.deepEqual(rows.map(r=>r.color),['#111111','#222222','#111111']);
  assert.deepEqual([...rows[0].objects],[p.objects[0].name]);assert.deepEqual([...rows[1].objects],[p.objects[1].name]);assert.equal(stitchBounds(compiled),'28 38 5 6');
  assert.equal(rows.reduce((s,r)=>s+r.stitches,0),compiled.commands.filter(c=>c.type==='stitch').length);
  assert.equal(stitchBounds({commands:[]}),'0 0 100 100');
});
