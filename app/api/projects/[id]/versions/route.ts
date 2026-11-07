import {listVersions} from '@/lib/project-store';
import {currentUser,unauthorized} from '@/lib/session';

export async function GET(_request:Request,ctx:RouteContext<'/api/projects/[id]/versions'>){
  if(!await currentUser())return unauthorized();
  return Response.json(await listVersions((await ctx.params).id));
}
