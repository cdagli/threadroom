import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import opentype from 'opentype.js';
import {load} from './load-lib.mjs';
const {layoutText,defaultText,transformText,validText,mergedOutline,fitTextInHoop,textStroke,autoTextPattern,textSatinThreshold}=load('text');
const {moveGeometry,geometryPayload,layoutObject,changeStitchKind}=load('curves');
const {object,validProject,bounds}=load('project');
const font=name=>opentype.parse(readFileSync(new URL(`./fixtures/${name}`,import.meta.url)).buffer);
const latin=font('nunito-latin-700-normal.ttf'),ext=font('nunito-latin-ext-700-normal.ttf');
const ref={source:'catalog',id:'nunito',family:'Nunito',weight:700,italic:false,subsets:['latin','latin-ext']};
const box=rings=>bounds([{rings}]);
const spec=(patch={})=>({...defaultText(ref,[50,50],'HI'),...patch});

test('Stroke estimate uses nonzero union area, counters and closed contour lengths',()=>{
  const square=[[0,0],[6,0],[6,6],[0,6]],hole=[[2,2],[2,4],[4,4],[4,2]];
  assert.ok(Math.abs(textStroke([square])-3)<1e-10);
  assert.ok(Math.abs(textStroke([square,hole])-2)<.01,'subtract the counter area and include its perimeter');
  const overlapping=square.map(([x,y])=>[x+3,y]);
  assert.ok(Math.abs(textStroke([square,overlapping])-2.25)<1e-10,'overlapping same-winding letters count their union area once');
  assert.equal(textStroke([]),0);assert.equal(textStroke([[],[[0,0],[0,0]]]),0);
  assert.equal(textStroke([[...square,square[0]]]),textStroke([square]));
  const rings=layoutText(spec({size:10}),[latin]).rings;
  assert.ok(Math.abs(textStroke(rings)-1.63)<.03,'Nunito Bold HI at 10 mm has a mean stroke near 1.63 mm');
  const perimeter=rings.reduce((p,r)=>p+r.reduce((s,a,i)=>{const b=r[(i+1)%r.length];return s+Math.hypot(b[0]-a[0],b[1]-a[1]);},0),0);
  assert.ok(Math.abs(textStroke(rings)-2*load('check').raster(rings,'nonzero').area/perimeter)<.03);
});

test('Automatic outline fill uses satin through the 3 mm stroke threshold and tatami above it',()=>{
  assert.equal(textSatinThreshold,3);
  assert.equal(autoTextPattern([[[0,0],[6,0],[6,6],[0,6]]]),'sweepSatin');
  assert.equal(autoTextPattern([[[0,0],[6.1,0],[6.1,6.1],[0,6.1]]]),'tatami');
  assert.equal(autoTextPattern(layoutText(spec({size:8}),[latin]).rings),'sweepSatin');
  assert.equal(autoTextPattern(layoutText(spec({size:30}),[latin]).rings),'tatami');
});

