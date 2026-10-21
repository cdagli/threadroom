// DOM-free ReactDOM benchmark. No layout/paint timing: minimal host nodes, real React hooks/memo/Profiler.
// Run: node scripts/editor-benchmark.mjs [--burst] [--compiled]
// --burst: four moves per frame. --compiled: synthetic stitches plus stale/export assertions.
// Timers for storage/design checks/background compilation are suppressed to isolate render CPU.
// Counts are injected into the loaded source; no runtime render-count instrumentation ships.
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const compiledMode=process.argv.includes('--compiled');
process.env.NODE_ENV='development';
class Host {
  constructor(name='#document',doc=null){this.nodeName=name.toUpperCase();this.tagName=this.nodeName;this.nodeType=name==='#document'?9:name==='#text'?3:1;this.ownerDocument=doc;this.namespaceURI='http://www.w3.org/1999/xhtml';this.childNodes=[];this.style={setProperty(){},removeProperty(){}};this.attributes={};}
  appendChild(n){if(n.parentNode)n.parentNode.removeChild(n);this.childNodes.push(n);n.parentNode=this;return n;}
  removeChild(n){this.childNodes.splice(this.childNodes.indexOf(n),1);n.parentNode=null;return n;}
  insertBefore(n,b){if(n.parentNode)n.parentNode.removeChild(n);this.childNodes.splice(this.childNodes.indexOf(b),0,n);n.parentNode=this;return n;}
  setAttribute(k,v){this.attributes[k]=String(v);} removeAttribute(k){delete this.attributes[k];}
  setAttributeNS(_,k,v){this.setAttribute(k,v);} removeAttributeNS(_,k){this.removeAttribute(k);}
  getAttribute(k){return this.attributes[k]??null;} addEventListener(){} removeEventListener(){} focus(){} select(){} click(){}
  setPointerCapture(){} hasPointerCapture(){return false;} releasePointerCapture(){}
  getBoundingClientRect(){return {x:0,y:0,left:0,top:0,right:1000,bottom:1000,width:1000,height:1000};}
  closest(selector){if(selector==='[data-object]'&&this.getAttribute('data-object'))return this;return this.parentNode?.closest(selector)??null;}
  matches(){return false;} querySelector(){return null;}
  get options(){return this.childNodes.flatMap(n=>n.tagName==='OPTION'?[n]:n.options);}
  get firstChild(){return this.childNodes[0]??null;} get lastChild(){return this.childNodes.at(-1)??null;}
  set textContent(v){this.childNodes=[];this.text=String(v);} get textContent(){return this.text??'';}
}
const doc=new Host();doc.createElement=n=>new Host(n,doc);doc.createElementNS=(ns,n)=>Object.assign(new Host(n,doc),{namespaceURI:ns});doc.createTextNode=t=>Object.assign(new Host('#text',doc),{nodeValue:t});doc.documentElement=doc.createElement('html');doc.body=doc.createElement('body');doc.activeElement=doc.body;
const win={document:doc,HTMLElement:Host,HTMLIFrameElement:class {},addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};doc.defaultView=win;
Object.assign(globalThis,{window:win,document:doc,HTMLElement:Host,SVGElement:Host,ResizeObserver:class{constructor(fn){this.fn=fn;} observe(){this.fn();} disconnect(){}}});
let frames=new Map(),frameId=0;globalThis.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
const realSetTimeout=globalThis.setTimeout;globalThis.setTimeout=()=>0;win.setTimeout=globalThis.setTimeout;
let compileCalls=0;
globalThis.fetch=(_url,options)=>{
  if(!options)return Promise.resolve({ok:true,json:async()=>({python:true})});
  compileCalls++;const p=JSON.parse(options.body),commands=p.objects.flatMap((o,block)=>o.rings.flatMap(r=>r.slice(1).map(([x,y],i)=>({type:'stitch',x,y,fromX:r[i][0],fromY:r[i][1],block,objectId:o.id}))));
  return Promise.resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>({pes:'',filename:'benchmark.pes',commands,threads:p.objects.map(o=>({color:o.color,name:o.name})),stats:{stitches:commands.length,jumps:0,jumpLength:0,trims:0,colorChanges:0,width:90,height:90,maxStitch:2,bytes:0,durationMs:0},engine:'Benchmark',pesVersion:'1'})});
};
const React=require('react'),{createRoot}=require('react-dom/client'),{flushSync}=require('react-dom');
const cache=new Map();let counts={studio:0,canvas:0,row:0,preview:0};globalThis.__editorBenchmarkCount=key=>counts[key]++;
function load(file){
  if(!existsSync(new URL('../'+file,import.meta.url)))file=file.replace(/\.tsx$/,'.ts');
  if(!existsSync(new URL('../'+file,import.meta.url)))file=file.replace(/\.ts$/,'.js');
  if(cache.has(file))return cache.get(file).exports;
  let source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  // Baseline instrumentation also works before the inline passes have been extracted.
  if(file==='app/studio.tsx')source=source.replace('export default function Studio() {','export default function Studio() { globalThis.__editorBenchmarkCount("studio");').replace('function StudioEditor() {','function StudioEditor() { globalThis.__editorBenchmarkCount("studio");').replace('.map(o=><g key={o.id} data-object={o.id}>','.map(o=>(globalThis.__editorBenchmarkCount("canvas"),<g key={o.id} data-object={o.id}>').replace('</>}</g>)}','</>}</g>))}');
  if(file==='app/layers-panel.tsx')source=source.replace('const o=row.object!,i=row.index,b=bounds([o])','globalThis.__editorBenchmarkCount("row");globalThis.__editorBenchmarkCount("preview");const o=row.object!,i=row.index,b=bounds([o])');
  // Count extracted components without adding production instrumentation to them.
  for(const [name,key] of [['CanvasObject','canvas'],['LayerObjectRow','row'],['LayerPreview','preview']])source=source.replace(new RegExp(`function ${name}\\(([^]*?)\\)\\s*\\{`),match=>match+`globalThis.__editorBenchmarkCount("${key}");`);
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const module={exports:{}};cache.set(file,module);
  const localRequire=id=>id.startsWith('@/')?load(id.slice(2)+'.ts'):id.startsWith('./')?load(file.slice(0,file.lastIndexOf('/')+1)+id.slice(2)+(file.startsWith('app/')?'.tsx':'.ts')):id==='@astryxdesign/core/Button'?{Button:compiledMode?({label,onClick,isDisabled})=>React.createElement('button',{'aria-label':label,onClick,disabled:isDisabled}):()=>null}:require(id);
  new Function('module','exports','require',code)(module,module.exports,localRequire);return module.exports;
}
const {demo,object}=load('lib/project.ts'),Studio=load('app/studio.tsx').default;
const bear=demo(),large={...bear,name:'64 objects / 10,240 ring points',objects:Array.from({length:64},(_,i)=>object(`Ring ${i}`, [Array.from({length:160},(_,j)=>[7+i%8*12+Math.cos(j/160*Math.PI*2)*3,7+Math.floor(i/8)*12+Math.sin(j/160*Math.PI*2)*3])]))};
function find(n,p){if(p(n))return n;for(const c of n.childNodes){const found=find(c,p);if(found)return found;}}
const props=n=>n[Object.keys(n).find(k=>k.startsWith('__reactProps$'))];
for(const fixture of [bear,large]){
  globalThis.localStorage={getItem:()=>JSON.stringify(fixture),setItem(){}};
  const container=doc.createElement('div'),root=createRoot(container,{onUncaughtError:console.error});let times=[];
  flushSync(()=>root.render(React.createElement(React.Profiler,{id:'Studio',onRender:(_id,phase,ms)=>{if(phase!=='mount')times.push(ms);}},React.createElement(Studio))));
  await new Promise(resolve=>realSetTimeout(resolve,20));flushSync(()=>{});
  if(compiledMode){const button=find(container,n=>n.attributes['aria-label']==='Export PES');flushSync(()=>props(button).onClick());await new Promise(resolve=>realSetTimeout(resolve,20));}
  const canvas=find(container,n=>n.tagName==='SVG'&&n.attributes['aria-label']==='Embroidery canvas'),target=find(canvas,n=>n.attributes['data-object']===fixture.objects[0].id);
  const event=(x,y)=>({pointerId:1,pointerType:'mouse',button:0,clientX:x,clientY:y,currentTarget:canvas,target,ctrlKey:false,metaKey:false,shiftKey:false,preventDefault(){},stopPropagation(){}});
  flushSync(()=>props(canvas).onPointerDown(event(400,400)));
  const originalPath=target.firstChild.getAttribute('d');
  const burst=process.argv.includes('--burst')?4:1;
  const move=i=>{flushSync(()=>props(canvas).onPointerMove(event(400+(i%20)*.8,400+(i%20)*.8)));if(i%burst===0){const pending=frames;frames=new Map();flushSync(()=>{for(const fn of pending.values())fn(performance.now());});}};
  for(let i=1;i<=40;i++)move(i);
  counts={studio:0,canvas:0,row:0,preview:0};times=[];const start=performance.now();
  for(let i=41;i<=240;i++)move(i);
  const elapsed=performance.now()-start;
  const result={fixture:fixture===bear?'bear':'large',compiled:compiledMode,objects:fixture.objects.length,points:fixture.objects.reduce((n,o)=>n+o.rings.flat().length,0),moves:200,burst,rendersPerMove:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,v/200])),reactMsPerMove:times.reduce((a,b)=>a+b,0)/200,hostMsPerMove:elapsed/200};
  assert.equal(counts.studio,200/burst);
  if(cache.has('app/canvas-object.tsx'))for(const key of ['canvas','row','preview'])assert.equal(counts[key],200/burst,`${key}: only the changed object should render`);
  console.log(JSON.stringify(result));
  if(compiledMode){
    const unchanged=find(canvas,n=>n.attributes['data-object']===fixture.objects[1].id);
    assert.equal(props(target.firstChild).opacity,.35);assert.equal(props(unchanged.firstChild).opacity,0,'unchanged objects keep their stitches');
  }
  // Pointer-up must flush a pending frame, then one undo restores the whole drag.
  flushSync(()=>props(canvas).onPointerMove(event(417,417)));
  flushSync(()=>props(canvas).onPointerUp(event(417,417)));
  assert.notEqual(target.firstChild.getAttribute('d'),originalPath);
  const undo=find(container,n=>n.attributes['aria-label']==='Undo');
  flushSync(()=>props(undo).onClick());assert.equal(target.firstChild.getAttribute('d'),originalPath);assert.equal(props(undo).disabled,true);
  flushSync(()=>props(canvas).onPointerDown(event(400,400)));
  flushSync(()=>props(canvas).onPointerMove(event(418,418)));
  flushSync(()=>props(canvas).onPointerCancel(event(418,418)));
  assert.equal(target.firstChild.getAttribute('d'),originalPath);assert.equal(props(undo).disabled,true);
  if(compiledMode){
    // A subsequent export must compile the edited project, never export the retained stale result.
    flushSync(()=>props(canvas).onPointerDown(event(400,400)));
    flushSync(()=>props(canvas).onPointerMove(event(418,418)));
    flushSync(()=>props(canvas).onPointerUp(event(418,418)));
    const calls=compileCalls,button=find(container,n=>n.attributes['aria-label']==='Export PES');
    flushSync(()=>props(button).onClick());await new Promise(resolve=>realSetTimeout(resolve,20));assert.equal(compileCalls,calls+1);
    assert.equal(props(target.firstChild).opacity,0);
  }
  flushSync(()=>props(canvas).onPointerUp(event(400,400)));flushSync(()=>root.unmount());frames.clear();
}
globalThis.setTimeout=realSetTimeout;
