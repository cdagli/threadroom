import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {object,demo,validProject,resolve,kindNames,kindHints,ropeDefaults}=load('project');
const {changeStitchKind,stitchGroups,curveRing,railSamples,railSegments,blockCentre,blockWidths,withRails,draftRails,draftBlockPaths,insertGeometryPoint,removeGeometryPoint,moveGeometry,setCorner,isCorner,closestInsertion,insertionHandles,geometryPayload,routeEnds,snapEnd}=load('curves');
const {completeDraft}=load('drawing');
const {checkProject}=load('check');
const {exportSVG}=load('svg-export');
const {en,tr}=load('i18n');
const project=objects=>({...demo(),objects});
const block=(left,right,corners)=>withRails(object('Block',[],'satin-block'),{points:[left,right],...(corners&&{corners})});
const straight=()=>block([[30,39],[60,39]],[[30,41],[60,41]]);
const near=(a,b,e=1e-9)=>Math.abs(a-b)<=e;

test('Rope runs are line styles with Ember defaults, validation and export',()=>{
  for(const kind of ['double-rope','triple-rope']){assert.ok(en[kindNames[kind]]&&tr[kindNames[kind]]&&tr[kindHints[kind]]);}
  assert.equal(tr[kindNames['double-rope']],'Çift halat dikişi');assert.equal(tr[kindNames['triple-rope']],'Üçlü halat dikişi');
  const line={...object('Line',[[[10,10],[40,10]]],'running')};
  for(const groups of [stitchGroups(line)])
    assert.ok(groups.at(-1).kinds.includes('double-rope')&&groups.at(-1).kinds.includes('triple-rope'));
  const rope=changeStitchKind(line,'double-rope');assert.equal(rope.length,ropeDefaults.length);assert.deepEqual(rope.rings,line.rings);
  assert.equal(changeStitchKind({...rope,length:2.2},'triple-rope').length,2.2,'rope to rope keeps the length');
  assert.ok(validProject(project([{...rope,ropeWidth:.2}])));assert.ok(validProject(project([{...rope,ropeWidth:2}])));
  for(const ropeWidth of [.1,2.5,'1'])assert.equal(validProject(project([{...rope,ropeWidth}])),false);
  assert.match(exportSVG(project([{...rope,ropeWidth:.6}])),/data-threadroom-kind="double-rope"[^>]*data-threadroom-rope-width="0.6"/);
  assert.equal(geometryPayload(project([rope])).objects[0].rings,rope.rings,'rope geometry is sent as drawn');
});

test('E-stitch flip is optional, validated and exported only when set',()=>{
  const e=object('Edge',[[[10,10],[40,10]]],'e-stitch');
  assert.ok(validProject(project([{...e,eFlipped:true}])));assert.equal(validProject(project([{...e,eFlipped:'yes'}])),false);
  assert.doesNotMatch(exportSVG(project([e])),/e-flipped/);assert.match(exportSVG(project([{...e,eFlipped:true}])),/data-threadroom-e-flipped="true"/);
});

test('The Blocks tool pairs alternate clicks into left and right rails with corner flags',()=>{
  const points=[[10,10],[10,14],[20,10],[20,16],[30,10]],corners=[true,false,true,true,false];
  assert.equal(completeDraft('blocks',points.slice(0,3),corners,'enter'),null);
  assert.deepEqual(completeDraft('blocks',points.slice(0,4),corners,'enter'),{closed:false,kind:'satin-block'});
  const rails=draftRails(points,corners);
  assert.deepEqual(rails.points,[[[10,10],[20,10]],[[10,14],[20,16]]],'the unpaired last click is dropped');
  assert.deepEqual(rails.corners,[[true,true],[false,true]]);
  assert.equal(draftRails(points.slice(0,3),corners),null);
  const preview=draftBlockPaths(points,corners);
  assert.equal(preview.length,4,'two rails and two rungs');assert.deepEqual(preview.slice(2),[[[10,10],[10,14]],[[20,10],[20,16]]]);
  assert.equal(draftBlockPaths(points.slice(0,1),corners).length,0);
});

