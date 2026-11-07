import {duplicateProject} from '@/lib/project-store';
import {badRequest,currentUser,notFound,readJSON,unauthorized} from '@/lib/session';

export async function POST(request:Request,ctx:RouteContext<'/api/projects/[id]/duplicate'>){
  const user=await currentUser();if(!user)return unauthorized();
  const {name,version}=((await readJSON(request).catch(()=>null))??{}) as {name?:unknown;version?:unknown};
  if(typeof name!=='string'||!name.trim()||name.length>40||(version!==undefined&&!Number.isInteger(version)))return badRequest();
  const id=await duplicateProject(user.id,(await ctx.params).id,name.trim(),version as number|undefined);
  return id?Response.json({id},{status:201}):notFound();
}
