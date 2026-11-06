'use client';
/**
 * Copyright 2026 Google LLC
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Adapted from GoogleChromeLabs/use-webmcp-tool (useWebMCP.js).
 * Local backport of its async registration fix until a release includes it:
 * https://github.com/GoogleChromeLabs/use-webmcp-tool/blob/main/useWebMCP.js
 */
import {useEffect,useReducer,useRef,useState} from 'react';
import type {WebMCPOptions,WebMCPState,WebMCPToolResponse} from 'use-webmcp-tool';

function errorMessage(value:unknown):string{
  if(value instanceof Error)return value.message;
  if(value&&typeof value==='object'&&'message' in value&&typeof value.message==='string')return value.message;
  if(typeof value==='string')return value;
  try{return JSON.stringify(value)??String(value);}catch{return String(value);}
}
function toolResponse(value:unknown):WebMCPToolResponse{
  if(value&&typeof value==='object'&&'content' in value&&Array.isArray(value.content))return value as WebMCPToolResponse;
  if(value===undefined||value===null)return {content:[]};
  return {content:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value)}]};
}

export function useWebMCP<Args=Record<string,unknown>,Result=unknown>({name,description,inputSchema,annotations,execute,enabled=true,formatOutput,onError}:WebMCPOptions<Args,Result>):WebMCPState{
  const [state,setState]=useState<WebMCPState>({supported:false,registered:false,error:null});
  const callbacks=useRef({execute,formatOutput,onError});
  useEffect(()=>{callbacks.current={execute,formatOutput,onError};});
  const schemaKey=inputSchema?JSON.stringify(inputSchema):'';
  const annotationsKey=annotations?JSON.stringify(annotations):'';
  const [detectTick,redetect]=useReducer((n:number)=>n+1,0);

  useEffect(()=>{
    const context=typeof document==='undefined'?undefined:document.modelContext;
    if(!context){
      setState({supported:false,registered:false,error:null});
      if(typeof document==='undefined')return;
      // Extensions can inject the API after the component mounts.
      let attempts=0;
      const timer=setInterval(()=>{
        if(document.modelContext){clearInterval(timer);redetect();}
        else if(++attempts>=20)clearInterval(timer);
      },500);
      return()=>clearInterval(timer);
    }
    if(!enabled){setState({supported:true,registered:false,error:null});return;}
    const controller=new AbortController();
    void (async()=>{
      try{
        // Registration returns a promise that can reject when cleanup aborts it.
        // Await it inside the try so Strict Mode replay cannot leak a rejection.
        await context.registerTool({
          name,description,inputSchema,annotations,
          async execute(args,options){
            try{
              const result=await callbacks.current.execute(args as Args,options);
              const format=callbacks.current.formatOutput;
              const shaped=format?format(result,args as Args):result;
              if(shaped instanceof Error)throw shaped;
              return toolResponse(shaped);
            }catch(error){
              if(options?.signal?.aborted)throw error;
              callbacks.current.onError?.(error);
              return {content:[{type:'text',text:errorMessage(error)}],isError:true};
            }
          },
        },{signal:controller.signal});
        if(!controller.signal.aborted)setState({supported:true,registered:true,error:null});
      }catch(error){
        // A disposed registration must not overwrite the state of its replacement.
        if(!controller.signal.aborted)setState({supported:true,registered:false,error:error instanceof Error?error:new Error(errorMessage(error))});
      }
    })();
    return()=>controller.abort();
    // Callbacks use refs; metadata changes alone require re-registration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[name,description,schemaKey,annotationsKey,enabled,detectTick]);
  return state;
}
