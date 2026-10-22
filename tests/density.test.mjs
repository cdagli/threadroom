import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {needleDensity,stitchLengths}=load('density');
const stitch=(x,y,fromX=x,fromY=y)=>({type:'stitch',x,y,fromX,fromY,block:0});
test('density counts stitch destinations, including stationary needles, but excludes jumps',()=>{
  const commands=[stitch(0,0),stitch(0,0),{...stitch(0,0),type:'jump'}],d=needleDensity(commands);assert.equal(d.penetrations,2);assert.equal(d.radius,1.5);assert.ok(Math.abs(d.max-2/(Math.PI*1.5**2))<1e-6);
});
test('every density cell equals brute-force disk counting in millimetres',()=>{
  const commands=[stitch(-2,1),stitch(0,0),stitch(1,1),stitch(1.5,1),stitch(5,4)],r=1.5,d=needleDensity(commands,r);
  for(let y=0;y<d.height;y++)for(let x=0;x<d.width;x++){
    const px=d.x+(x+.5)*d.cell,py=d.y+(y+.5)*d.cell,n=commands.filter(c=>(px-c.x)**2+(py-c.y)**2<=r*r+1e-10).length;assert.ok(Math.abs(d.values[y*d.width+x]-n/(Math.PI*r*r))<1e-6);
  }
});
test('density respects radius, translations and bounded grids for large designs',()=>{
  const commands=Array.from({length:1000},()=>stitch(50,50)),a=needleDensity(commands,.5),b=needleDensity(commands,1.5);assert.ok(Math.abs(a.max/b.max-9)<1e-5);
  const c=needleDensity(commands.map(c=>({...c,x:c.x-80,y:c.y+20})),1.5);assert.deepEqual(c.values,b.values);assert.equal(c.x,b.x-80);assert.equal(c.y,b.y+20);
  const big=needleDensity([stitch(-1000,-1000),stitch(1000,1000)]);assert.ok(big.values.length<=1024*1024);
});
test('histogram has explicit half-open bins and short threshold excludes equality',()=>{
  const commands=[0,.1,.3,.5,1,2,3,5,7,12].map(n=>stitch(n,0,0,0));commands.push({...stitch(100,0),type:'jump'});
  const h=stitchLengths(commands);assert.deepEqual(h.bins,[2,1,1,1,1,1,1,2]);assert.equal(h.short,2);assert.equal(h.stationary,1);assert.equal(h.longest,12);assert.equal(h.count,10);assert.equal(h.bins.reduce((a,b)=>a+b),10);assert.equal(stitchLengths(commands,1).short,4);
});
test('empty and malformed commands are stable, invalid parameters are rejected',()=>{
  assert.equal(needleDensity([]).max,0);assert.equal(needleDensity([]).values.length,0);assert.equal(stitchLengths([]).mean,0);assert.equal(needleDensity([stitch(NaN,0)]).penetrations,0);
  for(const radius of [0,NaN,Infinity,11])assert.throws(()=>needleDensity([],radius),RangeError);
  for(const threshold of [0,NaN,3])assert.throws(()=>stitchLengths([],threshold),RangeError);
});
