import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {runInNewContext} from 'node:vm';

function launcher() {
  const calls=[], lines=new EventEmitter(), process=new EventEmitter();
  process.env={};process.execPath='/node';
  const source=readFileSync(new URL('../scripts/dev.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  runInNewContext(source,{
    process,existsSync:()=>true,createInterface:()=>lines,
    console:{log(){},error(){}},setTimeout:()=>1,clearTimeout(){},
    spawn(command,args,options){
      const child=new EventEmitter();child.stdout={};child.killed=false;
      child.kill=()=>{child.killed=true;};calls.push({command,args,options,child});return child;
    }
  });
  return {calls,lines,process};
}

test('Next waits for Python and proxies its actual bound port',()=>{
  const app=launcher();
  assert.equal(app.calls.length,1);
  app.lines.emit('line','Starting Python…');
  assert.equal(app.calls.length,1);
  app.lines.emit('line',JSON.stringify({threadroomReady:true,port:49321}));
  assert.equal(app.calls.length,2);
  assert.equal(app.calls[1].options.env.THREADROOM_LOCAL_API,'http://127.0.0.1:49321');
  assert.equal(app.calls[1].options.env.THREADROOM_API_PORT,'49321');
  app.lines.emit('line',JSON.stringify({threadroomReady:true,port:12345}));
  assert.equal(app.calls.length,2);
});

test('Python failure prevents a disconnected web server',()=>{
  const app=launcher();app.calls[0].child.emit('exit',1);
  assert.equal(app.process.exitCode,1);
  assert.equal(app.calls.length,1);
  app.lines.emit('line',JSON.stringify({threadroomReady:true,port:49321}));
  assert.equal(app.calls.length,1);
});

test('Python failure shuts down an already running web server',()=>{
  const app=launcher();app.lines.emit('line',JSON.stringify({threadroomReady:true,port:49321}));
  app.calls[0].child.emit('exit',1);
  assert.equal(app.process.exitCode,1);
  assert.equal(app.calls[1].child.killed,true);
});
