'use client';
import {memo,useState} from 'react';
import {useT} from './i18n';
import {brotherThreads,threadReference,type Thread} from '@/lib/threads';
export default memo(function ThreadCatalogue({choose,onClose,onMatchAll}:{choose:(color:string,thread?:Thread)=>void;onClose:()=>void;onMatchAll:()=>void}){
  const {t}=useT(),[query,setQuery]=useState(''),q=query.trim().toLocaleLowerCase(t.lang);
  return <>
      <div className="thread-actions"><strong>{t('Brother threads')}</strong><button type="button" onClick={onClose}>{t('Close')}</button></div>
      <p className="section-copy">{t('Brother PEC codes 1–64; spool labels may differ.')}</p>
      <label>{t('Search by number or name')}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} autoFocus/></label>
      <div className="brother-results">{brotherThreads.filter(b=>(b.code+' '+b.name+' '+t(`thread.${b.name}`)).toLocaleLowerCase(t.lang).includes(q)).map(b=><button type="button" key={b.code} onClick={()=>choose(b.color,threadReference(b))}><span className="thread-swatch" style={{background:b.color}}/><span>{b.code} · {t(`thread.${b.name}`)}</span></button>)}</div>
      {!brotherThreads.some(b=>(b.code+' '+b.name+' '+t(`thread.${b.name}`)).toLocaleLowerCase(t.lang).includes(q))&&<p>{t('No matching threads.')}</p>}
      <button type="button" className="match-all" onClick={()=>{onMatchAll();onClose();}}>{t('Match whole design to Brother')}</button>
    </>;
});
