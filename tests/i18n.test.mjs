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
