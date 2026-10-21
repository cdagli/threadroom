import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

import {readFileSync} from 'node:fs';
import {load} from './load-lib.mjs';
const {curvePoints,moveGeometry,simplifyPath,geometryPayload,samplePath,closestInsertion,insertionHandles,insertGeometryPoint,removeGeometryPoint}=load('curves');
const {zoomViewport,panViewport,clientToWorld,viewportScale}=load('viewport');
const {object,validProject}=load('project');
const anchors=[[20,40],[35,20],[55,30],[65,50]];
const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-8;

test('Unset corners retain the original open and closed tessellation exactly',()=>{
  const paths=[false,true].map(closed=>curvePoints(anchors,closed));
  assert.equal(createHash('sha256').update(JSON.stringify(paths)).digest('hex'),'3c33aee05618b0f4a178c025b86a9aeadae9a29c800a90cda51da3fecf2599ee');
  for(const closed of [false,true])assert.deepEqual(curvePoints(anchors,closed),curvePoints(anchors,closed,anchors.map(()=>false)));
});

test('Corner tangents follow their own segment and two corners form a straight line',()=>{
  const {curveSegments}=load('curves'),points=[[10,10],[30,10],[30,30],[10,30]],corners=[true,true,true,true];
  const segments=curveSegments(points,true,corners);
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    assert.deepEqual(segments[i][0],a);assert.deepEqual(segments[i].at(-1),b);
    for(const p of segments[i])assert.ok(Math.abs((p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]))<1e-8);
  }
  const smooth=curveSegments(points,true),corner=curveSegments(points,true,[true,false,false,false]);
  assert.ok(smooth[0][1][1]<10);assert.ok(corner[0][1][1]>smooth[0][1][1]);
  const derivative=(path,start)=>{const a=start?path[0]:path.at(-2),b=start?path[1]:path.at(-1);return [b[0]-a[0],b[1]-a[1]];};
  const incoming=derivative(segments.at(-1),false),outgoing=derivative(segments[0],true);
  assert.equal(incoming[0],0);assert.equal(outgoing[1],0);assert.ok(incoming[1]<0&&outgoing[0]>0);
  assert.deepEqual(curveSegments([[1,2]],false,[true]),[]);
  assert.deepEqual(curvePoints([[1,2],[3,4]],false,[true,true]),[[1,2],[3,4]]);
});

test('Corner flags stay aligned through toggling, insertion, removal and movement',()=>{
  const {curveRing,setCorner}=load('curves'),curve={points:anchors,closed:true,corners:[true,false,true,false]};
  const o={...object('Corners',[curveRing(curve)]),curve};
  const changed=setCorner(o,1,true);
  assert.deepEqual(changed.curve.corners,[true,true,true,false]);assert.deepEqual(changed.rings,[curveRing(changed.curve)]);
  assert.deepEqual(o.curve.corners,[true,false,true,false]);
  const plain={...o,curve:{points:anchors,closed:true}},first=setCorner(plain,2,true);
  assert.deepEqual(first.curve.corners,[false,false,true,false]);
  assert.equal(setCorner(o,-1,true),o);assert.equal(setCorner(o,4,true),o);assert.equal(setCorner(o,.5,true),o);
  assert.equal(setCorner(object('Line',[anchors],'running'),0,true).curve,undefined);
  for(const index of [0,2,4]){
    const added=insertGeometryPoint(o,0,index,[40,40]);
    assert.deepEqual(added.curve.corners,[...curve.corners.slice(0,index),false,...curve.corners.slice(index)]);
    assert.deepEqual(added.rings,[curveRing(added.curve)]);
    const removed=removeGeometryPoint(added,0,index);
    assert.deepEqual(removed.curve,curve);assert.deepEqual(removed.rings,o.rings);
  }
  const moved=moveGeometry(o,([x,y])=>[2*x+3,2*y+4]);
  assert.deepEqual(moved.curve.corners,curve.corners);assert.deepEqual(moved.rings,[curveRing(moved.curve)]);
  assert.equal(insertGeometryPoint(plain,0,2,[40,40]).curve.corners,undefined);
  const handles=insertionHandles(changed),hit=closestInsertion(changed,handles[0].point);
  assert.equal(hit.index,1);assert.ok(hit.distance<1e-8);
  const payload=geometryPayload({version:1,name:'Corners',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:{tieIn:'tack',tieOff:'tack',lockSize:1},trimJump:3,objects:[moved]});
  assert.deepEqual(payload.objects[0].curve,moved.curve);assert.deepEqual(payload.objects[0].rings,moved.rings);
});