test('Block rails sample in pairs per rung segment; tapered widths interpolate linearly',()=>{
  const o=block([[20,40],[40,40],[60,40]],[[20,41],[40,43],[60,45]],[[true,true,true],[true,true,true]]);
  const [left,right]=railSamples(o.rails),segments=railSegments(o.rails);
  assert.equal(left.length,right.length);assert.equal(segments.length,2);
  for(const s of segments)assert.equal(s.left.length,s.right.length);
  assert.deepEqual(left[0],[20,40]);assert.deepEqual(right.at(-1),[60,45]);
  const widths=blockWidths(o.rails);
  for(let i=0;i<left.length;i++){const x=left[i][0];assert.ok(near(widths[i],1+(x-20)/10,1e-6),`width at ${x}`);}
  assert.deepEqual(o.rings,[blockCentre(o.rails)]);assert.deepEqual(o.rings[0][0],[20,40.5]);
  assert.deepEqual(railSamples(o.rails),[left,right],'cached samples stay stable');
});

test('Blocks validate their rails, keep their kind and load beside legacy satin blocks',()=>{
  const o=straight();assert.ok(validProject(JSON.parse(JSON.stringify(project([o])))));
  for(const bad of [{...o,rails:undefined},{...o,rails:{points:[[[1,1],[2,2]],[[1,2]]]}},{...o,rails:{points:[[[1,1]],[[1,2]]]}},{...o,rails:{points:[[[1,1],[2,2]],[[1,2],[2,3]]],corners:[[true],[true,true]]}},
    {...o,rails:{points:[Array.from({length:101},(_,i)=>[i/2,1]),Array.from({length:101},(_,i)=>[i/2,3])]}},{...o,kind:'satin'},{...o,curve:{points:[[1,1],[2,2]],closed:false}},{...o,rails:{points:[[[1,1],[2,'x']],[[1,2],[2,3]]]}}])
    assert.equal(validProject(project([bad])),false);
  // The old Blocks tool saved centre-line satin with a curve; it still loads and sews as satin.
  const legacyCurve={points:[[10,10],[30,20],[50,10]],closed:false,corners:[true,true,true],spline:'levien'};
  const legacy={...object('Satin block',[curveRing(legacyCurve)],'satin'),curve:legacyCurve};
  assert.ok(validProject(project([legacy])));const sent=geometryPayload(project([legacy])).objects[0];
  assert.equal(sent.kind,'satin');assert.equal(sent.railPaths,undefined);assert.deepEqual(stitchGroups(legacy).at(-1).kinds.includes('satin'),true);
  assert.deepEqual(stitchGroups(o),[{label:'Blocks',kinds:['satin-block']}]);
  for(const kind of ['running','fill','satin'])assert.equal(changeStitchKind(o,kind),o);
  assert.equal(changeStitchKind(legacy,'satin-block'),legacy);
});

