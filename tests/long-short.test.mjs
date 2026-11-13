import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {object,defaultLocks,validProject,resolve}=load('project');
const L=load('long-short');
const square=[[20,20],[80,20],[80,80],[20,80]];
const project=objects=>({version:1,name:'Shading',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:defaultLocks,trimJump:3,objects});
const fill=(patch={})=>({...object('Flower',[square]),fillPattern:'longShort',color:'#c8955f',...patch});

test('Long & short defaults: close single-thread lines, no underlay; spacing and bands validate',()=>{
  const r=resolve(fill(),'woven',defaultLocks);
  assert.equal(r.spacing,.3);assert.equal(r.underlay,'none');assert.equal(r.pullCompensation,0);
  assert.ok(validProject(project([fill({spacing:.2,patternParams:{bandStart:20,bandEnd:60,blend:2.5}})])));
  for(const patch of [{spacing:.1},{patternParams:{blend:9}},{shade:''},{fillPattern:'tatami',shade:'x'}])
    assert.equal(validProject(project([fill(patch)])),false,JSON.stringify(patch));
});

test('Adding a shade colour splits the band; the new layer is sewn on top and inherits the outline',()=>{
  const base=fill(),p=project([base]);
  const {project:next,id}=L.addShade(p,base.id,'new');
  assert.equal(id,'new');assert.equal(next.objects.length,2);
  const [outer,inner]=next.objects;
  assert.deepEqual(L.band(outer),[50,100]);assert.deepEqual(L.band(inner),[0,50]);
  assert.equal(outer.shade,inner.shade);assert.deepEqual(inner.rings,base.rings);
  assert.notEqual(inner.color,base.color);assert.equal(inner.thread,undefined);
  assert.deepEqual(L.shadeLayers(next,outer).map(o=>o.id),['new',base.id]);
  assert.ok(validProject(next));
  // A third colour from the centre layer; bands stay contiguous.
  const third=L.addShade(next,'new','c').project;
  assert.deepEqual(L.shadeLayers(third,outer).map(L.band),[[0,25],[25,50],[50,100]]);
});

test('Meeting points move both neighbours and keep each band at least 4 %',()=>{
  const base=fill(),p=L.addShade(project([base]),base.id,'n').project,shade=p.objects[0].shade;
  let next=L.setShadeEdge(p,shade,0,30);
  assert.deepEqual(L.shadeLayers(next,next.objects[0]).map(L.band),[[0,30],[30,100]]);
  next=L.setShadeEdge(next,shade,0,99);
  assert.deepEqual(L.shadeLayers(next,next.objects[0]).map(L.band),[[0,96],[96,100]]);
});

test('Editing one layer moves the outline, centre and shared settings of the whole set',()=>{
  const base=fill(),p=L.addShade(project([base]),base.id,'n').project;
  const moved=p.objects.map(o=>o.id==='n'?{...o,rings:[square.map(([x,y])=>[x+5,y])],center:[55,50],fillLength:3,patternParams:{...o.patternParams,blend:4}}:o);
  const synced=L.syncShades({...p,objects:moved},p);
  const outer=synced.objects.find(o=>o.id===base.id);
  assert.deepEqual(outer.rings,[square.map(([x,y])=>[x+5,y])]);assert.deepEqual(outer.center,[55,50]);
  assert.equal(outer.fillLength,3);assert.equal(outer.patternParams.blend,4);
  assert.deepEqual(L.band(outer),[50,100]); // bands stay per layer
});

test('Removing a layer gives its band to a neighbour; a single layer leaves the set',()=>{
  const base=fill();let p=L.addShade(project([base]),base.id,'a').project;p=L.addShade(p,'a','b').project;
  const middle=L.removeShade(p,'a');
  assert.deepEqual(L.shadeLayers(middle,middle.objects[0]).map(L.band),[[0,25],[25,100]]);
  const alone=L.removeShade(middle,'b');
  assert.equal(alone.objects.length,1);assert.equal(alone.objects[0].shade,undefined);assert.deepEqual(L.band(alone.objects[0]),[0,100]);
  // Switching a layer to another pattern detaches it the same way.
  const switched=L.syncShades({...middle,objects:middle.objects.map(o=>o.id==='b'?{...o,fillPattern:'tatami',patternParams:undefined}:o)},middle);
  assert.equal(switched.objects.find(o=>o.id==='b').shade,undefined);
  assert.deepEqual(L.band(switched.objects.find(o=>o.id===base.id)),[0,100]);
});

test('Pasted copies elsewhere form their own set instead of snapping back',()=>{
  const base=fill();const p=L.addShade(project([base]),base.id,'n').project;
  const copies=p.objects.map((o,i)=>({...o,id:`copy${i}`,rings:[square.map(([x,y])=>[x,y+10])]}));
  const next=L.syncShades({...p,objects:[...p.objects,...copies]},p);
  assert.deepEqual(next.objects[0].rings,[square]);
  assert.equal(next.objects[2].shade,next.objects[3].shade);assert.notEqual(next.objects[2].shade,p.objects[0].shade);
  assert.deepEqual(next.objects[2].rings,[square.map(([x,y])=>[x,y+10])]);
});

test('Agents shade a shape in one step and can reshade the set from any layer',()=>{
  const {shadeObject,designSummary}=load('agent-tools');
  const base=fill({id:'flower',name:'Flower',fillPattern:undefined,underlay:'tatami'});
  let n=0;const ids=()=>`l${++n}`;
  const r=shadeObject(project([base]),'flower',{colors:[{color:'#f2efe6'},{threadCode:'586'},{color:'#c8955f'}],edges:[20,55],blend:2.5},ids);
  assert.ok(!r.error,r.error);assert.ok(validProject(r.project));
  const objs=r.project.objects;
  assert.equal(objs.length,3);
  assert.deepEqual(objs.map(L.band),[[55,100],[20,55],[0,20]]); // outer sewn first, centre on top
  assert.equal(objs[2].id,'flower');assert.ok(objs.every(o=>o.shade==='flower'&&o.fillPattern==='longShort'&&o.thread&&o.underlay===undefined&&o.patternParams.blend===2.5));
  assert.equal(objs[1].thread.code,'586');
  assert.deepEqual(designSummary(r.project,{}).objects[0].shading,{set:'flower',band:[55,100]});
  // Reshade from the outer layer: two colours, straight stitches; surplus layer removed, ids kept.
  const again=shadeObject(r.project,objs[0].id,{colors:[{color:'#ffffff'},{color:'#000000'}],radial:false,angle:20},ids);
  assert.ok(!again.error,again.error);
  assert.deepEqual(again.project.objects.map(o=>o.id),[objs[1].id,'flower']);
  assert.deepEqual(again.project.objects.map(L.band),[[50,100],[0,50]]);
  assert.ok(again.project.objects.every(o=>o.patternParams.radial===0&&o.angle===20));
  // One colour leaves a plain long & short fill.
  const single=shadeObject(again.project,'flower',{colors:[{color:'#ffffff'}]},ids);
  assert.equal(single.project.objects.length,1);assert.equal(single.project.objects[0].shade,undefined);
  for(const [spec,message] of [[{colors:[]},/1 to 6/],[{colors:[{color:'red'}]},/#rrggbb/],[{colors:[{color:'#ffffff'},{color:'#000000'}],edges:[2]},/edges/],[{colors:[{color:'#ffffff'}],blend:9},/blend/]])
    assert.match(shadeObject(project([base]),'flower',spec,ids).error,message);
  assert.match(shadeObject(project([{...base,kind:'running'}]),'flower',{colors:[{color:'#ffffff'}]},ids).error,/closed fill/);
});