test('Shared text relayout reselects only opted-in outline fills and preserves valid settings',()=>{
  const base={...object('HI',[]),fillPattern:'tatami',underlay:'edge',text:spec({size:8,autoStitch:true})};
  const small=layoutObject(base,[latin]);
  assert.equal(small.fillPattern,'sweepSatin');assert.equal(small.underlay,'edge');assert.equal(base.fillPattern,'tatami');
  const large=layoutObject({...small,text:{...small.text,size:30}},[latin]);
  assert.equal(large.fillPattern,'tatami');assert.equal(large.underlay,'edge');
  for(const text of [spec({size:8}),spec({size:8,autoStitch:false})])assert.equal(layoutObject({...base,text},[latin]).fillPattern,'tatami');
  assert.equal(layoutObject({...base,text:spec({size:30}),fillPattern:'sweepSatin'},[latin]).fillPattern,'sweepSatin','legacy projects keep their pattern');
  for(const kind of ['running','cross']){
    const changed=changeStitchKind(small,kind);
    assert.equal(changed.text.autoStitch,false);
    const relaid=layoutObject(changed,[latin]);assert.equal(relaid.kind,kind);assert.equal(relaid.fillPattern,small.fillPattern);
    assert.equal(layoutObject({...changeStitchKind(relaid,'fill'),text:{...relaid.text,size:30}},[latin]).fillPattern,'sweepSatin','returning to fill does not re-enable automatic choice');
  }
  assert.equal(layoutObject(base),base,'wait for fonts before choosing');
  const project=o=>({version:1,name:'Text',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:{tieIn:'tack',tieOff:'tack',lockSize:1},trimJump:3,objects:[o]});
  const satin=layoutObject({...base,underlay:'edge-tatami',spacing:1.5},[latin]);
  assert.equal(satin.underlay,'edge');assert.equal(satin.spacing,undefined);assert.ok(validProject(project(satin)));
  const tatami=layoutObject({...large,underlay:'center',spacing:.2},[latin]);
  assert.equal(tatami.underlay,'edge');assert.equal(tatami.spacing,undefined);assert.ok(validProject(project(tatami)));
  assert.ok(validProject(project(JSON.parse(JSON.stringify(small)))));
});

test('Text autoStitch validates as an optional boolean',()=>{
  for(const autoStitch of [undefined,true,false])assert.ok(validText(spec({autoStitch})));
  for(const autoStitch of [null,0,1,'true',{}])assert.equal(validText(spec({autoStitch})),false);
});

test('Content and font edits use the new outlines to choose their automatic fill',()=>{
  const text=spec({size:20,autoStitch:true}),base={...object('HI',[]),text};
  const bold=layoutObject(base,[latin]);assert.equal(bold.fillPattern,'tatami');
  const content=layoutObject({...bold,text:{...text,content:'M'}},[latin]);
  assert.equal(content.fillPattern,'sweepSatin');
  const script=font('dancing-script-latin-400-normal.ttf');
  const changed=layoutObject({...bold,text:{...text,font:{...ref,id:'dancing-script',family:'Dancing Script',weight:400}}},[script]);
  assert.equal(changed.fillPattern,'sweepSatin');
});

test('Capital height matches the requested letter height and centres on the origin',()=>{
  const {rings,width}=layoutText(spec({size:10}),[latin]);
  const b=box(rings);
  assert.ok(Math.abs(b.height-10)<0.3,b.height); // rounded faces overshoot the design cap height slightly
  assert.ok(Math.abs(b.y+b.height/2-50)<0.05);
  assert.ok(Math.abs(b.x+b.width/2-50)<1,'centred horizontally');
  assert.ok(width>b.width-0.01);
  assert.equal(rings.length,2);
});

test('Holes, kerning, tracking and multiple lines lay out as expected',()=>{
  assert.equal(layoutText(spec({content:'O'}),[latin]).rings.length,2,'O has an outer contour and a hole');
  const tight=layoutText(spec({content:'AV'}),[latin]).width,loose=layoutText(spec({content:'AV',tracking:50}),[latin]).width;
  assert.ok(Math.abs(loose-tight-6)<1e-6,'50% tracking of 12 mm adds 6 mm between two letters');
  const two=box(layoutText(spec({content:'H\nH',size:10,lineHeight:2}),[latin]).rings);
  assert.ok(Math.abs(two.height-30)<0.3,two.height);
});

test('Characters outside the first subset use the next subset; unknown ones are reported',()=>{
  const only=layoutText(spec({content:'Ayşe'}),[latin]);
  assert.deepEqual(only.missing,['ş']);
  const both=layoutText(spec({content:'Ayşe☃'}),[latin,ext]);
  assert.deepEqual(both.missing,['☃']);
  assert.ok(both.rings.length>only.rings.length);
});

