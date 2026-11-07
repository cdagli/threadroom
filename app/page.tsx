import {listProjects} from '@/lib/project-store';
import {requirePageUser} from '@/lib/session';
import ProjectList from './project-list';

export default async function Page(){
  const user=await requirePageUser();
  return <ProjectList projects={await listProjects()} user={user}/>;
}
