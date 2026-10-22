import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {load} from './load-lib.mjs';
const {pixelGrid,cellRings,crossObjects,addPixelCross}=load('pixel-cross'),{validProject,defaultLocks}=load('project'),{geometryPayload}=load('curves'),{insideRegion,regionFromRings,ringArea}=load('polygon');
const image=(pixels,width=pixels.length)=>({width,height:pixels.length/width,data:new Uint8ClampedArray(pixels.flat())});
const project=()=>({version:1,machine:'brother-pr1x',name:'Pixels',hoop:'100x100',fabric:'woven',locks:defaultLocks,trimJump:3,objects:[]});
test('nearest-colour quantisation is deterministic, bounded and leaves alpha empty',()=>{
 const data=image([[255,0,0,255],[250,2,0,255],[0,0,255,255],[0,0,0,0]],2),grid=pixelGrid(data,2,2,2);assert.equal(grid.palette.length,2);assert.equal(grid.cells[0],grid.cells[1]);assert.equal(grid.cells[3],-1);assert.notEqual(grid.cells[0],grid.cells[2]);assert.deepEqual(pixelGrid(data,2,2,2),grid);
 const brother=pixelGrid(data,2,2,2,true);assert.ok(brother.palette.every(c=>c.thread.brand==='brother'));assert.ok(validProject(addPixelCross(project(),brother,2)));
 assert.throws(()=>pixelGrid(image([[0,0,0,0]]),1,1,2),/transparent/);assert.throws(()=>pixelGrid(data,100,2,2));assert.throws(()=>pixelGrid(data,2,2,NaN));
});
test('merged cell boundaries preserve holes, islands and diagonal neighbours exactly',()=>{
 for(const cells of [[0,0,0,0,-1,0,0,0,0],[0,-1,0,-1,0,-1,0,-1,0],[0,0,-1,0,0,-1,-1,-1,0]]){
  const grid={columns:3,rows:3,cells,palette:[{color:'#123456'}]},rings=cellRings(grid,0,2,[10,20]),region=regionFromRings(rings);
  assert.equal(rings.reduce((s,r)=>s+ringArea(r),0),cells.filter(c=>c===0).length*4);
  cells.forEach((c,i)=>assert.equal(insideRegion(region,[10+(i%3+.5)*2,20+(Math.floor(i/3)+.5)*2]),c===0));
 }
 const full={columns:32,rows:32,cells:Array(1024).fill(0),palette:[{color:'#ffffff'}]};assert.equal(cellRings(full,0,2,[0,0])[0].length,4);
});
test('one cross object per used colour retains aligned half-mm grid and validates limits',()=>{
 const grid={columns:3,rows:2,cells:[0,1,-1,0,1,0],palette:[{color:'#ff0000'},{color:'#0000ff'},{color:'#ffffff'}]},p=addPixelCross(project(),grid,1.5);assert.equal(p.objects.length,2);assert.ok(validProject(p));assert.ok(p.objects.every(o=>o.kind==='cross'&&o.crossStyle==='cross'&&o.crossSize===1.5&&o.angle===0&&o.coverage===100));assert.throws(()=>addPixelCross(project(),grid,20*2));assert.throws(()=>crossObjects(grid,1.2,[0,0]));assert.throws(()=>addPixelCross(project(),{...grid,columns:96,rows:96,cells:Array(9216).fill(0)},2),/hoop/);assert.throws(()=>addPixelCross(project(),{...grid,cells:Array(6).fill(-1)},2),/Paint/);
});
test('pixel grid compiles to the same occupied cells and survives PES roundtrip',()=>{
 const grid={columns:3,rows:3,cells:[0,0,0,0,1,0,0,0,0],palette:[{color:'#ff0000'},{color:'#0000ff'}]},p=geometryPayload(addPixelCross(project(),grid,2));
 const r=spawnSync(process.env.THREADROOM_PYTHON||'.venv/bin/python',['-c',`import json,sys,io,base64
from embroidery.compiler import compile_project
from embroidery.cross import cells
from pystitch import read_pes
p=json.load(sys.stdin)
assert [len(cells(o)[0]) for o in p['objects']]==[8,1]
r=compile_project(p)
assert len(r['threads'])==2 and r['stats']['stitches']>0
assert len(read_pes(io.BytesIO(base64.b64decode(r['pes']))).threadlist)==2
print('ok')`],{input:JSON.stringify(p),encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/ok/);
});