test('Arcs bend letters around a circle; positive bends arch up and negative bends arch down',()=>{
  const straight=box(layoutText(spec({content:'HHHHHH'}),[latin]).rings);
  const up=layoutText(spec({content:'HHHHHH',layout:'arc',bend:50}),[latin]).rings,down=layoutText(spec({content:'HHHHHH',layout:'arc',bend:-50}),[latin]).rings;
  const centreY=rings=>{const b=box(rings.slice(2,4));return b.y+b.height/2;},endY=rings=>{const b=box(rings.slice(0,1));return b.y+b.height/2;};
  assert.ok(endY(up)>centreY(up)+5,'rainbow: ends lower than the middle');
  assert.ok(endY(down)<centreY(down)-5,'smile: ends higher than the middle');
  assert.ok(box(up).width<straight.width);
  const circle=box(layoutText(spec({content:'HHHHHHHHHHHH',layout:'arc',bend:100}),[latin]).rings);
  assert.ok(Math.abs(circle.width-circle.height)<circle.width*0.15,'a full bend is roughly round');
});

test('Text follows a path and honours offset, side and direction',()=>{
  const path=[[10,80],[90,80]];
  const on=box(layoutText(spec({content:'H',layout:'path',path,offset:0,align:'left'}),[latin]).rings);
  assert.ok(Math.abs(on.y+on.height-80)<0.3&&on.y<75,'baseline sits on the path');
  assert.ok(Math.abs(on.x-10)<2);
  const mid=box(layoutText(spec({content:'H',layout:'path',path,offset:50}),[latin]).rings);
  assert.ok(Math.abs(mid.x+mid.width/2-50)<0.5);
  const below=box(layoutText(spec({content:'H',layout:'path',path,offset:50,below:true}),[latin]).rings);
  assert.ok(below.y>80);
  const reversed=box(layoutText(spec({content:'H',layout:'path',path,offset:50,reverse:true}),[latin]).rings);
  assert.ok(reversed.y>79.5,'reversing the direction flips text to the other side');
  const vertical=box(layoutText(spec({content:'HHH',layout:'path',path:[[50,90],[50,10]],offset:50}),[latin]).rings);
  assert.ok(vertical.height>vertical.width,'text runs up a vertical path');
});

test('Waves, rotation and closed outlines',()=>{
  const flat=box(layoutText(spec({content:'HHHHHHHH'}),[latin]).rings),wave=box(layoutText(spec({content:'HHHHHHHH',layout:'wave',waveHeight:.5,waveLength:4}),[latin]).rings);
  assert.ok(wave.height>flat.height+4);
  const turned=box(layoutText(spec({content:'HHHH',rotation:90}),[latin]).rings);
  assert.ok(turned.height>turned.width);
  for(const r of layoutText(spec(),[latin],true).rings)assert.deepEqual(r[0],r.at(-1));
});

test('Moving and resizing text updates its editable settings consistently with its geometry',()=>{
  const t=spec({size:10});const o={...object('Text',layoutText(t,[latin]).rings),text:t};
  const moved=moveGeometry(o,([x,y])=>[x+5,y-3]);
  assert.deepEqual(moved.text.origin,[55,47]);assert.equal(moved.text.size,10);
  const scaled=moveGeometry(o,([x,y])=>[50+(x-50)*2,50+(y-50)*2]);
  assert.ok(Math.abs(scaled.text.size-20)<1e-9);
  const regenerated=box(layoutText(scaled.text,[latin]).rings),transformed=box(scaled.rings);
  for(const k of ['x','y','width','height'])assert.ok(Math.abs(regenerated[k]-transformed[k])<0.05,k);
  const path=moveGeometry({...o,text:{...t,layout:'path',path:[[0,0],[10,0]]}},([x,y])=>[x+1,y+1]);
  assert.deepEqual(path.text.path,[[1,1],[11,1]]);
  assert.equal(transformText(t,p=>p).rotation,0);
});

