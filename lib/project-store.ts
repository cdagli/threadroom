import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {pool} from './db';
import {diffProjects,type Change} from './project-diff';
import {migrateProject,validProject,type Project} from './project';
import {maxThumbnailLength} from './project-thumbnail';

// Autosaves by the same person within this window amend their latest edit version.
const amendWindowMs=10*60_000;

type Person={id:string;name:string};
export type ProjectSummary={id:string;name:string;revision:number;createdAt:string;updatedAt:string;createdBy:Person;updatedBy:Person;versions:number;hasThumbnail:boolean};
export type ProjectRecord=ProjectSummary&{data:Project};
type VersionKind='created'|'edit'|'duplicated'|'restored';
export type VersionSummary={number:number;kind:VersionKind;summary:Change[];author:Person;createdAt:string;updatedAt:string;hasThumbnail:boolean};
export type SaveResult={status:'saved';revision:number;version:number}|{status:'conflict';revision:number;updatedBy:Person;updatedAt:string}|{status:'missing'};

const person=(id:string,name:string|null,email:string|null):Person=>({id,name:name||email||'—'});
const iso=(value:Date|string)=>new Date(value).toISOString();
const projectColumns=`p.id,p.name,p.revision,p.created_at,p.updated_at,p.thumbnail is not null as has_thumbnail,
  p.created_by,c.name as creator_name,c.email as creator_email,p.updated_by,u.name as editor_name,u.email as editor_email,
  (select count(*)::int from project_version v where v.project_id=p.id) as versions`;
const projectJoins=`from project p join "user" c on c.id=p.created_by join "user" u on u.id=p.updated_by`;
type ProjectRow={id:string;name:string;revision:number;created_at:Date;updated_at:Date;has_thumbnail:boolean;created_by:string;creator_name:string|null;creator_email:string|null;updated_by:string;editor_name:string|null;editor_email:string|null;versions:number};
const summary=(r:ProjectRow):ProjectSummary=>({id:r.id,name:r.name,revision:r.revision,createdAt:iso(r.created_at),updatedAt:iso(r.updated_at),
  createdBy:person(r.created_by,r.creator_name,r.creator_email),updatedBy:person(r.updated_by,r.editor_name,r.editor_email),versions:r.versions,hasThumbnail:r.has_thumbnail});

export function checkThumbnail(value:unknown):string|null{
  return typeof value==='string'&&value.startsWith('<svg')&&value.length<=maxThumbnailLength&&!/<script|\son\w+=|href="(?!#)/i.test(value)?value:null;
}
export const checkProject=(input:unknown):Project|null=>{const value=migrateProject(input);return validProject(value)?value:null;};

export async function listProjects():Promise<ProjectSummary[]>{
  const {rows}=await pool.query<ProjectRow>(`select ${projectColumns} ${projectJoins} order by p.updated_at desc`);
  return rows.map(summary);
}

export async function getProject(id:string):Promise<ProjectRecord|null>{
  const {rows:[row]}=await pool.query<ProjectRow&{data:Project}>(`select ${projectColumns},p.data ${projectJoins} where p.id=$1`,[id]);
  return row?{...summary(row),data:migrateProject(row.data)}:null;
}

export async function getThumbnail(id:string,version?:number):Promise<string|null>{
  const {rows:[row]}=version===undefined
    ?await pool.query<{thumbnail:string|null}>('select thumbnail from project where id=$1',[id])
    :await pool.query<{thumbnail:string|null}>('select thumbnail from project_version where project_id=$1 and number=$2',[id,version]);
  return row?.thumbnail??null;
}

export async function listVersions(id:string):Promise<VersionSummary[]>{
  const {rows}=await pool.query<{number:number;kind:VersionKind;summary:Change[];author_id:string;name:string|null;email:string|null;created_at:Date;updated_at:Date;has_thumbnail:boolean}>(
    `select v.number,v.kind,v.summary,v.author_id,a.name,a.email,v.created_at,v.updated_at,v.thumbnail is not null as has_thumbnail
     from project_version v join "user" a on a.id=v.author_id where v.project_id=$1 order by v.number desc`,[id]);
  return rows.map(r=>({number:r.number,kind:r.kind,summary:r.summary,author:person(r.author_id,r.name,r.email),createdAt:iso(r.created_at),updatedAt:iso(r.updated_at),hasThumbnail:r.has_thumbnail}));
}

export async function getVersion(id:string,number:number):Promise<{data:Project;thumbnail:string|null}|null>{
  const {rows:[row]}=await pool.query<{data:Project;thumbnail:string|null}>('select data,thumbnail from project_version where project_id=$1 and number=$2',[id,number]);
  return row?{...row,data:migrateProject(row.data)}:null;
}

async function transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T>{
  const client=await pool.connect();
  try{await client.query('begin');const result=await work(client);await client.query('commit');return result;}
  catch(error){await client.query('rollback');throw error;}
  finally{client.release();}
}