test('Curve passes through anchors and preserves open endpoints',()=>{
  const curve=curvePoints(anchors,false);
  assert.deepEqual(curve[0],anchors[0]);assert.deepEqual(curve.at(-1),anchors.at(-1));
  for(const p of anchors)assert.ok(curve.some(q=>near(p,q)));
  assert.ok(curve.length>anchors.length);
  assert.ok(curve.every(p=>p.every(Number.isFinite)));
  assert.ok(curve.slice(1).every((p,i)=>Math.hypot(p[0]-curve[i][0],p[1]-curve[i][1])<.6));
});

test('Closed curves include a continuous closing arc without repeating the first point',()=>{
  const curve=curvePoints(anchors,true);
  for(const p of anchors)assert.ok(curve.some(q=>near(p,q)));
  assert.ok(!near(curve[0],curve.at(-1)));
  assert.ok(Math.hypot(curve[0][0]-curve.at(-1)[0],curve[0][1]-curve.at(-1)[1])<.6);
});

test('Moving and resizing retain editable anchors and regenerate matching stitch geometry',()=>{
  const o={...object('Curve',[curvePoints(anchors,false)]),curve:{points:anchors,closed:false}};
  const shifted=moveGeometry(o,([x,y])=>[x+5,y+7]);
  assert.deepEqual(shifted.curve.points,anchors.map(([x,y])=>[x+5,y+7]));
  assert.ok(shifted.rings[0].every((p,i)=>near(p,[o.rings[0][i][0]+5,o.rings[0][i][1]+7])));
  const scaled=moveGeometry(o,([x,y])=>[x*1.5,y*1.5]);
  assert.deepEqual(scaled.rings,[curvePoints(scaled.curve.points,false)]);
  const movedAnchor=moveGeometry(o,(p,r,i)=>i===1?[40,22]:p);
  assert.deepEqual(movedAnchor.curve.points[1],[40,22]);
  assert.ok(movedAnchor.rings[0].some(p=>near(p,[40,22])));
  assert.deepEqual(o.curve.points,anchors);
});

test('Freehand simplification removes jitter and retains corners/endpoints',()=>{
  const points=[[0,0],[1,.01],[2,0],[3,0],[3,1],[3,2],[3,3]];
  assert.deepEqual(simplifyPath(points,.1),[[0,0],[3,0],[3,3]]);
});

test('Curve projects round-trip anchors and reject malformed control points',()=>{
  const o={...object('Curve',[curvePoints(anchors,false)],'running'),curve:{points:anchors,closed:false}};
  const p={version:1,name:'Curve test',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:{tieIn:'tack',tieOff:'tack',lockSize:1},trimJump:3,objects:[o]};
  assert.ok(validProject(JSON.parse(JSON.stringify(p))));
  assert.equal(validProject({...p,objects:[{...o,curve:{points:[[NaN,1],[2,3]],closed:false}}]}),false);
  assert.equal(validProject({...p,objects:[{...o,curve:{points:[[1,1],[2,3]],closed:true}}]}),false);
  assert.equal(validProject({...p,objects:[{...o,length:0}]}),false);
  assert.throws(()=>samplePath(anchors,0),/positive stitch length/);
});