test('Projects with text validate, and export sends nonzero letters plus a border object',()=>{
  const t={...spec(),border:{kind:'satin',color:'#664538',width:1.2}};
  const o={...object('HI',layoutText(t,[latin]).rings),text:t};
  const project={version:1,name:'Text',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:{tieIn:'tack',tieOff:'tack',lockSize:1},trimJump:3,objects:[o,{...object('Empty',[]),text:spec({content:''})}]};
  assert.ok(validProject(project));
  assert.equal(validProject({...project,objects:[{...o,text:{...t,size:500}}]}),false);
  assert.equal(validText({...t,font:{...t.font,id:'../x'}}),false);
  const payload=geometryPayload(project);
  assert.equal(payload.objects.length,2,'empty text is skipped and the border is added');
  assert.equal(payload.objects[0].fillRule,'nonzero');assert.equal(payload.objects[0].text,undefined);
  assert.equal(payload.objects[1].kind,'satin');assert.equal(payload.objects[1].color,'#664538');
  assert.equal(payload.objects[1].spacing,.4);assert.equal(payload.objects[1].underlay,'none');
  assert.equal(geometryPayload({...project,fabric:'terry'}).objects[1].spacing,.38,'border density follows the fabric');
  for(const r of payload.objects[1].rings)assert.deepEqual(r[0],r.at(-1));
  const running=geometryPayload({...project,objects:[{...o,kind:'running',rings:layoutText(t,[latin],true).rings}]}).objects[0];
  const steps=running.rings[0].slice(1).map((p,i)=>Math.hypot(p[0]-running.rings[0][i][0],p[1]-running.rings[0][i][1]));
  assert.ok(steps.every(d=>d<=o.length+1e-6)&&steps.filter(d=>d>o.length*.9).length>steps.length*.6,'outline stitches follow stitch length');
});

test('Text borders follow the merged outline of overlapping letters, keeping holes',()=>{
  const a=[[10,10],[30,10],[30,30],[10,30]],b=[[20,20],[40,20],[40,40],[20,40]];
  const merged=mergedOutline([a,b]);
  assert.equal(merged.length,1,'two overlapping squares give one outline');
  const area=r=>Math.abs(r.reduce((s,p,i)=>i?s+r[i-1][0]*p[1]-p[0]*r[i-1][1]:s,0)/2);
  assert.ok(Math.abs(area(merged[0])-700)<15,area(merged[0]));
  for(const p of merged[0])assert.ok(!(p[0]>21&&p[0]<29&&p[1]>21&&p[1]<29),'no border inside the overlap');
  assert.equal(mergedOutline(layoutText(spec({content:'O'}),[latin]).rings).length,2,'an O keeps its inner hole outline');
});


test('A placed text that would leave the hoop shrinks and moves inside it',()=>{
  const hoop={width:100,height:100},wide=spec({content:'Metninizi yazın',size:12,origin:[60,90]});
  const fitted=fitTextInHoop(wide,box(layoutText(wide,[latin,ext]).rings),hoop);
  const b=box(layoutText(fitted,[latin,ext]).rings);
  assert.ok(fitted.size<12&&fitted.size>=3,fitted.size);
  assert.ok(b.x>=1.9&&b.x+b.width<=98.1&&b.y>=1.9&&b.y+b.height<=98.1,JSON.stringify(b));
  const small=spec({size:8,origin:[50,50]});
  assert.equal(fitTextInHoop(small,box(layoutText(small,[latin]).rings),hoop),null);
  const edge=spec({size:8,origin:[3,50]}),moved=fitTextInHoop(edge,box(layoutText(edge,[latin]).rings),hoop);
  assert.equal(moved.size,8);assert.ok(box(layoutText(moved,[latin]).rings).x>=1.99);
});

test('A font whose declared cap height is far below its capitals is sized by its drawn H',()=>{
  const os2=latin.tables.os2,broken=Object.create(latin);broken.tables={...latin.tables,os2:{...os2,sCapHeight:Math.round(os2.sCapHeight/4)}};
  const height=f=>box(layoutText(spec({content:'H',size:10}),[f]).rings).height;
  assert.ok(Math.abs(height(broken)-height(latin))<height(latin)*.02,`${height(broken)} vs ${height(latin)}`);
  const swash=Object.create(latin);swash.tables={...latin.tables,os2:{...os2,sCapHeight:Math.round(os2.sCapHeight*1.2)}};
  assert.ok(height(swash)<height(latin)*.9,'a declared value within range is still trusted');
});
