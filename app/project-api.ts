import type {Project} from '@/lib/project';
import type {SaveResult,VersionSummary} from '@/lib/project-store';

async function json<T>(response:Response):Promise<T>{
  if(!response.ok)throw Object.assign(new Error(`HTTP ${response.status}`),{status:response.status});
  return response.json() as Promise<T>;
}
const send=(url:string,method:string,body?:unknown)=>fetch(url,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});

export const createProject=(data:Project,thumbnail:string|null)=>send('/api/projects','POST',{data,thumbnail}).then(r=>json<{id:string}>(r));
export const duplicateProject=(id:string,name:string,version?:number)=>send(`/api/projects/${id}/duplicate`,'POST',{name,version}).then(r=>json<{id:string}>(r));
export async function deleteProject(id:string){const r=await send(`/api/projects/${id}`,'DELETE');if(!r.ok)throw Object.assign(new Error(`HTTP ${r.status}`),{status:r.status});}
export const listVersions=(id:string)=>fetch(`/api/projects/${id}/versions`).then(r=>json<VersionSummary[]>(r));
export const restoreVersion=(id:string,number:number)=>send(`/api/projects/${id}/versions/${number}`,'POST').then(r=>json<{revision:number;version:number;data:Project}>(r));
export const thumbnailURL=(id:string,stamp:string|number,version?:number)=>`/api/projects/${id}/thumbnail?${version===undefined?'':`v=${version}&`}r=${encodeURIComponent(stamp)}`;

export type SaveResponse=SaveResult|{status:'too-large'}|{status:'error'};
export async function saveProject(id:string,data:Project,thumbnail:string|null,revision:number,keepalive=false):Promise<SaveResponse>{
  const body=JSON.stringify({data,thumbnail,revision});
  if(body.length>4_000_000)return {status:'too-large'};
  try{
    const r=await fetch(`/api/projects/${id}`,{method:'PUT',headers:{'content-type':'application/json'},body,keepalive:keepalive&&body.length<60_000});
    if(r.status===413)return {status:'too-large'};
    if(r.ok||r.status===409)return await r.json() as SaveResult;
    return r.status===404?{status:'missing'}:{status:'error'};
  }catch{return {status:'error'};}
}
