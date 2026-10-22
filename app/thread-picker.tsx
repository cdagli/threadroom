'use client';
import {useId,useMemo,useState,type ReactNode} from 'react';
import {useT} from './i18n';
import {palette,type Project} from '@/lib/project';
import {applyThread,brotherThreads,matchBrother,nearestBrother,threadReference,type Thread} from '@/lib/threads';

export default function ThreadPicker({project,selection,onChange,eyedropper}:{project:Project;selection:string[];onChange:(p:Project)=>void;eyedropper:ReactNode}){
  const {t}=useT(),id=useId(),[query,setQuery]=useState('');
  const items=project.objects.filter(o=>selection.includes(o.id)),item=items[0];
  const colors=useMemo(()=>[...new Map(project.objects.flatMap(o=>[o,...(o.text?.border?[o.text.border]:[])]).map(o=>[o.color.toLowerCase()+':'+(o.thread?.code??''),o])).values()],[project.objects]);
  if(!item)return null;
  const nearest=nearestBrother(item.color),mixed=items.some(o=>o.color!==item.color),q=query.trim().toLocaleLowerCase(t.lang);
  const label=(thread:Thread)=>{const b=brotherThreads.find(b=>b.code===thread.code)!;return t('Brother {code} {name}',{code:b.code,name:t(`thread.${b.name}`)});};
  const close=()=>document.getElementById(id)?.hidePopover();
  const choose=(color:string,thread?:Thread)=>{onChange(applyThread(project,selection,color,thread));close();};
  return <div className="thread-picker">
    <label>{t('Thread colour')}<div className="colour-picker"><input type="color" aria-label={t('Thread colour')} value={item.color} onChange={e=>choose(e.target.value)}/>{eyedropper}<span>{mixed?t('Mixed colours'):item.color.toUpperCase()}</span>{palette.slice(0,4).map(c=><button type="button" key={c} aria-label={t('Use thread {v0}',{v0:c})} style={{background:c}} onClick={()=>choose(c)}/>)}</div></label>
    <div className="thread-actions"><button type="button" popoverTarget={id}>{t('Brother threads')}</button><button type="button" onClick={()=>onChange(matchBrother(project,selection))}>{t('Match to Brother')}</button></div>
    <p className="thread-match">{!mixed&&(item.thread?label(item.thread):t('≈ Brother {code} {name}',{code:nearest.code,name:t(`thread.${nearest.name}`)}))}</p>
    <div className="design-colors" role="group" aria-label={t('Design colours')}><span>{t('Design colours')}</span>{colors.map(o=><button type="button" key={o.color+':'+o.thread?.code} className="thread-swatch" style={{background:o.color}} title={o.thread?label(o.thread):o.color} aria-label={t('Use thread {v0}',{v0:o.thread?label(o.thread):o.color})} onClick={()=>choose(o.color,o.thread)}/>)}</div>
    <div id={id} popover="auto" className="brother-popover" role="dialog" aria-label={t('Brother threads')}>
      <div className="thread-actions"><strong>{t('Brother threads')}</strong><button type="button" onClick={close}>{t('Close')}</button></div>
      <p className="section-copy">{t('Brother PEC codes 1–64; spool labels may differ.')}</p>
      <label>{t('Search by number or name')}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} autoFocus/></label>
      <div className="brother-results">{brotherThreads.filter(b=>(b.code+' '+b.name+' '+t(`thread.${b.name}`)).toLocaleLowerCase(t.lang).includes(q)).map(b=><button type="button" key={b.code} onClick={()=>choose(b.color,threadReference(b))}><span className="thread-swatch" style={{background:b.color}}/><span>{b.code} · {t(`thread.${b.name}`)}</span></button>)}</div>
      {!brotherThreads.some(b=>(b.code+' '+b.name+' '+t(`thread.${b.name}`)).toLocaleLowerCase(t.lang).includes(q))&&<p>{t('No matching threads.')}</p>}
      <button type="button" className="match-all" onClick={()=>{onChange(matchBrother(project));close();}}>{t('Match whole design to Brother')}</button>
    </div>
  </div>;
}
