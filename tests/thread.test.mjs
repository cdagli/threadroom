import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {threadShades,threadStyle,holeInset,sheenSegment,plyGrooves,passWidths,batchBreaks,lustre,lustreShades,drawThreads,fabricLooks,luminance,rgb,threadWidth}=load('thread');
const {fabrics}=load('project');
const st=(fromX,fromY,x,y,block=0,type='stitch')=>({type,fromX,fromY,x,y,block});
const record=()=>({strokes:[],path:[],beginPath(){this.path=[];},moveTo(x,y){this.path.push(x,y);},lineTo(x,y){this.path.push(x,y);},stroke(){this.strokes.push({colour:this.strokeStyle,width:this.lineWidth,cap:this.lineCap,path:this.path});}});

test('Thread shades: sunken ends, darker edge, lighter sheen, valid hex for any thread',()=>{
  assert.deepEqual(rgb('#fa0'),[255,170,0]);assert.deepEqual(rgb('#123456'),[18,52,86]);
  for(const c of ['#000000','#ffffff','#c4453a','#2f6fd6','#f6d7a7','#5a3e2b']){
    const s=threadShades(c);for(const v of Object.values(s))assert.match(v,/^#[0-9a-f]{6}$/);
    assert.equal(s.body,c);assert.ok(luminance(s.edge)<luminance(c)||luminance(c)===0,c);
    assert.ok(luminance(s.sheen)>luminance(c)||luminance(c)===1,c);
    if(luminance(c)>0){assert.ok(luminance(s.end)<luminance(s.mid),c);assert.ok(luminance(s.mid)<luminance(s.body),c);}
    else{assert.equal(s.end,c);assert.equal(s.mid,c);}
    for(const [shade,factor] of [[s.end,.70],[s.mid,.85]])rgb(shade).forEach((v,i)=>assert.ok(Math.abs(v-rgb(c)[i]*factor)<=.5));
  }
  assert.ok(luminance(threadShades('#000000').sheen)>.05,'black thread still shows a sheen');
  assert.ok(luminance(threadShades('#ffffff').edge)<.75,'white thread still shows its edges');
});

test('Thread style: 0.36 mm at true scale, readable when zoomed out, no drop shadow',()=>{
  assert.equal(threadWidth,.36);
  const far=threadStyle(1),mid=threadStyle(5),near=threadStyle(40);
  assert.equal(far.detail,0);assert.equal(mid.detail,1);assert.equal(near.detail,2);
  assert.ok(Math.abs(mid.width-.36)<1e-9&&Math.abs(near.width-.36)<1e-9);
  assert.ok(Math.abs(far.width-.7)<1e-9,'at least 0.7 px wide');
  for(const s of [far,mid,near]){assert.ok(s.body<s.width&&s.sheen<s.body);assert.deepEqual(s.shadow,[0,0]);}
  assert.equal(threadStyle(3.5/threadWidth).detail,2,'ply detail starts at 3.5 px per thread');
  assert.equal(threadStyle(3.49/threadWidth).detail,1);
});

test('Needle holes: symmetric insets, 1.8 mm cap, no zero-length inner segments',()=>{
  const s=holeInset(1,2,4,6,.35),back=holeInset(4,6,1,2,.35),d=Math.hypot(s[0]-1,s[1]-2);
  assert.ok(Math.abs(d-.35*.35*5)<1e-9);assert.ok(Math.abs(Math.hypot(4-s[2],6-s[3])-d)<1e-9);
  assert.deepEqual(back,[s[2],s[3],s[0],s[1]]);assert.deepEqual(holeInset(1,2,4,6,0),[1,2,4,6]);
  const long=holeInset(0,0,20,0,1);assert.ok(Math.abs(long[0]-1.8)<1e-9&&Math.abs(20-long[2]-1.8)<1e-9);
  assert.equal(holeInset(1,1,1,1,.75),null);assert.equal(holeInset(0,0,1,0,2),null,'insets consume a short stitch');
  assert.ok(holeInset(0,0,20,0,2),'the cap leaves a body on a long stitch');
});

test('Sheen: on the lit side, inset from both needle holes, absent on knots',()=>{
  const [x0,y0,x1,y1]=sheenSegment(0,0,4,0,.36);
  assert.ok(y0<0&&y1<0,'horizontal stitch: sheen above (light from the top left)');
  const inset=holeInset(0,0,4,0,.75);assert.equal(x0,inset[0]);assert.equal(x1,inset[2]);
  const back=sheenSegment(4,0,0,0,.36);assert.ok(back[1]<0,'direction does not flip the lit side');
  const v=sheenSegment(0,0,0,3,.36);assert.ok(v[0]<0,'vertical stitch: sheen on the left');
  assert.equal(sheenSegment(1,1,1.2,1,.36),null);assert.equal(sheenSegment(1,1,1,1,.36),null);
  const short=sheenSegment(0,0,.5,0,.36);assert.ok(short[2]-short[0]>.15&&short[0]>0);
});

test('Ply grooves: equal whole repeats, diagonal flank crossings, contained within holes',()=>{
  for(const [ax,ay,bx,by] of [[0,0,2.8,0],[1,2,1,5],[1,2,4,6],[4,6,1,2],[0,0,.1,0]]){
    const len=Math.hypot(bx-ax,by-ay),ux=(bx-ax)/len,uy=(by-ay)/len,g=plyGrooves(ax,ay,bx,by,.36,.7),n=Math.max(1,Math.round(len/.7));
    assert.equal(g.length,n*4);
    for(let i=0;i<n;i++){
      const [x0,y0,x1,y1]=g.slice(i*4,i*4+4),along0=(x0-ax)*ux+(y0-ay)*uy,along1=(x1-ax)*ux+(y1-ay)*uy;
      const across0=-(x0-ax)*uy+(y0-ay)*ux,across1=-(x1-ax)*uy+(y1-ay)*ux;
      assert.ok(across0*across1<0,'groove crosses the stitch axis');assert.ok(Math.abs(across0+across1)<1e-9);
      assert.ok(Math.abs(Math.abs(across0)-.36*.44)<1e-9,'groove reaches both flanks within the stroke width');
      assert.ok(Math.abs((along0+along1)/2-(i+.5)*len/n)<1e-9,'evenly spaced repeat centres');
      assert.ok(Math.abs(along1-along0-Math.min(.35,len/n*.8))<1e-9,'along-axis skew');
      assert.ok(along0>=0&&along1<=len,'groove stays between the holes');
    }
  }
  assert.deepEqual(plyGrooves(1,1,1,1,.36,.7),[]);
});

test('Thread painting: butt ends, dark holes at every zoom, bounded width and batch-only strokes',()=>{
  const commands=[{type:'stitch',fromX:0,fromY:0,x:4,y:0,block:0},{type:'stitch',fromX:0,fromY:1,x:4,y:1,block:0}],shade=threadShades('#c4453a');
  for(const px of [1,5,40]){
    const c=record(),style=threadStyle(px);drawThreads(c,commands,[shade],0,2,style,[-1,-1,5,2]);
    assert.deepEqual(c.strokes[0].path,[0,0,4,0,0,1,4,1]);assert.equal(c.strokes[0].colour,shade.end);
    assert.equal(c.strokes.length,style.detail===0?2:style.detail===1?5:6,'one stroke per shading pass for the whole batch');
    for(const s of c.strokes){assert.equal(s.cap,'butt');assert.ok(s.width<=style.width,'no widened shadow');}
    const variants=lustreShades(shade.body,style.detail?6:3),body=c.strokes.find(s=>s.colour===variants[Math.round((variants.length-1)/2)].body),inset=holeInset(0,0,4,0,style.detail?.75:.5);
    assert.deepEqual(body.path.slice(0,4),inset,'body stays clear of the dark holes');
    if(style.detail===2){assert.match(c.strokes.at(-1).colour,/^rgba\(\d+,\d+,\d+,\.45\)$/);assert.equal(c.strokes.at(-1).path.length,2*Math.round(4/.7)*4);}
    else assert.ok(c.strokes.every(s=>s.colour.startsWith('#')),'no shadow or ply pass');
  }
  const c=record(),style=threadStyle(1);drawThreads(c,commands,[shade],0,1,style,[-1,-1,5,2]);drawThreads(c,commands,[shade],1,2,style,[-1,-1,5,2]);
  assert.equal(c.strokes.length,4);assert.deepEqual(c.strokes[2].path,[0,1,4,1],'playback draws only the next stitch');
  const crossing=[commands[0],{type:'stitch',fromX:2,fromY:-1,x:2,y:1,block:0}],over=record();drawThreads(over,crossing,[shade],0,2,style,[-1,-2,5,2]);
  assert.equal(over.strokes.length,4);assert.deepEqual(over.strokes[2].path,[2,-1,2,1],'crossing starts a later batch');
});

test('Pass widths: geometry detects bean, out-and-back and separate fill rows per colour block',()=>{
  const bean=[st(0,0,4,0),st(4,0,0,0),st(0,0,4,0)],pair=[st(0,0,4,0),st(4.01,.01,.01,.01)];
  assert.deepEqual([...passWidths(bean)],[1.5,1.5,1.5]);assert.equal(passWidths(bean),passWidths(bean),'cached per commands array');
  for(const m of passWidths(pair))assert.ok(Math.abs(m-1.3)<1e-6,'reversed and quantised endpoints match');
  assert.deepEqual([...passWidths([st(0,0,4,0),st(4,.4,0,.4),st(0,.8,4,.8)])],[1,1,1]);
  assert.deepEqual([...passWidths([st(0,0,4,0),st(4,0,0,0,1)])],[1,1],'colour blocks never merge');
  assert.deepEqual([...passWidths([st(0,0,.09,0),st(.09,0,0,0),st(0,0,4,0,0,'jump'),st(0,0,4,0)])],[1,1,1,1],'short stitches and jumps do not count');
  assert.deepEqual([...passWidths([...bean,st(4,0,0,0)])],[1.5,1.5,1.5,1.5],'width caps at three passes');
});

test('Repeated painting: widened once per batch, scaled shading and grooves, incremental crossing order',()=>{
  const bean=[st(0,0,4,0),st(4,0,0,0),st(0,0,4,0)],shade=threadShades('#c4453a'),view=[-1,-1,5,2];
  for(const px of [1,5,40]){
    const c=record(),style=threadStyle(px);drawThreads(c,bean,[shade],0,3,style,view);
    assert.equal(c.strokes.length,style.detail===0?2:style.detail===1?5:6);assert.deepEqual(c.strokes[0].path,[0,0,4,0]);
    assert.ok(Math.abs(c.strokes[0].width-style.width*1.5)<1e-9,'minimum pixel width scales too');
    const variants=lustreShades(shade.body,style.detail?6:3),body=c.strokes.find(s=>s.colour===variants[Math.round((variants.length-1)/2)].body);assert.deepEqual(body.path,holeInset(0,0,4,0,style.detail?.75:.5),'hole length does not scale');
    if(style.detail){assert.ok(Math.abs(body.width-style.body*1.5)<1e-9);assert.deepEqual(c.strokes[4].path,sheenSegment(0,0,4,0,style.width*1.5));assert.equal(c.strokes[4].width,style.sheen*1.5);}
    if(style.detail===2){assert.equal(c.strokes[5].width,style.width*1.5*.12);assert.deepEqual(c.strokes[5].path,plyGrooves(0,0,4,0,style.width*1.5,.7));assert.ok(Math.abs(c.strokes[5].path[2]-c.strokes[5].path[0]-.35*1.5)<1e-9);}
    const playback=record();for(let i=0;i<3;i++)drawThreads(playback,bean,[shade],i,i+1,style,view);assert.deepEqual(playback.strokes,c.strokes,'playback skips repeats already painted in this batch');
  }
  const mixed=[st(0,0,4,0),...bean.map(k=>({...k,fromY:1,y:1})),st(0,2,4,2),st(4,2,0,2)],c=record(),style=threadStyle(1);
  drawThreads(c,mixed,[shade],0,mixed.length,style,[-1,-1,5,3]);assert.deepEqual(c.strokes.filter(s=>s.colour===shade.end).map(s=>s.width),[style.width*1.5,style.width*1.3,style.width]);
  const crossed=[bean[0],st(2,-1,2,1),bean[1]],over=record();assert.deepEqual([...batchBreaks(crossed)],[1,1,1]);
  drawThreads(over,crossed,[shade],0,3,style,view);assert.equal(over.strokes.length,6);assert.deepEqual(over.strokes[4].path,[4,0,0,0],'repeat after a crossing paints on top');
  const playback=record();for(let i=0;i<3;i++)drawThreads(playback,crossed,[shade],i,i+1,style,view);assert.deepEqual(playback.strokes,over.strokes);
  const edge=record();drawThreads(edge,bean,[shade],0,3,threadStyle(40),[-1,.26,5,1]);assert.ok(edge.strokes.length,'culling includes the widened thread');
});

test('Lustre: perpendicular to 225 degrees is bright, aligned is dim, independent of sewing direction',()=>{
  assert.ok(lustre(0,0,-1,-1)<1e-9);assert.ok(Math.abs(lustre(0,0,-1,1)-1)<1e-9);
  assert.equal(lustre(0,0,4,0),lustre(0,0,0,4));assert.equal(lustre(0,0,4,0),.5);
  assert.ok(lustre(0,0,1,-1)>lustre(0,0,1,1),'135 and 45 degree fills differ');
  for(const [x,y] of [[1,1],[1,-1],[3,4],[-4,2],[0,0]]){const l=lustre(2,3,2+x,3+y);assert.equal(l,lustre(2+x,3+y,2,3));assert.ok(l>=0&&l<=1);}
  assert.equal(lustre(1,1,1,1),0);
});

test('Lustre shades: cached six or three tones, scaled bodies and sheen, unchanged needle holes',()=>{
  for(const colour of ['#c4453a','#000000','#ffffff'])for(const n of [3,6]){
    const variants=lustreShades(colour,n),base=threadShades(colour);assert.equal(variants.length,n);assert.equal(lustreShades(colour,n),variants);
    variants.forEach((s,i)=>{
      const l=i/(n-1),scale=.94+.10*l,body=rgb(colour).map(v=>v*scale);assert.equal(s.end,base.end);assert.equal(s.edge,base.edge);
      for(const key of ['body','mid','sheen'])assert.match(s[key],/^#[0-9a-f]{6}$/);
      for(const key of ['body','mid'])rgb(s[key]).forEach((v,j)=>assert.ok(Math.abs(v-Math.min(255,rgb(base[key])[j]*scale))<=.5));
      rgb(s.sheen).forEach((v,j)=>assert.ok(Math.abs(v-Math.min(255,body[j]+(rgb(base.sheen)[j]-body[j])*(.55+.45*l)))<=.5));
    });
    assert.ok(luminance(variants.at(-1).sheen)>luminance(variants[0].sheen)||colour==='#ffffff');
  }
  assert.ok(luminance(lustreShades('#c4453a')[0].body)<luminance(lustreShades('#c4453a').at(-1).body));
});

test('Combined buckets: each unique segment paints once, using at most three widths and six directions',()=>{
  const commands=[];for(let passes=1;passes<=3;passes++)for(let i=0;i<6;i++){
    const angle=Math.PI/4+Math.asin(Math.sqrt(i/5)),x=commands.length*10,k=st(x,0,x+4*Math.cos(angle),4*Math.sin(angle));
    for(let p=0;p<passes;p++)commands.push(p%2?st(k.x,k.y,k.fromX,k.fromY):{...k});
  }
  const shade=threadShades('#c4453a'),view=[-10,-10,400,10];
  for(const px of [1,5,40]){
    const c=record(),style=threadStyle(px),levels=style.detail?6:3,passes=style.detail===0?2:style.detail===1?5:6;
    drawThreads(c,commands,[shade],0,commands.length,style,view);assert.equal(c.strokes.length,3*levels*passes);
    const ends=c.strokes.filter(s=>s.colour===shade.end);assert.equal(ends.length,3*levels);assert.equal(ends.reduce((n,s)=>n+s.path.length/4,0),18,'repeated geometry is collapsed, every unique segment remains');
    const tones=new Set(c.strokes.filter(s=>s.width===style.width*(style.detail?.74:1)&&s.colour!==shade.end&&s.colour!==shade.edge).map(s=>s.colour));assert.equal(tones.size,levels,'directions get distinct body tones');
  }
  const aligned=record(),perpendicular=record(),style=threadStyle(5);drawThreads(aligned,[st(0,0,3,3)],[shade],0,1,style,view);drawThreads(perpendicular,[st(0,0,-3,3)],[shade],0,1,style,view);
  assert.equal(aligned.strokes[0].colour,perpendicular.strokes[0].colour);assert.notEqual(aligned.strokes[3].colour,perpendicular.strokes[3].colour);assert.notEqual(aligned.strokes[4].colour,perpendicular.strokes[4].colour);
});

test('Fabric looks: every profile, light enough for thread, knit/terry/fleece distinct',()=>{
  assert.deepEqual(Object.keys(fabricLooks).sort(),Object.keys(fabrics).sort());
  for(const [k,f] of Object.entries(fabricLooks)){
    assert.match(f.base,/^#[0-9a-f]{6}$/);assert.ok(luminance(f.base)>.5,k);assert.ok(luminance(f.yarn)<luminance(f.base),k);
    assert.ok(f.period>=.3&&f.period<=4,k);
  }
  const p=['jersey','terry','fleece'].map(k=>fabricLooks[k].pattern);assert.equal(new Set(p).size,3);
  assert.equal(fabricLooks.jersey.pattern,'knit');assert.equal(fabricLooks.terry.pattern,'terry');assert.equal(fabricLooks.fleece.pattern,'fleece');
  assert.notEqual(fabricLooks.jersey.base,fabricLooks.fleece.base);
});

test('Stitch batches: crossing stitches start a new batch so later thread lies on top',()=>{
  const {crosses,stitchBatch}=load('thread');
  assert.ok(crosses(0,0,2,2,0,2,2,0));assert.ok(!crosses(0,0,2,0,2,0,2,2),'shared needle hole');
  assert.ok(!crosses(0,0,2,0,0,.4,2,.4),'parallel satin bites');assert.ok(!crosses(0,0,1,0,2,-1,2,1),'apart');
  const b=stitchBatch();
  // Centre walk along y=1, then satin bites across it.
  assert.ok(b.add(0,1,3,1));assert.ok(b.add(3,1,6,1));
  assert.equal(b.add(.5,0,.5,2),false,'a bite over the walk must wait for a new batch');
  b.clear();assert.ok(b.add(.5,0,.5,2));assert.ok(b.add(.5,2,.9,0),'zigzag bites share a hole');assert.ok(b.add(.9,0,1.3,2));
  assert.equal(b.segs.length,12);
  const full=stitchBatch(2);assert.ok(full.add(0,0,1,0)&&full.add(1,0,2,0));assert.equal(full.add(2,0,3,0),false,'size limit');
});

test('Batch breaks: cached per design, new batch on colour change and on crossing',()=>{
  const {batchBreaks}=load('thread');
  const st=(fromX,fromY,x,y,block=0,type='stitch')=>({type,fromX,fromY,x,y,block});
  const cmds=[st(0,1,3,1),st(3,1,6,1),st(6,1,.5,0,0,'jump'),st(.5,0,.5,2),st(.5,2,.9,0),st(.9,0,.9,2,1)];
  const b=batchBreaks(cmds);assert.deepEqual([...b],[1,0,0,1,0,1]);assert.equal(batchBreaks(cmds),b);
});
