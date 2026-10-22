import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const P=load('polygon'),S=load('shape-ops'),{object,defaultLocks,defaultTrimJump,validProject,demo}=load('project'),{curveRing,geometryPayload}=load('curves');
const {checkProject,fixFor}=load('check'),{exportSVG}=load('svg-export'),{createT}=load('i18n'),{circle}=load('shapes');
const sq=(x,y,w,h=w)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const project=(...objects)=>({version:1,name:'Shapes',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:{...defaultLocks},trimJump:defaultTrimJump,objects});
const named=(id,rings,kind='fill',extra={})=>({...object(id,rings,kind),id,...extra});
const curved=(id,c,r,kind='fill')=>{const s=circle(c,r),curve={points:s.points,closed:true,corners:s.corners,spline:'levien'};return named(id,[curveRing(curve,kind!=='fill')],kind,{curve});};
const area=o=>P.regionArea(S.shapeRegion(o));
const ok=r=>{assert.ok(!r.error,r.error);assert.ok(validProject(r.project));return r;};

test('Boolean results are valid rings: oriented, without slivers or collinear points, holes kept',()=>{
  const a=P.regionFromRings([sq(0,0,10)]),b=P.regionFromRings([sq(5,5,10)]);
  assert.equal(P.regionArea(P.union(a,b)),175);assert.equal(P.regionArea(P.difference(a,b)),75);assert.equal(P.regionArea(P.intersection(a,b)),25);
  const donut=P.difference(P.regionFromRings([sq(0,0,10)]),P.regionFromRings([sq(3,3,4)]));
  assert.equal(donut.length,1);assert.equal(donut[0].length,2);assert.ok(P.ringArea(donut[0][0])>0&&P.ringArea(donut[0][1])<0);
  // Squares that only share an edge leave no zero-area sliver; collinear points are removed.
  assert.deepEqual(P.difference(P.regionFromRings([sq(0,0,10)]),P.regionFromRings([sq(10,0,10)])).map(p=>p.length),[1]);
  assert.equal(P.difference(P.regionFromRings([sq(0,0,10)]),P.regionFromRings([sq(0,0,10)])).length,0);
  assert.equal(P.cleanRing([[0,0],[5,0],[10,0],[10,10],[10,10],[0,10],[0,0]]).length,4);
  // Even-odd input: nested rings are holes, overlapping rings XOR.
  assert.equal(P.regionArea(P.regionFromRings([sq(0,0,10),sq(2,2,2)])),96);
});

