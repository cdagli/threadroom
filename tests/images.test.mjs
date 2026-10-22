import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {validProject,defaultLocks,defaultTrimJump,object}=load('project');
const {migrateImages,imageBounds,imageToWorld,toImageFrame,insideImage,transformImage,moveImage,removeImage,updateImage,activeImage,imageLimits}=load('images');
const {around,translate,copySelection}=load('editing');
const {geometryPayload}=load('curves');
const src='data:image/png;base64,AAAA';
const image=(id,patch={})=>({id,src,name:`${id}.png`,x:20,y:30,width:40,height:20,opacity:.5,...patch});
const project=(patch={})=>({version:1,name:'Images',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:{...defaultLocks},trimJump:defaultTrimJump,objects:[object('A',[[[30,30],[60,30],[60,60]]])],...patch});
const near=(a,b,e=1e-9)=>a.every((v,i)=>Math.abs(v-b[i])<e);

test('Old single-artwork projects still load and migrate to images[0]',()=>{
  const old=project({artwork:{src,name:'bear.png',x:10,y:12,width:50,height:40}});
  assert.ok(validProject(old));
  const p=migrateImages(old);
  assert.equal(p.artwork,undefined);assert.deepEqual(p.images,[{id:'image-1',src,name:'bear.png',x:10,y:12,width:50,height:40,opacity:.5}]);
  assert.ok(validProject(p));assert.equal(migrateImages(p),p);
  // A file with both keeps the list and drops the legacy field.
  assert.deepEqual(migrateImages({...p,artwork:old.artwork}).images,p.images);
});

test('Image lists validate ids, sources, geometry, opacity and flags',()=>{
  assert.ok(validProject(project({images:[image('a'),image('b',{rotation:30,hidden:true,locked:false,opacity:1})]})));
  assert.ok(validProject(project({images:[]})));
  for(const bad of [null,{},[null],[image('a'),image('a')],[{...image('a'),id:''}],[{...image('a'),src:'https://x/y.png'}],[{...image('a'),opacity:1.5}],[{...image('a'),opacity:'1'}],
    [{...image('a'),width:0}],[{...image('a'),x:NaN}],[{...image('a'),x:5000}],[{...image('a'),rotation:400}],[{...image('a'),hidden:1}],[{...image('a'),locked:'yes'}],
    Array.from({length:imageLimits.count+1},(_,i)=>image(String(i)))])
    assert.equal(validProject(project({images:bad})),false,JSON.stringify(bad)?.slice(0,80));
});

test('Rotated image frames map both ways and bound the rotated corners',()=>{
  const i=image('a',{rotation:90});
  assert.ok(near(imageToWorld(i,[.5,.5]),[40,40]));
  // Rotating 90° clockwise (y down) sends the image's top-left corner to the top right of the centre.
  assert.ok(near(imageToWorld(i,[0,0]),[50,20]));
  for(const p of [[33,41],[47.5,22],[40,40]])assert.ok(near(imageToWorld(i,toImageFrame(i,p).map((v,k)=>k?(v-i.y)/i.height:(v-i.x)/i.width)),p));
  const b=imageBounds(i);assert.ok(near([b.x,b.y,b.width,b.height],[30,20,20,40]));
  assert.ok(insideImage(i,[40,22]));assert.ok(!insideImage(i,[22,40]));
});

test('Transforms move, scale and rotate an image about the editor matrix without skewing it',()=>{
  const p=project({images:[image('a'),image('b')]});
  const moved=transformImage(p,'a',translate(5,-2));assert.deepEqual([moved.images[0].x,moved.images[0].y],[25,28]);assert.equal(moved.images[1],p.images[1]);
  const scaled=transformImage(p,'a',around([20,30],2,1.5)).images[0];assert.ok(near([scaled.x,scaled.y,scaled.width,scaled.height],[20,30,80,30]));
  const turned=transformImage(p,'a',around([40,40],1,1,30)).images[0];assert.ok(Math.abs(turned.rotation-30)<1e-6);assert.ok(near([turned.x+turned.width/2,turned.y+turned.height/2],[40,40]));
  const back=transformImage({...p,images:[turned]},'a',around([40,40],1,1,-30)).images[0];assert.equal(back.rotation,undefined);
  assert.equal(transformImage(p,'a',[1,0,0,1,0,0]),p);
  assert.equal(transformImage(p,'a',around([20,30],.001)),null);assert.equal(transformImage(p,'missing',translate(1,1)),null);
});

test('List order, edits, removal and the active image',()=>{
  const p=project({images:[image('a'),image('b',{hidden:true}),image('c')]});
  assert.deepEqual(moveImage(p,'a',1).images.map(i=>i.id),['b','a','c']);assert.equal(moveImage(p,'c',1),p);
  assert.deepEqual(removeImage(p,'b').images.map(i=>i.id),['a','c']);
  const edited=updateImage(p,'a',{locked:true,opacity:.2});assert.equal(edited.images[0].locked,true);assert.equal(updateImage(edited,'a',{locked:undefined}).images[0].locked,undefined);
  assert.equal(activeImage(p,'b').id,'b');assert.equal(activeImage(p,null).id,'c');assert.equal(activeImage(updateImage(p,'c',{hidden:true}),null).id,'a');assert.equal(activeImage(project(),null),undefined);
});

test('Images never reach the compiler or the object clipboard',()=>{
  const p=project({images:[image('a')]});
  assert.equal(geometryPayload(p).images,undefined);assert.equal(copySelection(p,[p.objects[0].id]).images,undefined);
});
