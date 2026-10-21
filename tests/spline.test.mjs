import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {splineBeziers,sampleCubic,fitFreehand}=load('spline');
const curvature=(c,end)=>{const [a,b,d,e]=c,v=end?[3*(e[0]-d[0]),3*(e[1]-d[1])]:[3*(b[0]-a[0]),3*(b[1]-a[1])],w=end?[6*(e[0]-2*d[0]+b[0]),6*(e[1]-2*d[1]+b[1])]:[6*(d[0]-2*b[0]+a[0]),6*(d[1]-2*b[1]+a[1])];return (v[0]*w[1]-v[1]*w[0])/Math.hypot(...v)**3;};
test('Levien corners and open ends delimit independent runs',()=>{
  const c=splineBeziers([[0,0],[30,0]],false,[true,true])[0];assert.ok(c.flat().every((v,i)=>Math.abs(v-[[0,0],[10,0],[20,0],[30,0]].flat()[i])<1e-12));
  for(const flags of [[true,false],[false,false]])assert.deepEqual(splineBeziers([[0,0],[30,0]],false,flags)[0],c);
  const p=[[0,0],[20,-10],[40,0],[60,20]],flags=[true,false,true,false],before=splineBeziers(p,false,flags);
  assert.deepEqual(before.slice(0,2),splineBeziers([...p.slice(0,3),[80,40]],false,flags).slice(0,2));
  const rightAngle=splineBeziers([[0,0],[10,0],[10,10]],false,[false,true,false]);assert.ok(rightAngle[0].every(p=>Math.abs(p[1])<1e-12));assert.ok(rightAngle[1].every(p=>Math.abs(p[0]-10)<1e-12));
});
test('Levien sparse arc interpolates with natural ends and continuous curvature',()=>{
  const c=splineBeziers([[0,0],[20,-10],[40,0]],false,[true,false,true]);
  const degrees=Math.atan2(c[0][1][1],c[0][1][0])*180/Math.PI;assert.ok(Math.abs(degrees+49.48336)<.01,degrees);
  assert.deepEqual(c[0][3],[20,-10]);assert.deepEqual(c[1][0],[20,-10]);
  for(let i=0;i<4;i++){assert.ok(Math.abs(c[0][i][0]+c[1][3-i][0]-40)<.001);assert.ok(Math.abs(c[0][i][1]-c[1][3-i][1])<.001);}
  const irregular=splineBeziers([[0,0],[10,-5],[25,-8],[40,4],[60,0]],false);
  for(let i=1;i<irregular.length;i++){const a=curvature(irregular[i-1],true),b=curvature(irregular[i],false);assert.ok(Math.abs(a-b)/Math.max(Math.abs(a),Math.abs(b),1e-9)<.02,`${a} ${b}`);}
});
test('Twelve smooth nodes follow a true circle within 0.05 mm',()=>{
  const points=Array.from({length:12},(_,i)=>[10*Math.cos(i*Math.PI/6),10*Math.sin(i*Math.PI/6)]);
  const samples=splineBeziers(points,true).flatMap(c=>sampleCubic(c,.02));
  assert.ok(Math.max(...samples.map(p=>Math.abs(Math.hypot(...p)-10)))<.05);
  assert.ok(splineBeziers([[1,1],[1,1],[2,3]],false).flat(2).every(Number.isFinite));
});
test('Freehand simplifies straight jitter and retains an L corner',()=>{
  const straight=fitFreehand(Array.from({length:101},(_,i)=>[i/5,.01*Math.sin(i)]));assert.equal(straight.points.length,2);assert.deepEqual(straight.corners,[true,true]);
  const l=fitFreehand([...Array.from({length:21},(_,i)=>[i,0]),...Array.from({length:20},(_,i)=>[20,i+1])]);
  assert.deepEqual(l.points,[[0,0],[20,0],[20,20]]);assert.deepEqual(l.corners,[true,true,true]);
});
test('Freehand circle becomes an editable closed smooth spline; 3 mm gap stays open',()=>{
  const circle=Array.from({length:181},(_,i)=>[20+10*Math.cos(i*Math.PI/90),20+10*Math.sin(i*Math.PI/90)]),fit=fitFreehand(circle);
  assert.equal(fit.closed,true);assert.ok(fit.points.length>=3);assert.ok(fit.corners.every(c=>!c));
  assert.ok(Math.max(...splineBeziers(fit.points,true,fit.corners).flatMap(c=>sampleCubic(c,.1)).map(p=>Math.abs(Math.hypot(p[0]-20,p[1]-20)-10)))<.6);
  assert.equal(fitFreehand([[0,0],[10,0],[10,10],[0,3]]).closed,false);
});

test('Four smooth square nodes round into Levien arcs and cyclic corners split at the seam',()=>{
  const square=[[0,0],[20,0],[20,20],[0,20]],samples=splineBeziers(square,true).flatMap(c=>sampleCubic(c,.02));
  for(const p of samples){const r=Math.hypot(p[0]-10,p[1]-10);assert.ok(r>=13.7&&r<=14.15,r);}
  const flags=[false,true,false,true],curves=splineBeziers(square,true,flags),changed=splineBeziers([[3,-2],...square.slice(1)],true,flags);
  assert.deepEqual(curves.slice(1,3),changed.slice(1,3));
  for(const c of curves)assert.ok(c.flat().every(Number.isFinite));
});