test('Cut holes punches the other closed shapes into the fill sewn first; cutters removed or kept',()=>{
  const base=curved('base',[50,50],30),hole=curved('hole',[50,50],8),ring=named('ring',[[...sq(70,45,6),[70,45]]],'running');
  const p=project(base,hole,ring),r=ok(S.cutHoles(p,['hole','base','ring']));
  const cut=r.project.objects.find(o=>o.id==='base');
  assert.deepEqual(r.project.objects.map(o=>o.id),['base']);assert.equal(cut.curve,undefined);assert.equal(cut.rings.length,3);
  assert.ok(Math.abs(area(cut)-(area(base)-area(hole)-36))<.5,String([area(cut),area(base),area(hole)]));assert.equal(cut.angle,base.angle);assert.deepEqual(r.ids,['base']);
  assert.deepEqual(ok(S.cutHoles(p,['base','hole'],true)).project.objects.map(o=>o.id),['base','hole','ring']);
  // Export: one even-odd path with three subpaths; the compile payload carries the hole rings.
  const svg=exportSVG(r.project);assert.match(svg,/fill-rule="evenodd"/);assert.equal((svg.match(/id="base"[^>]*? d="([^"]*)"/)[1].match(/M/g)||[]).length,3);
  assert.equal(geometryPayload(r.project).objects[0].rings.length,3);
  assert.match(S.cutHoles(project(base,curved('far',[90,90],3)),['base','far']).error,/don't overlap/);
  assert.match(S.cutHoles(project(base),['base']).error,/Select a fill/);
});

test('Cut holes mode turns a drawn outline into a hole; points stay editable as rings',()=>{
  const base=curved('base',[50,50],30),r=ok(S.cutHole(project(base),'base',sq(40,40,10)));
  const o=r.project.objects[0];assert.equal(o.rings.length,2);assert.equal(o.curve,undefined);assert.equal(o.rings[1].length,4);
  assert.ok(o.rings[0].length<curveRing(base.curve).length);
  assert.ok(S.cutHole(project(named('line',[[[1,1],[9,9]]],'running')),'line',sq(2,2,2)).error);
});

test('Flatten removes later fills from earlier ones with a 0.4 mm overlap and deletes hidden fills',()=>{
  const lower=named('lower',[sq(20,20,40)]),upper=named('upper',[sq(40,40,40)]),hidden=named('hidden',[sq(50,50,5)]),line=named('line',[[[0,0],[90,90]]],'running');
  const p=project(lower,hidden,upper,line),r=ok(S.flattenOverlaps(p,null));
  assert.deepEqual(r.project.objects.map(o=>o.id),['lower','upper','line']);
  const flat=r.project.objects[0],kept=P.regionArea(P.intersection(S.shapeRegion(flat),S.shapeRegion(upper)));
  assert.ok(Math.abs(kept-(2*20*.4-.16))<.05,kept);assert.equal(r.project.objects[1],upper);
  assert.match(r.message,/1 fill flattened, 1 fully hidden/);
  assert.ok(S.flattenOverlaps(project(named('a',[sq(0,0,5)]),named('b',[sq(10,10,5)])),null).error);
  // Design check: a dense stack offers Flatten overlaps.
  const w={code:'dense',objectId:'lower',bounds:[45,45,55,55],severity:'fail',values:{layers:4,hits:9,objects:2},source:'stitches',key:'k'};
  const fix=fixFor(w,project(lower,upper),createT('tr'));assert.equal(fix.label,'Çakışmaları düzleştir');
  assert.ok(fix.apply(project(lower,upper)).objects[0].rings.length>0);assert.notEqual(fix.apply(project(lower,upper)).objects[0],lower);
  assert.equal(fixFor({...w,values:{...w.values,objects:1}},project(lower,upper)),null);
});

test('Union, subtract and intersect keep the first object’s settings and place',()=>{
  const a=named('a',[sq(10,10,20)],'fill',{angle:12,color:'#123456'}),b=named('b',[sq(20,20,20)],'fill',{angle:80}),c=named('c',[sq(60,60,5)]);
  const p=project(c,a,b);
  for(const [op,size] of [['union',700],['subtract',300],['intersect',100]]){
    const r=ok(S.combineShapes(p,['b','a'],op)),o=r.project.objects.find(x=>x.id==='a');
    assert.deepEqual(r.project.objects.map(x=>x.id),['c','a']);assert.equal(o.angle,12);assert.equal(o.color,'#123456');assert.ok(Math.abs(area(o)-size)<1e-6,op);
  }
  assert.match(S.combineShapes(project(a,c),['a','c'],'intersect').error,/don't overlap/);
  // Closed outlines stay outlines with closed rings.
  const outline=named('o',[[...sq(10,10,10),[10,10]]],'running'),r=ok(S.combineShapes(project(outline,b),['o','b'],'union'));
  assert.equal(r.project.objects[0].kind,'running');assert.deepEqual(r.project.objects[0].rings[0][0],r.project.objects[0].rings[0].at(-1));
});

test('Offset grows and shrinks with round joins, in place or as a new object',()=>{
  const a=named('a',[sq(30,30,10)]),p=project(a);
  const grown=ok(S.offsetShapes(p,['a'],1)).project.objects;assert.equal(grown.length,1);assert.ok(Math.abs(area(grown[0])-(100+40+Math.PI))<.2);
  const copy=ok(S.offsetShapes(p,['a'],-1,true,createT('tr'),()=>'new'));
  assert.deepEqual(copy.project.objects.map(o=>o.id),['a','new']);assert.equal(copy.project.objects[1].name,'a kaydırma');assert.ok(Math.abs(area(copy.project.objects[1])-64)<1e-6);
  assert.match(S.offsetShapes(p,['a'],-6).error,/too small/);
  assert.match(S.offsetShapes(project(named('e',[sq(0,0,10)])),['e'],2).error,/outside the hoop/);
  // A hole shrinks when the shape grows.
  const donut=named('d',[sq(20,20,40),sq(35,35,10)]),g=S.shapeRegion(ok(S.offsetShapes(project(donut),['d'],1)).project.objects[0]);
  assert.equal(g[0].length,2);assert.ok(Math.abs(Math.abs(P.ringArea(g[0][1]))-64)<1e-6);
});

test('Knife splits closed shapes and open paths along the line, keeping settings',()=>{
  const a=named('A',[sq(20,20,20)],'fill',{angle:40,entry:[20,20]}),line=named('L',[[[10,50],[50,50],[50,60]]],'bean');
  let n=0;const r=ok(S.knifeShapes(project(a,line),null,[30,10],[30,70],undefined,()=>`p${n++}`));
  assert.deepEqual(r.project.objects.map(o=>o.name),['A 1','A 2','L 1','L 2']);
  const [left,right]=r.project.objects;assert.equal(left.angle,40);assert.equal(left.entry,undefined);
  assert.ok(Math.abs(area(left)+area(right)-400)<.7);assert.ok(Math.abs(area(left)-area(right))<1e-6);
  assert.deepEqual(r.project.objects.slice(2).map(o=>o.kind),['bean','bean']);assert.deepEqual(r.project.objects[2].rings[0].at(-1),[30,50]);
  assert.match(S.knifeShapes(project(a),null,[30,10],[30,30]).error,/starting and ending outside/);
  assert.ok(S.knifeShapes(project(a),['A'],[50,10],[50,70]).error);
  // A ring cut twice: both halves keep a part of the hole.
  const donut=named('D',[sq(20,20,40),sq(30,30,20)]),halves=ok(S.knifeShapes(project(donut),['D'],[40,10],[40,70])).project.objects;
  assert.equal(halves.length,2);assert.ok(halves.every(o=>o.rings.length===1&&Math.abs(area(o)-600)<.5));
});

test('Shape options follow the selection',()=>{
  const p=demo(),ids=p.objects.map(o=>o.id);
  assert.deepEqual(S.shapeOptions(p,[ids[0]]),{closed:1,fills:1,cut:false,combine:false,flatten:false,offset:true,knife:true});
  assert.equal(S.shapeOptions(p,ids).cut,true);assert.equal(S.shapeOptions(p,[ids[4]]).offset,false);
  // The bear sample flattens: the cheeks and nose sit on the bear and the muzzle.
  const r=ok(S.flattenOverlaps(p,null));assert.ok(r.project.objects.length===p.objects.length);
  assert.deepEqual(checkProject(r.project).filter(w=>w.severity==='fail'),[]);
});
