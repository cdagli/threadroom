import {checkProject,checkThumbnail,deleteProject,getProject,saveProject} from '@/lib/project-store';
import {badRequest,BodyTooLarge,currentUser,notFound,readJSON,tooLarge,unauthorized} from '@/lib/session';

export async function GET(_request:Request,ctx:RouteContext<'/api/projects/[id]'>){
  if(!await currentUser())return unauthorized();
  const project=await getProject((await ctx.params).id);
  return project?Response.json(project):notFound();
}

export async function PUT(request:Request,ctx:RouteContext<'/api/projects/[id]'>){
  const user=await currentUser();if(!user)return unauthorized();
  let body:unknown;try{body=await readJSON(request);}catch(e){if(e instanceof BodyTooLarge)return tooLarge();throw e;}
  const {data,thumbnail,revision}=(body??{}) as {data?:unknown;thumbnail?:unknown;revision?:unknown};
  const project=checkProject(data);
  if(!project||!Number.isInteger(revision))return badRequest();
  const result=await saveProject(user.id,(await ctx.params).id,project,checkThumbnail(thumbnail),revision as number);
  if(result.status==='missing')return notFound();
  return Response.json(result,{status:result.status==='conflict'?409:200});
}

export async function DELETE(_request:Request,ctx:RouteContext<'/api/projects/[id]'>){
  const user=await currentUser();if(!user)return unauthorized();
  const result=await deleteProject(user.id,(await ctx.params).id);
  if(result==='missing')return notFound();
  if(result==='forbidden')return Response.json({error:'forbidden'},{status:403});
  return new Response(null,{status:204});
}
