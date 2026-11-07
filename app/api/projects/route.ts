import {checkProject,checkThumbnail,createProject} from '@/lib/project-store';
import {badRequest,BodyTooLarge,currentUser,readJSON,tooLarge,unauthorized} from '@/lib/session';

export async function POST(request:Request){
  const user=await currentUser();if(!user)return unauthorized();
  let body:unknown;try{body=await readJSON(request);}catch(e){if(e instanceof BodyTooLarge)return tooLarge();throw e;}
  const {data,thumbnail}=(body??{}) as {data?:unknown;thumbnail?:unknown};
  const project=checkProject(data);if(!project)return badRequest();
  const id=await createProject(user.id,project,checkThumbnail(thumbnail));
  return Response.json({id},{status:201});
}
