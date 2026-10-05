import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {object,validProject,pullCompensation,pullDefaults}=load('project');
const {exportSVG}=load('svg-export');
const {geometryPayload}=load('curves');
const project=(o,fabric='woven')=>({version:1,name:'Pull',machine:'brother-pr1x',hoop:'100x100',fabric,objects:[o]});
const square=[[30,30],[60,30],[60,60],[30,60]];

test('Pull compensation is optional and range-checked',()=>{
  const o=object('Region',[square]);
  assert.equal(o.pullCompensation,undefined);
  assert.ok(validProject(project(o)));
  const saved=JSON.parse(JSON.stringify(project({...o,pullCompensation:.3})));
  assert.ok(validProject(saved));assert.equal(saved.objects[0].pullCompensation,.3);
  for(const v of [0,1])assert.ok(validProject(project({...o,pullCompensation:v})));
  for(const v of [-.1,1.01,NaN,Infinity,'0.2',null,true])assert.equal(validProject(project({...o,pullCompensation:v})),false,String(v));
});

test('Objects without a value follow the fabric; explicit values do not',()=>{
  const o=object('Region',[square]);
  assert.deepEqual(pullDefaults,{woven:.2,jersey:.35});
  assert.equal(pullCompensation(o,'woven'),.2);assert.equal(pullCompensation(o,'jersey'),.35);
  assert.equal(pullCompensation({...o,pullCompensation:0},'jersey'),0);
  const payload=geometryPayload(project({...o,pullCompensation:.5},'jersey'));
  assert.equal(payload.fabric,'jersey');assert.equal(payload.objects[0].pullCompensation,.5);
  assert.equal('pullCompensation' in geometryPayload(project(o)).objects[0],false);
});

test('SVG export carries an explicit compensation only',()=>{
  const o=object('Region',[square]);
  assert.match(exportSVG(project({...o,pullCompensation:.25})),/data-threadroom-pull-compensation="0.25"/);
  assert.doesNotMatch(exportSVG(project(o)),/pull-compensation/);
});
