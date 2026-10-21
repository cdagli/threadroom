import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const shapes=load('shapes'),{circle,rect,star,triangle,diamond,hexagon,heart,shapeNames,fitRadius,fitRect}=shapes;
const {curvePoints}=load('curves');
const near=(a,b)=>Math.abs(a-b)<1e-9;
const outline=(kind,c,r)=>{const s=kind==='rect'?rect([c[0]-r,c[1]-r],[c[0]+r,c[1]+r]):shapes[kind](c,r);return curvePoints(s.points,true,s.corners);};
const inside=(pts,h)=>pts.every(([x,y])=>x>=-1e-9&&y>=-1e-9&&x<=h.width+1e-9&&y<=h.height+1e-9);

test('Shape names and radial node layouts use millimetres with their top point facing up',()=>{
  assert.deepEqual(Object.keys(shapeNames),['circle','rect','star','triangle','diamond','hexagon','heart']);
  assert.equal(shapeNames.rect,'Rectangle');assert.ok(Object.values(shapeNames).every(n=>typeof n==='string'&&n.length));
  const c=[23,31],r=12;
  for(const [make,n,start,corner,inner] of [[circle,12,Math.PI,false,1],[star,10,-Math.PI/2,true,.382],[triangle,3,-Math.PI/2,true,1],[hexagon,6,-Math.PI/2,true,1]]){
    const s=make(c,r);assert.equal(s.points.length,n);assert.deepEqual(s.corners,Array(n).fill(corner));
    for(let i=0;i<n;i++){
      const a=start+2*Math.PI*i/n,d=r*(i%2?inner:1);
      assert.ok(near(s.points[i][0],c[0]+d*Math.cos(a))&&near(s.points[i][1],c[1]+d*Math.sin(a)));
    }
  }
  assert.deepEqual(diamond(c,r),{points:[[23,19],[35,31],[23,43],[11,31]],corners:[true,true,true,true]});
});

test('Rectangles use opposite corners and squares grow to the larger drag component',()=>{
  const a=[50,50];
  for(const [dx,dy] of [[20,10],[-20,10],[20,-10],[-10,-20],[0,-20],[-20,0]]){
    const b=[a[0]+dx,a[1]+dy],s=rect(a,b),q=rect(a,b,true),n=Math.max(Math.abs(dx),Math.abs(dy));
    assert.deepEqual(s,{points:[[50,50],[50+dx,50],b,[50,50+dy]],corners:[true,true,true,true]});
    assert.deepEqual(q.points[2],[50+(Math.sign(dx)||1)*n,50+(Math.sign(dy)||1)*n]);
    assert.equal(Math.abs(q.points[2][0]-50),Math.abs(q.points[2][1]-50));
  }
  assert.deepEqual(a,[50,50]);assert.deepEqual(rect(a,a,true).points,Array(4).fill(a));
});

test('Heart keeps its eight asymmetric-height nodes, with only the tip and dip sharp',()=>{
  const s=heart([10,20],10);
  const expected=[[10,30],[1.8,22.5],[1.2,16.5],[7,14.5],[10,17.8],[13,14.5],[18.8,16.5],[18.2,22.5]];
  s.points.forEach((p,i)=>p.forEach((n,k)=>assert.ok(near(n,expected[i][k]))));
  assert.deepEqual(s.corners,[true,false,false,false,true,false,false,false]);
  const ring=curvePoints(s.points,true,s.corners);
  for(const p of s.points)assert.ok(ring.some(q=>near(q[0],p[0])&&near(q[1],p[1])));
});

test('Radius fitting respects each side of the hoop, keeps small shapes and includes curved overshoot',()=>{
  const h={width:100,height:80};
  for(const kind of Object.keys(shapeNames))for(const c of [[50,40],[2,40],[98,40],[50,2],[50,78],[20,20],[0,0],[100,80]]){
    const r=fitRadius(kind,c,200,h);
    assert.ok(r>=0&&r<=200,kind);assert.ok(inside(outline(kind,c,r),h),`${kind} ${c}: ${r}`);
    if(r>0)assert.equal(inside(outline(kind,c,r+.01),h),false,`${kind} fills the available space`);
    assert.equal(fitRadius(kind,[50,40],1,h),1);assert.equal(fitRadius(kind,c,0,h),0);
  }
  assert.equal(fitRadius('circle',[20,30],100,h),20);
  assert.equal(fitRadius('diamond',[50,40],100,h),40);
  assert.ok(fitRadius('heart',[20,20],100,h)<20/.88,'rounded lobes extend past their anchors');
  assert.equal(fitRadius('circle',[-1,40],10,h),0);assert.equal(fitRadius('heart',[50,81],10,h),0);
  assert.equal(fitRadius('star',[50,40],-1,h),0);
});

test('Rectangle fitting clamps the second corner and can keep a square in each drag direction',()=>{
  const h={width:100,height:80},a=[30,20];
  assert.deepEqual(fitRect(a,[-10,100],h),[0,80]);assert.deepEqual(fitRect(a,[120,-10],h),[100,0]);
  assert.deepEqual(fitRect(a,[40,50],h),[40,50]);
  for(const b of [[200,200],[-100,100],[100,-100],[-100,-100],[30,100],[100,20]]){
    const p=fitRect(a,b,h,true),s=rect(a,p,true);
    assert.ok(inside(s.points,h));assert.ok(near(Math.abs(p[0]-a[0]),Math.abs(p[1]-a[1])));
  }
  assert.deepEqual(fitRect(a,[40,50],h,true),[60,50]);assert.deepEqual(a,[30,20]);
});
