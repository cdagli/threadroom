import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {objectGeometry,designBounds,changedObjectIds,commandPaths,sewnStitches,objectTransform,projectCommands}=load('editor-render');
const {demo,object,bounds,pathData,isFillKind}=load('project');
const {visibleCommands}=load('layers');
const item=id=>({...object(id,[[[10,10],[20,10],[20,20]]]),id});
const project=()=>({...demo(),objects:[item('a'),item('b')]});
const command=(objectId,extra={})=>({type:'stitch',x:20,y:10,fromX:10,fromY:10,block:0,objectId,...extra});

test('Geometry is cached per immutable object and agrees with the existing paths and bounds',()=>{
  const p=demo();
  for(const o of p.objects){const g=objectGeometry(o);assert.equal(objectGeometry(o),g);assert.equal(g.path,pathData(o.rings,isFillKind(o.kind)));assert.deepEqual(g.bounds,bounds([o]));assert.notEqual(objectGeometry({...o}),g);}
  assert.deepEqual(designBounds(p.objects),bounds(p.objects));assert.deepEqual(designBounds([]),bounds([]));
  assert.deepEqual(designBounds([item('a'),{...item('empty'),rings:[]}]),bounds([item('a')]));
});

test('Only changed references are stale; removed objects and text borders are excluded too',()=>{
  const p=project(),border={...p.objects[0],text:{border:{kind:'running',color:'#000',width:1}}};p.objects[0]=border;
  assert.deepEqual([...changedObjectIds(p,p)],[]);
  assert.deepEqual([...changedObjectIds(p,{...p,name:'Renamed'})],[]);
  const next={...p,objects:[{...border,name:'Edited'},p.objects[1]]};
  assert.deepEqual([...changedObjectIds(p,next)].sort(),['a','a-border']);
  assert.deepEqual([...changedObjectIds(p,{...p,objects:[p.objects[1]]})].sort(),['a','a-border']);
  assert.deepEqual([...changedObjectIds(null,p)].sort(),['a','a-border','b']);
  // Undo restores the exact reference used by the last compile.
  assert.deepEqual([...changedObjectIds(p,{...next,objects:p.objects})],[]);
  assert.deepEqual([...changedObjectIds(p,{...p,objects:[...p.objects,item('new')]})],['new']);
});

test('Global sewing settings and reordered sew order invalidate every affected object',()=>{
  const p=project();
  for(const patch of [{fabric:'jersey'},{locks:{...p.locks,lockSize:1.5}},{trimJump:9},{hoop:'180x130'},{objects:[...p.objects].reverse()}])assert.deepEqual([...changedObjectIds(p,{...p,...patch})].sort(),['a','b']);
});

test('Stale filtering keeps unchanged stitches and source playback indices, removes connectors at either changed end',()=>{
  const p=project(),next={...p,objects:[{...p.objects[0]},p.objects[1]]},stale=changedObjectIds(p,next);
  const commands=[command('a'),command('b'),command('b',{travel:true,fromObjectId:'a'}),command('b',{type:'jump',fromObjectId:'a',trim:true}),command('b',{fromObjectId:'a'}),command(undefined)];
  const shown=visibleCommands(commands,next.objects,stale);
  assert.deepEqual(shown.indices,[1,4,5]);assert.deepEqual(shown.commands,[commands[1],commands[4],commands[5]]);
  assert.equal(visibleCommands(commands,next.objects,new Set(['a'])),shown);
  const full=visibleCommands(commands,next.objects);assert.equal(full.commands,commands);
  assert.equal(visibleCommands(commands,next.objects,stale),shown); // both realistic and line previews stay cached
  assert.deepEqual(visibleCommands(commands,[next.objects[0],{...next.objects[1],hidden:true}],stale).indices,[5]);
});

