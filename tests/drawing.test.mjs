import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {draftClick,completeDraft,movedForDrawing,snapAngle,lockAxis}=load('drawing');
const click=(state,p,time,button=0,extra={})=>draftClick(state,{p,time,button,detail:0,scale:10,ctrl:false,onFirst:false,...extra});
test('Release clicks replace double left clicks and suppress double right clicks',()=>{
  const empty={points:[],corners:[]},first=click(empty,[1,1],100);
  const double=click(first,[2,1],200);assert.deepEqual(double.points,[[2,1]]);assert.deepEqual(double.corners,[false]);
  const right=click(empty,[1,1],100,2);assert.deepEqual(click(right,[2,1],200,2).points,right.points);
  assert.equal(click(right,[2,1],550,2).points.length,2);assert.equal(click(first,[1,1],550).points.length,2);
  assert.equal(movedForDrawing([0,0],[.6,0]),true);assert.equal(movedForDrawing([0,0],[.5,0]),true);assert.equal(movedForDrawing([0,0],[.49,0]),false);
});
test('Angle snapping retains radius; axis lock uses the dominant displacement',()=>{
  const p=snapAngle([0,0],[10*Math.cos(Math.PI/9),10*Math.sin(Math.PI/9)]);
  assert.ok(Math.abs(p[0]-10*Math.cos(Math.PI/12))<1e-10);assert.ok(Math.abs(p[1]-10*Math.sin(Math.PI/12))<1e-10);
  assert.deepEqual(lockAxis([1,2],[8,5]),[8,2]);assert.deepEqual(lockAxis([1,2],[3,9]),[1,9]);
  const state={points:[[0,0],[3,8]],corners:[true,true]},snapped=click(state,[10,3],100,0,{ctrl:true,tool:'blocks'});
  assert.deepEqual(snapped.points.at(-1),snapAngle([0,0],[10,3]));
});
test('First-point closure and completion preserve tool topology and minimums',()=>{
  const state={points:[[0,0],[10,0]],corners:[true,true]};assert.deepEqual(click(state,[0,0],100,0,{onFirst:true}).points,state.points);
  const three={points:[...state.points,[10,10]],corners:[true,true,true]};assert.equal(click(three,[0,0],100,0,{onFirst:true}).action,'close');
  assert.deepEqual(completeDraft('open',three.points,three.corners,'first'),{closed:true,kind:'fill'});
  assert.deepEqual(completeDraft('open',state.points,state.corners,'enter'),{closed:false,kind:'running'});
  assert.deepEqual(completeDraft('closed',three.points,three.corners,'enter'),{closed:true,kind:'fill'});
  assert.equal(completeDraft('closed',state.points,state.corners,'switch'),null);
});
