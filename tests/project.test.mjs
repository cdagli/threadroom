import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {object,validProject,fabrics,resolve:resolveLocks,profileDefault,fromFabric,withFabric,underlayOptions,defaultLocks,defaultTrimJump,lockLimits,demo}=load('project');
const resolve=(o,fabric)=>resolveLocks(o,fabric,defaultLocks);
const {exportSVG}=load('svg-export');
const {geometryPayload}=load('curves');
const project=(o,fabric='woven')=>({version:1,name:'Fabric',machine:'brother-pr1x',hoop:'100x100',fabric,locks:{...defaultLocks},trimJump:defaultTrimJump,objects:[o]});
const square=[[30,30],[60,30],[60,60],[30,60]],line=[[30,40],[60,40]];

test('Corner flags are optional boolean arrays aligned with the editable anchors',()=>{
  const o={...object('Curve',[square]),curve:{points:square,closed:true}};
  assert.ok(validProject(project(o)));
  const saved=JSON.parse(JSON.stringify(project({...o,curve:{...o.curve,corners:[true,false,true,false]}})));
  assert.ok(validProject(saved));assert.deepEqual(saved.objects[0].curve.corners,[true,false,true,false]);
  for(const corners of [null,true,{},'true',[true],Array(4),[true,false,true,false,false],[true,false,1,false],[true,false,null,false]])
    assert.equal(validProject(project({...o,curve:{...o.curve,corners}})),false,JSON.stringify(corners));
});

test('Hidden flags and group references validate and survive JSON without requiring contiguous members',()=>{
  const o=object('Region',[square]),groups=[{id:'g',name:'Group 1'}];
  for(const hidden of [undefined,true,false])assert.ok(validProject(project({...o,hidden})));
  for(const hidden of [null,0,1,'true',{},[]])assert.equal(validProject(project({...o,hidden})),false,JSON.stringify(hidden));
  const p={...project(o),groups,objects:[{...o,group:'g',hidden:true},{...o,id:'b'},{...o,id:'c',group:'g'}]};
  assert.ok(validProject(p));assert.ok(validProject(JSON.parse(JSON.stringify(p))));
  for(const group of [null,1,true,'missing',{}])assert.equal(validProject({...p,objects:[{...o,group}]}),false,JSON.stringify(group));
  assert.equal(validProject(project({...o,group:'g'})),false);
  for(const bad of [null,{},true,[null],Array(1),[{}],[{id:1,name:'A'}],[{id:'g',name:1}],[{id:'g',name:'x'.repeat(41)}],[...groups,...groups],Array.from({length:81},(_,i)=>({id:String(i),name:'A'}))])
    assert.equal(validProject({...project(o),groups:bad}),false,JSON.stringify(bad));
  assert.ok(validProject({...project(o),groups:[]}));
  assert.ok(validProject({...project(o),groups:Array.from({length:80},(_,i)=>({id:String(i),name:'x'.repeat(40)}))}));
  assert.ok(validProject({...project(o),groups:[{id:'g',name:'Same'},{id:'h',name:'Same'}]}));
});

test('Hidden objects still compile, export and receive design checks',()=>{
  const {checkProject}=load('check');
  const o={...object('Hidden',[square]),hidden:true,group:'g'},p={...project(o),groups:[{id:'g',name:'Group 1'}]};
  const payload=geometryPayload(p);
  assert.equal(payload.objects.length,1);assert.equal(payload.objects[0].id,o.id);assert.deepEqual(payload.objects[0].rings,[square]);
  const svg=exportSVG(p);assert.match(svg,/inkscape:label="Hidden"/);assert.match(svg,/M30 30 L60 30 L60 60 L30 60 Z/);
  assert.equal(svg,exportSVG({...p,objects:[{...o,hidden:false}]}));
  const edge={...o,rings:[square.map(([x,y])=>[x-40,y])]};
  assert.ok(checkProject({...p,objects:[edge]}).some(w=>w.code==='outside-hoop'));
});

test('Fabric profiles are complete and within the editor limits',()=>{
  const keys=Object.keys(fabrics);
  for(const k of ['woven','jersey','rib','fleece','terry','denim'])assert.ok(keys.includes(k),k);
  for(const [k,f] of Object.entries(fabrics)){
    assert.ok(f.label&&f.stabilizer&&f.topping,k);
    for(const n of [f.fill,f.satin])assert.ok(n>=.3&&n<=2,k);
    assert.ok(f.pull>=0&&f.pull<=1,k);
    assert.ok(underlayOptions('fill').includes(f.fillUnderlay)&&underlayOptions('satin').includes(f.satinUnderlay),k);
    assert.ok(validProject(project(object('Region',[square]),k)),k);
  }
  assert.ok(/cut-away/i.test(fabrics.jersey.stabilizer)&&/water-soluble/i.test(fabrics.terry.topping)&&/water-soluble/i.test(fabrics.fleece.topping));
});

