import {test} from 'node:test';import assert from 'node:assert/strict';import {load} from './load-lib.mjs';
const {object}=load('project'),{orderTrace,traceTolerance,simplifyTrace}=load('trace-order');
const box=(name,color,x,y,w=2)=>object(name,[[[x,y],[x+w,y],[x+w,y+w],[x,y+w]]],'fill',color);
test('trace groups dominant background first, hue colours together and dark detail last',()=>{
 const objects=[box('outline','#111111',0,0),box('blue','#0000ff',4,5),box('red far','#ff0000',60,40),box('background','#ffffff',0,0,80),box('red top','#ff0000',0,0),box('red near','#ff0000',2,0)];
 const result=orderTrace(objects);assert.deepEqual(result.map(o=>o.name),['background','red top','red near','red far','blue','outline']);assert.equal(objects[0].name,'outline');assert.deepEqual(orderTrace([]),[]);
});
test('trace reduction uses physical tolerance and preserves holes and tiny rings',()=>{
 assert.equal(traceTolerance(1),.032);assert.equal(traceTolerance(100),.25);const o=box('shape','#ffffff',0,0,20);o.rings.push([[5,5],[5,6],[6,6],[6,5]]);const n=simplifyTrace(o,.2);assert.equal(n.rings.length,2);assert.ok(n.rings.every(r=>r.length>=3));assert.notEqual(n,o);
});
test('pure raster tracing keeps background removal, holes and deterministic colour runs',()=>{
 const {traceRaster}=load('trace'),data=new Uint8ClampedArray(12*12*4);for(let y=0;y<12;y++)for(let x=0;x<12;x++){const i=(y*12+x)*4,red=x>=2&&x<10&&y>=2&&y<10&&!(x>=4&&x<8&&y>=4&&y<8);data.set(red?[255,0,0,255]:[255,255,255,255],i);}
 const art={src:'',name:'Test',x:10,y:10,width:24,height:24},regions=traceRaster({width:12,height:12,data},art,2,true);assert.equal(regions.length,1);assert.equal(regions[0].rings.length,2);assert.equal(regions[0].color,'#ff0000');const all=orderTrace(traceRaster({width:12,height:12,data},art,2,false));assert.equal(all[0].color,'#ffffff');
});
