import {notFound} from 'next/navigation';
import {getProject} from '@/lib/project-store';
import {requirePageUser} from '@/lib/session';
import Studio from '../../studio';

export default async function ProjectPage({params}:PageProps<'/projects/[id]'>){
  await requirePageUser();
  const project=await getProject((await params).id);
  if(!project)notFound();
  return <Studio projectId={project.id} initialProject={project.data} initialRevision={project.revision}/>;
}
