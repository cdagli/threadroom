import { spawn } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import { createInterface } from 'node:readline';
const python = process.env.THREADROOM_PYTHON || (existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3');
let api, web, port, timeout, reloadTimer;
let stopping = false, restarting = false;
const watchers=[];
const stop = () => {if(stopping)return;stopping=true;clearTimeout(timeout);clearTimeout(reloadTimer);for(const watcher of watchers)watcher.close();api?.kill();web?.kill();};
const fail = message => {console.error(message);process.exitCode=1;stop();};
process.on('SIGINT', stop); process.on('SIGTERM', stop);
function startAPI(){
  restarting=false;
  api=spawn(python, ['-u', '-m', 'scripts.dev_api'], {stdio: ['ignore', 'pipe', 'inherit'],env:{...process.env,...(port?{THREADROOM_API_PORT:String(port)}:{})}});
  timeout=setTimeout(()=>fail('Python did not start within 15 seconds. Check the traceback above.'),15000);
  api.on('error', error=>fail(`Could not start Python: ${error.message}. Install requirements.txt in .venv first.`));
  api.on('exit', code=>{
    clearTimeout(timeout);
    if(stopping)return;
    if(restarting){startAPI();return;}
    fail(`Python exited (${code ?? 'signal'}). The web server was stopped; see the error above.`);
  });
  const lines=createInterface({input:api.stdout});
  lines.on('line', line=>{
    let info;try{info=JSON.parse(line);}catch{console.log(line);return;}
    if(!info.threadroomReady||stopping)return;
    if(!Number.isInteger(info.port)||info.port<1||info.port>65535){fail('Python reported an invalid port.');return;}
    if(port&&info.port!==port){fail('Python restarted on a different port.');return;}
    port=info.port;
    clearTimeout(timeout);
    const url=`http://127.0.0.1:${info.port}`;
    console.log(`Python embroidery API ready: ${url}`);
    if(web)return;
    web=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack'],{
      stdio:'inherit',env:{...process.env,THREADROOM_LOCAL_API:url,THREADROOM_API_PORT:String(info.port)}
    });
    web.on('error',error=>fail(`Could not start Next.js: ${error.message}`));
    web.on('exit',code=>{if(!stopping){process.exitCode=code||0;stop();}});
  });
}
startAPI();
// Next reloads the editor, but Python keeps imported code and pattern tables in
// memory. Restart on backend edits, keeping the proxy port and clearing plan caches.
for(const directory of ['api','embroidery','scripts']){
  const watcher=watch(directory,{recursive:true},(_event,filename)=>{
    if(filename&&!/\.(py|json)$/.test(String(filename)))return;
    clearTimeout(reloadTimer);
    reloadTimer=setTimeout(()=>{
      if(stopping||restarting||!port)return;
      console.log('Embroidery source changed; restarting Python…');
      restarting=true;api.kill();
    },150);
  });
  watcher.on('error',error=>fail(`Could not watch ${directory}: ${error.message}`));
  watchers.push(watcher);
}
