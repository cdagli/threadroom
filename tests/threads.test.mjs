import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {load} from './load-lib.mjs';
const {brotherThreads,deltaE2000,rgbToLab,nearestBrother,threadReference,applyThread,matchBrother,recolorObject}=load('threads');
const {demo,validProject}=load('project'),{geometryPayload}=load('curves');
const data=JSON.parse(readFileSync(new URL('./ciede2000-pairs.json',import.meta.url)));
test('CIEDE2000 published reference pairs, achromatic and hue-wrap cases',()=>{
  for(const [a,b,want] of data.pairs){assert.ok(Math.abs(deltaE2000(a,b)-want)<.00005);assert.ok(Math.abs(deltaE2000(b,a)-want)<.00005);assert.equal(deltaE2000(a,a),0);}
  assert.deepEqual(rgbToLab('#000000'),[0,0,0]);assert.ok(Math.abs(rgbToLab('#ffffff')[0]-100)<.00001);
});
test('64 catalogue entries match generated Python data and round trip through nearest matching',()=>{
  assert.deepEqual(brotherThreads,JSON.parse(readFileSync(new URL('../embroidery/threads.json',import.meta.url))).threads);
  assert.equal(brotherThreads.length,64);assert.deepEqual(brotherThreads.map(t=>t.code),Array.from({length:64},(_,i)=>String(i+1)));
  for(const t of brotherThreads){assert.equal(nearestBrother(t.color).code,t.code);assert.equal(t.color,'#'+t.rgb.map(v=>v.toString(16).padStart(2,'0')).join(''));}
  assert.equal(nearestBrother('#f994bd').code,'43');
});
test('Selection and whole-design recolouring preserve order, geometry and originals for one undo commit',()=>{
  const p=demo(),before=JSON.stringify(p),t=brotherThreads[42],ids=p.objects.slice(0,3).map(o=>o.id),next=applyThread(p,ids,t.color,threadReference(t));
  assert.ok(validProject(next));assert.equal(next.objects[3],p.objects[3]);
  next.objects.slice(0,3).forEach((o,i)=>{assert.deepEqual(o.thread,threadReference(t));assert.equal(o.color,t.color);assert.equal(o.rings,p.objects[i].rings);assert.equal(p.objects[i].thread,undefined);});
  const hand=applyThread(next,ids,'#123456');hand.objects.slice(0,3).forEach(o=>assert.ok(!Object.hasOwn(o,'thread')));
  assert.ok(!Object.hasOwn(recolorObject(next.objects[0],t.color),'thread'));
  const selected=matchBrother(p,ids);assert.equal(selected.objects[3],p.objects[3]);
  const all=matchBrother(p);assert.ok(validProject(all));assert.ok(all.objects.every(o=>o.thread));assert.deepEqual(all.objects.map(o=>o.id),p.objects.map(o=>o.id));
  assert.ok(geometryPayload(all).objects.every(o=>o.thread));assert.equal(JSON.stringify(p),before);
});
test('Malformed catalogue metadata and speed values fail validation; legacy projects remain valid',()=>{
  const p=demo(),t=brotherThreads[0],matched=applyThread(p,[p.objects[0].id],t.color,threadReference(t));assert.ok(validProject(p));
  for(const thread of [null,{}, {brand:'other',code:'1',name:t.name},{brand:'brother',code:'999',name:t.name},{brand:'brother',code:'1',name:'Wrong'}])assert.equal(validProject({...matched,objects:matched.objects.map((o,i)=>i?o:{...o,thread})}),false);
  assert.equal(validProject({...matched,objects:matched.objects.map((o,i)=>i?o:{...o,color:'#123456'})}),false);
  for(const speed of [99,1001,null,'650',NaN])assert.equal(validProject({...p,sewingSpeed:speed}),false);
  for(const speed of [100,650,1000])assert.ok(validProject({...p,sewingSpeed:speed}));
});
test('Text borders match with their object and retain only metadata for their own colour',()=>{
  const {defaultText}=load('text'),p=demo(),o=p.objects[0],t=brotherThreads[0];
  const text={...defaultText({source:'catalog',id:'nunito',family:'Nunito',weight:800,italic:false,subsets:['latin']},[50,50],'A'),border:{kind:'running',color:'#123456',width:1}};
  const source={...p,objects:[{...o,text,color:t.color,thread:threadReference(t)}]};
  const raw=geometryPayload(source);assert.equal(raw.objects[0].thread.code,'1');assert.equal(raw.objects[1].thread,undefined);
  const matched=matchBrother(source);assert.ok(validProject(matched));
  const payload=geometryPayload(matched);assert.equal(payload.objects[1].thread.code,nearestBrother('#123456').code);assert.equal(payload.objects[1].color,nearestBrother('#123456').color);
  assert.equal(source.objects[0].text.border.thread,undefined);
  assert.equal(validProject({...source,objects:[{...source.objects[0],text:{...text,border:{...text.border,thread:threadReference(t)}}}]}),false);
});
