import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {selectIds,visibleCommands,layerRows,layerTarget}=load('layers');
const {object,defaultLocks,normalizeGroups,moveObjects,moveGroup}=load('project');
const item=(id,group)=>({...object(id,[[[10,10],[20,10],[20,20]]]),id,...(group!==undefined&&{group})});
const project=()=>({version:1,name:'Layers',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:defaultLocks,trimJump:3,objects:[item('a'),item('b','g'),item('c','g'),item('d','h'),item('e')],groups:[{id:'g',name:'Group 1'},{id:'h',name:'Group 2'}]});

test('Selection preserves click order, toggles without duplicates and keeps the range endpoint primary',()=>{
  const order=['a','b','c','d'],ids=['c','a'];
  assert.deepEqual(selectIds(order,ids,'b','replace','c'),['b']);
  assert.deepEqual(selectIds(order,ids,'b','toggle','c'),['c','a','b']);
  assert.deepEqual(selectIds(order,ids,'c','toggle','a'),['a']);
  assert.deepEqual(selectIds(order,ids,'d','range','b'),['b','c','d']);
  assert.deepEqual(selectIds(order,ids,'a','range','d'),['d','c','b','a']);
  assert.deepEqual(selectIds(order,ids,'a','range','gone'),['a']);
  assert.equal(selectIds(order,ids,'gone','toggle','a'),ids);assert.deepEqual(ids,['c','a']);
});

test('Hidden stitch filtering preserves source indices and excludes borders and connectors at either hidden end',()=>{
  const objects=[{...item('a'),hidden:true,text:{border:{kind:'running'}}},item('b')];
  const command=(objectId,extra={})=>({type:'stitch',x:20,y:10,fromX:10,fromY:10,block:0,objectId,...extra});
  const commands=[command('a'),command('a-border'),command('b',{fromObjectId:'a',travel:true}),command('b',{fromObjectId:'a',type:'jump',trim:true}),command('b',{fromObjectId:'a'}),command('b'),command(undefined)];
  const shown=visibleCommands(commands,objects);
  assert.deepEqual(shown.indices,[4,5,6]);assert.deepEqual(shown.commands,commands.slice(4));
  assert.equal(visibleCommands(commands,objects.map(o=>({...o,hidden:false}))).commands,commands);
  assert.equal(commands.length,7);assert.equal(objects[0].hidden,true);
  const imported=[command(undefined),command(undefined,{type:'jump'})];assert.equal(visibleCommands(imported,objects).commands,imported);
});

test('Layer rows follow sew order; collapse hides rows without altering objects, membership or numbering',()=>{
  const p=project(),rows=layerRows(p,new Set());
  assert.deepEqual(rows.map(r=>r.key),['object:a','group:g','object:b','object:c','group:h','object:d','object:e']);
  assert.deepEqual(rows.find(r=>r.key==='group:g').ids,['b','c']);
  const collapsed=layerRows(p,new Set(['g','h']));
  assert.deepEqual(collapsed.map(r=>r.key),['object:a','group:g','group:h','object:e']);
  assert.equal(collapsed.at(-1).index,4);assert.equal(collapsed[1].end,3);assert.equal(collapsed[1].collapsed,true);
  assert.deepEqual(p.objects.map(o=>o.group),[undefined,'g','g','h',undefined]);
});

test('Drop targets distinguish group boundaries, membership and collapsed blocks using original indices',()=>{
  const p=project(),rows=layerRows(p,new Set()),g=rows.find(r=>r.key==='group:g'),b=rows.find(r=>r.key==='object:b'),e=rows.at(-1);
  assert.deepEqual(layerTarget(g,false),{index:1,group:null});
  assert.deepEqual(layerTarget(g,true),{index:1,group:'g'});
  assert.deepEqual(layerTarget(b,true),{index:2,group:'g'});
  assert.deepEqual(layerTarget(g,true,true),{index:3,group:null});
  const target=layerTarget(b,true),inside=moveObjects(p,['e'],target.index,target.group);
  assert.deepEqual(inside.objects.map(o=>o.id),['a','b','e','c','d']);assert.equal(inside.objects[2].group,'g');
  const outside=layerTarget(e,true),out=moveObjects(p,['b','c'],outside.index,outside.group);
  assert.deepEqual(out.objects.map(o=>o.id),['a','d','e','b','c']);assert.ok(out.objects.slice(-2).every(o=>o.group===undefined));
  const collapsed=layerRows(p,new Set(['g']))[1];assert.deepEqual(layerTarget(collapsed,true),{index:3,group:'g'});
  const whole=moveGroup(p,'h',layerTarget(g,true,true).index);assert.deepEqual(whole.objects.map(o=>o.id),['a','b','c','d','e']);
  assert.equal(normalizeGroups(inside),inside);assert.equal(normalizeGroups(out),out);
});

test('Locks toggle as one change, skip canvas selection and are kept by validation and SVG export',()=>{
  const {toggleLock,unlockAll,unlockedIds,selectableIds}=load('layers'),{validProject}=load('project'),{exportSVG}=load('svg-export');
  const p=project(),locked=toggleLock(p,['a','b']);
  assert.deepEqual(locked.objects.map(o=>!!o.locked),[true,true,false,false,false]);assert.equal(locked.objects[2],p.objects[2]);
  assert.deepEqual(toggleLock(toggleLock(locked,['b','c']),['a']).objects.map(o=>!!o.locked),[false,true,true,false,false]);
  assert.equal(Object.hasOwn(toggleLock(locked,['a','b']).objects[0],'locked'),false);
  assert.deepEqual(unlockedIds(locked,['a','c','gone']),['c']);
  assert.deepEqual(selectableIds({...locked,objects:locked.objects.map(o=>o.id==='e'?{...o,hidden:true}:o)}),['c','d']);
  assert.ok(validProject(locked));assert.equal(validProject({...p,objects:[{...p.objects[0],locked:'yes'}]}),false);
  assert.equal(unlockAll(p),p);assert.ok(unlockAll(locked).objects.every(o=>o.locked===undefined));
  assert.match(exportSVG(locked),/id="a"[^>]*data-threadroom-locked="true"/);assert.doesNotMatch(exportSVG(locked),/id="c"[^>]*data-threadroom-locked/);
  const {copySelection,pasteSelection}=load('editing');let n=0;
  const pasted=pasteSelection(locked,copySelection(locked,['a']),1,()=>`copy-${n++}`);assert.equal(pasted.project.objects.at(-1).locked,undefined);
});
