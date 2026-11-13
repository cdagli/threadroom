import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {libraryCategories,filterLibraryAssets,insertLibraryAsset,validLibraryAsset}=load('library');
const {libraryAssets}=load('library-assets');
const {blankProject,object,validProject,hoops}=load('project');
const {checkProject}=load('check');
const {selectionBounds}=load('editing');
const {en,tr}=load('i18n');
const {shapeNames}=load('shapes');
const rectangle=(name='Petal',x=10,y=20,w=20,h=10)=>object(name,[[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]]);
const asset=(patch={})=>({version:1,id:'test-motif',categoryId:'botanical',name:{en:'Flower',tr:'Çiçek'},tags:['yaprak','çiçekli'],design:{objects:[rectangle()]},...patch});
const ids=()=>{let n=0;return ()=>`new-${++n}`;};

test('The catalog has stable translated categories and valid, uniquely identified sample designs',()=>{
  assert.equal(libraryCategories.length,8);
  assert.equal(new Set(libraryCategories.map(c=>c.id)).size,8);
  for(const c of libraryCategories){assert.ok(en[c.name]);assert.ok(tr[c.name]);}
  assert.ok(libraryAssets.length>=4);
  for(const c of libraryCategories)assert.ok(libraryAssets.some(a=>a.categoryId===c.id),`${c.id} has motifs`);
  assert.equal(new Set(libraryAssets.map(a=>a.id)).size,libraryAssets.length);
  for(const a of libraryAssets){
    assert.ok(validLibraryAsset(a),a.id);
    assert.ok(a.design.objects.every(o=>o.thread&&!o.locked&&!o.hidden),a.id);
    assert.equal(new Set(a.design.objects.map(o=>o.id)).size,a.design.objects.length);
    if(a.categoryId!=='basic-shapes')assert.ok(a.design.groups?.length,a.id);
  }
});

test('Every sample inserts into each hoop, preserves editable parts, and leaves its catalog source unchanged',()=>{
  const before=JSON.stringify(libraryAssets);
  for(const a of libraryAssets)for(const [hoop,h] of Object.entries(hoops)){
    const p=blankProject('Catalog check',hoop),next=insertLibraryAsset(p,a,[h.width/2,h.height/2],ids());
    assert.ok(next,`${a.id} in ${hoop}`);assert.ok(validProject(next.project));
    assert.equal(next.project.objects.length,a.design.objects.length);
    assert.deepEqual(next.project.objects.map(o=>o.name),a.design.objects.map(o=>o.name));
    assert.equal(next.project.groups.length,a.design.groups?.length??0);
    assert.ok(checkProject(next.project).every(w=>w.severity!=='fail'),`${a.id} in ${hoop}`);
    if(hoop==='100x100'&&a.categoryId!=='basic-shapes')assert.deepEqual(checkProject(next.project),[],a.id);
    next.project.objects[0].rings[0][0][0]=0;
  }
  assert.equal(JSON.stringify(libraryAssets),before);
  // Accent-insensitive search: "cicek" finds items tagged "çiçek" (the catalog keeps growing, so no fixed count).
  const flowers=filterLibraryAssets(libraryAssets,{query:'cicek',categoryId:'botanical'}).map(a=>a.id);
  assert.ok(['botanical.tulip-01','botanical.daisy-01'].every(id=>flowers.includes(id)),flowers.join());
});

test('All former shape tools are searchable editable fills in Basic shapes',()=>{
  const shapes=filterLibraryAssets(libraryAssets,{categoryId:'basic-shapes'});
  assert.equal(shapes.length,Object.keys(shapeNames).length);
  for(const [kind,label] of Object.entries(shapeNames)){
    const shape=shapes.find(a=>a.id===`basic-shapes.${kind}`);
    assert.ok(shape,kind);
    assert.deepEqual(shape.name,{en:en[label],tr:tr[label]});
    assert.ok(shape.design.objects[0].curve.closed);
    assert.equal(shape.design.objects[0].kind,'fill');
    assert.ok(filterLibraryAssets(shapes,{query:tr[label]}).includes(shape));
  }
});

test('Catalog search combines category, all query words, Turkish text and tags',()=>{
  const flower=asset(),shape=asset({id:'box',categoryId:'basic-shapes',name:{en:'Rectangle',tr:'Dikdörtgen'},tags:['köşeli']});
  const assets=[flower,shape];
  assert.deepEqual(filterLibraryAssets(assets,{query:' CICEK yaprak '}),[flower]);
  assert.deepEqual(filterLibraryAssets(assets,{query:'DİKDÖRTGEN'}),[shape]);
  assert.deepEqual(filterLibraryAssets(assets,{query:'rectangle koseli'}),[shape]);
  assert.deepEqual(filterLibraryAssets(assets,{categoryId:'basic-shapes',query:'flower'}),[]);
  assert.deepEqual(filterLibraryAssets(assets,{categoryId:'botanical'}),[flower]);
  assert.deepEqual(filterLibraryAssets(assets,{}),assets);
});

