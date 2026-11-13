// Optional real-GPU regression suite. Uses the installed agent-browser CLI;
// serves only the two renderer modules and synthetic stitches, with no account/data access.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import ts from 'typescript';
const run=promisify(execFile),root=new URL('../',import.meta.url),session=`threadroom-thread-audit-${process.pid}`;
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{font:14px system-ui;background:#e8e5df;color:#25201d;padding:20px}canvas{max-width:100%;height:auto}pre{white-space:pre-wrap}</style><h1>Thread renderer GPU audit</h1><pre id="result">Running…</pre><script type="module" src="/audit.mjs"></script>`;
const server=createServer(async(req,res)=>{
  try{
    if(req.url==='/'){res.setHeader('content-type','text/html');res.end(html);return;}
    const files={'/audit.mjs':'tests/thread-renderer.browser.mjs','/lib/thread-renderer.js':'lib/thread-renderer.ts','/lib/thread.js':'lib/thread.ts'};
    const file=files[req.url];if(!file){res.writeHead(404).end();return;}
    let source=await readFile(new URL(file,root),'utf8');
    if(file.endsWith('.ts'))source=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2020,target:ts.ScriptTarget.ES2020}}).outputText.replace("from './thread'","from './thread.js'");
    res.setHeader('content-type','text/javascript');res.end(source);
  }catch(error){res.writeHead(500).end(String(error));}
});
const browser=(...args)=>run('agent-browser',['--session',session,...args],{maxBuffer:2_000_000});
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  await browser('open',url);
  try{await browser('wait','--fn','window.threadAuditResult !== undefined');}
  catch(error){console.error((await browser('errors')).stdout);console.error((await browser('eval','JSON.stringify({progress:window.threadAuditProgress,text:document.body.innerText})')).stdout);throw error;}
  const {stdout}=await browser('eval','--json','window.threadAuditResult');
  const result=JSON.parse(stdout),audit=result.data?.result??result;console.log(JSON.stringify(audit,null,2));
  await mkdir(new URL('tests/browser-harness/',root),{recursive:true});
  const screenshot=path.resolve(new URL('tests/browser-harness/thread-renderer.png',root).pathname);
  await browser('screenshot',screenshot,'--full');console.log(`Visual comparison: ${screenshot}`);
  if(!audit.passed)process.exitCode=1;
}finally{
  await browser('close').catch(()=>{});server.close();
}
