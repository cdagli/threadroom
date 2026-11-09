import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {objectMenu,canvasMenu,menuStep,menuPosition}=load('context-menu');
const {object,defaultLocks}=load('project');
const {clientToWorld,worldToClient}=load('viewport');
const item=(id,extra={})=>({...object(id,[[[10,10],[20,10],[20,20]]]),id,...extra});
const project=objects=>({version:1,name:'Menu',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:defaultLocks,trimJump:3,objects});
const actions=entries=>entries.filter(e=>e!=='separator').map(e=>e.disabled?`-${e.action}`:e.action);

test('Object menu offers Ember actions with sew-order and lock states',()=>{
  const p=project([item('a'),item('b',{group:'g'}),item('c',{locked:true}),item('d',{hidden:true})]);
  assert.deepEqual(actions(objectMenu(p,['a'],false)),['cut','copy','-paste','duplicate','delete','-group','-ungroup','lock','hide','editPoints','editAngles','front','forward','-backward','-back','flipH','flipV','rotate','-cutHoles','-flatten','-union','-subtract','-intersect','offset','knife']);
  assert.deepEqual(actions(objectMenu(p,['c'],true)),['-cut','copy','paste','duplicate','-delete','-group','-ungroup','unlock','hide','-editAngles','front','forward','backward','back','-flipH','-flipV','-rotate','-cutHoles','-flatten','-union','-subtract','-intersect','-offset','-knife']);
  const both=actions(objectMenu(p,['b','d'],true));assert.ok(both.includes('group')&&both.includes('ungroup')&&both.includes('hide')&&!both.includes('editPoints'));
  assert.ok(actions(objectMenu(p,['d'],true)).includes('show'));assert.ok(actions(objectMenu(p,['d'],true)).includes('-front'));
  assert.deepEqual(objectMenu(p,['gone'],true),canvasMenu(p,true));
});
test('Shape operations in the object menu follow the Shape tools rules; locked objects and Blocks are left out',()=>{
  const shapes=entries=>actions(entries).filter(a=>/cutHoles|flatten|union|subtract|intersect|offset|knife/.test(a));
  const line=item('line',{kind:'running',rings:[[[10,50],[40,50]]]});
  const block=item('blk',{kind:'satin-block',rings:[[[10,70],[40,70]]],rails:{points:[[[10,69],[40,69]],[[10,71],[40,71]]]}});
  const p=project([item('a'),item('b'),item('c',{locked:true}),line,block]);
  assert.deepEqual(shapes(objectMenu(p,['a','b'],false)),['cutHoles','flatten','union','subtract','intersect','offset','knife']);
  assert.deepEqual(shapes(objectMenu(p,['a','c'],false)),['-cutHoles','-flatten','-union','-subtract','-intersect','offset','knife']);
  assert.deepEqual(shapes(objectMenu(p,['line'],false)),['-cutHoles','-flatten','-union','-subtract','-intersect','-offset','knife']);
  assert.deepEqual(shapes(objectMenu(p,['blk'],false)),['-cutHoles','-flatten','-union','-subtract','-intersect','-offset','-knife']);
});
test('Edit angles and Edit flow field entries follow locks and the fill pattern',()=>{
  const guideEntries=entries=>actions(entries).filter(a=>/editAngles|editFlow/.test(a));
  const line=item('line',{kind:'running',rings:[[[10,50],[40,50]]]}),flow=item('flow',{fillPattern:'streamlines'}),circ=item('circ',{fillPattern:'circular'});
  const text=item('txt',{text:{value:'A'}}),p=project([item('a'),item('h',{hidden:true}),line,flow,circ,text]);
  assert.deepEqual(guideEntries(objectMenu(p,['flow'],false)),['editFlow']);
  assert.deepEqual(guideEntries(objectMenu(p,['circ'],false)),[]);
  assert.deepEqual(guideEntries(objectMenu(p,['h'],false)),['-editAngles']);
  assert.deepEqual(guideEntries(objectMenu(p,['line'],false)),[]);
  assert.deepEqual(guideEntries(objectMenu(p,['txt'],false)),['editAngles']);
});
test('Empty-canvas menu: paste, select all, unlock all only while something is locked, fit and grid',()=>{
  assert.deepEqual(actions(canvasMenu(project([item('a',{locked:true})]),false)),['-paste','-selectAll','unlockAll','fit','grid']);
  assert.deepEqual(actions(canvasMenu(project([item('a')]),true)),['paste','selectAll','fit','grid']);
});
test('Arrow keys skip separators and disabled rows, wrap, and Home/End jump',()=>{
  const entries=[{action:'cut',disabled:true},{action:'copy'},'separator',{action:'paste',disabled:true},{action:'fit'}];
  assert.equal(menuStep(entries,-1,'ArrowDown'),1);assert.equal(menuStep(entries,1,'ArrowDown'),4);assert.equal(menuStep(entries,4,'ArrowDown'),1);
  assert.equal(menuStep(entries,1,'ArrowUp'),4);assert.equal(menuStep(entries,-1,'ArrowUp'),4);assert.equal(menuStep(entries,4,'Home'),1);assert.equal(menuStep(entries,1,'End'),4);
  assert.equal(menuStep(entries,2,'ArrowDown'),4);assert.equal(menuStep([{action:'cut',disabled:true}],0,'ArrowDown'),-1);
});
test('The menu opens beside the pointer and stays inside the viewport',()=>{
  assert.deepEqual(menuPosition(100,100,200,300,1200,800),{left:100,top:100});
  assert.deepEqual(menuPosition(1150,750,200,300,1200,800),{left:950,top:450});
  assert.deepEqual(menuPosition(50,100,200,700,240,760),{left:32,top:52});
  assert.deepEqual(menuPosition(-20,-5,100,100,800,600),{left:8,top:8});
});
test('World-to-client inverts client-to-world for any zoom and pan',()=>{
  const rect={left:30,top:40,width:900,height:600},hoop={width:100,height:100};
  for(const view of [{zoom:1,pan:[0,0]},{zoom:3.2,pan:[12,-7]}]){const w=clientToWorld(view,worldToClient(view,[37,64],rect,hoop),rect,hoop);assert.ok(Math.abs(w[0]-37)<1e-9&&Math.abs(w[1]-64)<1e-9);}
});
