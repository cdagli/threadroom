import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {object,validProject,fabrics,resolve,profileDefault,fromFabric,withFabric,underlayOptions}=load('project');
const {exportSVG}=load('svg-export');
const {geometryPayload}=load('curves');
const project=(o,fabric='woven')=>({version:1,name:'Fabric',machine:'brother-pr1x',hoop:'100x100',fabric,objects:[o]});
const square=[[30,30],[60,30],[60,60],[30,60]],line=[[30,40],[60,40]];

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
  assert.match(svg,/data-threadroom-underlay="edge-tatami"/);assert.match(svg,/data-threadroom-inherited="spacing underlay"/);
  assert.match(exportSVG(project({...o,spacing:.5,underlay:'none',pullCompensation:0})),/data-threadroom-inherited=""/);
});
