import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {object,defaultLocks,validProject}=load('project');
const G=load('angle-guides'),{moveGeometry,geometryPayload,stitchGroups,changeStitchKind}=load('curves'),{exportSVG}=load('svg-export');
const R=load('redwork'),{transformSelection}=load('editing'),{objectMenu}=load('context-menu');
const square=[[20,20],[80,20],[80,80],[20,80]];
const project=objects=>({version:1,name:'Guides',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:defaultLocks,trimJump:3,objects});
const fan=[{a:[25,30],b:[75,30]},{a:[30,75],b:[70,60]}];
const close=(a,b,d=1e-9)=>assert.ok(Math.abs(a-b)<=d,`${a} ≠ ${b}`);

test('Angle guides validate: at most eight, finite, distinct ends; density settings in range',()=>{
  const o=object('Fill',[square]);
  assert.ok(validProject(project([{...o,angleGuides:fan,rowShortening:false,densityTrigger:.1}])));
  for(const patch of [{angleGuides:Array(9).fill(fan[0])},{angleGuides:[{a:[1,1],b:[1,1]}]},{angleGuides:[{a:[1,1]}]},{angleGuides:[{a:[1,NaN],b:[2,2]}]},{angleGuides:'x'},{rowShortening:1},{densityTrigger:.05},{densityTrigger:1.2}])
    assert.equal(validProject(project([{...o,...patch}])),false,JSON.stringify(patch));
});
test('One guide is the stitch angle; the angle input turns it; two or more sweep and lock the angle',()=>{
  const o=object('Fill',[square]),one={a:[40,50],b:[50,60]};
  assert.deepEqual(G.withGuides(o,[one]),{angleGuides:[one],angle:45});
  assert.deepEqual(G.withGuides(o,[]),{angleGuides:undefined});
  assert.deepEqual(G.withGuides({...o,fillPattern:'streamlines'},[one]),{angleGuides:[one]});
  const turned=G.setGuidedAngle({...o,angleGuides:[one]},-30),g=turned.angleGuides[0];
  close(G.guideAngle(g),-30,1e-9);close((g.a[0]+g.b[0])/2,45);close(Math.hypot(g.b[0]-g.a[0],g.b[1]-g.a[1]),Math.hypot(10,10),1e-9);
  assert.deepEqual(G.setGuidedAngle(o,12),{angle:12});
  assert.ok(G.sweeping({...o,angleGuides:fan}));assert.ok(!G.sweeping({...o,angleGuides:[fan[0],{a:[50,20],b:[50,40]}]}));
  assert.deepEqual(G.crossingGuides([fan[0],{a:[50,20],b:[50,40]},fan[1]]),[true,true,false]);
  assert.equal(G.guideMode({...o,fillPattern:'circular'}),null);assert.equal(G.guideMode({...o,fillPattern:'crossStitchFill'}),null);
  assert.equal(G.guideMode(object('Line',[[[0,0],[5,5]]],'running')),null);assert.equal(G.guideMode({...o,fillPattern:'streamlines'}),'flow');
});
test('Edit angles seeds one guide across the bounds at the current angle; ends move and guides are removed',()=>{
  const seed=G.seedGuide({...object('Fill',[square]),angle:0});
  assert.deepEqual(seed,{a:[20,50],b:[80,50]});
  const tilted=G.seedGuide({...object('Fill',[square]),angle:45});close(G.guideAngle(tilted),45,1e-9);close(tilted.a[0],20);close(tilted.b[1],80);
  const added=G.addGuide([seed],[30,30],[60,40]);assert.equal(added.length,2);
  assert.equal(G.addGuide([seed],[30,30],[30.2,30]),null);assert.equal(G.addGuide(Array(8).fill(seed),[1,1],[9,9]),null);
  assert.deepEqual(G.moveGuideEnd(added,1,'b',[70,40])[1],{a:[30,30],b:[70,40]});
  assert.deepEqual(G.moveGuideEnd(added,1,'b',[30.1,30]),added);
  assert.deepEqual(G.removeGuide(added,0),[added[1]]);
});
test('Guides move with transforms, keep one guide and the angle in step, and reach payload and SVG',()=>{
  const o={...object('Fill',[square]),angleGuides:[{a:[40,50],b:[60,50]}],angle:0,rowShortening:false};
  const moved=moveGeometry(o,([x,y])=>[x+5,y]);assert.deepEqual(moved.angleGuides,[{a:[45,50],b:[65,50]}]);
  const p=project([o]),rotated=transformSelection(p,[o.id],[0,1,-1,0,100,0]).objects[0];
  assert.deepEqual(rotated.angleGuides[0],{a:[50,40],b:[50,60]});assert.equal(rotated.angle,90);
  assert.deepEqual(moveGeometry(o,([x,y],r,i)=>r===0&&i===0?[x+1,y]:[x,y]).angleGuides,o.angleGuides);
  const payload=geometryPayload(project([{...o,angleGuides:fan}])).objects[0];assert.deepEqual(payload.angleGuides,fan);assert.equal(payload.rowShortening,false);
  assert.match(exportSVG(project([o])),/data-threadroom-angle-guides="\[\{&quot;a&quot;:\[40,50\]/);
});
test('Convert to redwork merges lines and fill outlines; Break apart restores them',()=>{
  const fill={...object('Fill',[square]),group:'g'},line={...object('Line',[[[10,10],[30,10]]],'running','#123456'),thread:undefined},text={...object('Text',[square]),text:{content:'A'}};
  const p={...project([fill,line,object('Other',[[[5,5],[6,6]]],'running')]),groups:[{id:'g',name:'G'}]};
  assert.ok(R.canConvertToRedwork(p,[fill.id,line.id]));assert.ok(!R.canConvertToRedwork(project([text]),[text.id]));
  assert.ok(!R.canConvertToRedwork(p,[]));assert.ok(!R.canConvertToRedwork(project([{...line,locked:true}]),[line.id]));
  const {project:q,id}=R.convertToRedwork(p,[line.id,fill.id]),red=q.objects.find(o=>o.id===id);
  assert.equal(q.objects.length,2);assert.equal(q.objects[0].id,id);assert.equal(red.kind,'redwork');assert.equal(red.length,2);assert.equal(red.group,'g');
  assert.deepEqual(red.rings,[[...square,square[0]],[[10,10],[30,10]]]);assert.deepEqual(red.sources.map(s=>s.id),[fill.id,line.id]);assert.equal(red.sources[0].group,undefined);
  assert.ok(validProject(q));assert.deepEqual(stitchGroups(red).map(g=>g.kinds),[['redwork']]);assert.equal(changeStitchKind(red,'running'),red);
  assert.ok(!objectMenu(q,[id],false).some(e=>e.action==='editPoints'));
  assert.equal(geometryPayload(q).objects[0].sources,undefined);
  assert.equal(validProject({...q,objects:q.objects.map(o=>o.id===id?{...o,sources:[{...red}]}:o)}),false);
  // Sources move with the redwork, so Break apart restores them where it now is.
  const shifted={...q,objects:q.objects.map(o=>o.id===id?moveGeometry(o,([x,y])=>[x+1,y+2]):o)};
  const apart=R.breakApart(shifted,id);assert.deepEqual(apart.ids,[fill.id,line.id]);
  assert.deepEqual(apart.project.objects[0].rings[0][0],[21,22]);assert.equal(apart.project.objects[0].group,'g');assert.equal(apart.project.objects.length,3);
  // Converting an existing redwork with more lines flattens its sources; ids in use are replaced.
  const again=R.convertToRedwork(q,[id,q.objects[1].id]).project.objects[0];assert.equal(again.sources.length,3);
  const copy={...q,objects:[...q.objects,{...red,id:'copy'}]},parts=R.breakApart(copy,'copy');assert.ok(parts.ids.every(i=>![fill.id,line.id].includes(i)));
  const bare=R.breakApart(project([{...object('Red',[[[1,1],[5,5]],[[6,6],[9,9]]],'redwork'),length:2}]),project([]).objects[0]?.id??'');assert.equal(bare,null);
  const plain=project([{...object('Red',[[[1,1],[5,5]],[[6,6],[9,9]]],'redwork'),id:'r',length:2}]);
  assert.deepEqual(R.breakApart(plain,'r').project.objects.map(o=>[o.kind,o.length,o.rings.length]),[['running',2,1],['running',2,1]]);
});
test('Fill settings: Edit angles button, locked angle and Density control only while guides sweep',async()=>{
  const {createRequire}=await import('node:module'),{readFileSync}=await import('node:fs'),ts=(await import('typescript')).default;
  const requireNode=createRequire(import.meta.url),React=requireNode('react'),{renderToStaticMarkup}=requireNode('react-dom/server');
  const {resolve}=load('project'),{createT}=load('i18n');
  const compile=(name,require)=>{const m={exports:{}};new Function('module','exports','require',ts.transpileModule(readFileSync(new URL(`../app/${name}.tsx`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(m,m.exports,require);return m.exports;};
  for(const lang of ['en','tr']){
    const t=createT(lang),require=id=>id==='./i18n'?{useT:()=>({t,formatNumber:n=>String(n)})}:id.startsWith('@/lib/')?load(id.slice(6)):id.startsWith('./')?compile(id.slice(2),require):requireNode(id);
    const {FillSettings}=compile('fill-settings',require);
    const render=patch=>{const item={...object('Fill',[square]),...patch};return renderToStaticMarkup(React.createElement(FillSettings,{item,resolved:resolve(item,'woven',defaultLocks),onChange:()=>{},source:()=>null,hoop:{width:100,height:100},angles:{active:false,onToggle:()=>{}}}));};
    const plain=render({}),one=render({angleGuides:[fan[0]]}),sweep=render({angleGuides:fan});
    assert.ok(plain.includes(t('Edit angles')));assert.ok(plain.includes(t('Gradient')));assert.ok(!plain.includes(t('Density control')));
    assert.ok(!one.includes(t('Density control')));assert.ok(!one.includes(t('More than one stitch angle. Change them with Edit angles.')));
    assert.ok(sweep.includes(t('Density control')));assert.ok(sweep.includes(t('Row shortening')));assert.ok(!sweep.includes(t('Gradient mode'))&&!sweep.includes(`>${t('Gradient')}<`));
    assert.ok(sweep.includes(t('More than one stitch angle. Change them with Edit angles.')));
    assert.ok(render({fillPattern:'streamlines'}).includes(t('Edit flow field')));assert.ok(!render({fillPattern:'circular'}).includes(t('Edit angles')));
  }
});
