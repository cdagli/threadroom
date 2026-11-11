import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {load} from './load-lib.mjs';
const {brotherThreads,threadBrands,deltaE2000,rgbToLab,nearestBrother,nearestThread,threadReference,applyThread,matchBrother,matchThreads,recolorObject,validThread,ensureThreads,defaultThread,defaultThreadColour,paletteOrder}=load('threads');
const {demo,validProject}=load('project'),{geometryPayload}=load('curves');
const data=JSON.parse(readFileSync(new URL('./ciede2000-pairs.json',import.meta.url)));
const python=JSON.parse(readFileSync(new URL('../embroidery/threads.json',import.meta.url)));
test('CIEDE2000 published reference pairs, achromatic and hue-wrap cases',()=>{
  for(const [a,b,want] of data.pairs){assert.ok(Math.abs(deltaE2000(a,b)-want)<.00005);assert.ok(Math.abs(deltaE2000(b,a)-want)<.00005);assert.equal(deltaE2000(a,a),0);}
  assert.deepEqual(rgbToLab('#000000'),[0,0,0]);assert.ok(Math.abs(rgbToLab('#ffffff')[0]-100)<.00001);
});
test('Brand charts: Brother first and inline, the rest as static files the compiler knows',()=>{
  assert.equal(threadBrands[0].id,'brother');assert.equal(threadBrands[0].count,brotherThreads.length);
  assert.deepEqual(python.brands,threadBrands.map(({id,label})=>({id,label})));
  assert.deepEqual(python.brother,brotherThreads.map(t=>[t.code,t.name,t.color]));
  const files=readdirSync(new URL('../public/threads/',import.meta.url)).sort();
  assert.deepEqual(files,threadBrands.slice(1).map(b=>b.id+'.json').sort());
  for(const b of threadBrands.slice(1)){
    const rows=JSON.parse(readFileSync(new URL(`../public/threads/${b.id}.json`,import.meta.url)));
    assert.equal(rows.length,b.count);assert.equal(new Set(rows.map(r=>r[0])).size,rows.length);
    for(const [code,name,color] of rows){assert.ok(code&&code.length<=24&&name.length<=60);assert.match(color,/^#[0-9a-f]{6}$/);}
  }
  for(const t of brotherThreads)assert.equal(nearestBrother(t.color).code,t.code);
  assert.equal(defaultThread.code,'100');assert.equal(defaultThreadColour,'#000000');
});
test('Thread references: Brother checked against the chart, other brands by shape',()=>{
  const t=brotherThreads[0];assert.ok(validThread(threadReference(t),t.color));
  for(const thread of [null,{},{brand:'other',code:'1',name:''},{brand:'brother',code:'999',name:t.name},{brand:'brother',code:t.code,name:'Wrong'},{brand:'madeira-rayon',code:'',name:'x'},{brand:'madeira-rayon',code:'1',name:3}])assert.equal(validThread(thread,t.color),false);
  assert.equal(validThread(threadReference(t),'#123456'),false);
  assert.ok(validThread({brand:'madeira-rayon',code:'1001',name:''},'#123456'));
});
test('Selection and whole-design recolouring preserve order, geometry and originals for one undo commit',()=>{
  const p=demo(),before=JSON.stringify(p),t=brotherThreads[42],ids=p.objects.slice(0,3).map(o=>o.id),next=applyThread(p,ids,t.color,threadReference(t));
  assert.ok(validProject(next));assert.equal(next.objects[3],p.objects[3]);
  next.objects.slice(0,3).forEach((o,i)=>{assert.deepEqual(o.thread,threadReference(t));assert.equal(o.color,t.color);assert.equal(o.rings,p.objects[i].rings);});
  assert.ok(!Object.hasOwn(recolorObject(next.objects[0],t.color),'thread'));
  const selected=matchBrother(p,ids);assert.equal(selected.objects[3],p.objects[3]);
  const all=matchBrother(p);assert.ok(validProject(all));assert.ok(all.objects.every(o=>o.thread?.brand==='brother'));assert.deepEqual(all.objects.map(o=>o.id),p.objects.map(o=>o.id));
  const chart=[{code:'A1',name:'Ink',color:'#101010'},{code:'B2',name:'',color:'#f0f0f0'}],other=matchThreads(p,chart,'madeira-rayon');
  assert.ok(validProject(other));assert.ok(other.objects.every(o=>o.thread.brand==='madeira-rayon'&&chart.some(c=>c.code===o.thread.code&&c.color===o.color)));
  assert.equal(nearestThread('#111111',chart).code,'A1');
  assert.ok(geometryPayload(all).objects.every(o=>o.thread));assert.equal(JSON.stringify(p),before);
});
test('No custom colours: ensureThreads snaps unthreaded objects and borders, and is a no-op otherwise',()=>{
  const p=demo(),snapped=ensureThreads(p);assert.ok(snapped.objects.every(o=>o.thread&&o.color===nearestBrother(p.objects.find(x=>x.id===o.id).color).color));
  assert.equal(ensureThreads(snapped),snapped);
  const {defaultText}=load('text'),o=snapped.objects[0];
  const text={...defaultText({source:'catalog',id:'nunito',family:'Nunito',weight:800,italic:false,subsets:['latin']},[50,50],'A'),border:{kind:'running',color:'#123456',width:1}};
  const fixed=ensureThreads({...snapped,objects:[{...o,text}]});assert.ok(validProject(fixed));
  assert.equal(fixed.objects[0].text.border.thread.code,nearestBrother('#123456').code);assert.equal(fixed.objects[0].text.border.color,nearestBrother('#123456').color);
});
test('paletteOrder keeps every thread and puts neutrals last',()=>{
  const ordered=paletteOrder(brotherThreads);assert.equal(ordered.length,brotherThreads.length);assert.deepEqual(new Set(ordered),new Set(brotherThreads));
  const neutral=t=>{const [,a,b]=rgbToLab(t.color);return Math.hypot(a,b)<10;},first=ordered.findIndex(neutral);
  assert.ok(first>0&&ordered.slice(first).every(neutral));
});
test('Malformed sewing speed values fail validation',()=>{
  const p=demo();
  for(const speed of [99,1001,null,'650',NaN])assert.equal(validProject({...p,sewingSpeed:speed}),false);
  for(const speed of [100,650,1000])assert.ok(validProject({...p,sewingSpeed:speed}));
});
