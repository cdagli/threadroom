import {test} from 'node:test';import assert from 'node:assert/strict';import {load} from './load-lib.mjs';
const {overlayPaths}=load('stitch-overlays'),{readViewSettings}=load('view-settings');
test('overlay preferences persist independently and old preferences migrate',()=>{
 const v=readViewSettings('{"showTrims":true,"showTies":true,"showNeedlePoints":true}');assert.equal(v.showJumps,false);assert.equal(v.showTrims,true);assert.deepEqual(readViewSettings(JSON.stringify(v)),v);assert.equal(readViewSettings('{"showTies":1}').showTies,false);
});
test('markers use compiled lock roles, selected penetrations and playback prefix',()=>{
 const base={type:'stitch',block:0,objectId:'a',fromX:1,fromY:2,x:3,y:4},cs=[{...base,tie:'in'},{...base,tie:'in'},{...base,type:'jump',trim:true},{...base,tie:'off'},{...base,objectId:'b'}];
 const p=overlayPaths(cs,cs.length,['a'],2);assert.equal((p.ties.match(/M/g)||[]).length,2);assert.equal((p.needles.match(/M/g)||[]).length,3);assert.ok(p.trims);assert.equal(overlayPaths(cs,1,[],2).trims,'');assert.equal(overlayPaths(cs,5,[],2).needles,'');
});