test('Export uses stitch length rather than display tessellation density for curves',()=>{
  const o={...object('Curve',[curvePoints(anchors,false)],'running'),curve:{points:anchors,closed:false}};
  const p={version:1,name:'Curve',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:{tieIn:'tack',tieOff:'tack',lockSize:1},trimJump:3,objects:[o],artwork:{src:'image'}};
  const exported=geometryPayload(p);
  assert.equal(exported.artwork,undefined);
  const ring=exported.objects[0].rings[0];
  assert.ok(ring.length<o.rings[0].length/4);
  assert.ok(near(ring[0],anchors[0]));assert.ok(near(ring.at(-1),anchors.at(-1)));
  assert.ok(ring.slice(1).every((p,i)=>Math.hypot(p[0]-ring[i][0],p[1]-ring[i][1])<=o.length+1e-8));
  assert.equal(p.objects[0],o);assert.ok(p.artwork);
});

test('Stitch library projects round-trip and validate compatible underlays',()=>{
  const p=JSON.parse(readFileSync(new URL('./stitch-library.project.json',import.meta.url)));
  assert.ok(validProject(p));
  assert.equal(validProject({...p,objects:[{...p.objects[0],underlay:'unknown'}]}),false);
  assert.equal(validProject({...p,objects:[{...p.objects.find(o=>o.kind==='satin'),underlay:'tatami'}]}),false);
  assert.equal(validProject({...p,objects:[{...p.objects.find(o=>o.kind==='running'),underlay:'edge'}]}),false);
  const o={...object('Curve',[curvePoints(anchors,false)],'backstitch'),curve:{points:anchors,closed:false}};
  const sampled=geometryPayload({...p,objects:[o]}).objects[0].rings[0];
  assert.ok(sampled.length<o.rings[0].length/4);
  assert.ok(near(sampled[0],anchors[0]));assert.ok(near(sampled.at(-1),anchors.at(-1)));
});

test('Adding a curve anchor finds the displayed curve and regenerates export geometry',()=>{
  const o={...object('Curve',[curvePoints(anchors,false)],'running'),curve:{points:anchors,closed:false}};
  const handle=insertionHandles(o)[1],hit=closestInsertion(o,handle.point);
  assert.equal(hit.index,2);assert.equal(hit.ring,0);assert.ok(hit.distance<1e-8);
  const next=insertGeometryPoint(o,hit.ring,hit.index,hit.point);
  assert.equal(next.curve.points.length,5);assert.deepEqual(next.curve.points[2],hit.point);
  assert.deepEqual(next.rings,[curvePoints(next.curve.points,false)]);
  assert.equal(o.curve.points.length,4);assert.equal(o.curve.points,anchors);
  const p={version:1,name:'Edited curve',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:{tieIn:'tack',tieOff:'tack',lockSize:1},trimJump:3,objects:[next]};
  assert.ok(validProject(JSON.parse(JSON.stringify(p))));
  assert.ok(geometryPayload(p).objects[0].rings[0].length<next.rings[0].length);
});

test('Closed-curve insertion includes the closing arc and respects anchor limits',()=>{
  const o={...object('Closed curve',[curvePoints(anchors,true)]),curve:{points:anchors,closed:true}};
  const handle=insertionHandles(o).at(-1),hit=closestInsertion(o,handle.point);
  assert.equal(hit.index,anchors.length);
  const next=insertGeometryPoint(o,0,hit.index,hit.point);
  assert.equal(next.curve.closed,true);assert.deepEqual(next.curve.points.at(-1),hit.point);
  assert.deepEqual(next.rings,[curvePoints(next.curve.points,true)]);
  const full={...o,curve:{points:Array.from({length:200},(_,i)=>[i/3,40]),closed:false}};
  assert.equal(insertGeometryPoint(full,0,3,[1,42]),full);
});

test('Removing points preserves minimum shape sizes and editable curve anchors',()=>{
  const o={...object('Curve',[curvePoints(anchors,false)],'running'),curve:{points:anchors,closed:false}};
  const next=removeGeometryPoint(o,0,1);
  assert.deepEqual(next.curve.points,[anchors[0],anchors[2],anchors[3]]);
  assert.deepEqual(next.rings,[curvePoints(next.curve.points,false)]);
  const two=removeGeometryPoint(next,0,1);
  assert.equal(removeGeometryPoint(two,0,0),two);
  const closed={...next,curve:{...next.curve,closed:true}};
  assert.equal(removeGeometryPoint(closed,0,0),closed);
  assert.equal(o.curve.points.length,4);
});