test('Fabric-driven values are optional and range-checked',()=>{
  const o=object('Region',[square]);
  for(const k of ['spacing','underlay','pullCompensation'])assert.equal(k in o,false,k);
  assert.ok(validProject(project(o)));
  const saved=JSON.parse(JSON.stringify(project({...o,spacing:.6,underlay:'edge',pullCompensation:.3})));
  assert.ok(validProject(saved));assert.equal(saved.objects[0].underlay,'edge');
  for(const v of [0,1])assert.ok(validProject(project({...o,pullCompensation:v})));
  for(const v of [-.1,1.01,NaN,Infinity,'0.2',null,true])assert.equal(validProject(project({...o,pullCompensation:v})),false,String(v));
  for(const v of [.2,2.1,NaN,'0.5',null])assert.equal(validProject(project({...o,spacing:v})),false,String(v));
  for(const v of ['zigzag','center','auto',true,false,null])assert.equal(validProject(project({...o,underlay:v})),false,String(v));
  assert.ok(validProject(project({...object('Line',[line],'satin'),underlay:'edge-zigzag'})));
  assert.equal(validProject(project({...object('Line',[line],'zigzag'),underlay:'center'})),false);
  assert.equal(validProject(project(o,'jersey-old')),false);
  assert.equal(validProject({...project(o),fabric:undefined}),false);
});

test('Unset values resolve from the profile by stitch style',()=>{
  const fill=object('Region',[square]),satin=object('Line',[line],'satin'),zigzag=object('Line',[line],'zigzag'),running=object('Line',[line],'running');
  for(const [k,f] of Object.entries(fabrics)){
    assert.deepEqual([resolve(fill,k).spacing,resolve(fill,k).underlay,resolve(fill,k).pullCompensation],[f.fill,f.fillUnderlay,f.pull],k);
    assert.deepEqual([resolve(satin,k).spacing,resolve(satin,k).underlay,resolve(satin,k).pullCompensation],[f.satin,f.satinUnderlay,f.pull],k);
    assert.deepEqual([resolve(zigzag,k).spacing,resolve(zigzag,k).underlay,resolve(zigzag,k).pullCompensation],[1.5,'none',f.pull],k);
    assert.equal(resolve(running,k).pullCompensation,0);assert.equal(resolve(running,k).underlay,'none');
  }
  assert.equal(profileDefault('running','woven','spacing'),null);
  assert.equal(fromFabric('fill','spacing'),true);assert.equal(fromFabric('zigzag','spacing'),false);assert.equal(fromFabric('zigzag','pullCompensation'),true);
});

test('Switching profiles keeps explicit values and changes inherited ones',()=>{
  const explicit={...object('Set',[square]),spacing:.6,underlay:'none',pullCompensation:0};
  const inherited=object('Inherited',[square]);
  let p={...project(explicit),objects:[explicit,inherited]};
  for(const fabric of Object.keys(fabrics)){
    p=withFabric(p,fabric);
    assert.equal(p.fabric,fabric);assert.equal(p.objects[0],explicit);assert.equal(p.objects[1],inherited);
    const [a,b]=geometryPayload(p).objects;
    assert.deepEqual([a.spacing,a.underlay,a.pullCompensation],[.6,'none',0],fabric);
    assert.deepEqual([b.spacing,b.underlay,b.pullCompensation],[fabrics[fabric].fill,fabrics[fabric].fillUnderlay,fabrics[fabric].pull],fabric);
  }
});

test('The compile payload carries resolved values and no fabric',()=>{
  const payload=geometryPayload(project(object('Region',[square]),'fleece'));
  assert.equal('fabric' in payload,false);
  assert.deepEqual([payload.objects[0].spacing,payload.objects[0].underlay,payload.objects[0].pullCompensation],[.45,'edge-tatami',.4]);
});

