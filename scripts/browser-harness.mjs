// Isolated browser transport harness for environments that prohibit binding a
// localhost server. Copies the real production build, changes resource URLs
// for file://, and injects a fixture produced by the actual Python compiler.
// Never shipped in .next-build/ or used by the deployable application.
import {cpSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
// The compile payload the editor sends for the bear sample (fabric and locks resolved).
const project=JSON.parse(spawnSync(process.execPath,['tests/editor.mjs','demo'],{input:'null',encoding:'utf8'}).stdout);
writeFileSync('tests/generated-project.json',JSON.stringify(project));
const result=spawnSync('.venv/bin/python',['-c', 'import json;from embroidery.compiler import compile_project;p=json.load(open("tests/generated-project.json"));r=compile_project(p);open("tests/generated-demo.json","w").write(json.dumps(r));print(r["stats"])'],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
const target=path.resolve('tests/browser-harness');cpSync('.next-build',target,{recursive:true});
function rewrite(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
  const name=path.join(dir,entry.name);if(entry.isDirectory())rewrite(name);
  else if(/\.html$/.test(name)){const text=readFileSync(name,'utf8').replaceAll('src="/_next/',`src="file://${target}/_next/`).replaceAll('href="/_next/',`href="file://${target}/_next/`);writeFileSync(name,text);}
  else if(/webpack.*\.js$/.test(name)){const text=readFileSync(name,'utf8').replaceAll('.p="/_next/"',`.p="file://${target}/_next/"`);writeFileSync(name,text);}
}}
rewrite(target);
const fixture=readFileSync('tests/generated-demo.json','utf8');
const injection=`<script>window.__realFetch=window.fetch.bind(window);window.__harnessErrors=[];window.addEventListener('error',e=>window.__harnessErrors.push({message:e.message,stack:e.error?.stack,src:e.target?.src}));window.addEventListener('unhandledrejection',e=>window.__harnessErrors.push({message:String(e.reason),stack:e.reason?.stack,src:e.reason?.target?.src}));window.__transportRequests=[];window.__fixture=${fixture};window.fetch=async function(url,options){if(String(url).includes('/api/export')){if(options&&options.method==='POST'){window.__transportRequests.push(JSON.parse(options.body));return new Response(JSON.stringify(window.__fixture),{status:200,headers:{'Content-Type':'application/json'}});}return new Response(JSON.stringify({ok:true,python:true}),{status:200});}throw new Error('Unexpected test-harness fetch: '+url);};</script>`;
const html=path.join(target,'index.html');writeFileSync(html,readFileSync(html,'utf8').replace('<head>','<head>'+injection));
console.log(`file://${target}/index.html`);
