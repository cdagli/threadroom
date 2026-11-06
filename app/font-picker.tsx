'use client';
import {Button,Input,Popover} from '@/design-system';
import {useT} from './i18n';
import {errorText,type Translator} from '@/lib/i18n';
import {useEffect, useId, useMemo, useRef, useState, type KeyboardEvent} from 'react';
import {categoryNames, listUploads, loadCatalog, previewFamily, previewRef, recommended, refFor, uploadFont, type CatalogFont, type Category, type UploadedFont} from '@/lib/fonts';
import {type FontRef} from '@/lib/text';

type Filter='recommended'|'all'|Category|'mine';
const filtersFor=(t:Translator):{id:Filter;label:string}[]=>[{id:'recommended',label:t("Best for stitching")},{id:'all',label:t("All")},{id:'s',label:t("Sans")},{id:'r',label:t("Serif")},{id:'d',label:t("Display")},{id:'h',label:t("Script")},{id:'m',label:t("Mono")},{id:'mine',label:t("Uploaded")}];
const ROW=46;

function usePreview(load:()=>Promise<string>,key:string) {
  const [family,setFamily]=useState<string|null>(null);
  useEffect(()=>{let live=true;setFamily(null);load().then(f=>{if(live)setFamily(f);}).catch(()=>{});return()=>{live=false;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key]);
  return family;
}
function FontRow({font,selected,active,id,onPick}:{font:CatalogFont&{upload?:boolean};selected:boolean;active:boolean;id:string;onPick:()=>void}) {
  const {t}=useT();
  const family=usePreview(()=>font.upload?previewRef({source:'upload',id:font.id,family:font.family,weight:font.weights[0],italic:font.italic,subsets:[]}):previewFamily(font.id,font.subsets,font.weights.includes(400)?400:font.weights[0]),font.id);
  return <Button variant="item" type="button" id={id} role="option" aria-selected={selected} className={`font-row${active?' active':''}`} tabIndex={-1} onMouseDown={e=>e.preventDefault()} onClick={onPick}>
    <span className="font-sample" style={family?{fontFamily:`'${family}'`}:undefined}>{font.family}</span>
    <small>{font.upload?t("Uploaded"):t(categoryNames[font.category])} · {t('weights.other',{count:font.weights.length})}{font.italic?t('italicSuffix'):''}</small>
    {selected&&<span className="stitch-check" aria-hidden="true">✓</span>}
  </Button>;
}

export function FontPicker({value,onChange}:{value:FontRef;onChange:(ref:FontRef)=>void}) {
  const {t,formatNumber}=useT();
  const filters=filtersFor(t);
  const id=useId(),button=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),list=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),file=useRef<HTMLInputElement>(null);
  const [open,setOpen]=useState(false),[position,setPosition]=useState({left:0,top:0,width:340,maxHeight:480});
  const [fonts,setFonts]=useState<CatalogFont[]>([]),[uploads,setUploads]=useState<UploadedFont[]>([]),[error,setError]=useState('');
  const [query,setQuery]=useState(''),[filter,setFilter]=useState<Filter>('recommended'),[active,setActive]=useState(0),[scroll,setScroll]=useState(0);
  const current=usePreview(()=>previewRef(value),`${value.source}-${value.id}-${value.weight}-${value.italic}`);
  useEffect(()=>{if(!open)return;loadCatalog(t).then(setFonts).catch(e=>setError(errorText(e,t,'The font list could not be loaded. Check your connection and try again.')));listUploads().then(setUploads);},[open,t]);
  const shown=useMemo(()=>{
    const mine=uploads.map(u=>({id:u.id,family:u.family,category:'d' as Category,weights:[u.weight],italic:u.italic,subsets:[],upload:true}));
    const q=query.trim().toLowerCase();
    let pool:(CatalogFont&{upload?:boolean})[]=filter==='mine'?mine:filter==='recommended'&&!q?Object.keys(recommended).map(r=>fonts.find(f=>f.id===r)).filter((f):f is CatalogFont=>!!f)
      :filter==='all'||filter==='recommended'?[...mine,...fonts]:fonts.filter(f=>f.category===filter);
    if(q)pool=pool.filter(f=>f.family.toLowerCase().includes(q));
    return pool;
  },[fonts,uploads,query,filter]);
  useEffect(()=>{setActive(0);setScroll(0);if(list.current)list.current.scrollTop=0;},[query,filter]);
  function place(){
    const rect=button.current!.getBoundingClientRect(),width=Math.min(340,window.innerWidth-24);
    const below=window.innerHeight-rect.bottom-12,above=rect.top-12,height=Math.min(500,Math.max(below,above));
    setPosition({left:Math.max(12,Math.min(rect.right-width,window.innerWidth-width-12)),top:below>=Math.min(500,above)?rect.bottom+5:Math.max(12,rect.top-height-5),width,maxHeight:height});
  }
  function pick(font:CatalogFont&{upload?:boolean}){
    menu.current?.hidePopover();button.current?.focus();
    onChange(font.upload?{source:'upload',id:font.id,family:font.family,weight:font.weights[0],italic:font.italic,subsets:[]}:refFor(font,value.weight,value.italic));
  }
  function reveal(index:number){
    const el=list.current;if(!el)return;
    if(index*ROW<el.scrollTop)el.scrollTop=index*ROW;else if((index+1)*ROW>el.scrollTop+el.clientHeight)el.scrollTop=(index+1)*ROW-el.clientHeight;
  }
  function keys(e:KeyboardEvent<HTMLInputElement>){
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const next=Math.max(0,Math.min(shown.length-1,active+(e.key==='ArrowDown'?1:-1)));setActive(next);reveal(next);}
    else if(e.key==='Enter'&&shown[active]){e.preventDefault();pick(shown[active]);}
    else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();menu.current?.hidePopover();button.current?.focus();}
  }
  async function upload(f:File){
    setError('');
    try{const ref=await uploadFont(f,t);setUploads(await listUploads());menu.current?.hidePopover();onChange(ref);}catch(e){setError(errorText(e,t,'This font could not be read.'));}
  }
  const height=Math.max(120,position.maxHeight-150),first=Math.max(0,Math.floor(scroll/ROW)-4),last=Math.min(shown.length,Math.ceil((scroll+height)/ROW)+4);
  return <div className="font-picker">
    <span className="stitch-label" id={`${id}-label`}>{t("Font")}</span>
    <Button variant="item" ref={button} type="button" className="font-button" aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-label={t("Font: {v0}",{v0:value.family})} popoverTarget={id} onClick={place}>
      <span className="font-button-sample" style={current?{fontFamily:`'${current}'`}:undefined}>{value.family}</span>
      <span className="stitch-chevron" aria-hidden="true">⌄</span>
    </Button>
    <Popover ref={menu} id={id} className="font-menu" popover="auto" role="dialog" aria-labelledby={`${id}-label`} style={position}
      onToggle={e=>{const shown=e.currentTarget.matches(':popover-open');setOpen(shown);if(shown){setError('');requestAnimationFrame(()=>input.current?.focus());}}}>
      <Input ref={input} className="font-search" type="search" placeholder={t("Search {v0} fonts",{v0:fonts.length?formatNumber(fonts.length):''})} aria-label={t("Search fonts")} role="combobox" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={shown[active]?`${id}-${shown[active].id}`:undefined} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={keys}/>
      <div className="font-filters" role="group" aria-label={t("Font category")}>{filters.filter(f=>f.id!=='mine'||uploads.length).map(f=><Button variant="ghost" key={f.id} type="button" aria-pressed={filter===f.id} onClick={()=>setFilter(f.id)}>{f.label}</Button>)}</div>
      <div ref={list} id={`${id}-list`} className="font-list" role="listbox" aria-label={t("Fonts")} style={{height}} onScroll={e=>setScroll(e.currentTarget.scrollTop)}>
        <div style={{height:shown.length*ROW,position:'relative'}}>
          {shown.slice(first,last).map((font,i)=><div key={font.id} style={{position:'absolute',top:(first+i)*ROW,left:0,right:0,height:ROW}}>
            <FontRow font={font} id={`${id}-${font.id}`} selected={font.id===value.id} active={first+i===active} onPick={()=>pick(font)}/>
          </div>)}
        </div>
        {!shown.length&&<p className="empty-list">{fonts.length||error?t("No matching fonts"):t("Loading fonts…")}</p>}
      </div>
      {error&&<p className="font-error" role="alert">{error}</p>}
      <div className="font-footer"><span>{formatNumber(shown.length)} {t("fonts · Open licence")}</span><Button variant="link" type="button" className="text-button" onClick={()=>file.current?.click()}>{t("Upload font…")}</Button>
        <Input ref={file} type="file" className="visually-hidden" tabIndex={-1} aria-label={t("Upload a font file")} accept=".ttf,.otf,.woff,.woff2" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value='';}}/></div>
    </Popover>
  </div>;
}

