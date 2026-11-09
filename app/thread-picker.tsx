'use client';
import {Button,Hint,Input,Popover} from '@/design-system';
import {useId,useMemo,useState,type ReactNode} from 'react';
import {useT} from './i18n';
import {useStableCallback} from './use-stable-callback';
import dynamic from 'next/dynamic';
import {Loading} from './panel-loading';
const ThreadCatalogue=dynamic(()=>import('./thread-catalogue'),{loading:Loading});
import {type Project} from '@/lib/project';
import {applyThread,brotherThreads,matchBrother,nearestBrother,type Thread} from '@/lib/threads';

// onPick reports a deliberately chosen colour so new objects can be drawn with it.
export default function ThreadPicker({project,selection,onChange,onPick,eyedropper,hint=false}:{hint?:boolean;project:Project;selection:string[];onChange:(p:Project)=>void;onPick?:(color:string,thread?:Thread)=>void;eyedropper:ReactNode}){
  const {t}=useT(),id=useId(),[opened,setOpened]=useState(false);
  const items=project.objects.filter(o=>selection.includes(o.id)),item=items[0];
  const colors=useMemo(()=>[...new Map(project.objects.flatMap(o=>[o,...(o.text?.border?[o.text.border]:[])]).map(o=>[o.color.toLowerCase()+':'+(o.thread?.code??''),o])).values()],[project.objects]);
  const close=useStableCallback(()=>document.getElementById(id)?.hidePopover());
  const choose=useStableCallback((color:string,thread?:Thread)=>{onPick?.(color,thread);onChange(applyThread(project,selection,color,thread));close();});
  const matchAll=useStableCallback(()=>onChange(matchBrother(project)));
  if(!item)return null;
  const nearest=nearestBrother(item.color),mixed=items.some(o=>o.color!==item.color);
  const label=(thread:Thread)=>{const b=brotherThreads.find(b=>b.code===thread.code)!;return t('Brother {code} {name}',{code:b.code,name:t(`thread.${b.name}`)});};
  const match=mixed?null:item.thread?label(item.thread):t('≈ Brother {code} {name}',{code:nearest.code,name:t(`thread.${nearest.name}`)});
  return <div className="thread-picker">
    <div className="field-heading">{t('Thread colour')}{hint&&<Hint text={t('hint.thread')}/>}</div>
    <div className="thread-current">
      <Input type="color" aria-label={t('Thread colour')} value={item.color} onChange={e=>choose(e.target.value)}/>
      <div className="thread-current-text"><span className="thread-hex">{mixed?t('Mixed colours'):item.color.toUpperCase()}</span>
        <span className="thread-match">{match}{!item.thread&&<Button variant="link" type="button" title={t('Match to Brother')} onClick={()=>onChange(matchBrother(project,selection))}>{t('Match')}</Button>}</span></div>
      {eyedropper}
    </div>
    {colors.length>1&&<div className="design-colors" role="group" aria-label={t('Design colours')}><span>{t('Design colours')}</span>{colors.map(o=><Button variant="swatch" type="button" key={o.color+':'+o.thread?.code} className="thread-swatch" aria-pressed={!mixed&&o.color.toLowerCase()===item.color.toLowerCase()&&o.thread?.code===item.thread?.code} style={{background:o.color}} title={o.thread?label(o.thread):o.color} aria-label={t('Use thread {v0}',{v0:o.thread?label(o.thread):o.color})} onClick={()=>choose(o.color,o.thread)}/>)}</div>}
    <Button variant="secondary" type="button" className="thread-catalogue-button" popoverTarget={id}>{t('Brother threads')}</Button>
    <Popover id={id} popover="auto" className="brother-popover" role="dialog" aria-label={t('Brother threads')} onBeforeToggle={e=>{if(e.newState==='open')setOpened(true);}}>
      {opened&&<ThreadCatalogue choose={choose} onClose={close} onMatchAll={matchAll}/>}
    </Popover>
  </div>;
}
