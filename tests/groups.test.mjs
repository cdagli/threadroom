import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {object,defaultLocks,validProject,normalizeGroups,groupObjects,ungroup,ungroupObjects,moveObjects,moveGroup}=load('project');
const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
const item=(id,group)=>({...object(id,[[[10,10],[20,10],[20,20],[10,20]]]),id,...(group!==undefined&&{group})});
const project=(objects,groups)=>freeze({version:1,name:'Layers',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:{...defaultLocks},trimJump:3,objects,...(groups&&{groups})});
const order=p=>p.objects.map(o=>o.id);
const membership=p=>p.objects.map(o=>o.group);
const groups=[{id:'g',name:'Group 1'},{id:'h',name:'Group 3'}];

test('Group normalization keeps only the first contiguous run and removes empty groups',()=>{
  const p=project([item('a','g'),item('b','g'),item('c'),item('d','g'),item('e','g'),item('f','h')],[...groups,{id:'empty',name:'Empty'}]);
  assert.ok(validProject(p),'validation does not require contiguous groups');
  const next=normalizeGroups(p);
  assert.deepEqual(order(next),order(p));assert.deepEqual(membership(next),['g','g',undefined,undefined,undefined,'h']);
  assert.deepEqual(next.groups,groups);assert.equal('group' in next.objects[3],false);assert.equal('group' in next.objects[4],false);
  assert.equal(next.objects[0],p.objects[0]);assert.equal(normalizeGroups(next),next);
  assert.deepEqual(membership(p),['g','g',undefined,'g','g','h']);
  const empty=project([],groups);assert.deepEqual(normalizeGroups(empty).groups,[]);
  const plain=project([item('a')]);assert.equal(normalizeGroups(plain),plain);assert.equal('groups' in normalizeGroups(plain),false);
  const unknown=normalizeGroups(project([item('a','missing')]));assert.equal(unknown.objects[0].group,undefined);assert.ok(validProject(unknown));
  const blank=project([item('a',''),item('b','')],[{id:'',name:''}]);assert.equal(normalizeGroups(blank),blank);
});

test('Grouping gathers selected objects in sew order at the first selection and picks the lowest unused name',()=>{
  const p=project([item('a','g'),item('b','g'),item('c','h'),item('d','h'),item('e')],groups);
  const {project:next,groupId}=groupObjects(p,['d','b','b','missing']);
  assert.ok(groupId);assert.deepEqual(order(next),['a','b','d','c','e']);
  assert.deepEqual(membership(next),['g',groupId,groupId,'h',undefined]);
  assert.deepEqual(next.groups,[...groups,{id:groupId,name:'Group 2'}]);assert.ok(validProject(next));
  assert.deepEqual(order(p),['a','b','c','d','e']);assert.equal(next.objects[0],p.objects[0]);
  const all=groupObjects(p,order(p),'Everything');
  assert.deepEqual(all.project.groups,[{id:all.groupId,name:'Everything'}]);
  assert.ok(all.project.objects.every(o=>o.group===all.groupId));
  for(const ids of [[],['missing'],['a'],['a','a','missing']])assert.deepEqual(groupObjects(p,ids),{project:p,groupId:null});
  const again=groupObjects(next,['a','e']);assert.notEqual(again.groupId,groupId);assert.equal(again.project.groups.at(-1).name,'Group 4');
});

test('Ungrouping removes membership and normalizes a group split by removing its middle member',()=>{
  const p=project([item('a','g'),item('b','g'),item('c','g'),item('d','h')],groups);
  const whole=ungroup(p,'g');assert.deepEqual(membership(whole),[undefined,undefined,undefined,'h']);assert.deepEqual(whole.groups,[groups[1]]);
  const middle=ungroupObjects(p,['b']);assert.deepEqual(membership(middle),['g',undefined,undefined,'h']);assert.deepEqual(middle.groups,groups);
  const first=ungroupObjects(p,['a']);assert.deepEqual(membership(first),[undefined,'g','g','h']);
  assert.equal(ungroup(p,'missing'),p);assert.equal(ungroupObjects(p,['missing']),p);
  assert.ok(validProject(middle));assert.deepEqual(membership(p),['g','g','g','h']);
});