test('SVG export carries resolved values and names inherited ones',()=>{
  const o=object('Region',[square]);
  const svg=exportSVG(project({...o,pullCompensation:.25},'jersey'));
  assert.match(svg,/data-threadroom-fabric="jersey"/);
  assert.match(svg,/data-threadroom-pull-compensation="0.25"/);assert.match(svg,/data-threadroom-spacing="0.48"/);
  assert.match(svg,/data-threadroom-underlay="edge-tatami"/);assert.match(svg,/data-threadroom-inherited="spacing underlay tie-in tie-off lock-size"/);
  assert.match(exportSVG(project({...o,spacing:.5,underlay:'none',pullCompensation:0,tieIn:'none',tieOff:'tack',lockSize:1})),/data-threadroom-inherited=""/);
});

test('Split length and short stitches default on wide kinds and are range-checked',()=>{
  const {satinDefaults,satinLimits,usesShortStitches}=load('project');
  const satin=object('Line',[line],'satin'),zigzag=object('Line',[line],'zigzag'),estitch=object('Line',[line],'e-stitch'),running=object('Line',[line],'running');
  for(const k of ['splitLength','shortStitches'])assert.equal(k in satin,false,k);
  assert.deepEqual(satinDefaults,{splitLength:7,shortStitches:true});assert.deepEqual(satinLimits.width,[.5,10]);
  assert.deepEqual([resolve(satin,'woven').splitLength,resolve(satin,'woven').shortStitches],[7,true]);
  assert.deepEqual([resolve(zigzag,'jersey').splitLength,resolve(zigzag,'jersey').shortStitches],[7,true]);
  assert.deepEqual([resolve(estitch,'woven').splitLength,resolve(estitch,'woven').shortStitches],[7,false]);
  assert.deepEqual([resolve(running,'woven').splitLength,resolve(running,'woven').shortStitches],[0,false]);
  assert.equal(usesShortStitches('e-stitch'),false);
  assert.equal(fromFabric('satin','splitLength'),false);assert.equal(fromFabric('satin','shortStitches'),false);
  assert.deepEqual([resolve({...satin,splitLength:4.5,shortStitches:false},'woven').splitLength,resolve({...satin,shortStitches:false},'woven').shortStitches],[4.5,false]);
  for(const v of [3,7,12])assert.ok(validProject(project({...satin,splitLength:v})),String(v));
  for(const v of [2.9,12.1,NaN,'7',null,true])assert.equal(validProject(project({...satin,splitLength:v})),false,String(v));
  for(const v of [true,false])assert.ok(validProject(project({...satin,shortStitches:v})));
  for(const v of [1,'true',null])assert.equal(validProject(project({...satin,shortStitches:v})),false,String(v));
  for(const v of [6.5,10])assert.ok(validProject(project({...satin,satinWidth:v})),String(v));
  assert.equal(validProject(project({...satin,satinWidth:10.5})),false);
  const saved=JSON.parse(JSON.stringify(project({...satin,splitLength:5,shortStitches:false})));
  assert.ok(validProject(saved));assert.deepEqual([saved.objects[0].splitLength,saved.objects[0].shortStitches],[5,false]);
  const [p]=geometryPayload(project({...satin,splitLength:5})).objects;assert.deepEqual([p.splitLength,p.shortStitches],[5,true]);
});

test('SVG export carries split length and short stitches for wide kinds',()=>{
  const satin=object('Line',[line],'satin');
  const svg=exportSVG(project({...satin,splitLength:5}));
  assert.match(svg,/data-threadroom-split-length="5"/);assert.match(svg,/data-threadroom-short-stitches="true"/);
  assert.match(svg,/data-threadroom-inherited="spacing underlay pull-compensation short-stitches tie-in tie-off lock-size"/);
  assert.match(exportSVG(project({...object('Line',[line],'e-stitch'),shortStitches:false})),/data-threadroom-split-length="7"(?![^>]*short-stitches)/);
  assert.doesNotMatch(exportSVG(project(object('Region',[square]))),/split-length|short-stitches/);
});

