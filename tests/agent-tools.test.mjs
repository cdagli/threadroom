import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {designSummary,objectDetail,issueReport,issueCounts,reference,patchObject,makeShape,makePath,checked,validateArgs,englishMessage,editablePoints,editPoints}=load('agent-tools');
const {createT}=load('i18n');
const {demo,object,defaultLocks,defaultTrimJump}=load('project');
const {checkProject}=load('check');
const blank=objects=>({version:1,name:'Agent',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:{...defaultLocks},trimJump:defaultTrimJump,objects});

test('Design summary lists objects in mm without image data or raw geometry',()=>{
  const p={...demo(),images:[{id:'i',src:'data:image/png;base64,AAAA',name:'art.png',x:10,y:10,width:40,height:30,opacity:.5}]};
  const s=designSummary(p,{selection:[]});
  assert.equal(s.hoop.width,100);assert.equal(s.objects.length,p.objects.length);
  assert.equal(s.objects[0].id,p.objects[0].id);assert.ok(s.objects[0].bounds.width>0);
  assert.ok(!JSON.stringify(s).includes('base64'));assert.ok(!('rings' in s.objects[0]));
  const d=objectDetail(p.objects[0],p,true);assert.ok(d.geometry.rings.length);assert.ok(d.resolved.spacing>0);
  assert.ok(!('geometry' in objectDetail(p.objects[0],p)));
});
test('Issue report explains each warning and names its one-click fix',()=>{
  const p=blank([object('Thin strip',[[[30,40],[60,40],[60,40.7],[30,40.7]]])]);
  const list=checkProject(p),report=issueReport(list,p);
  const narrow=report.find(r=>r.code==='fill-narrow');assert.ok(narrow);
  assert.equal(narrow.objectName,'Thin strip');assert.equal(narrow.title,'Shape too thin to fill');
  assert.equal(narrow.autoFix.label,'Use running stitch');assert.deepEqual(issueCounts(list),{fail:list.filter(w=>w.severity==='fail').length,check:list.filter(w=>w.severity==='check').length});
});
test('Reference catalogue covers stitch kinds, hoops, fabrics and fill patterns',()=>{
  const r=reference();
  assert.ok(r.stitchKinds.some(k=>k.id==='fill'&&k.needsClosedShape));assert.ok(r.hoops.some(h=>h.id==='100x100'));
  assert.ok(r.fabrics.length>=7);assert.ok(r.fillPatterns.length>0);assert.ok(JSON.stringify(r).length<60000);
});
test('Object patches mirror the settings panel rules',()=>{
  const line=makePath('open',[[10,10],[50,10],[50,40]],blank([])).object;
  assert.match(patchObject(line,{kind:'fill'}).error,/closed shape/);
  assert.match(patchObject(line,{bogus:1}).error,/Unknown/);
  const satin=patchObject(line,{kind:'satin',satinWidth:3}).object;assert.equal(satin.kind,'satin');assert.equal(satin.satinWidth,3);
  const threaded=patchObject(line,{threadCode:'2'}).object;assert.equal(threaded.color,'#0a55a3');assert.equal(threaded.thread.code,'2');
  const recoloured=patchObject(threaded,{color:'#ff0000'}).object;assert.equal(recoloured.thread,undefined);
  const reset=patchObject({...line,spacing:.5},{spacing:null}).object;assert.equal('spacing' in reset,false);
  assert.match(patchObject({...line,locked:true},{name:'x'}).error,/locked/);
  assert.equal(patchObject(line,{matchThread:true}).object.thread.brand,'brother');
});
test('Shapes and paths are built like the drawing tools and stay inside the hoop',()=>{
  const p=blank([]);
  const star=makeShape('star',[50,50],40,40,p).object;assert.equal(star.kind,'fill');assert.ok(star.curve.closed);
  assert.match(makeShape('circle',[95,50],40,40,p).error,/outside the hoop/);
  const rect=makeShape('rect',[50,50],40,20,p,{kind:'running'}).object;assert.equal(rect.kind,'running');
  assert.equal(makePath('closed',[[10,10],[40,10],[40,40]],p).object.kind,'fill');
  assert.equal(makePath('blocks',[[10,10],[10,14],[40,10],[40,14]],p).object.kind,'satin-block');
  assert.equal(makePath('points',[[10,10],[12,12]],p).object.kind,'manual');
  assert.match(makePath('open',[[10,10],[140,10]],p).error,/outside/);
  assert.ok('project' in checked(blank([star,rect])));
});

