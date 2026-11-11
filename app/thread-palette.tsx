'use client';
import {Button,Input,Select} from '@/design-system';
import {useEffect,useMemo,useState} from 'react';
import {useT} from './i18n';
import {threadName} from './thread-label';
import {setThreadBrand,useThreadBrand} from './use-thread-brand';
import {brandLabel,loadThreads,paletteOrder,threadBrands,threadReference,type CatalogueThread,type Thread} from '@/lib/threads';

type Chart={brand:string;threads:readonly CatalogueThread[]|null;failed?:boolean};
// Brand chart browser: brand, search and a swatch grid. Choosing a swatch reports its colour and reference.
export default function ThreadPalette({selected,onChoose}:{selected?:Thread;onChoose:(color:string,thread:Thread)=>void}){
  const {t}=useT(),brand=useThreadBrand(),[query,setQuery]=useState(''),[chart,setChart]=useState<Chart>({brand,threads:null});
  const [focus,setFocus]=useState<CatalogueThread|null>(null);
  useEffect(()=>{let live=true;loadThreads(brand).then(threads=>{if(live)setChart({brand,threads});},()=>{if(live)setChart({brand,threads:null,failed:true});});return ()=>{live=false;};},[brand]);
  const current=chart.brand===brand?chart:{brand,threads:null};
  const ordered=useMemo(()=>current.threads?paletteOrder(current.threads):[],[current.threads]);
  const q=query.trim().toLocaleLowerCase(t.lang);
  const shown=q?ordered.filter(th=>(th.code+' '+th.name+' '+threadName(t,{brand,name:th.name})).toLocaleLowerCase(t.lang).includes(q)):ordered;
  const picked=selected?.brand===brand?ordered.find(th=>th.code===selected.code):undefined,readout=focus??picked;
  const describe=(th:CatalogueThread)=>{const name=threadName(t,{brand,name:th.name});return name?`${th.code} · ${name}`:th.code;};
  return <div className="thread-palette">
    <div className="thread-palette-filters">
      <Select controlSize="sm" aria-label={t('Thread brand')} value={brand} onChange={e=>{setThreadBrand(e.target.value);setFocus(null);}}>
        {threadBrands.map(b=><option key={b.id} value={b.id}>{b.label}</option>)}
      </Select>
      <Input type="search" className="thread-search" aria-label={t('Search by number or name')} placeholder={t('Code or name')} value={query} onChange={e=>setQuery(e.target.value)}/>
    </div>
    {current.failed?<p className="thread-palette-note">{t('Could not load this thread chart.')}</p>
      :!current.threads?<p className="thread-palette-note">{t('Loading threads…')}</p>
      :shown.length===0?<p className="thread-palette-note">{t('No matching threads.')}</p>
      :<div className="thread-grid" role="group" aria-label={brandLabel(brand)} onPointerLeave={()=>setFocus(null)}>
        {shown.map(th=><Button variant="swatch" type="button" key={th.code} className="thread-chip" style={{background:th.color}} title={describe(th)} aria-label={describe(th)} aria-pressed={th===picked}
          onPointerEnter={()=>setFocus(th)} onFocus={()=>setFocus(th)} onBlur={()=>setFocus(null)} onClick={()=>onChoose(th.color,threadReference(th,brand))}/>)}
      </div>}
    <div className="thread-readout" aria-hidden="true">
      {readout?<><span className="thread-swatch" style={{background:readout.color}}/><span>{describe(readout)}</span></>:<span>{t('{count} colours',{count:shown.length})}</span>}
    </div>
  </div>;
}
