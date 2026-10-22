import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import opentype from 'opentype.js';
import {load} from './load-lib.mjs';
const {object,defaultLocks,defaultTrimJump,validProject}=load('project');
const {around,translate,mapPoint,scaleGesture,rotationGesture,transformSelection,selectionBounds,alignSelection,snapBounds,copySelection,readClipboard,pasteSelection}=load('editing');
const {curveRing,moveGeometry}=load('curves');
const {layoutText,defaultText,validText,textSourcePoint}=load('text');
const {readViewSettings,defaultView,unitValue,playbackSpeeds,formatLength}=load('view-settings');
const rectangle=(x,y,w,h)=>object('Shape',[[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]],'fill','#123456');
const project=objects=>({version:1,name:'Test',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:{...defaultLocks},trimJump:defaultTrimJump,objects});
const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} ≈ ${b}`);
const pt=(a,b)=>a.forEach((n,i)=>near(n,b[i]));

test('Eight scale handles use the opposite anchor; Shift corners preserve ratio and Alt fixes centre',()=>{
  const b={x:10,y:20,width:20,height:10};
  for(const [h,p,expected] of [['nw',[0,10],[0,10,30,30]],['n',[20,10],[10,10,30,30]],['ne',[40,10],[10,10,40,30]],['e',[40,25],[10,20,40,30]],['se',[40,40],[10,20,40,40]],['s',[20,40],[10,20,30,40]],['sw',[0,40],[0,20,30,40]],['w',[0,25],[0,20,30,30]]]){
    const m=scaleGesture(b,h,p);pt(mapPoint(m,[10,20]),expected.slice(0,2));pt(mapPoint(m,[30,30]),expected.slice(2));
  }
  const proportional=scaleGesture(b,'se',[50,35],true);pt(mapPoint(proportional,[30,30]),[50,40]);
  const centred=scaleGesture(b,'se',[40,35],false,true);pt(mapPoint(centred,[20,25]),[20,25]);pt(mapPoint(centred,[10,20]),[0,15]);
  assert.ok(scaleGesture(b,'se',[-50,-50]).every(Number.isFinite));
  assert.ok(scaleGesture({x:0,y:0,width:0,height:10},'e',[5,5]).every(Number.isFinite));
});
test('Rotation snaps to 15 degrees and flip/quarter-turn preserve centre and ends',()=>{
  const a={...rectangle(20,30,10,20),entry:[20,30],exit:[30,50]},b=rectangle(60,60,5,5),p=project([a,b]),box=selectionBounds(p,[a.id]);
  near(rotationGesture(box,[25,0],[60,40],true),90);
  near(rotationGesture(box,[35,40],[35,43],true),15);near(rotationGesture(box,[35,40],[35,43],true,7),23);
  const flip=transformSelection(p,[a.id],around([25,40],-1,1));pt(flip.objects[0].entry,[30,30]);pt(flip.objects[0].exit,[20,50]);assert.equal(flip.objects[1],b);
  const turn=transformSelection(p,[a.id],around([25,40],1,1,90),90);pt(turn.objects[0].entry,[35,35]);assert.equal(turn.objects[0].rotation,90);near(transformSelection(p,[a.id],around([25,40],1,1,-1110),-1110).objects[0].rotation,-30);
  assert.equal(p.objects[0],a);assert.equal(a.rings[0][0][0],20);
});
test('Transforms reject new hoop overflow and invalid matrices, allowing already-outside objects back in',()=>{
  const a=rectangle(80,80,20,20),p=project([a]);
  assert.equal(transformSelection(p,[a.id],translate(.1,0)),null);
  assert.equal(transformSelection(p,[a.id],around([90,90],2)),null);
  assert.equal(transformSelection(p,[a.id],[NaN,0,0,1,0,0]),null);
  assert.equal(transformSelection(p,[a.id],around([90,90],0)),null);
  assert.equal(transformSelection(p,[a.id],translate(0,0)),p);
  const outside=project([rectangle(-10,10,5,5)]);assert.ok(transformSelection(outside,[outside.objects[0].id],translate(20,0)));
});
test('Curves retain anchors, corner flags, spline and stitch settings during transforms',()=>{
  const curve={points:[[20,20],[40,20],[40,40]],closed:true,corners:[true,false,true],spline:'levien'},a={...rectangle(20,20,20,20),curve,rings:[curveRing(curve)],spacing:.45,entry:[20,20]};
  const p=project([a]),next=transformSelection(p,[a.id],translate(3,4)).objects[0];
  pt(next.curve.points[0],[23,24]);pt(next.entry,[23,24]);assert.deepEqual(next.curve.corners,curve.corners);assert.equal(next.curve.spline,'levien');assert.equal(next.spacing,.45);assert.ok(validProject(project([next])));
});
test('All alignment modes and equal-gap distribution operate on selection bounds only',()=>{
  const a=rectangle(10,10,10,10),b=rectangle(35,30,20,20),c=rectangle(80,80,10,10),d=rectangle(2,2,2,2),p=project([a,b,c,d]),ids=[a.id,b.id,c.id];
  for(const mode of ['left','centre','right','top','middle','bottom']){
    const next=alignSelection(p,ids,mode),boxes=next.objects.slice(0,3).map(o=>selectionBounds(next,[o.id]));
    const feature=r=>mode==='left'?r.x:mode==='centre'?r.x+r.width/2:mode==='right'?r.x+r.width:mode==='top'?r.y:mode==='middle'?r.y+r.height/2:r.y+r.height;
    boxes.forEach(r=>near(feature(r),feature(boxes[0])));assert.equal(next.objects[3],d);
  }
  for(const mode of ['horizontal','vertical']){
    const next=alignSelection(p,[c.id,a.id,b.id],mode),boxes=next.objects.slice(0,3).map(o=>selectionBounds(next,[o.id])),axis=mode==='horizontal'?'x':'y',dim=mode==='horizontal'?'width':'height';
    near(boxes[1][axis]-boxes[0][axis]-boxes[0][dim],boxes[2][axis]-boxes[1][axis]-boxes[1][dim]);assert.equal(next.objects[3],d);
  }
});
test('Snapping uses edges/centres in screen tolerance and fine-grid subdivisions without mutation',()=>{
  const b={x:10.2,y:20.3,width:10,height:10},others=[{x:20.5,y:30.5,width:10,height:10}];
  const snap=snapBounds(b,others,.5,1,true);pt(snap.delta,[.3,.2]);assert.deepEqual(snap.guides,[{axis:'x',value:20.5},{axis:'y',value:30.5}]);
  pt(snapBounds(b,[],.5,5/10,false).delta,[-.2,.2]);
  assert.deepEqual(snapBounds(b,others,.01,null,true),{delta:[0,0],guides:[]});
  assert.deepEqual(snapBounds({x:20.4,y:30.4,width:0,height:0},others,.5,null,true,true).guides,[{axis:'x',value:20.5},{axis:'y',value:30.5}]);
});
test('Browser clipboard round-trips stitch settings; whole groups get fresh IDs and partial groups detach',()=>{
  const a={...rectangle(10,10,10,10),group:'g',spacing:.45,entry:[10,10],fillUnderlays:[{angle:0,spacing:2,length:3,inset:.2}]},b={...rectangle(30,30,10,10),group:'g'},p={...project([a,b]),groups:[{id:'g',name:'My group'}]};
  const clip=readClipboard(JSON.stringify(copySelection(p,[a.id,b.id])));let n=0;
  const pasted=pasteSelection(p,clip,3,()=>`new-${++n}`);assert.ok(pasted);assert.ok(validProject(pasted.project));assert.equal(pasted.ids.length,2);assert.equal(pasted.project.groups.length,2);
  const [x,y]=pasted.project.objects.slice(2);assert.notEqual(x.group,'g');assert.equal(x.group,y.group);pt(x.rings[0][0],[13,13]);pt(x.entry,[13,13]);assert.equal(x.spacing,.45);assert.deepEqual(x.fillUnderlays,a.fillUnderlays);assert.notEqual(x.fillUnderlays,a.fillUnderlays);
  assert.deepEqual(pasted.project.objects.slice(0,2),p.objects);assert.equal(copySelection(p,[a.id]).objects[0].group,undefined);assert.deepEqual(copySelection(p,[a.id]).groups,[]);
  assert.equal(readClipboard('{bad'),null);assert.equal(readClipboard('{"objects":[]}'),null);assert.equal(pasteSelection(p,copySelection(p,[a.id]),100,()=>`new-${++n}`),null);
  assert.equal(pasteSelection(project(Array.from({length:80},()=>rectangle(1,1,1,1))),clip,3,()=>`new-${++n}`),null);
});
test('Affine text stretching, reflection and repeated rotation survive regeneration and JSON reload',()=>{
  const font=opentype.parse(readFileSync(new URL('./fixtures/nunito-latin-700-normal.ttf',import.meta.url)).buffer),ref={source:'catalog',id:'nunito',family:'Nunito',weight:700,italic:false,subsets:['latin']};
  for(const layout of ['straight','arc','wave','path']){
    const text={...defaultText(ref,[50,50],'HI'),layout,path:layout==='path'?[[20,50],[80,50]]:undefined},a={...rectangle(30,30,10,10),text,rings:layoutText(text,[font]).rings,entry:[40,50]};
    let next=moveGeometry(a,q=>mapPoint(around([50,50],1.5,.7),q));next=moveGeometry(next,q=>mapPoint(around([50,50],-1,1),q));next=moveGeometry(next,q=>mapPoint(around([50,50],1,1,90),q));next=moveGeometry(next,q=>mapPoint(translate(2,3),q));
    assert.ok(validText(next.text));assert.ok(validProject(project([next])));const saved=JSON.parse(JSON.stringify(next));
    const regenerated=selectionBounds(project([{...saved,rings:layoutText(saved.text,[font]).rings}]),[saved.id]),actual=selectionBounds(project([next]),[next.id]);
    for(const key of ['x','y','width','height'])near(regenerated[key],actual[key],.06);
    pt(mapPoint(next.text.affine,textSourcePoint(next.text,[20,30])),[20,30]);assert.equal(next.text.content,'HI');assert.ok(layoutText({...next.text,content:'HII'},[font]).rings.length>next.rings.length);
    assert.ok(validText({...next.text,affine:[1,0,0,1,0,0]}));assert.equal(validText({...next.text,affine:[0,0,0,0,0,0]}),false);
  }
});
test('View preferences validate untrusted storage and units convert display values only',()=>{
  assert.deepEqual(readViewSettings('oops'),defaultView);assert.deepEqual(readViewSettings('null'),defaultView);
  assert.deepEqual(readViewSettings(JSON.stringify({units:'feet',gridSize:0,subdivisions:1.5,rulers:'yes'})),defaultView);
  const prefs=readViewSettings(JSON.stringify({...defaultView,units:'in',gridSize:10,subdivisions:10,showJumps:true,rulers:true}));assert.equal(prefs.showJumps,true);assert.equal(prefs.units,'in');near(unitValue(25.4,prefs.units),1);near(unitValue(25,'cm'),2.5);near(unitValue(25,'mm'),25);
});

test('Playback speed is remembered only for the offered 0.25×–16× steps',()=>{
  assert.equal(defaultView.playbackSpeed,1);assert.deepEqual([...playbackSpeeds],[.25,.5,1,2,4,8,16]);
  assert.equal(readViewSettings(JSON.stringify({playbackSpeed:16})).playbackSpeed,16);assert.equal(readViewSettings(JSON.stringify({playbackSpeed:.25})).playbackSpeed,.25);
  for(const bad of [3,0,-1,32,'4',null])assert.equal(readViewSettings(JSON.stringify({playbackSpeed:bad})).playbackSpeed,1);
  assert.equal(readViewSettings(JSON.stringify({units:'cm'})).playbackSpeed,1);
});

test('Lengths for the worksheet and Info follow the display units and language',()=>{
  const {formatNumber}=load('i18n'),tr=(n,d)=>formatNumber(n,'tr',d),en=(n,d)=>formatNumber(n,'en',d);
  assert.equal(formatLength(25,'mm',tr),'25,0 mm');assert.equal(formatLength(25,'cm',tr),'2,5 cm');assert.equal(formatLength(25.4,'in',en),'1.000 in');assert.equal(formatLength(100,'cm',en),'10.0 cm');
});