test('Polygon point changes preserve independent holes and manual point paths',()=>{
  const rings=[[[10,10],[80,10],[80,80],[10,80]],[[30,30],[60,30],[60,60],[30,60]]];
  const o=object('Fill',rings),next=insertGeometryPoint(o,1,2,[60,45]);
  assert.equal(next.rings[0],rings[0]);assert.equal(next.rings[1].length,5);assert.equal(o.rings[1].length,4);
  assert.deepEqual(removeGeometryPoint(next,1,2).rings,rings);
  const line=object('Manual',[[[20,20],[60,20]]],'manual'),handle=insertionHandles(line)[0];
  assert.deepEqual(handle.point,[40,20]);assert.deepEqual(insertGeometryPoint(line,0,1,handle.point).rings[0],[[20,20],[40,20],[60,20]]);
});

test('Zoom keeps the point under the cursor fixed, including SVG letterboxing',()=>{
  const hoop={width:180,height:130},rect={left:20,top:40,width:900,height:720},client=[211,345];
  const before={zoom:1.7,pan:[14,-6]},anchor=clientToWorld(before,client,rect,hoop);
  const after=zoomViewport(before,anchor,4.3,hoop);
  assert.ok(near(clientToWorld(after,client,rect,hoop),anchor));
  assert.ok(near(zoomViewport(after,anchor,before.zoom,hoop).pan,before.pan));
});

test('Zoom limits keep anchors fixed and screen dragging moves the scene by the drag distance',()=>{
  const hoop={width:100,height:100},rect={left:0,top:0,width:1000,height:500},view={zoom:1,pan:[0,0]},client=[400,250];
  const anchor=clientToWorld(view,client,rect,hoop);
  const max=zoomViewport(view,anchor,100,hoop),min=zoomViewport(view,anchor,.01,hoop);
  assert.equal(max.zoom,8);assert.equal(min.zoom,.5);
  assert.ok(near(clientToWorld(max,client,rect,hoop),anchor));assert.ok(near(clientToWorld(min,client,rect,hoop),anchor));
  const delta=[100,-40],next=panViewport(view,delta,viewportScale(view,rect,hoop));
  assert.ok(near(clientToWorld(next,[client[0]+delta[0],client[1]+delta[1]],rect,hoop),anchor));
});

test('Entry and exit snap to the outline and survive moving, resizing and anchor edits',()=>{
  const {withEnd,snapEnd,openPath}=load('curves');
  const square=[[30,30],[60,30],[60,60],[30,60]];
  let o=withEnd(withEnd(object('Region',[square]),'entry',[20,45]),'exit',[50,61]);
  assert.deepEqual([o.entry,o.exit],[[30,45],[50,60]]);
  const moved=moveGeometry(o,([x,y])=>[x+5,y+7]);
  assert.deepEqual([moved.entry,moved.exit],[[35,52],[55,67]]);
  const scaled=moveGeometry(o,([x,y])=>[45+(x-45)*1.5,45+(y-45)*1.5]);
  assert.deepEqual(scaled.entry,[22.5,45]);assert.ok(near(snapEnd(scaled,scaled.entry),scaled.entry));assert.ok(near(snapEnd(scaled,scaled.exit),scaled.exit));
  const anchor=moveGeometry(o,(p,r,i)=>r===0&&i===1?[70,30]:p);
  assert.deepEqual(anchor.entry,o.entry);assert.deepEqual(anchor.rings[0][1],[70,30]);
  const curve=withEnd({...object('Curve',[curvePoints(anchors,false)],'running'),curve:{points:anchors,closed:false}},'entry',[66,51]);
  assert.deepEqual(curve.entry,anchors.at(-1));
  const shifted=moveGeometry(curve,([x,y])=>[x+2,y+3]);
  assert.deepEqual(shifted.entry,[67,53]);assert.deepEqual(shifted.rings,[curvePoints(shifted.curve.points,false)]);
  const p={version:1,name:'Ends',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:{tieIn:'tack',tieOff:'tack',lockSize:1},trimJump:3,objects:[o,shifted]};
  assert.ok(validProject(JSON.parse(JSON.stringify(p))));
  // Open paths: one end sets the direction, so the other setting is cleared.
  assert.ok(openPath(curve));assert.equal(openPath(o),false);
  const reversed=withEnd(curve,'exit',[19,40]);
  assert.deepEqual(reversed.exit,anchors[0]);assert.equal('entry' in reversed,false);
  assert.equal('entry' in withEnd(o,'entry',undefined),false);
  // Text keeps its ends when moved; the spec moves with it.
  const text={...o,text:{origin:[45,45],rotation:0,size:6,path:undefined},rings:[square]};
  const movedText=moveGeometry(text,([x,y])=>[x+1,y]);
  assert.deepEqual(movedText.entry,[31,45]);assert.deepEqual(movedText.text.origin,[46,45]);
});

