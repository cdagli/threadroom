import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {selectIds,visibleCommands,stackRows,stackTarget}=load('layers');
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

test('Collapse hides rows without altering objects, membership or numbering',()=>{
  const p=project(),rows=stackRows(p,new Set());
  assert.deepEqual(rows.find(r=>r.key==='group:g').ids,['b','c']);
  const collapsed=stackRows(p,new Set(['g','h']));
  assert.deepEqual(collapsed.map(r=>r.key),['object:e','group:h','group:g','object:a']);
  assert.equal(collapsed[0].index,4);assert.equal(collapsed[2].end,3);assert.equal(collapsed[2].collapsed,true);
  assert.deepEqual(p.objects.map(o=>o.group),[undefined,'g','g','h',undefined]);
});

test('Layers list the top of the stack first, with group headers above their members',()=>{
  const p=project();
  assert.deepEqual(stackRows(p,new Set()).map(r=>r.key),['object:e','group:h','object:d','group:g','object:c','object:b','object:a']);
  assert.deepEqual(stackRows(p,new Set(['g'])).map(r=>r.key),['object:e','group:h','object:d','group:g','object:a']);
});

test('Drop targets mirror the stacked list and keep group boundaries, membership and collapsed blocks',()=>{
  const p=project(),rows=stackRows(p,new Set()),g=rows.find(r=>r.key==='group:g'),b=rows.find(r=>r.key==='object:b'),c=rows.find(r=>r.key==='object:c'),a=rows.at(-1);
  assert.deepEqual(stackTarget(g,false),{index:3,group:null});
  assert.deepEqual(stackTarget(g,true),{index:3,group:'g'});
  assert.deepEqual(stackTarget(c,true),{index:2,group:'g'});
  assert.deepEqual(stackTarget(b,false),{index:2,group:'g'});
  assert.deepEqual(stackTarget(g,true,true),{index:1,group:null});
  const target=stackTarget(c,true),inside=moveObjects(p,['e'],target.index,target.group);
  assert.deepEqual(inside.objects.map(o=>o.id),['a','b','e','c','d']);assert.equal(inside.objects[2].group,'g');
  const bottom=stackTarget(a,true),out=moveObjects(p,['b','c'],bottom.index,bottom.group);
  assert.deepEqual(out.objects.map(o=>o.id),['b','c','a','d','e']);assert.ok(out.objects.slice(0,2).every(o=>o.group===undefined));
  const collapsed=stackRows(p,new Set(['g'])).find(r=>r.key==='group:g');assert.deepEqual(stackTarget(collapsed,true),{index:1,group:'g'});
  const whole=moveGroup(p,'h',stackTarget(g,true,true).index);assert.deepEqual(whole.objects.map(o=>o.id),['a','d','b','c','e']);
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

test('Colour runs merge consecutive same-thread objects and sum compiled stitches',()=>{
  const {colourRuns}=load('layers'),p=project();
  p.objects[1].color='#AABBCC';p.objects[2].color='#aabbcc';p.objects[3].color='#aabbcc';p.objects[3].thread={brand:'Brother',code:'209',name:'Pink'};
  const runs=colourRuns(p,null);
  assert.deepEqual(runs.map(r=>r.ids),[['a'],['b','c'],['d'],['e']]);assert.deepEqual(runs.map(r=>[r.index,r.end]),[[0,1],[1,3],[3,4],[4,5]]);
  assert.equal(runs[2].thread.code,'209');assert.equal(runs[0].stitches,null);
  const stitch=id=>({type:'stitch',objectId:id,x:0,y:0,fromX:0,fromY:0,block:0});
  const counted=colourRuns(p,{commands:[stitch('b'),stitch('b'),stitch('c'),{...stitch('c'),type:'jump'},stitch('c-border'),stitch('e')]});
  assert.deepEqual(counted.map(r=>r.stitches),[0,3,0,1]);
  assert.deepEqual(colourRuns({...p,objects:[]},null),[]);
});
test('Placing a block keeps groups whole, joins a group it lands inside and leaves a group it moves away from',()=>{
  const {placeObjects,positionIndex}=load('layers'),p=project(),order=q=>q.objects.map(o=>o.id+(o.group?`:${o.group}`:''));
  assert.deepEqual(order(placeObjects(p,['b','c'],5)),['a','d:h','e','b:g','c:g']);
  assert.deepEqual(order(placeObjects(p,['e'],2)),['a','b:g','e:g','c:g','d:h']);
  assert.deepEqual(order(placeObjects(p,['b'],5)),['a','c:g','d:h','e','b']);
  assert.deepEqual(order(placeObjects(p,['c'],1)),['a','c:g','b:g','d:h','e']);
  assert.deepEqual(order(placeObjects(p,['a','e'],3)),['b:g','c:g','a','e','d:h']);
  assert.equal(placeObjects(p,['a'],0),p);assert.equal(placeObjects(p,['gone'],2),p);
  assert.deepEqual(order(placeObjects(p,['a'],positionIndex(p,'a',4))),['b:g','c:g','d:h','a','e']);
  assert.deepEqual(order(placeObjects(p,['e'],positionIndex(p,'e',1))),['e','a','b:g','c:g','d:h']);
  assert.equal(positionIndex(p,'b',99),5);assert.equal(positionIndex(p,'d',-3),0);assert.equal(placeObjects(p,['c'],positionIndex(p,'c',3)),p);
});