test('Block rails edit as rung pairs: move one point, insert and remove rungs, toggle corners',()=>{
  const o=block([[20,40],[60,40]],[[20,44],[60,44]],[[true,true],[true,true]]);
  const moved=moveGeometry(o,([x,y],ring,i)=>ring===1&&i===1?[x,y+2]:[x,y]);
  assert.deepEqual(moved.rails.points,[[[20,40],[60,40]],[[20,44],[60,46]]]);assert.notDeepEqual(moved.rings,o.rings);
  const shifted=moveGeometry({...o,entry:[20,42]},([x,y])=>[x+1,y]);assert.deepEqual(shifted.entry,[21,42]);assert.deepEqual(shifted.rails.points[0][0],[21,40]);
  const handles=insertionHandles(o);assert.equal(handles.length,1);assert.ok(near(handles[0].point[0],40,.2)&&near(handles[0].point[1],42));
  const hit=closestInsertion(o,[40,42.3]);assert.equal(hit.index,1);
  const added=insertGeometryPoint(o,hit.ring,hit.index,[40,42],true);
  assert.equal(added.rails.points[0].length,3);assert.ok(near(added.rails.points[0][1][0],40,.2)&&near(added.rails.points[0][1][1],40));assert.ok(near(added.rails.points[1][1][1],44));
  assert.deepEqual(added.rails.corners,[[true,true,true],[true,true,true]]);assert.ok(validProject(project([added])));
  assert.equal(removeGeometryPoint(o,0,0),o,'two rungs is the minimum');
  const removed=removeGeometryPoint(added,1,1);assert.deepEqual(removed.rails.points,o.rails.points);assert.deepEqual(removed.rails.corners,o.rails.corners);
  const smooth=setCorner(added,1,false,1);assert.equal(isCorner(smooth,1,1),false);assert.equal(isCorner(smooth,0,1),true);
  assert.equal(setCorner(o,0,false,2),o);
  // Ends sit at the block's ends (rung midpoints), like an open satin line.
  assert.deepEqual(snapEnd(o,[61,45]),[60,42]);
  // Centre underlay (woven default) returns before the satin, so the block ends where it starts.
  const ends=routeEnds(project([o]),o.id);assert.deepEqual([ends.entry,ends.exit],[[20,42],[20,42]]);
  const bare=routeEnds(project([{...o,underlay:'none'}]),o.id);assert.deepEqual([bare.entry,bare.exit],[[20,42],[60,42]]);
});

test('Block payload carries paired rails and satin settings; design check uses local width',()=>{
  const o=block([[20,40],[60,40]],[[20,40.2],[60,43]]),p={...project([o]),fabric:'woven'};
  const sent=geometryPayload(p).objects[0],[left,right]=sent.railPaths;
  assert.equal(left.length,right.length);assert.deepEqual(sent.rings,[blockCentre(o.rails)]);
  const r=resolve(o,'woven',p.locks);assert.deepEqual([r.spacing,r.underlay,r.splitLength,r.shortStitches,r.pullCompensation],[.4,'center',7,true,.2]);
  assert.deepEqual(checkProject(p).filter(w=>w.code.startsWith('satin')),[],'a tapered tip is not flagged');
  const pinch=block([[20,40],[40,40],[60,40]],[[20,44],[40,40.5],[60,44]],[[true,true,true],[true,true,true]]);
  const narrow=checkProject(project([pinch])).find(w=>w.code==='satin-narrow');assert.equal(narrow.severity,'check');assert.ok(narrow.bounds[0]>30&&narrow.bounds[2]<50,'marked at the pinch');
  assert.equal(checkProject(project([block([[20,40],[60,40]],[[20,40.5],[60,40.5]])])).find(w=>w.code==='satin-narrow').severity,'fail');
  const wide=checkProject(project([block([[20,40],[60,40]],[[20,42],[60,50]])])).find(w=>w.code==='satin-wide');
  assert.ok(wide.values.width>7.9&&wide.bounds[0]>40,'only the wide end');
  const long=checkProject(project([{...block([[20,40],[60,40]],[[20,42],[60,50]]),splitLength:12}])).find(w=>w.code==='satin-long');assert.equal(long.severity,'fail');
  const svg=exportSVG(project([o]));
  assert.match(svg,/data-threadroom-kind="satin-block"/);assert.match(svg,/data-threadroom-split-length="7"/);assert.match(svg,/data-threadroom-rails="/);
  assert.equal((svg.match(/<path[^>]* d="([^"]*)"/)[1].match(/M/g)||[]).length,2,'two rail subpaths');
});

test('Rope and block compiler messages translate',()=>{
  const {errorText,createT}=load('i18n'),turkish=createT('tr'),fallback='The stitch engine rejected this design.';
  assert.equal(errorText('Rope width must be between 0.2 and 2.',turkish,fallback),'Halat genişliği, 0,2 ile 2 arasında olmalıdır.');
  assert.equal(errorText('A satin block needs two rails with the same number of points.',turkish,fallback),'Saten blok, nokta sayısı aynı olan iki ray gerektirir.');
  assert.equal(errorText('E-stitch flip must be on or off.',turkish,fallback),'E dikişi çevirme açık ya da kapalı olmalıdır.');
});
