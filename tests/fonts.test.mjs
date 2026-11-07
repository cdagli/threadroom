import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {loadCatalog,minSize,weightFor,refFor}=load('fonts');
const font={id:'nunito',family:'Nunito',category:'s',weights:[400,700,800,900],italic:true,subsets:['latin'],min:[14,9,7,6]};

test('Minimum fill heights distinguish unknown weights and never-clean weights',()=>{
  assert.equal(minSize(font,400),14);
  assert.equal(minSize({...font,min:[0,9,7,6]},400),Infinity);
  assert.equal(minSize({...font,min:undefined},400),undefined);
  assert.equal(minSize(font,500),undefined);
});
test('Size-aware weights use the lightest clean weight at or above the request',()=>{
  assert.equal(weightFor(font,400,14),400);
  assert.equal(weightFor(font,400,9),700);
  assert.equal(weightFor(font,400,8),800);
  assert.equal(weightFor(font,400,6),900);
  assert.equal(weightFor(font,800,20),800);
  assert.equal(weightFor(font,750,8),800);
  assert.equal(weightFor({...font,weights:[900,400,800,700],min:[6,14,7,9]},400,9),700);
  assert.equal(weightFor({...font,min:[0,9,7,6]},400,100),700);
});
test('If no weight qualifies, choose the smallest minimum and the heaviest tie',()=>{
  const before=structuredClone(font);
  assert.equal(weightFor(font,400,5),900);
  assert.equal(weightFor({...font,min:[14,6,6,9]},400,5),800);
  assert.equal(weightFor({...font,min:[14,6,7,9]},900,8),700);
  assert.equal(weightFor({...font,min:[0,0,0,0]},400,100),900);
  assert.deepEqual(font,before);
});
test('Font references use size data, with legacy curated weights only as fallback',()=>{
  assert.equal(refFor(font,400,false,14).weight,400);
  assert.equal(refFor(font,400,false,8).weight,800);
  assert.equal(refFor(font,400,false).weight,700);
  const legacy={...font,min:undefined};
  assert.equal(refFor(legacy,400,false,8).weight,700);
  assert.equal(weightFor(legacy,400,8),700);
  assert.equal(refFor({...legacy,id:'fixture'},500,true,8).weight,400);
  assert.equal(refFor({...font,italic:false},400,true,8).italic,false);
  assert.equal(refFor(font,400,true,8).italic,true);
  assert.deepEqual(refFor(font,400,false,8),{source:'catalog',id:'nunito',family:'Nunito',weight:800,italic:false,subsets:['latin']});
});
test('Catalogue loader accepts both row formats using inline data',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,json:async()=>({source:'fixture',updated:'fixture',fonts:[
    ['fixture','Fixture','s',[400,700],1,['latin'],[14,0]],
    ['legacy','Legacy','r',[400],0,['latin']],
  ]})});
  try{
    const fonts=await loadCatalog();
    assert.equal(fonts.length,2);assert.deepEqual(fonts[0].min,[14,0]);
    assert.equal(minSize(fonts[0],700),Infinity);assert.equal(fonts[0].italic,true);
    assert.equal(fonts[1].min,undefined);assert.equal(fonts[1].italic,false);
  }finally{globalThis.fetch=original;}
});
