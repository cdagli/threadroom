'use client';
import {Button,Hint,Input,Popover} from '@/design-system';
import {useId,useMemo,useState,type ReactNode} from 'react';
import {useT} from './i18n';
import {useStableCallback} from './use-stable-callback';
import dynamic from 'next/dynamic';
import {Loading} from './panel-loading';
const ThreadCatalogue=dynamic(()=>import('./thread-catalogue'),{loading:Loading});
import {palette,type Project} from '@/lib/project';
import {applyThread,brotherThreads,matchBrother,nearestBrother,type Thread} from '@/lib/threads';

export default function ThreadPicker({project,selection,onChange,eyedropper,hint=false}:{hint?:boolean;project:Project;selection:string[];onChange:(p:Project)=>void;eyedropper:ReactNode}){
  const {t}=useT(),id=useId(),[opened,setOpened]=useState(false);
  const items=project.objects.filter(o=>selection.includes(o.id)),item=items[0];
  const colors=useMemo(()=>[...new Map(project.objects.flatMap(o=>[o,...(o.text?.border?[o.text.border]:[])]).map(o=>[o.color.toLowerCase()+':'+(o.thread?.code??''),o])).values()],[project.objects]);
  const close=useStableCallback(()=>document.getElementById(id)?.hidePopover());
  const choose=useStableCallback((color:string,thread?:Thread)=>{onChange(applyThread(project,selection,color,thread));close();});
  const matchAll=useStableCallback(()=>onChange(matchBrother(project)));
  if(!item)return null;
  const nearest=nearestBrother(item.color),mixed=items.some(o=>o.color!==item.color);
  const label=(thread:Thread)=>{const b=brotherThreads.find(b=>b.code===thread.code)!;return t('Brother {code} {name}',{code:b.code,name:t(`thread.${b.name}`)});};
  return <div className="thread-picker">
    <label>{hint?<span className="field-heading">{t('Thread colour')}<Hint text={t('hint.thread')}/></span>:t('Thread colour')}<div className="colour-picker"><Input type="color" aria-label={t('Thread colour')} value={item.color} onChange={e=>choose(e.target.value)}/>{eyedropper}<span>{mixed?t('Mixed colours'):item.color.toUpperCase()}</span>{palette.slice(0,4).map(c=><Button variant="swatch" type="button" key={c} aria-label={t('Use thread {v0}',{v0:c})} style={{background:c}} onClick={()=>choose(c)}/>)}</div></label>
    <div className="thread-actions"><Button variant="secondary" type="button" popoverTarget={id}>{t('Brother threads')}</Button><Button variant="secondary" type="button" onClick={()=>onChange(matchBrother(project,selection))}>{t('Match to Brother')}</Button></div>
    <p className="thread-match">{!mixed&&(item.thread?label(item.thread):t('≈ Brother {code} {name}',{code:nearest.code,name:t(`thread.${nearest.name}`)}))}</p>
    <div className="design-colors" role="group" aria-label={t('Design colours')}><span>{t('Design colours')}</span>{colors.map(o=><Button variant="swatch" type="button" key={o.color+':'+o.thread?.code} className="thread-swatch" style={{background:o.color}} title={o.thread?label(o.thread):o.color} aria-label={t('Use thread {v0}',{v0:o.thread?label(o.thread):o.color})} onClick={()=>choose(o.color,o.thread)}/>)}</div>
    <Popover id={id} popover="auto" className="brother-popover" role="dialog" aria-label={t('Brother threads')} onBeforeToggle={e=>{if(e.newState==='open')setOpened(true);}}>
      {opened&&<ThreadCatalogue choose={choose} onClose={close} onMatchAll={matchAll}/>}
    </Popover>
  </div>;
}
