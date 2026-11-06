import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../lib/use-webmcp.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const settle=()=>new Promise(resolve=>setImmediate(resolve));

// Exercise the real hook with deterministic effect setup, cleanup and replay.
// Node's test runner fails on any unhandled registration rejection.
function harness(context){
  const slots=[],effects=[],updates=[];
  let cursor=0;
  const react={
    useState(initial){const i=cursor++;slots[i]??={value:initial};return [slots[i].value,value=>{updates.push(value);slots[i].value=value;}];},
    useRef(value){const i=cursor++;return slots[i]??=( {current:value} );},
    useReducer(reducer,initial){const i=cursor++;slots[i]??={value:initial};return [slots[i].value,()=>{slots[i].value=reducer(slots[i].value);}];},
    useEffect(setup,deps){
      const i=cursor++,previous=slots[i];
      if(!previous||!deps||deps.some((dep,k)=>!Object.is(dep,previous.deps?.[k])))effects.push(()=>{previous?.cleanup?.();slots[i]={setup,deps,cleanup:setup()};});
    },
  };
  const module={exports:{}},document={modelContext:context};
  new Function('module','exports','require','document',code)(module,module.exports,id=>{assert.equal(id,'react');return react;},document);
  const render=options=>{cursor=0;const result=module.exports.useWebMCP(options);while(effects.length)effects.shift()();return result;};
  const cleanup=()=>{for(const slot of slots)slot?.cleanup?.();};
  const replay=()=>{cleanup();for(const slot of slots)if(slot?.setup)slot.cleanup=slot.setup();};
  return {render,replay,cleanup,updates};
}
const options={name:'get_design',description:'Read the design',inputSchema:{type:'object'},execute:()=>({name:'Demo'})};

test('Strict Mode cleanup handles a rejected registration and registers its replacement',async()=>{
  const registrations=[];
  const h=harness({registerTool(tool,{signal}){
    return new Promise((resolve,reject)=>{
      registrations.push({tool,signal,resolve});
      signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
    });
  }});
  h.render(options);h.replay();await settle();
  assert.equal(registrations.length,2);
  assert.equal(registrations[0].signal.aborted,true);
  assert.equal(registrations[1].signal.aborted,false);
  assert.equal(h.updates.length,0,'disposed registration cannot set error state');
  registrations[1].resolve();await settle();
  assert.deepEqual(h.updates,[{supported:true,registered:true,error:null}]);
  const result=await registrations[1].tool.execute({},{});
  assert.deepEqual(result,{content:[{type:'text',text:'{"name":"Demo"}'}]});
  h.cleanup();await settle();
});

test('a registration resolving after cleanup cannot overwrite current state',async()=>{
  let resolve;
  const h=harness({registerTool:()=>new Promise(done=>{resolve=done;})});
  h.render(options);h.cleanup();resolve();await settle();
  assert.deepEqual(h.updates,[]);
});

test('registration failures are captured for synchronous and asynchronous APIs',async()=>{
  for(const asyncAPI of [false,true]){
    const error=new Error('Registration denied');
    const h=harness({registerTool(){if(asyncAPI)return Promise.reject(error);throw error;}});
    h.render(options);await settle();
    assert.deepEqual(h.updates,[{supported:true,registered:false,error}]);h.cleanup();
  }
});

test('rerenders retain registration and execute the latest callback with MCP results',async()=>{
  const registrations=[],errors=[];
  const h=harness({registerTool(tool){registrations.push(tool);return Promise.resolve();}});
  h.render(options);await settle();
  h.render({...options,execute:()=>42});
  assert.equal(registrations.length,1);
  assert.deepEqual(await registrations[0].execute({},{}),{content:[{type:'text',text:'42'}]});
  h.render({...options,execute:()=>{throw new Error('Invalid design');},onError:error=>errors.push(error)});
  assert.deepEqual(await registrations[0].execute({},{}),{content:[{type:'text',text:'Invalid design'}],isError:true});
  assert.equal(errors.length,1);
  const controller=new AbortController();controller.abort();
  await assert.rejects(registrations[0].execute({},{signal:controller.signal}),/Invalid design/);
  assert.equal(errors.length,1,'execution cancellation passes through to the agent');
  h.cleanup();
});

test('unsupported browsers and disabled registration clean up without registering',()=>{
  const unsupported=harness(undefined);
  unsupported.render(options);unsupported.cleanup();
  assert.deepEqual(unsupported.updates,[{supported:false,registered:false,error:null}]);
  const disabled=harness({registerTool(){assert.fail('disabled tool registered');}});
  disabled.render({...options,enabled:false});disabled.cleanup();
  assert.deepEqual(disabled.updates,[{supported:true,registered:false,error:null}]);
});
