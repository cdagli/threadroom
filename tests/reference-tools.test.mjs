import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {traceMask,traceOutline,sampleColors,referenceMapping}=load('reference-tools');
const {ringArea,simplifyRing}=load('click-to-stitch');
const {imageToWorld}=load('images');
const mask=rows=>({data:Uint8Array.from(rows.join(''),c=>c==='#'?1:0),width:rows[0].length,height:rows.length});
const trace=(rows,opts)=>{const m=mask(rows);return traceMask(m.data,m.width,m.height,opts);};
const pixels=rows=>{const m=mask(rows),data=new Uint8ClampedArray(m.width*m.height*4);m.data.forEach((v,k)=>data.set([10,85,163,v?255:0],k*4));return {width:m.width,height:m.height,data};};
const image={id:'ref',src:'',name:'test',x:10,y:20,width:4,height:3,opacity:0};

test('Masks select the largest four-connected component and preserve all when requested',()=>{
  const rows=['##....#','##.....','.......'];
  const large=trace(rows,{simplify:0});assert.equal(large.rings.length,1);assert.equal(large.area,4);assert.deepEqual(large.bounds,[0,0,2,2]);assert.equal(large.rings[0].length,4);
  const all=trace(rows,{largestOnly:false});assert.equal(all.rings.length,2);assert.equal(all.area,5);assert.deepEqual(all.ringTypes,['outer','outer']);
  assert.equal(trace(['#.', '.#'],{largestOnly:false}).rings.length,2,'diagonal cells do not join');
  assert.deepEqual(trace(['..']).rings,[]);assert.equal(trace(['..']).bounds,null);
});
test('Hole rings are marked and winding is preserved',()=>{
  const rows=['#####','#...#','#...#','#####'];
  const r=trace(rows,{holes:true,simplify:0});assert.deepEqual(r.ringTypes,['outer','hole']);assert.equal(r.area,14);
  assert.ok(ringArea(r.rings[0])>0);assert.ok(ringArea(r.rings[1])<0);assert.equal(trace(rows).rings.length,1);
});
test('Closed-ring DP preserves the closing arc, tolerates zero epsilon and never collapses to a line',()=>{
  const ring=[[0,0],[1,0],[2,0],[2,1],[2,2],[1,2],[0,2],[0,1]];
  assert.equal(simplifyRing(ring,0).length,4);assert.equal(ringArea(simplifyRing(ring,.3)),4);
  const coarse=trace(['##','##'],{simplify:100}).rings[0];assert.ok(coarse.length>=3);assert.ok(Math.abs(ringArea(coarse))>0);
  const r=trace(['#####','#####','##...','#####'],{simplify:0,maxPoints:4});assert.ok(r.pointCounts[0]<=4);assert.ok(r.pointCounts[0]>=3);
  assert.throws(()=>trace(['#.#.#'],{largestOnly:false,maxPoints:3}),/maxPoints/);
});
test('Outline transforms rotation, clips the hoop, rounds mm, and ignores display opacity',()=>{
  const px=pixels(['####','####','####']),rotated={...image,rotation:90};
  const r=traceOutline(px,rotated,{width:100,height:100},{resolution:.1,simplify:0});
  assert.equal(r.area,12);assert.deepEqual(r.bounds,[10.5,19.5,13.5,23.5]);
  const clipped=traceOutline(px,{...image,x:-2.03,y:-1.01},{width:100,height:100},{resolution:.1,simplify:0});
  for(const p of clipped.rings.flat())for(const n of p){assert.ok(n>=0&&n<=100);assert.ok(Math.abs(n*100-Math.round(n*100))<1e-8);}
  assert.deepEqual(traceOutline(px,{...image,x:-50},{width:100,height:100}).rings,[]);
});
test('Colour flood requires a seed and uses the stitch-region tolerance',()=>{
  const px=pixels(['####','####','####']);for(let y=0;y<3;y++)for(let x=2;x<4;x++)px.data.set([220,0,0,255],(y*4+x)*4);
  assert.throws(()=>traceOutline(px,image,{width:100,height:100},{mode:'colour'}),/point/);
  const r=traceOutline(px,image,{width:100,height:100},{mode:'colour',point:[10.5,20.5],tolerance:1,resolution:.25});
  assert.deepEqual(r.bounds,[10,20,12,23]);assert.equal(r.area,6);
  assert.deepEqual(traceOutline(px,image,{width:100,height:100},{mode:'colour',point:[1,1]}).rings,[]);
  px.data.fill(0);assert.deepEqual(traceOutline(px,image,{width:100,height:100}).rings,[]);
  px.data[3]=128;assert.deepEqual(traceOutline(px,image,{width:100,height:100}).rings,[]);
});
test('Sampling returns exact threads, transparent/outside null, rotation and circular alpha-weighted averages',()=>{
  const px=pixels(['####','####','####']);
  const r=sampleColors(px,{...image,rotation:90},[imageToWorld({...image,rotation:90},[.25,.5]),[0,0]],.5);
  assert.equal(r[0].color,'#0a55a3');assert.equal(r[0].nearest.code,'2');assert.equal(r[0].nearest.deltaE,0);assert.equal(r[1].color,null);assert.equal(r[1].nearest,null);
  const two={width:2,height:1,data:new Uint8ClampedArray([255,0,0,255,0,0,255,85])};
  assert.equal(sampleColors(two,{...image,width:2,height:1},[[10.5,20.5]],2)[0].color,'#bf0040');
  two.data[3]=0;assert.equal(sampleColors(two,{...image,width:2,height:1},[[10.5,20.5]],2)[0].color,null);
  assert.equal(sampleColors(px,image,[[10.1,20.1]],0)[0].color,'#0a55a3');
});
test('View mapping preserves axes and longest side with useful automatic grids',()=>{
  for(const [span,grid] of [[25,1],[80,5],[81,10]]){
    const m=referenceMapping(image,[0,0,span,span/2],768);assert.equal(m.grid,grid);assert.equal(m.width,768);assert.ok(Math.abs(m.scale*span+2*m.margin-768)<1e-9);
  }
  assert.deepEqual(referenceMapping({...image,rotation:90}).region,[10.5,19.5,13.5,23.5]);
  assert.throws(()=>referenceMapping(image,[1,0,0,2]),/positive/);
  assert.throws(()=>referenceMapping(image,[0,0,100,100],768,.01),/grid/);
});
