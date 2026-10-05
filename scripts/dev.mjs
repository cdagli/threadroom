import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
const python = process.env.THREADROOM_PYTHON || (existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3');
const api = spawn(python, ['-u', '-m', 'scripts.dev_api'], {stdio: ['ignore', 'pipe', 'inherit']});
let web;
let stopping = false;
const stop = () => {if(stopping)return;stopping=true;clearTimeout(timeout);api.kill();web?.kill();};
const fail = message => {console.error(message);process.exitCode=1;stop();};
const timeout=setTimeout(()=>fail('Python did not start within 15 seconds. Check the traceback above.'),15000);
process.on('SIGINT', stop); process.on('SIGTERM', stop);
api.on('error', error=>fail(`Could not start Python: ${error.message}. Install requirements.txt in .venv first.`));
api.on('exit', code=>{if(!stopping)fail(`Python exited (${code ?? 'signal'}). The web server was stopped; see the error above.`);});
const lines=createInterface({input:api.stdout});
lines.on('line', line=>{
  let info;try{info=JSON.parse(line);}catch{console.log(line);return;}
  if(!info.threadroomReady||web||stopping)return;
  if(!Number.isInteger(info.port)||info.port<1||info.port>65535){fail('Python reported an invalid port.');return;}
  clearTimeout(timeout);
  const url=`http://127.0.0.1:${info.port}`;
  console.log(`Python embroidery API ready: ${url}`);
  web=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack'],{
    stdio:'inherit',env:{...process.env,THREADROOM_LOCAL_API:url,THREADROOM_API_PORT:String(info.port)}
  });
  web.on('error',error=>fail(`Could not start Next.js: ${error.message}`));
  web.on('exit',code=>{if(!stopping){process.exitCode=code||0;stop();}});
});
