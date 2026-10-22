import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {imageSize,imageFilename}=load('image-export');
const compiled={commands:[{type:'jump',x:999,y:999,fromX:0,fromY:0},{type:'stitch',x:30,y:40,fromX:10,fromY:20}]};
test('PNG crops to sewn design bounds with 5 mm margin, independent of viewport and jumps',()=>{
  const b=imageSize(compiled,10);assert.deepEqual(b,{x:5,y:15,width:30,height:30,scale:10,pixelWidth:300,pixelHeight:300});assert.ok(Math.abs(imageSize(compiled).scale-300/25.4)<1e-10);
});
test('PNG never exceeds 8000 px on either side, preserving aspect ratio',()=>{
  const b=imageSize({commands:[{type:'stitch',x:1000,y:10,fromX:0,fromY:0}]},40);assert.equal(b.pixelWidth,8000);assert.ok(b.pixelHeight<=8000);assert.ok(Math.abs(b.width/b.height-b.pixelWidth/(b.height*b.scale))<1e-6);
});
test('PNG filenames follow the project name with safe filesystem characters',()=>{
  assert.equal(imageFilename('My flowers'),'My flowers.png');assert.equal(imageFilename('baby/name'),'baby_name.png');assert.equal(imageFilename('  '),'threadroom.png');assert.throws(()=>imageSize({commands:[]}));
});
