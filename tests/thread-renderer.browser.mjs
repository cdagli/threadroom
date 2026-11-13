import {drawRealisticThreads} from '/lib/thread-renderer.js';
import {drawThreads,threadShades,threadStyle} from '/lib/thread.js';

// Executed in an actual browser by npm run test:thread-renderer. Pixel assertions
// cover ordering, incremental compositing, transparent edges and tiled rendering.
const results=[],colours=['#e4bc80','#65375f','#a35491','#111a28','#faf8ee'];
window.threadAuditProgress=results;
const assert=(ok,message,details={})=>{results.push({test:message,passed:!!ok,...details});if(!ok)throw Error(message);};
const stitch=(a,b,block=0)=>({type:'stitch',fromX:a[0],fromY:a[1],x:b[0],y:b[1],block});
const canvas=(width=800,height=600)=>{const el=document.createElement('canvas');el.width=width;el.height=height;return el.getContext('2d',{willReadFrequently:true});};
const pixels=c=>c.getImageData(0,0,c.canvas.width,c.canvas.height).data;
const draw=(c,commands,from=0,to=commands.length,scale=10,x=0,y=0)=>{c.setTransform(scale,0,0,scale,x,y);return drawRealisticThreads(c,commands,colours,from,to,scale,[-100,-100,1000,1000]);};
const compare=(a,b)=>{
  let max=0,total=0,n=0;
  for(let i=0;i<a.length;i+=4){
    // RGB is undefined at zero alpha; compare premultiplied values, as compositing does.
    for(let k=0;k<4;k++){const delta=Math.abs(k===3?a[i+k]-b[i+k]:(a[i+k]*a[i+3]-b[i+k]*b[i+3])/255);max=Math.max(max,delta);total+=delta;n++;}
  }
  return {max,mean:total/n};
};
let context;
const original=HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext=function(type,...args){const result=original.call(this,type,...args);if(type==='webgl2')context=result;return result;};
try{
  const commands=[];
  for(let y=6;y<48;y+=.38)for(let x=6;x<68;x+=4){const stagger=(Math.round(y/.38)%4);commands.push(stitch([x+stagger,y],[Math.min(x+stagger+4,72),y],1));}
  for(let t=0;t<2*Math.PI;t+=.009)commands.push(stitch([39+28*Math.cos(t),27+17*Math.sin(t)],[39+33*Math.cos(t),27+22*Math.sin(t)]));
  for(let y=12;y<43;y+=.35)commands.push(stitch([29,y],[35,y],2));
  for(let t=0;t<1;t+=.01){commands.push(stitch([35+13*t,27-15*t],[41+13*t,27-15*t],2));commands.push(stitch([35+13*t,27+15*t],[41+13*t,27+15*t],2));}
  for(let row=0;row<5;row++)for(let x=6;x<72;x+=3)commands.push(stitch([x,52+row*1.5],[x+3,52+row*1.5],row));
  const full=canvas(1000,800),incremental=canvas(1000,800);
  assert(draw(full,commands)==='webgl2','WebGL2 shader compiles and renders');
  // Match ThreadView: each GPU playback frame resolves the sewn prefix before
  // minification. Independently minifying batches cannot preserve edge coverage.
  for(let start=0;start<commands.length;start+=137){incremental.setTransform(1,0,0,1,0,0);incremental.clearRect(0,0,1000,800);draw(incremental,commands,0,Math.min(start+137,commands.length));}
  const playback=compare(pixels(full),pixels(incremental));
  assert(playback.max<5&&playback.mean<.1,'Sewn-prefix playback matches a full render',playback);
  assert(pixels(full)[3]===0,'Empty background stays transparent');
  assert(pixels(full).some((value,i)=>i%4===3&&value>0&&value<255),'Thread edges retain partial alpha');

  const cross=[stitch([2,5],[8,5],0),stitch([5,2],[5,8],2)],a=canvas(100,100),b=canvas(100,100);
  draw(a,cross);draw(b,[...cross].reverse());
  const topA=a.getImageData(50,50,1,1).data,topB=b.getImageData(50,50,1,1).data;
  assert(topA[2]>topB[2]&&topB[0]>topA[0],'Later stitch covers earlier stitch at a crossing',{topA:[...topA],topB:[...topB]});
  const jump=canvas(100,100);draw(jump,[{...cross[0],type:'jump'}]);
  assert(pixels(jump).every(v=>v===0),'Jump commands never paint a thread');

  const seam=[stitch([90,4],[110,7]),stitch([102,1],[103,9],2)],large=canvas(2200,180),crop=canvas(200,180);
  draw(large,seam,0,seam.length,20);draw(crop,seam,0,seam.length,20,-2000);
  const tile=compare(large.getImageData(2000,0,200,180).data,pixels(crop));
  assert(tile.max<5&&tile.mean<.1,'Tiled export has no filter seam',tile);
  const fineSeam=[stitch([120,4],[140,7]),stitch([128,1],[129,9],2)],fineLarge=canvas(1400,180),fineCrop=canvas(200,180);
  draw(fineLarge,fineSeam,0,fineSeam.length,10);draw(fineCrop,fineSeam,0,fineSeam.length,10,-1200);
  const fineTile=compare(fineLarge.getImageData(1200,0,200,180).data,pixels(fineCrop));
  assert(fineTile.max<5&&fineTile.mean<.1,'Minified tiles preserve the design-space grid through their gutters',fineTile);
  const panned=canvas(1000,800);draw(panned,commands,0,commands.length,10,16,12);
  const pan=compare(full.getImageData(0,0,970,770).data,panned.getImageData(16,12,970,770).data);
  assert(pan.max<5&&pan.mean<.1,'Integer pan preserves thread texture and shading',pan);

  // Standard density: one thread every 0.2 mm.
  const satin=Array.from({length:335},(_,i)=>stitch([i*.2,0],[i*.2,20]));
  const zoomSamples=[];
  for(const scale of [2,2.1,2.2,2.5,3,3.5,4,5,6,8,10,12,16,20])for(const offset of [0,.25,.5,.75]){
    const c=canvas(Math.ceil(67*scale+2),Math.ceil(20*scale+2));
    c.fillStyle='#f6f1e6';c.fillRect(0,0,c.canvas.width,c.canvas.height);draw(c,satin,0,satin.length,scale,offset,offset);
    const p=c.getImageData(Math.ceil(4*scale),Math.ceil(7*scale),Math.floor(55*scale),Math.floor(6*scale)).data;
    const mean=[0,0,0];for(let i=0;i<p.length;i+=4)for(let k=0;k<3;k++)mean[k]+=p[i+k]/(p.length/4);
    zoomSamples.push({scale,offset,mean});
  }
  window.threadZoomSamples=zoomSamples;
  const zoomSpan=[0,1,2].map(k=>Math.max(...zoomSamples.map(s=>s.mean[k]))-Math.min(...zoomSamples.map(s=>s.mean[k])));
  assert(Math.max(...zoomSpan)<5,'Zoom and fractional pan preserve average satin shading',{zoomSpan});

  const coverage=[];
  for(const spacing of [.21,.6]){
    const rows=[];for(let y=0;y<20;y+=spacing)rows.push(stitch([0,y],[40,y]));
    const c=canvas(400,200);draw(c,rows);
    const p=c.getImageData(40,30,320,140).data;
    let alpha=0;for(let i=3;i<p.length;i+=4)alpha+=p[i]/255;
    coverage.push(alpha/(p.length/4));
  }
  assert(coverage[0]>.96&&coverage[1]<.65,'Thread covers rows at standard density while preserving genuinely open spacing',{denseCoverage:coverage[0],openCoverage:coverage[1]});

  // A fill sewn in sections runs its rows downwards in one and upwards in another.
  const order=[false,true].map(up=>{
    const rows=Array.from({length:60},(_,i)=>i*.21).map((y,i)=>stitch(i%2?[30,y]:[2,y],i%2?[2,y]:[30,y],3));if(up)rows.reverse();
    const c=canvas(320,130);c.fillStyle='#f6f1e6';c.fillRect(0,0,320,130);draw(c,rows);
    const p=c.getImageData(60,30,200,70).data;let sum=0;for(let i=0;i<p.length;i+=4)sum+=p[i]+p[i+1]+p[i+2];return sum/(p.length/4)/3;
  });
  assert(Math.abs(order[0]-order[1])<2.5,'Fill tone does not depend on the order its rows were sewn',{order});

  // The canvas keeps its matrix in single precision: at these scales it differs from the
  // requested value, which must not send frames to the Canvas fallback (zoom flicker).
  const backends=[33.71,36.07,44.19,47.28,93,113.93,170.98].map(scale=>draw(canvas(600,400),cross,0,cross.length,scale,-3.3*scale,-2.7*scale));
  assert(backends.every(b=>b==='webgl2'),'Every zoom level stays on the GPU renderer',{backends});

  const dense=Array.from({length:100000},(_,i)=>stitch([(i%300)*.33,Math.floor(i/300)*.3],[(i%300)*.33+2,Math.floor(i/300)*.3],i%5));
  const stress=canvas(1000,1000);draw(stress,dense);
  const start=performance.now();assert(draw(stress,dense)==='webgl2','100,000 stitches render using instancing');
  pixels(stress); // Synchronize GPU completion; submission time alone is misleading.
  const redrawMs=performance.now()-start;
  const subpixel=canvas(100,100);assert(draw(subpixel,dense,0,dense.length,1)==='webgl2'&&pixels(subpixel).some(v=>v),'Subpixel stitches remain visible');

  const extension=context.getExtension('WEBGL_lose_context');
  if(extension){
    const lost=new Promise(resolve=>context.canvas.addEventListener('webglcontextlost',resolve,{once:true}));extension.loseContext();await lost;
    const fallback=canvas(100,100);assert(draw(fallback,cross)==='canvas2d'&&pixels(fallback).some(v=>v),'Context loss falls back to Canvas without a blank preview');
    const restored=new Promise((resolve,reject)=>{context.canvas.addEventListener('webglcontextrestored',resolve,{once:true});setTimeout(()=>reject(Error('GPU context did not restore')),5000);});
    await new Promise(resolve=>setTimeout(resolve,100));extension.restoreContext();await restored;
    assert(draw(canvas(100,100),cross)==='webgl2','Restored context rebuilds GPU resources');
  }
  HTMLCanvasElement.prototype.getContext=original;
  // The two renderings use identical stitch coordinates, scale and backing resolution.
  for(const [name,gpu] of [['Canvas baseline',false],['GPU realistic',true]]){
    const title=document.createElement('h2');title.textContent=name;document.body.append(title);
    const c=canvas(1200,900);c.fillStyle='#f6f1e6';c.fillRect(0,0,1200,900);c.setTransform(15,0,0,15,0,0);
    if(gpu)draw(c,commands,0,commands.length,15);else drawThreads(c,commands,colours.map(threadShades),0,commands.length,threadStyle(15),[0,0,80,60]);
    document.body.append(c.canvas);
  }
  window.threadAuditResult={passed:true,results,stitches:commands.length,redraw100kMs:Math.round(redrawMs*10)/10};
}catch(error){window.threadAuditResult={passed:false,results,error:String(error)};}
finally{HTMLCanvasElement.prototype.getContext=original;}
document.getElementById('result').textContent=JSON.stringify(window.threadAuditResult,null,2);