const pt={type:'array',items:{type:'number'},minItems:2,maxItems:2};
const addShape={type:'object',additionalProperties:false,required:['shape','center','width'],properties:{shape:{type:'string',enum:['circle','rect']},center:pt,width:{type:'number',minimum:1},height:{type:'number'},kind:{type:'string'},color:{type:'string'},name:{type:'string',maxLength:5}}};
test('Tool arguments are checked against the schema before running',()=>{
  assert.equal(validateArgs(addShape,{shape:'circle',center:[50,50],width:20}),null);
  assert.equal(validateArgs(addShape,{shape:'circle',center:[50,50],size:20}),"Unknown argument 'size'. Allowed: shape, center, width, height, kind, color, name.");
  assert.equal(validateArgs(addShape,{shape:'circle',center:[50,50]}),"Missing required argument 'width'.");
  assert.equal(validateArgs(addShape,{shape:'blob',center:[50,50],width:2}),"'shape' must be one of: circle, rect.");
  assert.equal(validateArgs(addShape,{shape:'rect',center:'50,50',width:2}),"'center' must be array, not string.");
  assert.equal(validateArgs(addShape,{shape:'rect',center:[50],width:2}),"'center' needs at least 2 items.");
  assert.equal(validateArgs(addShape,{shape:'rect',center:[50,'x'],width:2}),"'center[1]' must be number, not string.");
  assert.equal(validateArgs(addShape,{shape:'rect',center:[5,5],width:.5}),"'width' must be at least 1.");
  assert.equal(validateArgs(addShape,{shape:'rect',center:[5,5],width:2,name:'too long'}),"'name' must be at most 5 characters.");
  assert.equal(validateArgs(addShape,[]),'Arguments must be object, not array.');
  const nested={type:'object',additionalProperties:false,properties:{ops:{type:'array',items:{type:'object',additionalProperties:false,required:['op'],properties:{op:{type:'string',enum:['move']},index:{type:'integer'},at:{type:['array','null']}}}},free:{type:'object'}}};
  assert.equal(validateArgs(nested,{ops:[{op:'move',index:1,at:null}],free:{anything:1}}),null);
  assert.equal(validateArgs(nested,{ops:[{op:'move',idx:1}]}),"Unknown argument 'ops[0].idx'. Allowed: op, index, at.");
  assert.equal(validateArgs(nested,{ops:[{index:1}]}),"Missing required argument 'ops[0].op'.");
  assert.equal(validateArgs(nested,{ops:[{op:'move',index:1.5}]}),"'ops[0].index' must be integer, not number.");
});
test('Editor messages shown in Turkish reach the agent in English',()=>{
  const tr=createT('tr');
  assert.equal(englishMessage(tr('Transform stays inside the hoop.')),'Transform stays inside the hoop.');
  assert.equal(englishMessage(tr('Keep at least {v0} points in this path.',{v0:3})),'Keep at least 3 points in this path.');
  assert.equal(englishMessage('Something else'),'Something else');
});
test('Point editing mirrors the point editor and is one atomic change',()=>{
  const p=blank([]),hoop={width:100,height:100};
  const shape=makePath('closed',[[10,10],[40,10],[40,40],[10,40]],p).object;
  const view=editablePoints(shape,blank([shape]));
  assert.equal(view.structure,'curve');assert.equal(view.rings[0].points.length,4);assert.equal(view.rings[0].points[1].corner,true);assert.equal(view.minPoints,3);assert.ok(view.ends.entry);
  const moved=editPoints(shape,[{op:'move',index:2,to:[50,50]},{op:'move',index:0,by:[-5,0]},{op:'set_corner',index:1,corner:false},{op:'insert',afterIndex:3,at:[5,25]}],hoop).object;
  assert.deepEqual(moved.curve.points,[[5,10],[40,10],[50,50],[10,40],[5,25]]);assert.equal(moved.curve.corners[1],false);assert.equal(shape.curve.points[2][0],40);
  assert.deepEqual(editPoints(shape,[{op:'remove',index:0}],hoop).object.curve.points.length,3);
  assert.match(editPoints(shape,[{op:'remove',index:0},{op:'remove',index:0}],hoop).error,/at least 3 points/);
  assert.match(editPoints(shape,[{op:'move',index:0,to:[-1,10]}],hoop).error,/outside the hoop/);
  assert.match(editPoints(shape,[{op:'move',index:9,to:[1,1]}],hoop).error,/index must be 0–3/);
  assert.match(editPoints(shape,[{op:'move',ring:1,index:0,to:[1,1]}],hoop).error,/only ring 0/);
  assert.match(editPoints({...shape,locked:true},[{op:'move',index:0,to:[1,1]}],hoop).error,/locked/);
  assert.match(editPoints({...shape,text:{}},[{op:'move',index:0,to:[1,1]}],hoop).error,/update_text/);
  const block=makePath('blocks',[[10,10],[10,14],[40,10],[40,14],[70,10],[70,14]],p).object;
  const rails=editablePoints(block,blank([block]));assert.equal(rails.rings[1].rail,'right');assert.equal(rails.rings[0].points.length,3);
  assert.equal(editPoints(block,[{op:'move',ring:1,index:2,by:[0,2]}],hoop).object.rails.points[1][2][1],16);
  assert.equal(editPoints(block,[{op:'remove',index:1}],hoop).object.rails.points[0].length,2);
  assert.match(editPoints(block,[{op:'remove',index:1},{op:'remove',index:0}],hoop).error,/two rungs/);
  const line=makePath('open',[[10,10],[50,10]],p).object,ended=editPoints(line,[{op:'set_end',end:'entry',at:[49,11]}],hoop).object;
  assert.deepEqual(ended.entry,[50,10]);assert.equal(editPoints(ended,[{op:'set_end',end:'entry',at:null}],hoop).object.entry,undefined);
  const poly={...object('Poly',[[[10,10],[30,10],[30,30]]]),kind:'fill'};
  assert.equal(editablePoints(poly,blank([poly])).structure,'polyline');
  assert.match(editPoints(poly,[{op:'set_corner',index:0,corner:true}],hoop).error,/polyline/);
});
