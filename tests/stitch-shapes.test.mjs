import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {isClosedShape,stitchGroups,changeStitchKind,curveRing,reclose,geometryPayload,moveGeometry,setCorner,openPath}=load('curves');
const {object,demo,validProject}=load('project');
const square=[[10,10],[30,10],[30,30],[10,30]],hole=[[15,15],[20,15],[20,20],[15,20]];
const curve=closed=>{const c={points:square,closed,corners:[true,true,true,true]};return {...object('Curve',[curveRing(c)],closed?'fill':'running'),curve:c};};
const lines=['running','bean','backstitch','satin','zigzag','e-stitch','underlay'];

test('Shape closure follows curve metadata, text, fill rings and repeated outline endpoints',()=>{
  for(const o of [curve(true),object('Fill',[square,hole]),object('Cross',[square],'cross'),object('Outline',reclose([square,hole],true),'bean'),{...object('Text',[]),text:{}}])assert.equal(isClosedShape(o),true);
  for(const o of [curve(false),{...curve(false),kind:'fill'},object('Freehand',[square],'running'),object('Points',[square],'manual'),object('Closed points',reclose([square],true),'manual'),object('Mixed',[...reclose([square],true),hole],'running'),object('Empty',[],'running'),object('Degenerate',[[[1,1],[2,2],[1,1]]],'running')])assert.equal(isClosedShape(o),false);
});

test('Closed shapes group fills and outlines; open paths offer line styles and manual',()=>{
  const closed=[{label:'Fill',kinds:['fill','cross']},{label:'Outline',kinds:lines}],open=[{label:'Line',kinds:[...lines,'manual']}];
  assert.deepEqual(stitchGroups(curve(true)),closed);
  assert.deepEqual(stitchGroups(object('Outline',reclose([square],true),'running')),closed);
  assert.deepEqual(stitchGroups({...object('Text',[]),text:{}}),closed);
  assert.deepEqual(stitchGroups(curve(false)),open);
  assert.deepEqual(stitchGroups(object('Manual',[square],'manual')),open);
  assert.deepEqual(stitchGroups({...curve(false),kind:'fill'}),open);
});

test('Every curve outline preserves the closing segment through switching, editing and export',()=>{
  const source=curve(true),before=structuredClone(source);
  for(const kind of lines){
    const outline=changeStitchKind(source,kind);
    assert.equal(outline.curve.closed,true);assert.deepEqual(outline.curve,source.curve);
    assert.deepEqual(outline.rings[0][0],outline.rings[0].at(-1));assert.equal(openPath(outline),false);
    for(const edited of [moveGeometry(outline,([x,y])=>[x+1,y+2]),setCorner(outline,1,false)])assert.deepEqual(edited.rings[0][0],edited.rings[0].at(-1));
    const exported=geometryPayload({...demo(),objects:[outline]}).objects[0];
    assert.deepEqual(exported.rings[0][0],exported.rings[0].at(-1));
    const fill=changeStitchKind(outline,'cross');assert.equal(fill.curve.closed,true);assert.deepEqual(fill.rings,source.rings);
  }
  assert.deepEqual(source,before);
  // Old closed curves with unrepeated line rings also export their full outline.
  const legacy={...source,kind:'running'},exported=geometryPayload({...demo(),objects:[legacy]}).objects[0];
  assert.deepEqual(exported.rings[0][0],exported.rings[0].at(-1));
  assert.ok(load('editor-render').objectGeometry(legacy).path.endsWith(' Z'));
});

test('Plain-ring outlines close outer rings and holes once; filling removes repeats',()=>{
  const source=object('Traced fill',[square,hole]);
  for(const kind of lines){
    const outline=changeStitchKind(source,kind);
    assert.deepEqual(outline.rings,[...reclose([square,hole],true)]);
    assert.deepEqual(changeStitchKind(outline,'bean').rings,outline.rings);
    assert.deepEqual(changeStitchKind(outline,'fill').rings,source.rings);
    assert.deepEqual(changeStitchKind(outline,'cross').rings,source.rings);
  }
  assert.deepEqual(source.rings,[square,hole]);
});

test('Open paths cannot become fills; legacy open fills remain loadable without changing geometry',()=>{
  const open=curve(false),legacy={...open,kind:'fill'},p={...demo(),objects:[legacy]};
  for(const kind of ['fill','cross'])assert.equal(changeStitchKind(open,kind),open);
  assert.ok(validProject(JSON.parse(JSON.stringify(p))));
  assert.equal(changeStitchKind(legacy,'fill'),legacy);
  assert.equal(changeStitchKind(legacy,'cross'),legacy);
  const line=changeStitchKind(legacy,'running');assert.equal(line.curve.closed,false);assert.deepEqual(line.rings,legacy.rings);
  const manual=changeStitchKind(open,'manual');assert.equal(manual.curve,undefined);assert.deepEqual(manual.rings,[open.curve.points]);
  const text={...object('Text',[square]),text:{}};assert.equal(changeStitchKind(text,'manual').kind,'running');
});
