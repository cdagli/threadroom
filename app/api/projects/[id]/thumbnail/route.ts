import {getThumbnail} from '@/lib/project-store';
import {currentUser,unauthorized,versionNumber} from '@/lib/session';

// ?v=<number> serves a version's preview; the list adds ?r=<revision> so a fresh save busts the cache.
export async function GET(request:Request,ctx:RouteContext<'/api/projects/[id]/thumbnail'>){
  if(!await currentUser())return unauthorized();
  const v=new URL(request.url).searchParams.get('v'),version=v===null?undefined:versionNumber(v)??-1;
  const svg=await getThumbnail((await ctx.params).id,version);
  if(!svg)return new Response(null,{status:404});
  return new Response(svg,{headers:{'content-type':'image/svg+xml','cache-control':'private, max-age=31536000, immutable','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'"}});
}
