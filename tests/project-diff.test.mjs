import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {diffProjects,describeChange,same,maxChanges,relativeTime}=load('project-diff');
const {demo,blankProject,object}=load('project');
const {projectThumbnail}=load('project-thumbnail');
const {createT}=load('i18n');

test('Version summaries name added, removed and edited objects',()=>{
  const before=demo(),[first,second,...rest]=before.objects;
  const after={...before,objects:[{...first,color:'#000000'},...rest,object('Leaf',[[[1,1],[5,1],[5,5]]])]};
  assert.deepEqual(diffProjects(before,after),[{op:'edited',name:first.name},{op:'added',name:'Leaf'},{op:'removed',name:second.name}]);
});

test('Key order from Postgres jsonb is not reported as a change',()=>{
  const before=demo(),reordered=JSON.parse(JSON.stringify(before,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).reverse()):v));
  assert.ok(same(before,reordered));
  assert.deepEqual(diffProjects(before,reordered),[]);
});

test('Renames, settings, layer order and images get their own entries',()=>{
  const before=demo(),after={...before,name:'Bear 2',hoop:'130x180',objects:[...before.objects].reverse(),images:[{id:'i',src:'data:image/png;base64,AA',name:'a',x:0,y:0,width:1,height:1,opacity:.5}]};
  assert.deepEqual(diffProjects(before,after).map(c=>c.op),['renamed','reordered','settings','images']);
});

test('Long summaries are capped with a count of the rest',()=>{
  const before=blankProject('A'),after={...before,objects:Array.from({length:12},(_,i)=>object(`O${i}`,[[[0,0],[1,0],[1,1]]]))};
  const changes=diffProjects(before,after);
  assert.equal(changes.length,maxChanges);
  assert.deepEqual(changes.at(-1),{op:'more',count:12-maxChanges+1});
  assert.equal(describeChange(changes.at(-1),createT('tr')),'+5 değişiklik daha');
  assert.equal(describeChange({op:'restored',number:3},createT('en')),'Restored version 3');
});

test('Relative times follow the interface language',()=>{
  const now=Date.parse('2026-11-07T12:00:00Z');
  assert.equal(relativeTime('2026-11-07T11:00:00Z','en',now),'1 hour ago');
  assert.equal(relativeTime('2026-11-07T11:59:40Z','en',now),'this minute');
  assert.match(relativeTime('2026-11-05T12:00:00Z','tr',now),/2 gün önce|evvelsi gün/);
});

test('Thumbnails are compact, cropped SVG without editor metadata or scripts',()=>{
  const svg=projectThumbnail(demo());
  assert.ok(svg.startsWith('<svg'));
  assert.doesNotMatch(svg,/data-threadroom|inkscape|<title|<script|\d\.\d{2}/);
  assert.match(svg,/viewBox="[\d. ]+"/);
  assert.ok(svg.length<12000,String(svg.length));
  assert.equal(projectThumbnail(blankProject('Empty')),null);
});
