import {getVersion,restoreVersion} from '@/lib/project-store';
import {badRequest,currentUser,notFound,unauthorized,versionNumber} from '@/lib/session';

export async function GET(_request:Request,ctx:RouteContext<'/api/projects/[id]/versions/[number]'>){
  if(!await currentUser())return unauthorized();
  const {id,number}=await ctx.params,n=versionNumber(number);if(n===null)return badRequest();
  const version=await getVersion(id,n);
  return version?Response.json(version.data):notFound();
}

// Restoring adds a new version with the old content; nothing in the history is removed.
export async function POST(_request:Request,ctx:RouteContext<'/api/projects/[id]/versions/[number]'>){
  const user=await currentUser();if(!user)return unauthorized();
  const {id,number}=await ctx.params,n=versionNumber(number);if(n===null)return badRequest();
  const result=await restoreVersion(user.id,id,n);
  return result?Response.json(result):notFound();
}
