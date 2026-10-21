import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {en,tr,createT,t,formatNumber,formatMm,TranslationError,errorText}=load('i18n');
const {object,defaultLocks,defaultTrimJump,demo,groupObjects,kindNames,fabrics,underlayNames,lockNames,hoops}=load('project');
const {checkProject,explain,fixFor,severityNames}=load('check');
const {shapeNames}=load('shapes');
const {defaultText}=load('text');
const {stitchGroups}=load('curves');
const placeholders=s=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
test('Turkish supplies every English key with matching interpolation placeholders',()=>{
  assert.deepEqual(Object.keys(tr).sort(),Object.keys(en).sort());
  for(const [key,value] of Object.entries(en)){
    assert.equal(typeof tr[key],'string',key);assert.ok(tr[key].trim(),key);
    assert.deepEqual(placeholders(tr[key]),placeholders(value),key);
  }
});
test('Interpolation, plurals and measurements follow the selected language',()=>{
  assert.equal(t('Use thread {v0}',{v0:'#123456'}),'#123456 ipliğini kullan');
  for(const lang of ['tr','en']){
    const translate=createT(lang);
    assert.equal(translate('issues.other',{count:3}),lang==='tr'?'3 sorun':'3 issues');
    assert.equal(translate('issues.other',{count:1}),lang==='tr'?'1 sorun':'1 issue');
    assert.equal(translate('objects.other',{count:1}),lang==='tr'?'1 nesne':'1 object');
  }
  assert.equal(formatNumber(1234.5,'tr'),'1.234,5');assert.equal(formatNumber(1234.5,'en'),'1,234.5');
  assert.equal(formatMm(2.5,'tr'),'2,5 mm');assert.equal(formatMm(2.5,'en'),'2.5 mm');
});
test('A design warning explains the stitch problem and offers its fix in Turkish',()=>{
  const o=object('İnce şerit',[[[30,40],[60,40],[60,40.7],[30,40.7]]]);
  const project={version:1,name:'Deneme',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:{...defaultLocks},trimJump:defaultTrimJump,objects:[o]};
  const warning=checkProject(project).find(w=>w.code==='fill-narrow');assert.ok(warning);
  const copy=explain(warning,project,'',createT('tr'));
  assert.equal(copy.title,'Şekil dolgu için çok ince');assert.match(copy.why,/0,7 mm/);assert.match(copy.fix,/düz dikişe/);
  const fix=fixFor(warning,project,createT('tr'));assert.equal(fix.label,'Düz dikiş kullan');assert.match(fix.title,/düz dikişle/);
  assert.equal(fix.apply(project).objects[0].kind,'running');assert.equal(project.objects[0].kind,'fill');
  assert.equal(explain(warning,project,'',createT('en')).title,'Shape too thin to fill');
});
test('Display tables reference dictionary keys and new editable content uses the supplied language',()=>{
  for(const table of [kindNames,underlayNames,lockNames,shapeNames,severityNames])for(const key of Object.values(table))assert.ok(Object.hasOwn(en,key),key);
  for(const f of Object.values(fabrics))for(const key of [f.label,f.stabilizer,f.topping])assert.ok(Object.hasOwn(en,key),key);
  for(const h of Object.values(hoops))assert.ok(Object.hasOwn(en,h.label),h.label);
  const translate=createT('tr'),p=demo(translate);assert.equal(p.name,'Uykucu ayıcık');assert.equal(p.objects[0].name,'Bal rengi ayıcık');
  assert.equal(groupObjects(p,p.objects.slice(0,2).map(o=>o.id),undefined,translate).project.groups[0].name,'Grup 1');
  const font={source:'catalog',id:'nunito',family:'Nunito',weight:800,italic:false,subsets:['latin']};
  assert.equal(defaultText(font,[50,50],undefined,translate).content,'Metninizi yazın');
  assert.equal(defaultText(font,[50,50],'Ada',translate).content,'Ada');
  assert.equal(stitchGroups(p.objects[0],translate)[0].label,'Dolgu');
});
test('Parser, engine and asynchronous errors have Turkish UI messages',()=>{
  const translate=createT('tr');
  assert.equal(errorText(new Error('This embroidery file is incomplete or damaged.'),translate,'This file could not be opened.'),'Bu nakış dosyası eksik veya hasarlı.');
  assert.equal(errorText(new Error('Unexpected token in JSON'),translate,'This file could not be opened.'),'Dosya açılamadı.');
  const error=new TranslationError(createT('en'),'Upload “{v0}” again to edit this text.',{v0:'Nunito'});
  assert.match(errorText(error,translate,'This font could not be read.'),/“Nunito” yazı tipini yeniden yükle/);
  const warning={code:'engine-error',objectId:null,values:{},bounds:[0,0,100,100],severity:'fail',source:'stitches',key:'engine-error'};
  const copy=explain(warning,demo(),'The embroidery engine could not export this design.',translate);
  assert.equal(copy.title,'Dikişler oluşturulamıyor');assert.equal(copy.why,'Nakış motoru bu tasarımı dışa aktaramadı.');
});
test('Fill pattern names translate without changing saved pattern IDs or geometry',()=>{
  const {fillPatterns,patternPreview}=load('fill-patterns');
  const names={even:'Düz',tatami:'Tatami',original:'Orijinal',columns:'Sütunlar','offset-columns':'Kaydırılmış sütunlar',triangle:'Üçgen',walk:'Yürüyüş',waves:'Dalgalar'};
  assert.deepEqual(fillPatterns.map(p=>p.id),Object.keys(names));
  for(const pattern of fillPatterns){
    assert.equal(createT('tr')(pattern.name),names[pattern.id]);
    assert.equal(createT('en')(pattern.name),pattern.name);
    assert.equal(patternPreview(pattern.id).length,12);
  }
});
test('Long knit fill warnings explain the length and fix in the selected language',()=>{
  const p={...demo(),fabric:'jersey',objects:[{...object('Dolgu',[[[30,30],[60,30],[60,60],[30,60]]]),fillLength:5.5}]};
  const warning=checkProject(p).find(w=>w.code==='fill-long');assert.ok(warning);
  assert.deepEqual(explain(warning,p,'',createT('tr')),{
    title:'Örme kumaşta uzun dolgu dikişleri',why:'5,5 mm uzunluğundaki dolgu dikişleri esnek kumaşta takılabilir veya kayabilir.',fix:'Dolgu dikişi uzunluğunu 5 mm veya altına indir.'
  });
  assert.equal(explain(warning,p,'',createT('en')).why,'Fill stitches of 5.5 mm can snag or shift on stretchy fabric.');
  assert.ok(!checkProject({...p,fabric:'woven'}).some(w=>w.code==='fill-long'));
  assert.ok(!checkProject({...p,objects:[{...p.objects[0],fillLength:5}]}).some(w=>w.code==='fill-long'));
});
test('Fill compiler validation messages retain actionable details in Turkish',()=>{
  const translate=createT('tr'),fallback='The stitch engine rejected this design.';
  const labels={fillLength:'Dolgu dikişi uzunluğu',handStitch:'El dikişi','Gradient end spacing':'Gradyan bitiş sıra aralığı','Gradient start':'Gradyan başlangıcı','Gradient end':'Gradyan bitişi','Gradient center':'Gradyan merkezi','Gradient width':'Gradyan genişliği','Underlay angle':'Alt dikiş açısı','Underlay spacing':'Alt dikiş sıra aralığı','Underlay length':'Alt dikiş uzunluğu','Underlay inset':'Alt dikiş içe mesafesi','Wave steps':'Dalga adımları','Wave amplitude':'Dalga genliği','Stitch tolerance':'Dikiş toleransı'};
  for(const [label,turkish] of Object.entries(labels)){
    assert.equal(errorText(`${label} must be a finite number.`,translate,fallback),`${turkish} sonlu bir sayı olmalıdır.`);
    assert.equal(errorText(`${label} must be between -0.3 and 4.`,translate,fallback),`${turkish}, -0,3 ile 4 arasında olmalıdır.`);
  }
  assert.equal(errorText('fillLength must be between 1 and 6.',createT('en'),fallback),'Fill stitch length must be between 1 and 6.');
  assert.equal(errorText('Unknown fill pattern.',translate,fallback),'Bilinmeyen dolgu deseni.');
  assert.equal(errorText('Hand stitch must be an integer.',translate,fallback),'El dikişi değeri tam sayı olmalıdır.');
  assert.equal(errorText('Wave steps must be an integer.',translate,fallback),'Dalga adımı sayısı tam sayı olmalıdır.');
  assert.equal(errorText('Choose a ramp or plateau gradient.',translate,fallback),'Rampa veya plato gradyanı seç.');
  assert.equal(errorText('Choose up to three fill underlays.',translate,fallback),'En fazla üç dolgu alt dikişi seç.');
  assert.equal(errorText('Invalid fill underlay.',translate,fallback),'Geçersiz dolgu alt dikişi.');
  assert.equal(errorText('Invalid fill pattern parameters.',translate,fallback),'Geçersiz dolgu deseni parametreleri.');
  assert.equal(errorText('Unknown field must be a finite number.',translate,fallback),translate(fallback));
});
