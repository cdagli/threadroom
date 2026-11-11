import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {editorTask,taskCancelled}=load('editor-task'),{TranslationError,createT}=load('i18n');
class FakeWorker{
  terminated=false;
  postMessage(job){this.job=job;}
  terminate(){this.terminated=true;}
  reply(value){this.onmessage({data:{value}});}
}
test('superseding a job terminates CPU work; late replies never resolve a newer request',async()=>{
  const workers=[],task=editorTask(()=>{const w=new FakeWorker();workers.push(w);return w;});
  const first=task.run({kind:'density',commands:[],radius:1}),cancelled=assert.rejects(first,taskCancelled);
  const second=task.run({kind:'density',commands:[],radius:3});
  assert.equal(workers[0].terminated,true);workers[0].reply('obsolete');workers[1].reply('current');
  await cancelled;assert.equal(await second,'current');
  const third=task.run({kind:'density',commands:[],radius:2});
  assert.equal(workers.length,2,'an idle worker and its imported functions are reused');workers[1].reply('reused');assert.equal(await third,'reused');
  task.cancel();assert.equal(workers[1].terminated,true);
});
test('unmount cancellation, failures and translated worker errors remain recoverable',async()=>{
  const workers=[],task=editorTask(()=>{const w=new FakeWorker();workers.push(w);return w;});
  let p=task.run({kind:'density',commands:[],radius:1});let rejected=assert.rejects(p,taskCancelled);task.cancel();await rejected;
  p=task.run({kind:'density',commands:[],radius:1});rejected=assert.rejects(p,/Worker failed/);workers.at(-1).onerror();await rejected;assert.equal(workers.at(-1).terminated,true);
  p=task.run({kind:'density',commands:[],radius:1});rejected=assert.rejects(p,e=>e instanceof TranslationError&&e.key==='Choose a file smaller than 8 MB.'&&e.message===createT('en')(e.key));
  workers.at(-1).onmessage({data:{error:{message:'ignored',key:'Choose a file smaller than 8 MB.'}}});await rejected;
  task.cancel();
});
test('worker wrappers preserve the pure pixel, flood, trace, density and SVG functions',async()=>{
  const {runEditorJob}=load('editor-jobs'),{demo}=load('project'),p={...demo(),objects:[]};
  const pixels={width:8,height:8,data:new Uint8ClampedArray(Array.from({length:64},(_,i)=>i%8<4?[255,0,0,255]:[0,0,255,255]).flat())};
  const image={id:'art',src:'',name:'art',x:20,y:20,width:40,height:40,opacity:1,rotation:17};
  const commands=[{type:'stitch',x:2,y:3,fromX:1,fromY:2,block:0},{type:'jump',x:7,y:8,fromX:2,fromY:3,block:0}];
  const sources={sources:[{d:'M0 0Q10 0 10 10L0 10Z',m:[1,0,0,1,0,0],style:{fill:'#123456',stroke:'none','stroke-width':'1','fill-rule':'nonzero',color:'#000000'},name:'shape'}],viewBox:[0,0,20,20],width:20,height:20,aspect:'xMidYMid meet'};
  // Object IDs are intentionally random; geometry and settings must be identical.
  const normalise=v=>JSON.parse(JSON.stringify(v,(key,value)=>key==='id'||key==='group'?'id':value));
  const cases=[
    [{kind:'downsample',pixels},()=>load('click-to-stitch').downsample(pixels)],
    [{kind:'click',pixels,image,point:[25,25],tolerance:12},()=>load('click-to-stitch').clickToStitch(pixels,image,[25,25],12)],
    [{kind:'trace',pixels,art:image,colours:2,ignoreBackground:false,lang:'tr'},()=>load('trace').tracePixels(pixels,image,2,false,createT('tr'))],
    [{kind:'density',commands,radius:1.5},()=>load('density').needleDensity(commands,1.5)],
    [{kind:'svg',sources,filename:'art.svg',project:p,lang:'tr'},()=>load('svg-import').importSVGSources(sources,'art.svg',p,createT('tr'))],
  ];
  for(const [job,direct] of cases)assert.deepEqual(normalise(await runEditorJob(job)),normalise(direct()),job.kind);
});
