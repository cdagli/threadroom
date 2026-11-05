import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {load} from './load-lib.mjs';
const {checkProject,stitchWarnings,sortWarnings,explain,fixFor,severityNames,raster,limits}=load('check');
const {object,demo,validProject,defaultLocks,defaultTrimJump}=load('project');
const {defaultText}=load('text');
const {createT}=load('i18n');
const project=(...objects)=>({version:1,name:'Check',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:{...defaultLocks},trimJump:defaultTrimJump,objects});
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const codes=p=>Object.fromEntries(checkProject(p).map(w=>[w.code,w]));
const font={source:'catalog',id:'nunito',family:'Nunito',weight:700,italic:false,subsets:['latin']};
const text=(size,kind='fill')=>({...object('Name',[rect(40,40,20,size)],kind),text:{...defaultText(font,[50,50],'Ada'),size}});
const satin=(width,extra={})=>({...object('Line',[[[30,50],[70,50]]],'satin'),satinWidth:width,...extra});
const cases={
  'fill-small':[project(object('Dot',[rect(40,40,1.5,1.5)])),'fail',project(object('Dot',[rect(40,40,2,2.5)])),'check'],
  'fill-narrow':[project(object('Strip',[rect(30,40,30,.7)])),'fail',project(object('Strip',[rect(30,40,30,1.5)])),'check'],
  'fill-thin-part':[project(object('Flag',[[[30,30],[50,30],[50,50],[40,50],[40,56],[39.4,56],[39.4,50],[30,50]]])),'check'],
  'satin-narrow':[project(satin(.6)),'fail'],
  'satin-long':[project(satin(9,{splitLength:12})),'fail'],
  'satin-wide':[project(satin(8)),'check'],
  'text-small':[project(text(3.5)),'fail',project(text(5)),'check',project(text(4,'satin')),'check'],
  'outside-hoop':[project({...satin(4),rings:[[[1,50],[40,50]]]},object('Line',[[[0,10],[20,10]]],'running')),'fail'],
  'near-edge':[project(object('Edge',[rect(1,40,20,20)])),'check'],
  'colour-order':[project(object('A',[rect(10,10,10,10)],'fill','#111111'),object('B',[rect(30,10,10,10)],'fill','#222222'),object('C',[rect(50,10,10,10)],'fill','#111111')),'check'],
};

test('The bear sample and the stitch library have no design warnings',()=>{
  assert.deepEqual(checkProject(demo()),[]);
  assert.deepEqual(checkProject(JSON.parse(readFileSync(new URL('./stitch-library.project.json',import.meta.url)))),[]);
});

test('Each editor check is triggered by a minimal project and absent on a clean one',()=>{
  const clean=project(object('Square',[rect(30,30,30,30)]),satin(2),text(8));
  assert.deepEqual(checkProject(clean),[]);
  for(const [code,list] of Object.entries(cases))for(let i=0;i<list.length;i+=2){
    assert.ok(validProject(list[i]),code);
    const w=codes(list[i])[code];
    assert.ok(w,`${code} #${i/2}`);assert.equal(w.severity,list[i+1],`${code} #${i/2}`);
    assert.equal(w.source,'design');assert.ok(w.bounds[0]<=w.bounds[2]&&w.bounds[1]<=w.bounds[3]);
    assert.ok(Object.values(w.values).every(Number.isFinite),code);
  }
  assert.equal(codes(project(satin(1)))['satin-narrow'],undefined);
  assert.equal(codes(project(object('Corner',[rect(3,40,20,20)])))['near-edge'],undefined);
  assert.equal(codes(project(object('A',[rect(10,10,10,10)],'fill','#111111'),object('C',[rect(50,10,10,10)],'fill','#111111'),object('B',[rect(30,10,10,10)],'fill','#222222')))['colour-order'],undefined);
});

test('Fill raster measures area, thickness and thin parts',()=>{
  const r=raster([rect(0,0,10,4)]);
  assert.ok(Math.abs(r.area-40)<1,r.area);assert.ok(Math.abs(r.thickness-4)<.3,r.thickness);assert.ok(r.thin.area<.5,'only the corners');
  const holed=raster([rect(0,0,10,10),rect(2,2,6,6)]);
  assert.ok(Math.abs(holed.area-64)<1.5,holed.area);assert.ok(holed.thickness>2&&holed.thickness<2.5,holed.thickness); // the corners of a 2 mm frame fit a 2.34 mm circle
});

