'use client';
import {Button,Hint} from '@/design-system';
import {useMemo,type ReactNode} from 'react';
import {useT} from './i18n';
import {useStableCallback} from './use-stable-callback';
import ThreadPalette from './thread-palette';
import {threadLabel,threadName} from './thread-label';
import {useThreadBrand} from './use-thread-brand';
import {type Project} from '@/lib/project';
import {applyThread,brandLabel,loadThreads,matchThreads,sameThread,type Thread} from '@/lib/threads';

// onPick reports a deliberately chosen colour so new objects can be drawn with it.
// heading=false when a Section already titles the picker.
export default function ThreadPicker({project,selection,onChange,onPick,eyedropper,heading=true}:{heading?:boolean;project:Project;selection:string[];onChange:(p:Project)=>void;onPick?:(color:string,thread?:Thread)=>void;eyedropper:ReactNode}){
  const {t}=useT(),brand=useThreadBrand();
  const items=project.objects.filter(o=>selection.includes(o.id)),item=items[0];
  const colors=useMemo(()=>[...new Map(project.objects.flatMap(o=>[o,...(o.text?.border?[o.text.border]:[])]).map(o=>[o.color.toLowerCase()+':'+(o.thread?`${o.thread.brand}/${o.thread.code}`:''),o])).values()],[project.objects]);
  const choose=useStableCallback((color:string,thread?:Thread)=>{onPick?.(color,thread);onChange(applyThread(project,selection,color,thread));});
  const matchAll=useStableCallback(async()=>{const threads=await loadThreads(brand);onChange(matchThreads(project,threads,brand));});
  if(!item)return null;
  const mixed=items.some(o=>o.color.toLowerCase()!==item.color.toLowerCase()||!sameThread(o.thread,item.thread));
  const name=mixed?t('Mixed colours'):item.thread?threadName(t,item.thread)||item.thread.code:item.color.toUpperCase();
  const meta=mixed?t('objects.other',{count:items.length}):item.thread?`${brandLabel(item.thread.brand)} · ${item.thread.code}`:item.color.toUpperCase();
  return <div className="thread-picker">
    {heading&&<div className="field-heading">{t('Thread colour')}<Hint text={t('hint.thread')}/></div>}
    <div className="thread-current">
      <span className={`thread-current-swatch${mixed?' mixed':''}`} style={mixed?{background:`linear-gradient(135deg,${items.slice(0,4).map(o=>o.color).join(',')})`}:{background:item.color}}/>
      <div className="thread-current-text"><span className="thread-current-name">{name}</span><span className="thread-current-meta">{meta}</span></div>
      {eyedropper}
    </div>
    {colors.length>1&&<div className="design-colors" role="group" aria-label={t('Design colours')}><span>{t('Design colours')}</span>{colors.map(o=>{const label=o.thread?threadLabel(t,o.thread):o.color.toUpperCase();
      return <Button variant="swatch" type="button" key={o.color+':'+o.thread?.brand+o.thread?.code} className="thread-swatch" aria-pressed={!mixed&&o.color.toLowerCase()===item.color.toLowerCase()&&sameThread(o.thread,item.thread)} style={{background:o.color}} title={label} aria-label={t('Use thread {v0}',{v0:label})} onClick={()=>choose(o.color,o.thread)}/>;})}</div>}
    <ThreadPalette selected={mixed?undefined:item.thread} onChoose={choose}/>
    <Button variant="secondary" size="sm" type="button" className="match-all" onClick={()=>void matchAll()}>{t('Match whole design to {brand}',{brand:brandLabel(brand)})}</Button>
  </div>;
}