test('Moving objects uses the original insertion index and preserves relative sew order',()=>{
  const p=project(['a','b','c','d','e'].map(id=>item(id)));
  for(const [ids,index,expected] of [[['b'],0,['b','a','c','d','e']],[['b'],3,['a','c','b','d','e']],[['b'],5,['a','c','d','e','b']],[['e','c'],1,['a','c','e','b','d']],[['b','c'],2,['a','b','c','d','e']],[['d'],1,['a','d','b','c','e']],[['a'],4,['b','c','d','a','e']]]){
    const next=moveObjects(p,ids,index);assert.deepEqual(order(next),expected);assert.ok(validProject(next));
  }
  assert.equal(moveObjects(p,['missing'],0),p);assert.deepEqual(order(p),['a','b','c','d','e']);
});

test('Moving objects into or out of groups normalizes every split and removes empty groups',()=>{
  const p=project([item('a','g'),item('b','g'),item('c','g'),item('d','h'),item('e','h'),item('f')],groups);
  const split=moveObjects(p,['f'],1);
  assert.deepEqual(order(split),['a','f','b','c','d','e']);assert.deepEqual(membership(split),['g',undefined,undefined,undefined,'h','h']);
  const into=moveObjects(p,['f'],1,'g');
  assert.deepEqual(membership(into),['g','g','g','g','h','h']);assert.deepEqual(into.groups,groups);
  const out=moveObjects(p,['a','b','c'],6,null);
  assert.deepEqual(order(out),['d','e','f','a','b','c']);assert.deepEqual(membership(out),['h','h',undefined,undefined,undefined,undefined]);assert.deepEqual(out.groups,[groups[1]]);
  const implicit=moveObjects(p,['a','b','c'],6);assert.deepEqual(implicit,out);
  const transfer=moveObjects(p,['c','b'],4,'h');
  assert.deepEqual(order(transfer),['a','d','b','c','e','f']);assert.deepEqual(membership(transfer),['g','h','h','h','h',undefined]);
  for(const next of [split,into,out,transfer])assert.ok(validProject(next));
});

test('Moving whole groups snaps targets inside another group to the start of its block',()=>{
  const p=project([item('a','g'),item('b','g'),item('c'),item('d','h'),item('e','h'),item('f')],groups);
  const later=moveGroup(p,'g',4);assert.deepEqual(order(later),['c','a','b','d','e','f']);assert.deepEqual(membership(later),[undefined,'g','g','h','h',undefined]);
  const earlier=moveGroup(p,'h',1);assert.deepEqual(order(earlier),['d','e','a','b','c','f']);assert.deepEqual(earlier.groups,groups);
  assert.deepEqual(order(moveGroup(p,'g',6)),['c','d','e','f','a','b']);
  assert.deepEqual(order(moveGroup(p,'g',1)),order(p));assert.deepEqual(order(moveGroup(p,'h',0)),order(earlier));
  assert.equal(moveGroup(p,'missing',0),p);
  assert.ok(validProject(later));assert.ok(validProject(earlier));
});

test('The colour-order design fix normalizes groups after inserting an object into a group block',()=>{
  const {fixFor}=load('check');
  const objects=['a','b','c','d'].map((id,i)=>({...item(id,i<2?'g':undefined),color:['#111111','#222222','#111111','#333333'][i],rings:[[[10+i*20,10],[20+i*20,10],[20+i*20,20],[10+i*20,20]]]}));
  const p=project(objects,[groups[0]]),fix=fixFor({code:'colour-order',objectId:'c'},p),next=fix.apply(p);
  assert.deepEqual(order(next),['a','c','b','d']);assert.deepEqual(membership(next),['g',undefined,undefined,undefined]);assert.equal(normalizeGroups(next),next);
});