test('Stitch paths cache by command array, block count and playback count without mixing blocks',()=>{
  const commands=[command('a'),command('b',{block:1,travel:true}),command('b',{type:'jump',block:1,trim:true})];
  const full=commandPaths(commands,2,3);assert.equal(commandPaths(commands,2,3),full);
  assert.deepEqual(full,{blocks:[{stitch:'M10 10L20 10',jump:''},{stitch:'M10 10L20 10',jump:'M10 10L20 10'}],travel:'M10 10L20 10',trims:[[10,10]],travelCount:1,jumpCount:1});
  assert.equal(commandPaths(commands,2,1).blocks[1].stitch,'');assert.equal(commandPaths(commands,2,0).blocks[0].stitch,'');
  assert.equal(commandPaths(commands,0,3).blocks.length,0);assert.notEqual(commandPaths([...commands],2,3),full);
  const compiled={commands};assert.equal(sewnStitches(compiled,0),0);assert.equal(sewnStitches(compiled,1),1);assert.equal(sewnStitches(compiled,3),2);assert.equal(sewnStitches(compiled,2),2);
});

test('Moved, rotated and flipped objects keep their last stitches transformed; other edits stay stale',()=>{
  const a=item('a'),moved={...a,rings:a.rings.map(r=>r.map(([x,y])=>[x+5,y-2]))};
  assert.deepEqual(objectTransform(a,moved).map(v=>Math.round(v*1e6)/1e6+0),[1,0,0,1,5,-2]);
  const rotated={...a,rings:a.rings.map(r=>r.map(([x,y])=>[-y,x])),angle:a.angle+90};
  assert.deepEqual(objectTransform(a,rotated).map(v=>Math.round(v*1e6)/1e6+0),[0,1,-1,0,0,0]);
  const flipped={...a,rings:a.rings.map(r=>r.map(([x,y])=>[30-x,y]))};
  assert.deepEqual(objectTransform(a,flipped).map(v=>Math.round(v*1e6)/1e6+0),[-1,0,0,1,30,0]);
  // A sewing setting, an angle on its own, or reshaped points cannot be previewed.
  assert.equal(objectTransform(a,{...moved,spacing:.2}),null);
  assert.equal(objectTransform(a,{...a,angle:a.angle+10}),null);
  assert.equal(objectTransform(a,{...a,rings:[[[10,10],[25,10],[20,20]]]}),null);
  assert.equal(objectTransform(a,{...a,rings:[[[10,10],[20,10],[20,20],[10,20]]]}),null);
  assert.deepEqual(objectTransform(a,{...a,name:'Renamed'}).map(v=>v+0),[1,0,0,1,0,0]);
  // Straight lines are collinear: a similarity is fitted instead.
  const line={...item('l'),kind:'running',rings:[[[0,0],[10,0],[20,0]]]};
  assert.deepEqual(objectTransform(line,{...line,rings:[[[0,0],[0,10],[0,20]]]}).map(v=>Math.round(v*1e6)/1e6+0),[0,1,-1,0,0,0]);

  const p=project(),next={...p,objects:[moved,{...p.objects[1],spacing:.2}]};
  const commands=[command('a',{fromObjectId:'a'}),command('b',{fromObjectId:'a',type:'jump'}),command('b',{fromObjectId:'b'})];
  const stale=changedObjectIds(p,next),{commands:out,moved:ids}=projectCommands(commands,p,next,stale);
  assert.deepEqual([...ids.keys()],['a']);
  assert.deepEqual(out[0],{...commands[0],x:25,y:8,fromX:15,fromY:8});
  // The connector to an unmoved object is hidden rather than stretched.
  assert.deepEqual(out[1],{...commands[1],type:'jump',travel:false,trim:false,fromX:20,fromY:10});
  const both={...p,objects:[moved,{...p.objects[1],rings:p.objects[1].rings.map(r=>r.map(([x,y])=>[x+5,y-2]))}]};
  assert.deepEqual(projectCommands(commands,p,both,changedObjectIds(p,both)).commands[1],{...commands[1],x:25,y:8,fromX:15,fromY:8});
  assert.equal(out[2],commands[2]);
  assert.equal(projectCommands(commands,p,p,changedObjectIds(p,p)).commands,commands);
});
