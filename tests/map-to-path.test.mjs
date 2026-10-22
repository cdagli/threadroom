import {test} from 'node:test';import assert from 'node:assert/strict';import {load} from './load-lib.mjs';
const {object,defaultLocks,validProject,ungroupObjects}=load('project'),{mapToPath,syncPathBindings,unlinkPath,updatePathSettings,defaultPathSettings}=load('map-to-path'),{moveGeometry,geometryPayload}=load('curves'),{layerRows,colourRuns}=load('layers'),{copySelection}=load('editing');
const base=()=>({version:1,machine:'brother-pr1x',name:'Border',hoop:'100x100',fabric:'woven',locks:defaultLocks,trimJump:3,objects:[{...object('heart',[[[2,2],[6,2],[4,6]]],'fill','#ff0000'),id:'prototype',spacing:.5,fillUnderlays:[{angle:30,spacing:2,length:3,inset:.2}]},{...object('path',[[[10,30],[90,30]]],'running'),id:'path'}]});
const settings={...defaultPathSettings,mode:'count',count:3};
const mapped=(p=base(),s=settings)=>mapToPath(p,['prototype'],'path',s,'Border','g');
const centre=o=>{const ps=o.rings.flat();return [Math.min(...ps.map(p=>p[0]))+(Math.max(...ps.map(p=>p[0]))-Math.min(...ps.map(p=>p[0])))/2,Math.min(...ps.map(p=>p[1]))+(Math.max(...ps.map(p=>p[1]))-Math.min(...ps.map(p=>p[1])))/2];};
test('path repeat preserves stitch settings, serialises binding and omits hidden guide from stitches and both layer views',()=>{
 const p=mapped(),copies=p.objects.filter(o=>o.group==='g');assert.equal(copies.length,3);assert.deepEqual(copies.map(centre),[[12,30],[50,30],[88,30]]);assert.ok(copies.every(o=>o.spacing===.5&&o.fillUnderlays[0].angle===30));assert.ok(validProject(p));assert.ok(validProject(JSON.parse(JSON.stringify(p))));assert.equal(geometryPayload(p).objects.length,3);assert.equal(layerRows(p,new Set()).filter(r=>r.type==='object').length,3);assert.deepEqual(colourRuns(p,null).flatMap(r=>r.ids),copies.map(o=>o.id));assert.equal(copySelection(p,copies.map(o=>o.id)).groups[0].pathBinding,undefined);
});
test('path and prototype edits relayout all instances in the same project update; unlink freezes geometry',()=>{
 const p=mapped(),path=p.objects.find(o=>o.id==='path'),moved={...p,objects:p.objects.map(o=>o.id==='path'?moveGeometry(o,([x,y])=>[x,y+10]):o)},next=syncPathBindings(moved,p);assert.deepEqual(next.objects.filter(o=>o.group==='g').map(centre),[[12,40],[50,40],[88,40]]);
 const changed={...next,objects:next.objects.map(o=>o.id==='prototype'?{...o,spacing:.7}:o)},edited=syncPathBindings(changed,next);assert.ok(edited.objects.filter(o=>o.group==='g').every(o=>o.spacing===.7));
 const detached=unlinkPath(edited,'g');assert.equal(detached.groups[0].pathBinding,undefined);assert.ok(!detached.objects.find(o=>o.id==='path').layoutOnly);assert.deepEqual(detached.objects.filter(o=>o.group==='g'),edited.objects.filter(o=>o.group==='g'));assert.equal(geometryPayload(detached).objects.length,4);
 const gone=syncPathBindings({...p,objects:p.objects.filter(o=>o.id!=='path')},p);assert.equal(gone.groups[0].pathBinding,undefined);assert.ok(validProject(gone));
 assert.ok(validProject(syncPathBindings(ungroupObjects(p,['prototype']),p)));
});
test('count, spacing, fill, rotation, reverse, centre alignment and start offset',()=>{
 const p=mapped(base(),{...settings,count:1,offset:10});assert.deepEqual(centre(p.objects[0]),[55,30]);const start=updatePathSettings(p,'g',{...settings,count:1,offset:10,align:'start'});assert.deepEqual(centre(start.objects[0]),[22,30]);
 const vertical=base();vertical.objects[1].rings=[[[30,10],[30,90]]];const rotated=mapped(vertical);const copy=rotated.objects[0];assert.deepEqual(centre(copy),[30,12]);assert.deepEqual(copy.rings[0][0],[32,10]);const reversed=updatePathSettings(rotated,'g',{...settings,reverse:true});assert.deepEqual(centre(reversed.objects[0]),[30,88]);
 const spaced=mapped(base(),{...settings,mode:'spacing',spacing:6});assert.equal(spaced.groups[0].pathBinding.members.length,8);assert.deepEqual(centre(spaced.objects[0]),[15,30]);const filled=mapped(base(),{...settings,mode:'fill',spacing:6});assert.deepEqual(centre(filled.objects[0]),[12,30]);
});
test('binding input validation and design limits reject corrupt or unbounded layouts',()=>{
 const p=mapped();for(const patch of [{offset:NaN},{count:0},{count:81},{spacing:-1}]){assert.throws(()=>updatePathSettings(p,'g',{...settings,...patch}));}
 const broken=JSON.parse(JSON.stringify(p));broken.groups[0].pathBinding.members[0][0]='missing';assert.equal(validProject(broken),false);assert.throws(()=>mapped(base(),{...settings,count:80}));assert.throws(()=>mapToPath(base(),['path'],'path',settings,'Bad'));
 const q=base();q.objects[0].locked=true;assert.throws(()=>mapped(q));
});
test('multiple prototypes keep relative positions; curved guide and geometry edits relayout after reload',()=>{
 const p=base(),extra={...p.objects[0],id:'second',color:'#0000ff',rings:[[[7,2],[9,2],[8,4]]],spacing:.6};p.objects.splice(1,0,extra);
 p.objects[2]={...p.objects[2],curve:{points:[[10,30],[50,50],[90,30]],closed:false,corners:[false,false,false]}};
 const n=mapToPath(p,['prototype','second'],'path',{...settings,count:2},'Two motifs','g'),copies=n.objects.filter(o=>o.group==='g');assert.equal(copies.length,4);assert.deepEqual(copies.map(o=>o.spacing),[.5,.6,.5,.6]);assert.ok(validProject(n));
 const saved=JSON.parse(JSON.stringify(n)),reloaded=syncPathBindings(saved);assert.ok(validProject(reloaded));
 const changed={...reloaded,objects:reloaded.objects.map(o=>o.id==='prototype'?moveGeometry(o,([x,y])=>[x+1,y]):o)},updated=syncPathBindings(changed,reloaded);assert.notDeepEqual(updated.objects[2].rings,reloaded.objects[2].rings);assert.equal(updated.groups[0].pathBinding.members.length,2);
});
test('per-copy lock and hide survive relayout; guide moved with its copies is applied once',()=>{
 const p=mapped(),locked=syncPathBindings({...p,objects:p.objects.map(o=>o.id==='prototype'?{...o,locked:true,hidden:true}:o.group==='g'?{...o,hidden:true}:o)},p);assert.ok(locked.groups[0].pathBinding);
 const copies=locked.objects.filter(o=>o.group==='g');assert.deepEqual(copies.map(o=>[!!o.locked,!!o.hidden]),[[true,true],[false,true],[false,true]]);assert.ok(locked.groups[0].pathBinding.prototypes.every(o=>!o.locked&&!o.hidden));assert.deepEqual(copies.map(centre),[[12,30],[50,30],[88,30]]);
 const path=syncPathBindings({...locked,objects:locked.objects.map(o=>o.id==='path'?moveGeometry(o,([x,y])=>[x,y+5]):o)},locked);assert.deepEqual(path.objects.filter(o=>o.group==='g').map(o=>[!!o.locked,!!o.hidden]),[[true,true],[false,true],[false,true]]);
 const all=syncPathBindings({...p,objects:p.objects.map(o=>moveGeometry(o,([x,y])=>[x+3,y+10]))},p);assert.deepEqual(all.objects.filter(o=>o.group==='g').map(centre),[[15,40],[53,40],[91,40]]);assert.ok(all.groups[0].pathBinding);
});