test('Insertion makes independent editable copies, retains target settings and preserves groups',()=>{
  const existing=rectangle('Existing',60,60),project={...blankProject('My project','180x130','jersey'),objects:[existing]};
  const source=asset({design:{objects:[{...rectangle(),id:'a',group:'g',locked:true},{...rectangle('Stem',20,30,2,10),id:'b',group:'g'}],groups:[{id:'g',name:'Flower'}]}});
  const snapshot=structuredClone(source),projectSnapshot=structuredClone(project),generate=ids();
  const first=insertLibraryAsset(project,source,[80,50],generate);assert.ok(first);assert.ok(validProject(first.project));
  assert.equal(first.project.name,project.name);assert.equal(first.project.fabric,project.fabric);assert.equal(first.project.hoop,project.hoop);
  assert.equal(first.project.objects[0],existing);assert.deepEqual(selectionBounds(first.project,first.ids),{x:70,y:40,width:20,height:20});
  assert.equal(first.project.groups[0].name,'Flower');
  assert.ok(first.project.objects.slice(1).every(o=>o.group===first.project.groups[0].id&&!o.locked));
  const second=insertLibraryAsset(first.project,source,[120,60],generate);assert.ok(second);
  assert.equal(new Set(second.project.objects.map(o=>o.id)).size,5);
  assert.notEqual(second.project.groups[0].id,second.project.groups[1].id);
  second.project.objects.at(-1).rings[0][0][0]=0;
  assert.deepEqual(source,snapshot);assert.deepEqual(project,projectSnapshot);
  assert.notDeepEqual(second.project.objects.at(-1).rings,first.project.objects.at(-1).rings);
});

test('Drops clamp to hoop edges and oversize motifs fit proportionally; straight paths remain insertable',()=>{
  const p=blankProject('Small hoop','60x40'),source=asset({design:{objects:[rectangle('Large',100,100,120,60)]}});
  for(const at of [[0,0],[60,40],[-100,1000],[30,20]]){
    const next=insertLibraryAsset(p,source,at,ids());assert.ok(next);
    const b=selectionBounds(next.project,next.ids);assert.ok(Math.abs(b.width-59.9)<1e-9);assert.ok(Math.abs(b.height-29.95)<1e-9);
    assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=60&&b.y+b.height<=40);
  }
  const line=asset({design:{objects:[object('Line',[[[10,10],[30,10]]],'running')]}});
  assert.ok(insertLibraryAsset(p,line,[30,20],ids()));
  const column=asset({design:{objects:[{...object('Satin stem',[[[20,10],[20,70]]],'satin'),satinWidth:1.4}]}});
  for(const at of [[0,0],[60,0],[0,40],[60,40]]){
    const next=insertLibraryAsset(p,column,at,ids());assert.ok(next);
    assert.ok(checkProject(next.project).every(w=>w.code!=='outside-hoop'),'Satin width stays within the hoop at a corner');
  }
});

test('Invalid payloads, nonfinite positions and object/point limits reject without changing the project',()=>{
  const p=blankProject('Unchanged'),source=asset();
  for(const bad of [null,{},asset({version:2}),asset({categoryId:'missing'}),asset({name:{tr:'Çiçek',en:''}}),asset({design:{objects:[]}}),asset({design:{objects:[{...rectangle(),layoutOnly:true}]}}),asset({design:{objects:[{...rectangle(),id:'same'},{...rectangle(),id:'same'}]}})]){
    assert.equal(validLibraryAsset(bad),false);
    assert.equal(insertLibraryAsset(p,bad,[50,50],ids()),null);
  }
  assert.equal(insertLibraryAsset(p,source,[NaN,50],ids()),null);
  const full={...p,objects:Array.from({length:80},(_,i)=>({...rectangle(),id:`existing-${i}`}))},before=structuredClone(full);
  assert.equal(insertLibraryAsset(full,source,[50,50],ids()),null);assert.deepEqual(full,before);
  const ring=Array.from({length:6001},(_,i)=>[10+i/1000,20+(i%2)]);
  assert.equal(insertLibraryAsset({...p,objects:[object('Many points',[ring])]},asset({design:{objects:[object('More points',[ring])]}}),[50,50],ids()),null);
  assert.deepEqual(p,blankProject('Unchanged'));
});
