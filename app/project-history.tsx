'use client';
import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import {Button,Icon,LoadingState,Modal} from '@/design-system';
import {describeChange,relativeTime} from '@/lib/project-diff';
import type {Project} from '@/lib/project';
import type {VersionSummary} from '@/lib/project-store';
import {useT} from './i18n';
import {listVersions,restoreVersion,thumbnailURL} from './project-api';

type Props={projectId:string;revision:number;canRestore:boolean;onRestored:(data:Project,revision:number)=>void;onDuplicate:(version:number)=>void;onClose:()=>void};

// Browse every saved version with its preview; restoring adds a new version on top.
export default function ProjectHistory({projectId,revision,canRestore,onRestored,onDuplicate,onClose}:Props){
  const {t,lang}=useT();
  const [versions,setVersions]=useState<VersionSummary[]|null>(null),[error,setError]=useState('');
  const [selected,setSelected]=useState<number|null>(null),[busy,setBusy]=useState(false);
  const list=useRef<HTMLOListElement>(null);
  useEffect(()=>{
    let live=true;
    listVersions(projectId).then(v=>{if(!live)return;setVersions(v);setSelected(v[0]?.number??null);}).catch(()=>{if(live)setError(t('The history could not be loaded.'));});
    return()=>{live=false;};
  },[projectId,revision,t]);
  const index=versions?.findIndex(v=>v.number===selected)??-1,version=versions?.[index];
  const latest=versions?.[0]?.number;

  function step(e:KeyboardEvent){
    if(!versions||(e.key!=='ArrowDown'&&e.key!=='ArrowUp'))return;
    e.preventDefault();
    const next=Math.max(0,Math.min(versions.length-1,index+(e.key==='ArrowDown'?1:-1)));
    setSelected(versions[next].number);
    list.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  }
  async function restore(number:number){
    setBusy(true);setError('');
    try{const result=await restoreVersion(projectId,number);onRestored(result.data,result.revision);}
    catch{setError(t('The version could not be restored.'));setBusy(false);}
  }

  return <Modal title={t('Version history')} size="wide" onClose={onClose}>
    {!versions?(error?<p role="alert">{error}</p>:<LoadingState label={t('Loading versions…')}/>):<div className="history-layout">
      <ol ref={list} className="history-list" aria-label={t('Versions')} onKeyDown={step}>
        {versions.map(v=><li key={v.number}>
          <Button variant="item" className="history-row" aria-current={v.number===selected||undefined} onClick={()=>setSelected(v.number)}>
            <span className="history-row-head"><strong>{t('Version {number}',{number:v.number})}</strong>{v.number===latest&&<span className="history-badge">{t('Current')}</span>}<time dateTime={v.updatedAt} title={new Date(v.updatedAt).toLocaleString(lang)}>{relativeTime(v.updatedAt,lang)}</time></span>
            <span className="history-author">{v.author.name}</span>
            <span className="history-changes">{(v.summary.length?v.summary.map(c=>describeChange(c,t)):[t('No changes')]).map((text,i)=><span key={i}>{text}</span>)}</span>
          </Button>
        </li>)}
      </ol>
      {version&&<figure className="history-preview">
        <span className="history-thumb">{version.hasThumbnail?<img src={thumbnailURL(projectId,version.updatedAt,version.number)} alt={t('Version {number}',{number:version.number})}/>:<span className="project-thumb-empty">{t('No preview')}</span>}</span>
        <figcaption>{t('Version {number}',{number:version.number})} · {version.author.name} · {new Date(version.updatedAt).toLocaleString(lang)}</figcaption>
        {error&&<p role="alert" className="projects-error">{error}</p>}
        <div className="io-actions">
          <Button variant="secondary" disabled={busy} onClick={()=>onDuplicate(version.number)}><Icon name="duplicate" size={16}/>{t('Duplicate as new project')}</Button>
          <Button variant="primary" loading={busy} disabled={version.number===latest||!canRestore} title={version.number===latest?t('This is the current version.'):!canRestore?t('Wait for your changes to save.'):undefined} onClick={()=>void restore(version.number)}><Icon name="undo" size={16}/>{t('Restore this version')}</Button>
        </div>
      </figure>}
    </div>}
    <p className="history-hint">{t('Use ↑ and ↓ to step through versions.')}</p>
    <div className="io-actions"><Button variant="secondary" onClick={onClose}>{t('Close')}</Button></div>
  </Modal>;
}
