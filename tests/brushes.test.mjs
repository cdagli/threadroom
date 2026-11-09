import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const B=load('brushes'),{object,defaultLocks,defaultTrimJump,validProject}=load('project'),{blockWidths}=load('curves');
const project=(...objects)=>({version:1,name:'Brushes',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:{...defaultLocks},trimJump:defaultTrimJump,objects});
// A gentle S-curve sampled like pointer moves.
const stroke=Array.from({length:120},(_,i)=>[10+i*.6,50+12*Math.sin(i/120*Math.PI*2)]);
const make=(id,size=B.brushDefaults[id],pressures)=>{
  const r=B.brushStroke(id,stroke,size,pressures);assert.ok(r,id);
  return B.brushObject(object(id,[],'running','#d8949b'),r);
};

test('Every brush makes a valid, sewable object of its stitch kind',()=>{
  const kinds={running:'running',bean:'bean',rope:'triple-rope',satin:'satin',taper:'satin-block',fill:'fill'};
  for(const id of B.brushIds){
    const o=make(id);assert.equal(o.kind,kinds[id]);
    assert.ok(validProject(project(o)),id);
    assert.ok(o.rings.every(r=>r.every(p=>p.every(Number.isFinite))),id);
  }
});

test('Brush sizes set the matching stitch setting and are clamped to their range',()=>{
  assert.equal(make('running',2.2).length,2.2);
  assert.equal(make('rope',.8).ropeWidth,.8);
  assert.equal(make('satin',4).satinWidth,4);
  assert.equal(make('satin',99).satinWidth,B.brushes.satin.setting.max);
});

test('Tapered satin is thin at the ends and wide in the middle; pen pressure shapes it',()=>{
  const w=blockWidths(make('taper',6).rails),mid=w[Math.floor(w.length/2)];
  assert.ok(w[0]<1.5&&w.at(-1)<1.5,'tapered ends');
  assert.ok(mid>4&&mid<=6.01,`middle ${mid}`);
  const light=stroke.map((_,i)=>i<60?.2:.9),p=blockWidths(make('taper',6,light).rails);
  assert.ok(p[Math.floor(p.length*.3)]<p[Math.floor(p.length*.7)],'more pressure is wider');
});

test('The fill brush fills the painted area as one plain fill, merging overlapping passes',()=>{
  const o=make('fill',8),xs=o.rings[0].map(p=>p[0]);
  assert.ok(Math.min(...xs)<=6.1&&Math.max(...xs)>=81.3,'caps reach half the width past the ends');
  assert.equal(o.fillPattern,'tatami');assert.equal(o.angleGuides,undefined);
  // A back-and-forth scribble whose passes overlap becomes a single outline without holes.
  const scribble=[0,1,2,3,4,5].flatMap(k=>Array.from({length:40},(_,i)=>[20+(k%2?39-i:i),20+k*5+i*.125]));
  const r=B.brushStroke('fill',scribble,8);assert.equal(r.rings.length,1);
});

test('A tap or tiny stroke makes nothing',()=>{
  for(const id of B.brushIds)assert.equal(B.brushStroke(id,[[10,10],[10.2,10.1]],B.brushDefaults[id]),null);
});

test('Missing pressure (mouse or synthetic events) falls back to the automatic taper',()=>{
  const w=blockWidths(make('taper',6,stroke.map(()=>NaN)).rails);
  assert.ok(w.every(Number.isFinite)&&w[0]<1.5&&w[Math.floor(w.length/2)]>4);
});
