// Execute the actual webpack browser-worker output in a Node worker with an importScripts
// adapter. This verifies chunk URLs, lazy dependencies and structured-clone/transfer behavior,
// without a browser. Browser paint, focus and keyboard behavior still require manual checks.
import {Worker} from 'node:worker_threads';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {load} from '../tests/load-lib.mjs';
const dir=resolve(process.argv[2]||'.next'),chunks=join(dir,'static/chunks');
const entry=readdirSync(chunks).filter(f=>f.endsWith('.js')).find(f=>{const s=readFileSync(join(chunks,f),'utf8');return s.includes('onmessage=async')&&s.includes('importScripts(');});
assert.ok(entry,'webpack must emit a browser worker with its own chunk loader');
const worker=new Worker(`
  const {parentPort,workerData}=require('node:worker_threads'),{readFileSync}=require('node:fs'),{join}=require('node:path'),vm=require('node:vm');
  globalThis.self=globalThis;
  globalThis.postMessage=(value,transfer)=>parentPort.postMessage(value,transfer);
  globalThis.importScripts=(...urls)=>{for(const url of urls){if(!url.startsWith('/_next/static/chunks/'))throw Error(url);vm.runInThisContext(readFileSync(join(workerData.dir,url.slice('/_next/'.length)),'utf8'),{filename:url});}};
  vm.runInThisContext(readFileSync(workerData.entry,'utf8'),{filename:workerData.entry});
  parentPort.on('message',data=>globalThis.onmessage({data}));
`,{eval:true,workerData:{dir,entry:join(chunks,entry)}});
const run=job=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{worker.terminate();reject(Error('Worker timeout'));},15000);
  const error=e=>{clearTimeout(timer);reject(e);};worker.once('error',error);
  worker.once('message',reply=>{clearTimeout(timer);worker.off('error',error);reply.error?reject(Object.assign(Error(reply.error.message),reply.error)):resolve(reply.value);});worker.postMessage(job);
});
const {runEditorJob}=load('editor-jobs'),{demo}=load('project');
const pixels={width:8,height:8,data:new Uint8ClampedArray(Array.from({length:64},(_,i)=>i%8<4?[255,0,0,255]:[0,0,255,255]).flat())};
const image={id:'art',src:'',name:'art',x:20,y:20,width:40,height:40,opacity:1};
const sources={sources:[{d:'M0 0C10 0 10 10 0 10Z',m:[1,0,0,1,0,0],style:{fill:'#123456',stroke:'none','stroke-width':'1','fill-rule':'nonzero',color:'#000000'},name:'shape'}],viewBox:[0,0,20,20],width:20,height:20,aspect:'xMidYMid meet'};
const commands=Array.from({length:5000},(_,i)=>({type:i%10?'stitch':'jump',x:i%100,y:Math.floor(i/100),fromX:i%100-1,fromY:Math.floor(i/100),block:0}));
const normalise=v=>JSON.parse(JSON.stringify(v,(key,value)=>key==='id'||key==='group'?'id':value));
try{
  for(const job of [
    {kind:'trace',pixels,art:image,colours:2,ignoreBackground:false,lang:'tr'},
    {kind:'downsample',pixels},
    {kind:'click',pixels,image,point:[25,25],tolerance:12},
    {kind:'pixel',pixels,columns:8,rows:8,colours:2,brother:true},
    {kind:'density',commands,radius:1.5},
    {kind:'svg',sources,filename:'art.svg',project:{...demo(),objects:[]},lang:'tr'},
  ]){assert.deepEqual(normalise(await run(job)),normalise(await runEditorJob(job)),job.kind);console.log(`${job.kind}: production worker matches pure function`);}
  await assert.rejects(run({kind:'svg',sources:{...sources,sources:[]},filename:'empty.svg',project:{...demo(),objects:[]},lang:'tr'}),e=>e.key==='This SVG has no supported visible shapes.');
}finally{await worker.terminate();}