test('Satin text borders carry split and short-stitch defaults',()=>{
  const o={...object('Text',[square]),text:{border:{kind:'satin',color:'#664538',width:4}}};
  const [, border]=geometryPayload(project(o)).objects;
  assert.deepEqual([border.kind,border.satinWidth,border.splitLength,border.shortStitches],['satin',4,7,true]);
  const [, bean]=geometryPayload(project({...o,text:{border:{kind:'bean',color:'#664538',width:1}}})).objects;
  assert.deepEqual([bean.splitLength,bean.shortStitches],[0,false]);
  assert.match(exportSVG(project({...o,text:{...o.text,content:'A'}})),/border"[^>]*data-threadroom-split-length="7" data-threadroom-short-stitches="true"/);
});

test('Entry and exit points are optional, validated and survive JSON',()=>{
  const o=object('Region',[square]);
  assert.equal('entry' in o,false);assert.equal('exit' in o,false);
  const saved=JSON.parse(JSON.stringify(project({...o,entry:[30,45],exit:[60,45]})));
  assert.ok(validProject(saved));assert.deepEqual([saved.objects[0].entry,saved.objects[0].exit],[[30,45],[60,45]]);
  for(const v of [[1],[1,2,3],[NaN,1],[1,Infinity],['1',2],null,{x:1,y:2},[1e4,1]])
    for(const k of ['entry','exit'])assert.equal(validProject(project({...o,[k]:v})),false,`${k} ${JSON.stringify(v)}`);
});

test('SVG export and the compile payload carry snapped entry and exit points',()=>{
  const o={...object('Region',[square]),entry:[29,44],exit:[61.5,50]};
  const svg=exportSVG(project(o));
  assert.match(svg,/data-threadroom-entry="30 44"/);assert.match(svg,/data-threadroom-exit="60 50"/);
  assert.doesNotMatch(exportSVG(project(object('Region',[square]))),/threadroom-(entry|exit)/);
  assert.match(exportSVG(project({...object('Line',[line],'running'),exit:[29,41]})),/data-threadroom-exit="30 40"(?![^>]*entry)/);
  const [p]=geometryPayload(project(o)).objects;assert.deepEqual([p.entry,p.exit],[[30,44],[60,50]]);
  assert.equal(JSON.parse(JSON.stringify(geometryPayload(project(object('Region',[square]))))).objects[0].entry,undefined);
  const text={...o,text:{border:{kind:'satin',color:'#664538',width:2}}};
  const [letters,border]=geometryPayload(project(text)).objects;
  assert.deepEqual(letters.entry,[30,44]);assert.equal(border.entry,undefined);assert.equal(border.exit,undefined);
});

test('Lock and trim settings: project defaults, object overrides and validation',()=>{
  assert.deepEqual(defaultLocks,{tieIn:'tack',tieOff:'tack',lockSize:1});assert.equal(defaultTrimJump,3);
  assert.ok(validProject(demo()));assert.deepEqual([demo().locks,demo().trimJump],[defaultLocks,3]);
  const o=object('Region',[square]),p=project(o);
  for(const v of [lockLimits.trim[0],3,lockLimits.trim[1]])assert.ok(validProject({...p,trimJump:v}),String(v));
  for(const v of [.9,10.1,NaN,'3',null,undefined])assert.equal(validProject({...p,trimJump:v}),false,String(v));
  for(const locks of [undefined,null,{...defaultLocks,tieIn:'knot'},{...defaultLocks,tieOff:undefined},{...defaultLocks,lockSize:.4},{...defaultLocks,lockSize:1.6},{...defaultLocks,lockSize:'1'}])assert.equal(validProject({...p,locks}),false,JSON.stringify(locks));
  for(const t of ['none','tack','triangle'])assert.ok(validProject({...p,locks:{...defaultLocks,tieIn:t,tieOff:t}}),t);
  for(const v of ['none','tack','triangle'])assert.ok(validProject(project({...o,tieIn:v,tieOff:v})),v);
  for(const v of ['arrow',1,null])assert.equal(validProject(project({...o,tieOff:v})),false,String(v));
  for(const v of [.5,1.5])assert.ok(validProject(project({...o,lockSize:v})));
  for(const v of [.49,1.51,'1',null])assert.equal(validProject(project({...o,lockSize:v})),false,String(v));
  // Unset object values inherit the project's; set ones win, both in the payload and SVG.
  const q={...p,locks:{tieIn:'triangle',tieOff:'none',lockSize:.7},trimJump:6.5,objects:[o,{...o,id:'b',tieOff:'tack',lockSize:1.4}]};
  const payload=geometryPayload(q);
  assert.equal('locks' in payload,false);assert.equal(payload.trimJump,6.5);
  assert.deepEqual(payload.objects.map(x=>[x.tieIn,x.tieOff,x.lockSize]),[['triangle','none',.7],['triangle','tack',1.4]]);
  const svg=exportSVG(q);
  assert.match(svg,/data-threadroom-trim-jump="6.5"/);
  assert.match(svg,/data-threadroom-tie-in="triangle" data-threadroom-tie-off="none" data-threadroom-lock-size="0.7"/);
  assert.match(svg,/data-threadroom-tie-in="triangle" data-threadroom-tie-off="tack" data-threadroom-lock-size="1.4"/);
  assert.match(svg,/data-threadroom-inherited="spacing underlay pull-compensation tie-in"/);
  assert.equal(fromFabric('fill','tieIn'),false);
});


test('Run tolerance is optional, validated, exported and keeps the compiler curve tessellation',()=>{
  const {curvePoints}=load('curves'),points=[[20,40],[35,20],[55,30],[65,50]];
  const o={...object('Run',[curvePoints(points,false)],'running'),curve:{points,closed:false}};
  assert.ok(!('tolerance' in o));
  for(const tolerance of [.1,.2,1]){
    const p=project({...o,tolerance});assert.ok(validProject(p));
    assert.deepEqual(geometryPayload(p).objects[0].rings,o.rings);
    assert.match(exportSVG(p),new RegExp(`data-threadroom-tolerance="${tolerance}"`));
  }
  for(const tolerance of [0,1.1,NaN,null,true,'0.2'])assert.equal(validProject(project({...o,tolerance})),false);
  assert.doesNotMatch(exportSVG(project(o)),/threadroom-tolerance/);
});


test('Fill pattern table drives validated payloads, JSON and SVG settings',()=>{
  const {fillPatterns,patternPreview}=load('fill-patterns'),o=object('Fill',[square]);
  for(const p of fillPatterns){
    const saved=JSON.parse(JSON.stringify(project({...o,fillPattern:p.id,patternParams:Object.fromEntries(p.params.map(f=>[f.key,f.default]))})));
    assert.ok(validProject(saved));assert.equal(geometryPayload(saved).objects[0].fillPattern,p.id);
    assert.match(exportSVG(saved),new RegExp(`data-threadroom-fill-pattern="${p.id}"`));
    assert.ok(patternPreview(p.id).length>=12);
  }
  for(const patch of [{fillPattern:'unknown'},{fillPattern:null},{patternParams:null},{patternParams:[]},{patternParams:{steps:1.2}},{patternParams:{steps:0}},{patternParams:{amplitude:11}},{patternParams:{amplitude:NaN}},{patternParams:{extra:1}}])assert.equal(validProject(project({...o,...patch})),false);
  assert.ok(!('fillPattern' in geometryPayload(project(o)).objects[0]));
});

test('Fill underlays, hand stitch, independent length and gradients round-trip and validate',()=>{
  const o=object('Fill',[square]),underlays=[{angle:90,spacing:2,length:2.5,inset:.4},{angle:45,spacing:3,length:5,inset:2}];
  const ramp={mode:'ramp',start:.2,end:.8,endSpacing:2},plateau={mode:'plateau',center:.5,width:.2,endSpacing:4};
  for(const gradient of [ramp,plateau]){
    const saved=JSON.parse(JSON.stringify(project({...o,fillUnderlays:underlays,handStitch:5,fillLength:6,gradient})));
    assert.ok(validProject(saved));const resolved=geometryPayload(saved).objects[0];
    for(const key of ['fillUnderlays','handStitch','fillLength','gradient'])assert.deepEqual(resolved[key],saved.objects[0][key]);
    const svg=exportSVG(saved);
    for(const attr of ['fill-underlays','hand-stitch','fill-length','gradient'])assert.match(svg,new RegExp(`data-threadroom-${attr}="`));
    assert.match(svg,/&quot;mode&quot;/);
  }
  const {fillUnderlayPreset}=load('project');
  assert.deepEqual(fillUnderlayPreset('edge-tatami',2.5),[underlays[0]]);assert.deepEqual(fillUnderlayPreset('edge',2.5),[]);
  for(const fillUnderlays of [[],underlays,[underlays[0],underlays[0],underlays[0]]])assert.ok(validProject(project({...o,fillUnderlays})));
  for(const patch of [{fillUnderlays:null},{fillUnderlays:[{}]},{fillUnderlays:Array(1)},{fillUnderlays:underlays.concat(underlays)},{fillUnderlays:[{...underlays[0],inset:2.1}]},{fillUnderlays:[{...underlays[0],length:NaN}]},{fillLength:0},{fillLength:6.1},{fillLength:true},{handStitch:1.2},{handStitch:null},{handStitch:6},{gradient:null},{gradient:{}},{gradient:{...ramp,mode:'wave'}},{gradient:{...ramp,end:2}},{gradient:{...plateau,width:-1}},{gradient:{...ramp,endSpacing:Infinity}}])assert.equal(validProject(project({...o,...patch})),false,JSON.stringify(patch));
  const defaults=geometryPayload(project(o)).objects[0];
  for(const key of ['fillUnderlays','handStitch','fillLength','gradient'])assert.equal(defaults[key],undefined);
});

test('Only long fill stitches on knits add a new design warning',()=>{
  const {checkProject,explain}=load('check');
  const o={...object('Fill',[square]),fillLength:6};
  for(const fabric of ['jersey','rib','fleece']){
    const p=project(o,fabric),w=checkProject(p).find(w=>w.code==='fill-long');assert.ok(w);assert.equal(w.severity,'check');
    assert.match(explain(w,p).fix,/5 mm/);
  }
  for(const p of [project(o),project({...o,fillLength:5},'jersey'),project({...o,kind:'running'},'jersey'),demo()])assert.ok(!checkProject(p).some(w=>w.code==='fill-long'));
});


test('Run tolerance keeps text outlines closed and is ignored by manual and underlay sampling',()=>{
  const {curvePoints}=load('curves');
  const o={...object('Text',[square],'bean'),tolerance:.2,text:{border:{kind:'bean',color:'#664538',width:1}}};
  const letters=geometryPayload(project(o)).objects[0];
  assert.deepEqual(letters.rings[0][0],letters.rings[0].at(-1));
  for(const kind of ['manual','underlay']){
    const points=[[20,40],[35,20],[55,30],[65,50]],curve={points,closed:false},rings=[curvePoints(points,false)],plain={...object('Line',rings,kind),curve};
    assert.deepEqual(geometryPayload(project({...plain,tolerance:.2})).objects[0].rings,geometryPayload(project(plain)).objects[0].rings);
  }
});

test('Each pattern validates only its own finite, stepped parameters',()=>{
  const {fillPatterns,patternCycle}=load('fill-patterns'),o=object('Fill',[square]);
  for(const p of fillPatterns){
    const valid=params=>validProject(project({...o,fillPattern:p.id,patternParams:params}));
    assert.ok(valid({}),p.id);
    for(const f of p.params){
      for(const value of [f.min,f.default,f.max]){assert.ok(valid({[f.key]:value}),`${p.id}/${f.key}=${value}`);assert.ok(patternCycle(p.id,4,.2,{[f.key]:value}).rows.length);}
      for(const value of [null,true,'3',NaN,Infinity,f.min-f.step,f.max+f.step,f.min+f.step*.5])assert.equal(valid({[f.key]:value}),false,`${p.id}/${f.key}=${value}`);
    }
    for(const key of ['steps','intensity','tightness','cellSize'])if(!p.params.some(f=>f.key===key))assert.equal(valid({[key]:3}),false,p.id);
    const preview=patternPreviewFor(p.id);
    assert.ok(preview.flat().length,p.id);
    assert.ok(preview.flat().every(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)&&x>=2&&x<=40&&y>=2&&y<=26),p.id);
  }
  function patternPreviewFor(id){return load('fill-patterns').patternPreview(id);}
});

