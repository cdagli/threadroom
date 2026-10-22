import {createT,TranslationError,type Key,type Values} from './i18n';
import type {EditorJob,EditorResult} from './editor-jobs';

type Reply<T>={value:T;error?:never}|{error:{message:string;key?:Key;values?:Values};value?:never};
export const taskCancelled=(e:unknown)=>e instanceof Error&&e.name==='AbortError';
// One active computation per owner/channel. Terminating the worker cancels CPU work too,
// rather than merely discarding a response after an obsolete job finishes.
export function editorTask(makeWorker=()=>new Worker(new URL('./editor.worker.ts',import.meta.url))){
  let cached:Worker|null=null;
  let active:{worker:Worker;reject:(e:Error)=>void}|null=null;
  function cancel(){const job=active;active=null;cached?.terminate();cached=null;if(job)job.reject(new DOMException('Cancelled','AbortError'));}
  return {
    cancel,
    run<J extends EditorJob>(job:J):Promise<EditorResult<J>>{
      if(active)cancel();
      return new Promise((resolve,reject)=>{
        const worker=cached??=makeWorker(),entry={worker,reject};active=entry;
        const finish=(failed=false)=>{if(failed){worker.terminate();cached=null;}if(active===entry)active=null;};
        worker.onmessage=(event:MessageEvent<Reply<EditorResult<J>>>)=>{
          if(active!==entry)return;finish();const reply=event.data;
          if(reply.error){const e=reply.error;reject(e.key?new TranslationError(createT('en'),e.key,e.values):new Error(e.message));}
          else resolve(reply.value);
        };
        worker.onerror=()=>{if(active!==entry)return;finish(true);reject(new Error('Worker failed'));};
        worker.onmessageerror=()=>{if(active!==entry)return;finish(true);reject(new Error('Worker response failed'));};
        try{worker.postMessage(job);}catch(e){finish(true);reject(e);}
      });
    },
  };
}
