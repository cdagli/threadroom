import {test} from 'node:test';import assert from 'node:assert/strict';import {load} from './load-lib.mjs';
const {measurePoint,measureAngle}=load('measure'),{formatLength}=load('view-settings');
test('measurement angles are clockwise from +x and snapping preserves length in every quadrant',()=>{
 assert.equal(measureAngle([0,0],[0,1]),90);assert.equal(measureAngle([0,0],[0,-1]),270);assert.equal(measureAngle([0,0],[0,0]),0);
 for(const b of [[4,1],[-4,1],[-4,-1],[4,-1]]){const q=measurePoint([0,0],b,true);assert.ok(Math.abs(Math.hypot(...q)-Math.hypot(...b))<1e-10);assert.ok(Math.abs(measureAngle([0,0],q)/15-Math.round(measureAngle([0,0],q)/15))<1e-10);assert.equal(measurePoint([0,0],b,false),b);}
 assert.equal(formatLength(25.4,'in',(n,d)=>n.toFixed(d)),'1.000 in');assert.equal(formatLength(25,'cm',(n,d)=>n.toFixed(d)),'2.5 cm');
});
