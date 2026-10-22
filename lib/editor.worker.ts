import {runEditorJob,type EditorJob} from './editor-jobs';
import {TranslationError} from './i18n';
// webpack recognises new Worker(new URL(..., import.meta.url)); no worker-loader.
const scope=globalThis as unknown as {onmessage:(event:MessageEvent<EditorJob>)=>void;postMessage:(value:unknown,transfer?:Transferable[])=>void};
scope.onmessage=async({data})=>{
  try{
    const value=await runEditorJob(data);
    scope.postMessage({value},data.kind==='density'?[(value as {values:Float32Array}).values.buffer as ArrayBuffer]:[]);
  }catch(e){scope.postMessage({error:{message:e instanceof Error?e.message:String(e),...(e instanceof TranslationError?{key:e.key,values:e.values}:{})}});}
};