async function insertProject(client:PoolClient,userId:string,data:Project,thumbnail:string|null,kind:VersionKind,changes:Change[]):Promise<string>{
  const id=randomUUID();
  await client.query('insert into project (id,name,data,thumbnail,created_by,updated_by) values ($1,$2,$3,$4,$5,$5)',[id,data.name,data,thumbnail,userId]);
  await client.query('insert into project_version (id,project_id,number,kind,data,thumbnail,summary,author_id) values ($1,$2,1,$3,$4,$5,$6,$7)',[randomUUID(),id,kind,data,thumbnail,JSON.stringify(changes),userId]);
  return id;
}

export const createProject=(userId:string,data:Project,thumbnail:string|null)=>transaction(client=>insertProject(client,userId,data,thumbnail,'created',[{op:'created'}]));

export async function duplicateProject(userId:string,id:string,name:string,version?:number):Promise<string|null>{
  return transaction(async client=>{
    const {rows:[source]}=version===undefined
      ?await client.query<{data:Project;thumbnail:string|null;name:string}>('select data,thumbnail,name from project where id=$1',[id])
      :await client.query<{data:Project;thumbnail:string|null;name:string}>('select v.data,v.thumbnail,p.name from project_version v join project p on p.id=v.project_id where v.project_id=$1 and v.number=$2',[id,version]);
    if(!source)return null;
    return insertProject(client,userId,{...migrateProject(source.data),name},source.thumbnail,'duplicated',[{op:'duplicated',name:source.name}]);
  });
}

async function lockProject(client:PoolClient,id:string){
  const {rows:[row]}=await client.query<{revision:number;updated_by:string;updated_at:Date;editor_name:string|null;editor_email:string|null}>(
    'select p.revision,p.updated_by,p.updated_at,u.name as editor_name,u.email as editor_email from project p join "user" u on u.id=p.updated_by where p.id=$1 for update of p',[id]);
  return row;
}
async function latestVersion(client:PoolClient,id:string){
  const {rows:[row]}=await client.query<{id:string;number:number;kind:VersionKind;author_id:string;updated_at:Date;data:Project}>(
    'select id,number,kind,author_id,updated_at,data from project_version where project_id=$1 order by number desc limit 1',[id]);
  return row;
}

export async function saveProject(userId:string,id:string,data:Project,thumbnail:string|null,revision:number):Promise<SaveResult>{
  return transaction(async client=>{
    const current=await lockProject(client,id);
    if(!current)return {status:'missing'};
    if(current.revision!==revision)return {status:'conflict',revision:current.revision,updatedBy:person(current.updated_by,current.editor_name,current.editor_email),updatedAt:iso(current.updated_at)};
    const last=await latestVersion(client,id);
    const amend=last&&last.kind==='edit'&&last.author_id===userId&&Date.now()-new Date(last.updated_at).getTime()<amendWindowMs;
    let number:number;
    if(amend){
      const {rows:[base]}=await client.query<{data:Project}>('select data from project_version where project_id=$1 and number=$2',[id,last.number-1]);
      await client.query('update project_version set data=$1,thumbnail=$2,summary=$3,updated_at=now() where id=$4',[data,thumbnail,JSON.stringify(base?diffProjects(base.data,data):[]),last.id]);
      number=last.number;
    }else{
      number=(last?.number??0)+1;
      await client.query('insert into project_version (id,project_id,number,kind,data,thumbnail,summary,author_id) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [randomUUID(),id,number,'edit',data,thumbnail,JSON.stringify(last?diffProjects(last.data,data):[]),userId]);
    }
    const {rows:[saved]}=await client.query<{revision:number}>('update project set name=$1,data=$2,thumbnail=$3,updated_by=$4,updated_at=now(),revision=revision+1 where id=$5 returning revision',[data.name,data,thumbnail,userId,id]);
    return {status:'saved',revision:saved.revision,version:number};
  });
}

export async function restoreVersion(userId:string,id:string,number:number):Promise<{revision:number;version:number;data:Project}|null>{
  return transaction(async client=>{
    if(!await lockProject(client,id))return null;
    const {rows:[row]}=await client.query<{data:Project;thumbnail:string|null}>('select data,thumbnail from project_version where project_id=$1 and number=$2',[id,number]);
    if(!row)return null;
    const target={...row,data:migrateProject(row.data)};
    const last=await latestVersion(client,id),next=last.number+1;
    await client.query('insert into project_version (id,project_id,number,kind,data,thumbnail,summary,author_id) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [randomUUID(),id,next,'restored',target.data,target.thumbnail,JSON.stringify([{op:'restored',number}]),userId]);
    const {rows:[saved]}=await client.query<{revision:number}>('update project set name=$1,data=$2,thumbnail=$3,updated_by=$4,updated_at=now(),revision=revision+1 where id=$5 returning revision',[target.data.name,target.data,target.thumbnail,userId,id]);
    return {revision:saved.revision,version:next,data:target.data};
  });
}

// Only the creator may delete a project; everyone signed in may view and edit it.
export async function deleteProject(userId:string,id:string):Promise<'deleted'|'forbidden'|'missing'>{
  const {rows:[row]}=await pool.query<{created_by:string}>('select created_by from project where id=$1',[id]);
  if(!row)return 'missing';
  if(row.created_by!==userId)return 'forbidden';
  await pool.query('delete from project where id=$1',[id]);
  return 'deleted';
}
