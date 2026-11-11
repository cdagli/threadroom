'use client';
import {useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button,EmptyState,Icon,IconButton,Input,Modal,SegmentedControl,Select} from '@/design-system';
import {authClient} from '@/lib/auth-client';
import {blankProject,demo,type Fabric} from '@/lib/project';
import {relativeTime} from '@/lib/project-diff';
import {projectThumbnail} from '@/lib/project-thumbnail';
import type {ProjectSummary} from '@/lib/project-store';
import {useT} from './i18n';
import {NewProjectDialog} from './new-project-dialog';
import {createProject,deleteProject,duplicateProject,thumbnailURL} from './project-api';

type Props={projects:ProjectSummary[];user:{id:string;name:string}};

export default function ProjectList({projects:initialProjects,user}:Props){
  const {t,lang,setLang}=useT();
  const router=useRouter();
  const [projects,setProjects]=useState(initialProjects);
  const [query,setQuery]=useState(''),[mine,setMine]=useState(false);
  const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState('');
  const [confirm,setConfirm]=useState<ProjectSummary|null>(null),[creating,setCreating]=useState(false);
  const shown=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase(lang);
    return projects.filter(p=>(!mine||p.createdBy.id===user.id)&&(!q||p.name.toLocaleLowerCase(lang).includes(q)||p.createdBy.name.toLocaleLowerCase(lang).includes(q)));
  },[projects,query,mine,user.id,lang]);

  async function create(sample:boolean,hoop?:string,fabric?:Fabric){
    setBusy(sample?'sample':'new');setError('');
    try{
      const data=sample?demo(t):blankProject(t('Untitled embroidery'),hoop,fabric);
      const {id}=await createProject(data,projectThumbnail(data));
      router.push(`/projects/${id}`);
    }catch{setError(t('The project could not be created.'));setBusy(null);}
  }
  async function duplicate(p:ProjectSummary){
    setBusy(p.id);setError('');
    try{const {id}=await duplicateProject(p.id,t('Copy of {name}',{name:p.name}).slice(0,40));router.push(`/projects/${id}`);}
    catch{setError(t('The project could not be duplicated.'));setBusy(null);}
  }
  async function remove(p:ProjectSummary){
    setConfirm(null);setBusy(p.id);setError('');
    try{await deleteProject(p.id);setProjects(list=>list.filter(x=>x.id!==p.id));}
    catch{setError(t('The project could not be deleted.'));}
    setBusy(null);
  }

  return <main className="projects-page">
    <header className="projects-header">
      <span className="brand" aria-hidden="true">t<span className="brand-dot">.</span></span>
      <h1>{t('Projects')}</h1>
      <span className="projects-user">{t('Signed in as {name}',{name:user.name})}</span>
      <Select controlSize="sm" aria-label={t('Language')} value={lang} onChange={e=>setLang(e.target.value as 'tr'|'en')}>
        <option value="tr" lang="tr">Türkçe</option><option value="en" lang="en">English</option>
      </Select>
      <Button variant="ghost" size="sm" onClick={()=>void authClient.signOut().then(()=>{window.location.href='/login';})}><Icon name="sign-out" size={16}/>{t('Sign out')}</Button>
    </header>
    <div className="projects-toolbar">
      <Input type="search" className="projects-search" aria-label={t('Search projects')} placeholder={t('Search projects')} value={query} onChange={e=>setQuery(e.target.value)}/>
      <SegmentedControl aria-label={t('Project filter')}>
        <Button variant="ghost" size="sm" aria-pressed={!mine} onClick={()=>setMine(false)}>{t('All projects')}</Button>
        <Button variant="ghost" size="sm" aria-pressed={mine} onClick={()=>setMine(true)}>{t('Created by me')}</Button>
      </SegmentedControl>
      <span className="projects-spacer"/>
      <Button variant="secondary" loading={busy==='sample'} disabled={!!busy} onClick={()=>void create(true)}><Icon name="needle" size={16}/>{t('Start from sample')}</Button>
      <Button variant="primary" disabled={!!busy} onClick={()=>{setError('');setCreating(true);}}><Icon name="plus" size={16}/>{t('New project')}</Button>
    </div>
    {error&&<p className="projects-error" role="alert">{error}</p>}
    {!projects.length?<div className="projects-empty"><EmptyState icon={<Icon name="needle" size={24}/>} title={t('No projects yet')} description={t('Create a project to start digitising. Everyone signed in can see and edit it.')}>
      <Button variant="primary" disabled={!!busy} onClick={()=>{setError('');setCreating(true);}}><Icon name="plus" size={16}/>{t('New project')}</Button>
    </EmptyState></div>
    :!shown.length?<div className="projects-empty"><EmptyState icon={<Icon name="info" size={24}/>} title={t('No matching projects')} description={t('Try another name or show all projects.')}>
      <Button variant="secondary" onClick={()=>{setQuery('');setMine(false);}}>{t('All projects')}</Button>
    </EmptyState></div>
    :<ul className="projects-grid">{shown.map(p=>{
      const own=p.createdBy.id===user.id;
      return <li key={p.id} className="project-card" aria-busy={busy===p.id||undefined}>
        <a className="project-card-link" href={`/projects/${p.id}`}>
          <span className="project-thumb">{p.hasThumbnail?<img src={thumbnailURL(p.id,p.revision)} alt="" loading="lazy"/>:<span className="project-thumb-empty">{t('No preview')}</span>}</span>
          <span className="project-card-body">
            <strong>{p.name}</strong>
            <span>{t('Created by {name}',{name:p.createdBy.name})}</span>
            <span title={new Date(p.updatedAt).toLocaleString(lang)}>{t('Edited {time} by {name}',{time:relativeTime(p.updatedAt,lang),name:p.updatedBy.name})} · {t('versions.other',{count:p.versions})}</span>
          </span>
        </a>
        <div className="project-card-actions" role="group" aria-label={t('Project actions')}>
          <IconButton size="sm" aria-label={t('Duplicate project')} title={t('Duplicate project')} disabled={!!busy} onClick={()=>void duplicate(p)}><Icon name="duplicate" size={16}/></IconButton>
          <IconButton size="sm" aria-label={t('Delete')} title={own?t('Delete'):t('Only the creator can delete this project.')} disabled={!own||!!busy} onClick={()=>setConfirm(p)}><Icon name="trash" size={16}/></IconButton>
        </div>
      </li>;
    })}</ul>}
    {creating&&<NewProjectDialog busy={busy==='new'} error={busy?undefined:error||undefined} onCreate={(hoop,fabric)=>void create(false,hoop,fabric)} onClose={()=>{if(busy!=='new')setCreating(false);}}/>}
    {confirm&&<Modal title={t('Delete project?')} onClose={()=>setConfirm(null)}>
      <p>{t('“{name}” and its version history will be deleted for everyone. This cannot be undone.',{name:confirm.name})}</p>
      <div className="io-actions"><Button variant="secondary" onClick={()=>setConfirm(null)}>{t('Cancel')}</Button><Button variant="danger" onClick={()=>void remove(confirm)}><Icon name="trash" size={16}/>{t('Delete')}</Button></div>
    </Modal>}
  </main>;
}
