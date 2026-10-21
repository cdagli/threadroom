import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {sampleArtwork,artworkPixels}=load('artwork-color');
const art={x:20,y:30,width:50,height:20};
const pixels=(width,height,at)=>({width,height,data:Uint8ClampedArray.from(Array.from({length:width*height},(_,i)=>at(i%width,Math.floor(i/width))).flat())});

test('Picker maps millimetres to natural pixels and averages the original RGB, independent of opacity',()=>{
  const image=pixels(5,5,(x,y)=>[x*50,y*50,100,255]);
  assert.equal(sampleArtwork(image,art,[45,40]),'#646464');
  // Near edges, clip the neighbourhood rather than wrapping to another row.
  assert.equal(sampleArtwork(image,art,[20,30]),'#191964');
  assert.equal(sampleArtwork(image,art,[70,50]),'#afaf64');
  const solid=pixels(3,3,()=>[12,90,230,255]);
  for(const opacity of [.1,.5,1])assert.equal(sampleArtwork(solid,{...art,opacity},[45,40]),'#0c5ae6');
});

test('Fully transparent neighbours are ignored; partial alpha does not fade RGB',()=>{
  const image=pixels(3,3,(x,y)=>x===1&&y===1?[200,40,80,1]:[0,255,255,0]);
  assert.equal(sampleArtwork(image,art,[45,40]),'#c82850');
  assert.equal(sampleArtwork(pixels(3,3,()=>[255,0,0,0]),art,[45,40]),null);
  assert.equal(sampleArtwork(pixels(1,1,()=>[1,2,3,127]),art,[70,50]),'#010203');
});

test('Outside clicks and empty or invalid image bounds produce no colour',()=>{
  const image=pixels(3,3,()=>[255,0,0,255]);
  for(const p of [[19.99,40],[70.01,40],[45,29.99],[45,50.01],[NaN,40]])assert.equal(sampleArtwork(image,art,p),null);
  for(const bounds of [{...art,width:0},{...art,height:-1}])assert.equal(sampleArtwork(image,bounds,[45,40]),null);
  assert.equal(sampleArtwork({width:0,height:0,data:new Uint8ClampedArray()},art,[45,40]),null);
});

test('Image decoding is shared per source at natural resolution and retries failures',async()=>{
  const previous={Image:globalThis.Image,document:globalThis.document};let decodes=0,draws=0,fail=false;
  globalThis.Image=class {naturalWidth=5;naturalHeight=4;async decode(){decodes++;if(fail)throw new Error('bad image');}};
  globalThis.document={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext(){return {drawImage(){draws++;},getImageData(x,y,w,h){assert.deepEqual([x,y,w,h],[0,0,5,4]);return pixels(w,h,()=>[20,30,40,255]);}};}};}};
  try{
    const first=artworkPixels('first');assert.equal(first,artworkPixels('first'));await first;
    assert.equal(await artworkPixels('first'),await first);assert.equal(decodes,1);assert.equal(draws,1);
    await artworkPixels('second');assert.equal(decodes,2);
    fail=true;await assert.rejects(artworkPixels('broken'),/bad image/);
    fail=false;await artworkPixels('broken');assert.equal(decodes,4);
  }finally{
    for(const [key,value] of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;
  }
});