test('Every warning has a short title, one sentence on why, and one concrete fix',()=>{
  const raw=['short-stitches','long-stitches','dense','long-jump','many-trims'].map(code=>({code,objectId:'a-border',bounds:[1,1,2,2],severity:'check',values:{count:3,limit:7,longest:9,layers:5,hits:9,objects:2,length:40,share:1,shortest:.1}}));
  const p=project({...object('A',[rect(30,30,10,10)]),id:'a'});
  const stitches=stitchWarnings(raw,p);
  assert.ok(stitches.every(w=>w.objectId==='a'&&w.source==='stitches'));
  const all=[...Object.values(cases).flatMap(list=>list.filter((_,i)=>i%2===0).flatMap(q=>checkProject(q).map(w=>[w,q]))),...stitches.map(w=>[w,p])];
  assert.equal(new Set(all.map(([w])=>w.code)).size,15);
  for(const [w,q] of all){
    const {title,why,fix}=explain(w,q);
    assert.ok(title.length>5&&title.length<=30,title);
    assert.match(why,/^[A-Z0-9].*[.]$/,why);assert.equal(why.split(/[.!?] /).length,1,why);
    assert.ok(fix.length>10&&fix.endsWith('.'),fix);
    assert.doesNotMatch(why+fix,/undefined|NaN/);
    assert.ok(!/\btrims?\b/i.test(why)||/cut/.test(why),`trim explained: ${why}`);
  }
  assert.deepEqual(severityNames,{fail:'Will likely fail',check:'Worth checking'});
  assert.equal(sortWarnings([{...stitches[0]},{...stitches[0],severity:'fail',key:'x'}],p)[0].severity,'fail');
});

test('One-click fixes clear their warning and keep the project valid',()=>{
  const expected={'fill-small':'Use running stitch','fill-narrow':'Use running stitch','satin-narrow':'Use bean stitch','satin-long':'Split at 7 mm','text-small':'Make 6 mm tall','outside-hoop':'Move inside','near-edge':'Move inside','colour-order':'Sew earlier'};
  for(const [code,label] of Object.entries(expected)){
    const p=cases[code][0],w=codes(p)[code],fix=fixFor(w,p);
    assert.equal(fix?.label,label,code);
    const next=fix.apply(p);
    assert.ok(validProject(next),code);assert.equal(codes(next)[code],undefined,code);
  }
  const big={...text(3.5),rings:[rect(2,40,96,3.5)]},bigProject=project(big),bean=fixFor(codes(bigProject)['text-small'],bigProject);
  assert.equal(bean.label,'Use bean outline');assert.equal(codes(bean.apply(bigProject))['text-small'].severity,'check');
  for(const code of ['fill-thin-part','satin-wide'])assert.equal(fixFor(codes(cases[code][0])[code],cases[code][0]),null,code);
  // Reordering is offered only when nothing passed over overlaps the moved objects.
  const stacked=project(object('A',[rect(10,10,10,10)],'fill','#111111'),object('B',[rect(25,12,30,10)],'fill','#222222'),object('C',[rect(50,10,10,10)],'fill','#111111'));
  const later=fixFor(codes(stacked)['colour-order'],stacked);
  assert.equal(later?.label,'Sew others later');assert.deepEqual(later.apply(stacked).objects.map(o=>o.name),['B','A','C']);
  const blocked=project(object('A',[rect(10,10,10,10)],'fill','#111111'),object('B',[rect(5,5,60,20)],'fill','#222222'),object('C',[rect(50,10,10,10)],'fill','#111111'));
  assert.equal(fixFor(codes(blocked)['colour-order'],blocked),null);
  const trims={...project(),trimJump:9};
  assert.equal(fixFor({code:'long-stitches',objectId:null,bounds:[0,0,1,1],severity:'check',values:{},source:'stitches',key:'k'},trims).apply(trims).trimJump,defaultTrimJump);
  assert.equal(limits.satinWide,7);
});

test('Over-limit pattern floats explain sizing rather than offering a trim fix',()=>{
  const p={...demo(),trimJump:10},w={code:'long-stitches',objectId:p.objects[0].id,bounds:[0,0,1,1],severity:'check',values:{count:1,limit:12.7,longest:13},source:'stitches',key:'float'};
  assert.equal(fixFor(w,p),null);
  assert.match(explain(w,p).fix,/pattern size/);
  assert.match(explain(w,p,'',createT('tr')).fix,/Desen boyutunu/);
});

test('Fill text in a hairline font is flagged; bold and satin text are not',async()=>{
  const opentype=(await import('opentype.js')).default,{layoutText}=load('text');
  const face=name=>opentype.parse(readFileSync(new URL(`./fixtures/${name}`,import.meta.url)).buffer);
  const written=(file,ref,extra={})=>{const spec={...defaultText(ref,[50,50],'Merhaba'),size:12,...extra};return {...object('Name',layoutText(spec,[face(file)]).rings,'fill'),text:spec};};
  const dancing=written('dancing-script-latin-400-normal.ttf',{...font,id:'dancing-script',family:'Dancing Script',weight:400});
  const warning=codes(project(dancing))['text-thin'];
  assert.equal(warning?.severity,'check');assert.ok(warning.values.percent>20,String(warning.values.percent));
  assert.equal(explain(warning,project(dancing)).title,'Thin strokes in this font');
  assert.match(explain(warning,project(dancing),'',createT('tr')).fix,/Nakışa uygun/);
  assert.equal(codes(project(written('nunito-latin-700-normal.ttf',font)))['text-thin'],undefined,'Nunito Bold stitches cleanly');
  assert.equal(codes(project({...dancing,kind:'running'}))['text-thin'],undefined,'outlines are not fills');
});
