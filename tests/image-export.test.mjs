import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {imageSize,imageFilename,exportCommands}=load('image-export');
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
test('PNG leaves out hidden objects, so the crop follows the visible stitches',()=>{
  const commands=[{type:'stitch',x:10,y:10,fromX:10,fromY:10,objectId:'a'},{type:'stitch',x:90,y:90,fromX:90,fromY:90,objectId:'b'}],compiled={commands};
  const visible=exportCommands(compiled,{objects:[{id:'a'},{id:'b',hidden:true}]});assert.equal(visible.length,1);assert.deepEqual(imageSize({commands:visible},10),{x:5,y:5,width:10,height:10,scale:10,pixelWidth:100,pixelHeight:100});
  assert.equal(exportCommands(compiled,{objects:[{id:'a'},{id:'b'}]}).length,2);
});
