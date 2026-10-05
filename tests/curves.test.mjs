import {test} from 'node:test';
import assert from 'node:assert/strict';

import {readFileSync} from 'node:fs';
import {load} from './load-lib.mjs';
const {curvePoints,moveGeometry,simplifyPath,geometryPayload,samplePath,closestInsertion,insertionHandles,insertGeometryPoint,removeGeometryPoint}=load('curves');
const {zoomViewport,panViewport,clientToWorld,viewportScale}=load('viewport');
const {object,validProject}=load('project');
const anchors=[[20,40],[35,20],[55,30],[65,50]];
const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-8;

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
  const p={version:1,name:'Curve test',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',objects:[o]};
  assert.ok(validProject(JSON.parse(JSON.stringify(p))));
  assert.equal(validProject({...p,objects:[{...o,curve:{points:[[NaN,1],[2,3]],closed:false}}]}),false);
  assert.equal(validProject({...p,objects:[{...o,curve:{points:[[1,1],[2,3]],closed:true}}]}),false);
  assert.equal(validProject({...p,objects:[{...o,length:0}]}),false);
  assert.throws(()=>samplePath(anchors,0),/positive stitch length/);
});

test('Export uses stitch length rather than display tessellation density for curves',()=>{
  const o={...object('Curve',[curvePoints(anchors,false)],'running'),curve:{points:anchors,closed:false}};
  const p={version:1,name:'Curve',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',objects:[o],artwork:{src:'image'}};
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
  assert.equal(validProject({...p,objects:[{...p.objects[0],underlayType:'unknown'}]}),false);
  assert.equal(validProject({...p,objects:[{...p.objects.find(o=>o.kind==='satin'),underlay:true,underlayType:'tatami'}]}),false);
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
  const p={version:1,name:'Edited curve',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',objects:[next]};
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
