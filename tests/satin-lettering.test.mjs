import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {load} from './load-lib.mjs';
const {satinFonts,layoutSatinText,satinTextShapes,convertSatinText,columnWidth,strokeRails}=load('satin-lettering');
const {defaultText,validText,transformText}=load('text'),{defaultFont}=load('fonts');
const {object,demo,validProject,bounds}=load('project'),{geometryPayload,moveGeometry}=load('curves'),{checkProject}=load('check');
const spec=(font='simplex',content='Ayşe İpek',patch={})=>({...defaultText(defaultFont,[50,50],content),size:6,satin:{font,columnWidth:14},...patch});
const lettering=text=>({...object('Lettering',layoutSatinText(text).rings,'satin-block'),id:'lettering',text});
const project=o=>({...demo(),objects:[o]});

test('Every Hershey glyph, including Turkish and punctuation, produces finite paired editable rails',()=>{
  const required='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789çğıİöşüÇĞIÖŞÜ.,!?\'"-:;()';
  for(const [font,data] of Object.entries(satinFonts)){
    for(const ch of required)assert.ok(data.glyphs[ch],`${font}: ${ch}`);
    for(const ch of Object.keys(data.glyphs)){
      const text=spec(font,ch),o=lettering(text),result=layoutSatinText(text);
      assert.deepEqual(result.missing,[]);assert.ok(validProject(project(o)),`${font}: ${ch}`);
      assert.deepEqual(layoutSatinText(structuredClone(text)),result,'deterministic regeneration');
      const {objects}=satinTextShapes(o);
      if(ch!==' ')assert.ok(objects.length,`${font}: ${ch} has rails`);
      for(const b of objects){
        assert.ok(validProject(project(b)),`${font}: ${ch} valid block`);
        const [l,r]=b.rails.points;assert.equal(l.length,r.length);
        for(let i=0;i<l.length;i++)assert.ok(Math.hypot(r[i][0]-l[i][0],r[i][1]-l[i][1])>=.99,`${font}: ${ch} rung ${i} width`);
      }
    }
  }
});

test('Both rails use existing multiline, spacing, alignment, rotation and shaped text layout',()=>{
  const text=spec('script','İpek'),base=bounds([lettering(text)]);
  const tracked=bounds([lettering({...text,tracking:50})]);assert.ok(tracked.width>base.width+8);
  const multiline=bounds([lettering({...text,content:'İpek\nİpek',lineHeight:2})]);assert.ok(multiline.height>base.height+10);
  for(const patch of [{layout:'arc',bend:40},{layout:'wave',waveHeight:.5},{layout:'path',path:[[10,80],[50,50],[90,80]],offset:50},{rotation:90}]){
    const result=layoutSatinText({...text,...patch});assert.notDeepEqual(result.rings,layoutSatinText(text).rings);assert.deepEqual(result.missing,[]);
    assert.ok(result.columns.every(c=>c.rails.points[0].length===c.rails.points[1].length));
  }
  const path={...text,layout:'path',path:[[10,70],[90,70]]};
  assert.notDeepEqual(layoutSatinText({...path,reverse:true}).rings,layoutSatinText(path).rings);
  assert.notDeepEqual(layoutSatinText({...path,below:true}).rings,layoutSatinText(path).rings);
  const moved=moveGeometry(lettering(text),([x,y])=>[x+4,y-2]);assert.deepEqual(layoutSatinText(moved.text).rings,moved.rings);
  const stretched=transformText(text,([x,y])=>[x*1.2+3,y*.8]);assert.ok(validText(stretched));
  for(const factor of [.5,2]){
    const transformed=moveGeometry(lettering(text),([x,y])=>[50+(x-50)*factor,50+(y-50)*factor]);
    const regenerated=layoutSatinText(transformed.text).rings;
    for(let r=0;r<regenerated.length;r++)for(let i=0;i<regenerated[r].length;i++)for(let k=0;k<2;k++)assert.ok(Math.abs(regenerated[r][i][k]-transformed.rings[r][i][k])<=.002,'resizing preserves clamped columns on regeneration');
  }
  assert.deepEqual(layoutSatinText(spec('simplex','☃')).missing,['☃']);
});

test('Column settings validate, clamp, and split sharp turns without crossed mitres',()=>{
  const text=spec();assert.ok(validText(text));
  for(const satin of [{font:'ember',columnWidth:14},{font:'script',columnWidth:0},{font:'simplex',columnWidth:Infinity},null])assert.equal(validText({...text,satin}),false);
  assert.equal(columnWidth({...text,size:4}),1);assert.equal(columnWidth({...text,size:150}),10);
  assert.equal(strokeRails([[0,0],[0,1],[1,1]],.2).length,2);
  assert.equal(strokeRails([[0,0],[0,0],[0,1]],.2).length,1);
  assert.equal(validProject(project({...lettering(text),kind:'fill'})),false);
});

test('Live export keeps ownership and reading order; conversion gives ordinary grouped Blocks within the project budget',()=>{
  const o=lettering(spec()),p=project(o),sent=geometryPayload(p).objects;
  assert.equal(sent.length,1);assert.equal(sent[0].id,o.id);assert.ok(sent[0].satinColumns.length>5);
  assert.equal(sent[0].text,undefined);
  const chars=sent[0].satinColumns.map(c=>c.character);assert.deepEqual(chars,[...chars].sort((a,b)=>a-b));
  const next=convertSatinText(p,o.id);assert.ok(next&&validProject(next));assert.deepEqual(checkProject(next),[]);
  const svg=load('svg-export').exportSVG(p);assert.match(svg,/data-threadroom-kind="satin-block"/);assert.match(svg,/data-threadroom-rails=/);assert.doesNotMatch(svg,/data-threadroom-kind="fill"/);
  assert.ok(next.objects.every(b=>b.kind==='satin-block'&&b.rails&&!b.text));assert.ok(next.groups.length>1);
  assert.deepEqual(next.objects.map(b=>b.rails.points),sent[0].satinColumns.map(c=>c.railPaths));
  assert.equal(convertSatinText(project(lettering(spec('simplex','A'.repeat(60)))),o.id),null,'conversion never exceeds 80 objects');
  assert.equal(convertSatinText(project({...o,locked:true}),o.id),null);
  assert.deepEqual(geometryPayload(project(lettering(spec('simplex',' ')))).objects,[]);
});

test('Six millimetre Turkish names have a quiet geometry and actual PES design check, deterministic stitches and ownership',()=>{
  for(const font of Object.keys(satinFonts)){
    const p=project(lettering(spec(font)));assert.deepEqual(checkProject(p),[]);
    const code='import json,sys\nfrom embroidery.compiler import compile_project\np=json.load(sys.stdin)\na=compile_project(p);b=compile_project(p)\nassert a["pes"]==b["pes"]\nprint(json.dumps({"warnings":a["warnings"],"commands":a["commands"],"stats":a["stats"]}))';
    const run=spawnSync(process.env.THREADROOM_PYTHON||'.venv/bin/python',['-c',code],{input:JSON.stringify(geometryPayload(p)),encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);const out=JSON.parse(run.stdout);assert.deepEqual(out.warnings,[]);
    assert.ok(out.stats.stitches>100);assert.ok(out.commands.every(c=>c.objectId==='lettering'));
    assert.ok(out.stats.trims<12,'nearby strokes connect rather than cutting every block');
  }
});

test('Font generator reproduces the checked-in JSON byte for byte',()=>{
  const run=spawnSync(process.env.THREADROOM_PYTHON||'.venv/bin/python',['scripts/generate-satin-fonts.py','--check'],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
});
