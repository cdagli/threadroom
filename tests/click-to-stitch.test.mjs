import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {downsample,floodRegion,fillSmallHoles,traceRegion,simplifyRing,ringArea,regionRings,clickToStitch}=load('click-to-stitch');
// Synthetic RGBA buffers: at(x, y) returns [r, g, b, a].
const image=(w,h,at)=>{const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(at(x,y),(y*w+x)*4);return {width:w,height:h,data};};
const red=[220,30,40,255],white=[255,255,255,255];
const inBox=(x,y,x0,y0,x1,y1)=>x>=x0&&x<x1&&y>=y0&&y<y1;
const sorted=r=>[...r].map(p=>p.join(',')).sort();

test('A clicked block becomes one ring at its pixel corners, mapped to millimetres',()=>{
  const px=image(20,20,(x,y)=>inBox(x,y,5,5,15,15)?red:white),region=floodRegion(px,8,9,10);
  assert.equal(region.count,100);assert.deepEqual(region.box,[5,5,14,14]);assert.equal(region.color,'#dc1e28');
  const rings=traceRegion(region);assert.equal(rings.length,1);
  assert.deepEqual(sorted(rings[0]),sorted([[5,5],[15,5],[15,15],[5,15]]));assert.ok(ringArea(rings[0])>0);
  // Image 40 × 40 mm at (10, 10): 2 mm per working pixel.
  const result=clickToStitch(px,{x:10,y:10,width:40,height:40},[27,27],10);
  assert.deepEqual(sorted(result.rings[0]),sorted([[20,20],[40,20],[40,40],[20,40]]));assert.equal(result.color,'#dc1e28');assert.equal(result.pixels,100);
  // Clicking the white surround selects it, with the red block as its hole.
  const outside=clickToStitch(px,{x:0,y:0,width:20,height:20},[1,1],10);
  assert.equal(outside.rings.length,2);assert.equal(Math.abs(ringArea(outside.rings[0])),400);assert.equal(ringArea(outside.rings[1]),-100);
});

test('Holes keep the opposite orientation; specks below the hole size are filled',()=>{
  const donut=image(16,16,(x,y)=>inBox(x,y,2,2,14,14)&&!inBox(x,y,6,6,10,10)?red:white);
  const rings=regionRings(floodRegion(donut,3,3,10));
  assert.equal(rings.length,2);assert.equal(ringArea(rings[0]),144);assert.equal(ringArea(rings[1]),-16);
  const speck=image(16,16,(x,y)=>x===7&&y===7?white:inBox(x,y,2,2,14,14)?red:white),region=floodRegion(speck,3,3,10);
  assert.equal(region.count,143);assert.equal(fillSmallHoles(region,6),1);assert.equal(region.count,144);assert.equal(traceRegion(region).length,1);
  // A hole that reaches the bounding box edge is part of the outside, not a hole.
  const notch=image(10,10,(x,y)=>inBox(x,y,0,0,10,10)&&!inBox(x,y,4,0,6,3)?red:white),open=floodRegion(notch,1,8,10);
  assert.equal(fillSmallHoles(open,100),0);assert.equal(open.count,94);
});

test('Tolerance bounds the colour distance from the seed, not from neighbours',()=>{
  // A horizontal ramp of 10 grey levels per pixel: a gradient can't leak past the tolerance.
  // Seed at x = 10 (grey 100): 2 % reaches 5 grey levels per channel, 10 % about 25.
  const ramp=image(20,4,x=>[x*10,x*10,x*10,255]);
  assert.deepEqual(floodRegion(ramp,10,1,2).box,[10,0,10,3]);assert.deepEqual(floodRegion(ramp,10,1,10).box,[8,0,12,3]);
  assert.equal(floodRegion(ramp,10,1,100).count,80);
  // Neighbours of another colour don't shift the seed: an edge click still takes its own side.
  const split=image(10,4,x=>x<5?red:white);assert.equal(floodRegion(split,4,1,5).count,20);assert.equal(floodRegion(split,5,1,5).color,'#ffffff');
});

test('Transparent pixels never join and a transparent seed finds nothing',()=>{
  const px=image(10,10,(x,y)=>x<5?red:[220,30,40,40]);
  assert.equal(floodRegion(px,2,2,30).count,50);assert.equal(floodRegion(px,7,2,30),null);
  assert.equal(floodRegion(px,-1,2,30),null);assert.equal(clickToStitch(px,{x:0,y:0,width:10,height:10},[12,2],30),null);
});

test('Diagonal self-contact splits into separate loops instead of crossing',()=>{
  // 1 1 0 / 1 0 1 / 0 1 1: two L shapes touching at two corners.
  const on=new Set(['0,0','1,0','0,1','2,1','1,2','2,2']),mask=new Uint8Array(9);
  for(const key of on){const [x,y]=key.split(',').map(Number);mask[y*3+x]=1;}
  const rings=traceRegion({mask,width:3,height:3,count:6,box:[0,0,2,2],color:'#000000'});
  assert.equal(rings.length,2);assert.deepEqual(rings.map(ringArea),[3,3]);
  // The flood itself is 4-connected, so it stops at the diagonal.
  const px=image(3,3,(x,y)=>on.has(`${x},${y}`)?red:white);assert.equal(floodRegion(px,0,0,5).count,3);
});

test('Simplification straightens pixel staircases and respects the point budget',()=>{
  // A right triangle with a stepped hypotenuse.
  const px=image(40,40,(x,y)=>x<=y?red:white),region=floodRegion(px,0,39,5);
  const raw=traceRegion(region)[0],simple=simplifyRing(raw,.8);
  assert.ok(raw.length>70);assert.ok(simple.length<=5,String(simple.length));assert.ok(Math.abs(ringArea(simple)-ringArea(raw))<40);
  // Speckled noise: many holes, capped by maxPoints.
  let seed=3;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const noisy=image(120,120,(x,y)=>Math.abs(x-60)<2&&Math.abs(y-60)<2||rand()>=.12?red:white),rings=regionRings(floodRegion(noisy,60,60,5),{maxPoints:300});
  assert.ok(rings.reduce((n,r)=>n+r.length,0)<=300);assert.ok(rings.length>=1);
});

test('Rotated images rotate the region about the image centre',()=>{
  const px=image(10,10,(x,y)=>inBox(x,y,0,0,5,5)?red:white);
  const result=clickToStitch(px,{x:0,y:0,width:10,height:10,rotation:90},[1,1],10);
  const near=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<1e-9);
  for(const p of [[10,0],[10,5],[5,5],[5,0]])assert.ok(result.rings[0].some(q=>near(q,p)),p.join());
});

test('Downsampling box-averages RGB weighted by alpha',()=>{
  const px=image(4,4,(x,y)=>x<2?[200,0,0,255]:y<2?[0,0,0,0]:[0,0,200,255]);
  const small=downsample(px,2);assert.equal(small.width,2);assert.equal(small.height,2);
  assert.deepEqual([...small.data.slice(0,4)],[200,0,0,255]);assert.deepEqual([...small.data.slice(4,8)],[0,0,0,0]);
  const mixed=downsample(image(2,1,x=>x?[0,0,0,0]:[100,150,200,255]),1);assert.deepEqual([...mixed.data],[100,150,200,128]);
  assert.equal(downsample(px,8),px);
  const wide=downsample(image(960,10,()=>red));assert.equal(wide.width,480);assert.equal(wide.height,5);
});