test('Preview cycles match the compiler at default and boundary parameters',async()=>{
  const {spawnSync}=await import('node:child_process'),{existsSync}=await import('node:fs');
  const {fillPatterns,patternCycle}=load('fill-patterns'),cases=[];
  for(const p of fillPatterns)for(const s of [.2,.3,2])for(const bound of ['default','min','max'])cases.push([p.id,6,s,Object.fromEntries(p.params.map(f=>[f.key,f[bound]]))]);
  const python=process.env.THREADROOM_PYTHON||(existsSync('.venv/bin/python')?'.venv/bin/python':'python3');
  const result=spawnSync(python,['-c','import sys,json;from embroidery.patterns import pattern_cycle;print(json.dumps([pattern_cycle(*args) for args in json.load(sys.stdin)]))'],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:16*1024*1024});
  assert.equal(result.status,0,result.stderr);
  const expected=JSON.parse(result.stdout);
  function close(a,b,path){if(typeof a==='number'){assert.ok(Math.abs(a-b)<1e-7,`${path}: ${a} vs ${b}`);return;}assert.equal(a.length,b.length,path);a.forEach((v,i)=>close(v,b[i],`${path}/${i}`));}
  cases.forEach(([id,L,s,params],i)=>{const {rows,shear}=patternCycle(id,L,s,params);close([rows,shear],expected[i],`${id}/${s}/${JSON.stringify(params)}`);});
});