test('Marker positions show explicit points and estimate automatic ones',()=>{
  const {routeEnds,withEnd}=load('curves');
  const a=object('A',[[[10,10],[30,10]]],'running'),b=object('B',[[[80,12],[35,12]]],'running'),c=object('C',[[[50,50],[70,50],[70,70],[50,70]]]);
  const p={version:1,name:'Ends',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:{tieIn:'tack',tieOff:'tack',lockSize:1},trimJump:3,objects:[a,b,c]};
  const auto=routeEnds(p,b.id);
  assert.deepEqual([auto.entry,auto.exit,auto.auto],[[35,12],[80,12],{entry:true,exit:true}]);
  const set=routeEnds({...p,objects:[a,withEnd(b,'entry',[81,12]),c]},b.id);
  assert.deepEqual([set.entry,set.exit,set.auto],[[80,12],[35,12],{entry:false,exit:true}]);
  const fill=routeEnds(p,c.id);assert.deepEqual(fill.auto,{entry:true,exit:true});
  const eyes=object('Eyes',[[[35,47],[41,47]],[[59,47],[65,47]]],'bean'),two=routeEnds({...p,objects:[c,eyes,object('Nose',[[[48,56],[52,56],[50,58]]])]},eyes.id);
  assert.deepEqual([two.entry,two.exit],[[59,47],[41,47]]);
  assert.equal(routeEnds(p,'missing'),null);
});

test('Levien curves retain their model through edits, validation, compiler payload and SVG export',()=>{
  const {curveRing,setCorner}=load('curves'),{exportSVG}=load('svg-export');
  const curve={points:anchors,closed:true,corners:[true,false,true,false],spline:'levien'},o={...object('Levien',[curveRing(curve)]),curve};
  const project={version:1,name:'Levien',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:{tieIn:'tack',tieOff:'tack',lockSize:1},trimJump:3,objects:[o]};
  assert.ok(validProject(project));assert.ok(!validProject({...project,objects:[{...o,curve:{...curve,spline:'other'}}]}));
  const added=insertGeometryPoint(o,0,1,[28,30],true);assert.deepEqual(added.curve.corners,[true,true,false,true,false]);assert.equal(added.curve.spline,'levien');
  const removed=removeGeometryPoint(added,0,1);assert.deepEqual(removed.curve,curve);
  for(const changed of [added,removed,setCorner(o,1,true),moveGeometry(o,([x,y])=>[x+1,y+1])]){
    assert.equal(changed.curve.spline,'levien');assert.deepEqual(changed.rings,[curveRing(changed.curve)]);
    const stale={...changed,rings:[[[0,0],[1,0],[1,1]]]};
    assert.deepEqual(geometryPayload({...project,objects:[stale]}).objects[0].rings,changed.rings);
    assert.equal(exportSVG({...project,objects:[stale]}),exportSVG({...project,objects:[changed]}));
    const handle=insertionHandles(changed)[0];assert.ok(closestInsertion(changed,handle.point).distance<1e-8);
  }
});
