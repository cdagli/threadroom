'use client';
import {useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject} from 'react';
import {categoryNames, listUploads, loadCatalog, previewFamily, previewRef, recommended, refFor, uploadFont, weightNames, type CatalogFont, type Category, type UploadedFont} from '@/lib/fonts';
import {textLimits, type FontRef, type TextLayout, type TextSpec} from '@/lib/text';

type Filter='recommended'|'all'|Category|'mine';
const filters:{id:Filter;label:string}[]=[{id:'recommended',label:'Best for stitching'},{id:'all',label:'All'},{id:'s',label:'Sans'},{id:'r',label:'Serif'},{id:'d',label:'Display'},{id:'h',label:'Script'},{id:'m',label:'Mono'},{id:'mine',label:'Uploaded'}];
const ROW=46;

function usePreview(load:()=>Promise<string>,key:string) {
  const [family,setFamily]=useState<string|null>(null);
  useEffect(()=>{let live=true;setFamily(null);load().then(f=>{if(live)setFamily(f);}).catch(()=>{});return()=>{live=false;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key]);
  return family;
}
function FontRow({font,selected,active,id,onPick}:{font:CatalogFont&{upload?:boolean};selected:boolean;active:boolean;id:string;onPick:()=>void}) {
  const family=usePreview(()=>font.upload?previewRef({source:'upload',id:font.id,family:font.family,weight:font.weights[0],italic:font.italic,subsets:[]}):previewFamily(font.id,font.subsets,font.weights.includes(400)?400:font.weights[0]),font.id);
  return <button type="button" id={id} role="option" aria-selected={selected} className={`font-row${active?' active':''}`} tabIndex={-1} onMouseDown={e=>e.preventDefault()} onClick={onPick}>
    <span className="font-sample" style={family?{fontFamily:`'${family}'`}:undefined}>{font.family}</span>
    <small>{font.upload?'Uploaded':categoryNames[font.category]} · {font.weights.length} {font.weights.length===1?'weight':'weights'}{font.italic?' + italic':''}</small>
    {selected&&<span className="stitch-check" aria-hidden="true">✓</span>}
  </button>;
}

export function FontPicker({value,onChange}:{value:FontRef;onChange:(ref:FontRef)=>void}) {
  const id=useId(),button=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),list=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),file=useRef<HTMLInputElement>(null);
  const [open,setOpen]=useState(false),[position,setPosition]=useState({left:0,top:0,width:340,maxHeight:480});
  const [fonts,setFonts]=useState<CatalogFont[]>([]),[uploads,setUploads]=useState<UploadedFont[]>([]),[error,setError]=useState('');
  const [query,setQuery]=useState(''),[filter,setFilter]=useState<Filter>('recommended'),[active,setActive]=useState(0),[scroll,setScroll]=useState(0);
  const current=usePreview(()=>previewRef(value),`${value.source}-${value.id}-${value.weight}-${value.italic}`);
  useEffect(()=>{if(!open)return;loadCatalog().then(setFonts).catch(e=>setError(e.message));listUploads().then(setUploads);},[open]);
  const shown=useMemo(()=>{
    const mine=uploads.map(u=>({id:u.id,family:u.family,category:'d' as Category,weights:[u.weight],italic:u.italic,subsets:[],upload:true}));
    const q=query.trim().toLowerCase();
    let pool:(CatalogFont&{upload?:boolean})[]=filter==='mine'?mine:filter==='recommended'&&!q?recommended.map(r=>fonts.find(f=>f.id===r)).filter((f):f is CatalogFont=>!!f)
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
    try{const ref=await uploadFont(f);setUploads(await listUploads());menu.current?.hidePopover();onChange(ref);}catch(e){setError(e instanceof Error?e.message:'This font could not be read.');}
  }
  const height=Math.max(120,position.maxHeight-150),first=Math.max(0,Math.floor(scroll/ROW)-4),last=Math.min(shown.length,Math.ceil((scroll+height)/ROW)+4);
  return <div className="font-picker">
    <span className="stitch-label" id={`${id}-label`}>Font</span>
    <button ref={button} type="button" className="font-button" aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-label={`Font: ${value.family}`} popoverTarget={id} onClick={place}>
      <span className="font-button-sample" style={current?{fontFamily:`'${current}'`}:undefined}>{value.family}</span>
      <span className="stitch-chevron" aria-hidden="true">⌄</span>
    </button>
    <div ref={menu} id={id} className="font-menu" popover="auto" role="dialog" aria-labelledby={`${id}-label`} style={position}
      onToggle={e=>{const shown=e.currentTarget.matches(':popover-open');setOpen(shown);if(shown){setError('');requestAnimationFrame(()=>input.current?.focus());}}}>
      <input ref={input} className="font-search" type="search" placeholder={`Search ${fonts.length?fonts.length.toLocaleString():''} fonts`} aria-label="Search fonts" role="combobox" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={shown[active]?`${id}-${shown[active].id}`:undefined} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={keys}/>
      <div className="font-filters" role="group" aria-label="Font category">{filters.filter(f=>f.id!=='mine'||uploads.length).map(f=><button key={f.id} type="button" aria-pressed={filter===f.id} onClick={()=>setFilter(f.id)}>{f.label}</button>)}</div>
      <div ref={list} id={`${id}-list`} className="font-list" role="listbox" aria-label="Fonts" style={{height}} onScroll={e=>setScroll(e.currentTarget.scrollTop)}>
        <div style={{height:shown.length*ROW,position:'relative'}}>
          {shown.slice(first,last).map((font,i)=><div key={font.id} style={{position:'absolute',top:(first+i)*ROW,left:0,right:0,height:ROW}}>
            <FontRow font={font} id={`${id}-${font.id}`} selected={font.id===value.id} active={first+i===active} onPick={()=>pick(font)}/>
          </div>)}
        </div>
        {!shown.length&&<p className="empty-list">{fonts.length||error?'No matching fonts':'Loading fonts…'}</p>}
      </div>
      {error&&<p className="font-error" role="alert">{error}</p>}
      <div className="font-footer"><span>{shown.length.toLocaleString()} fonts · Open licence</span><button type="button" className="text-button" onClick={()=>file.current?.click()}>Upload font…</button>
        <input ref={file} type="file" className="visually-hidden" tabIndex={-1} aria-label="Upload a font file" accept=".ttf,.otf,.woff,.woff2" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value='';}}/></div>
    </div>
  </div>;
}

const shapes:{id:TextLayout;label:string;icon:string}[]=[
  {id:'straight',label:'Straight',icon:'M3 15h18'},{id:'arc',label:'Arc',icon:'M3 17C6 7 18 7 21 17'},
  {id:'wave',label:'Wave',icon:'M2 12c3-6 6-6 8 0s5 6 8 0 3-4 4-3'},{id:'path',label:'Path',icon:'M3 18c4 0 3-11 9-11s4 8 9 8M3 18h0M21 15h0'},
];
const aligns:{id:TextSpec['align'];label:string;icon:string}[]=[{id:'left',label:'Align left',icon:'M4 6h16M4 10h10M4 14h16M4 18h10'},{id:'center',label:'Align centre',icon:'M4 6h16M7 10h10M4 14h16M7 18h10'},{id:'right',label:'Align right',icon:'M4 6h16M10 10h10M4 14h16M10 18h10'}];
const Glyph=({d}:{d:string})=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d}/></svg>;
function Range({label,value,min,max,step=1,format,onChange}:{label:string;value:number;min:number;max:number;step?:number;format?:(n:number)=>string;onChange:(n:number)=>void}) {
  return <label>{label} <span className="field-value">{format?format(value):value}</span><input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>;
}

export type TextPanelProps={
  spec:TextSpec; fill:boolean; loading:boolean; missing:string[]; textArea:RefObject<HTMLTextAreaElement|null>;
  guides:{id:string;name:string}[]; guide:{id:string;name:string}|null;
  onChange:(patch:Partial<TextSpec>,merge?:string)=>void; onUseGuide:(id:string)=>void; onRemoveGuide:()=>void; onDrawPath:()=>void; onConvert:()=>void;
};
export default function TextPanel({spec,fill,loading,missing,textArea,guides,guide,onChange,onUseGuide,onRemoveGuide,onDrawPath,onConvert}:TextPanelProps) {
  const family=usePreview(()=>previewRef(spec.font),`${spec.font.source}-${spec.font.id}-${spec.font.weight}-${spec.font.italic}`);
  const [weights,setWeights]=useState<{weights:number[];italic:boolean}|null>(null);
  useEffect(()=>{
    let live=true;setWeights(null);
    if(spec.font.source==='catalog')loadCatalog().then(all=>{const f=all.find(x=>x.id===spec.font.id);if(live&&f)setWeights({weights:f.weights,italic:f.italic});}).catch(()=>{});
    return()=>{live=false;};
  },[spec.font.id,spec.font.source]);
  const multiline=spec.content.includes('\n'),number=(n:string,[min,max]:readonly [number,number])=>{const v=Number(n);return Number.isFinite(v)&&v>=min&&v<=max?v:null;};
  return <section className="panel-section text-panel" aria-label="Text">
    <div className="settings-heading"><h2>Text</h2>{loading&&<span className="text-status" role="status">Loading font…</span>}</div>
    <textarea ref={textArea} className="text-input" aria-label="Text" rows={2} maxLength={textLimits.content} value={spec.content} spellCheck={false}
      style={family?{fontFamily:`'${family}'`,fontWeight:spec.font.weight,fontStyle:spec.font.italic?'italic':'normal'}:undefined}
      onChange={e=>onChange({content:e.target.value},'content')}/>
    <FontPicker value={spec.font} onChange={font=>onChange({font})}/>
    {spec.font.source==='catalog'&&weights&&(weights.weights.length>1||weights.italic)&&<div className="style-row">
      <label>Weight<select value={spec.font.weight} onChange={e=>onChange({font:{...spec.font,weight:Number(e.target.value)}})}>{weights.weights.map(w=><option key={w} value={w}>{weightNames[w]||w}</option>)}</select></label>
      {weights.italic&&<button type="button" className="italic-toggle" aria-pressed={spec.font.italic} aria-label="Italic" title="Italic" onClick={()=>onChange({font:{...spec.font,italic:!spec.font.italic}})}>I</button>}
    </div>}
    <div className="setting-grid">
      <label>Letter height · mm<input type="number" min={textLimits.size[0]} max={textLimits.size[1]} step=".5" value={Math.round(spec.size*10)/10} onChange={e=>{const n=number(e.target.value,textLimits.size);if(n!==null)onChange({size:n},'size');}}/></label>
      <label>Spacing · %<input type="number" min={textLimits.tracking[0]} max={textLimits.tracking[1]} step="1" value={spec.tracking} onChange={e=>{const n=number(e.target.value,textLimits.tracking);if(n!==null)onChange({tracking:n},'tracking');}}/></label>
    </div>
    <div className="text-row">
      <div className="segmented" role="group" aria-label="Alignment">{aligns.map(a=><button key={a.id} type="button" aria-label={a.label} title={a.label} aria-pressed={spec.align===a.id} onClick={()=>onChange({align:a.id})}><Glyph d={a.icon}/></button>)}</div>
      {multiline&&<label className="inline-number">Lines<input type="number" aria-label="Line spacing" min={textLimits.lineHeight[0]} max={textLimits.lineHeight[1]} step=".1" value={spec.lineHeight} onChange={e=>{const n=number(e.target.value,textLimits.lineHeight);if(n!==null)onChange({lineHeight:n},'lineHeight');}}/></label>}
    </div>
    <span className="stitch-label">Shape</span>
    <div className="segmented shape-switch" role="group" aria-label="Text shape">{shapes.map(s=><button key={s.id} type="button" aria-pressed={spec.layout===s.id} onClick={()=>{if(s.id==='path'&&!spec.path){onChange({layout:'path'});return;}onChange({layout:s.id});}}><Glyph d={s.icon}/><span>{s.label}</span></button>)}</div>
    {spec.layout==='arc'&&<Range label={spec.bend>=0?'Arch up':'Arch down'} value={spec.bend} min={-100} max={100} format={n=>Math.abs(n)===100?'Circle':`${Math.abs(n)}%`} onChange={bend=>onChange({bend},'bend')}/>}
    {spec.layout==='wave'&&<div className="setting-grid">
      <Range label="Height" value={spec.waveHeight} min={0} max={1.5} step={.05} format={n=>`${Math.round(n*100)}%`} onChange={waveHeight=>onChange({waveHeight},'waveHeight')}/>
      <Range label="Length" value={spec.waveLength} min={1} max={20} step={.5} format={n=>`${n}×`} onChange={waveLength=>onChange({waveLength},'waveLength')}/>
    </div>}
    {spec.layout==='path'&&<div className="path-options">
      <div className="path-source">
        <button type="button" onClick={onDrawPath}>{spec.path?'Redraw path':'Draw path'}</button>
        {guides.length>0&&<select aria-label="Follow an existing line" value="" onChange={e=>{if(e.target.value)onUseGuide(e.target.value);}}><option value="">Follow a line…</option>{guides.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>}
      </div>
      {!spec.path&&<p className="text-hint">Draw a path on the hoop, or follow a line or shape you already have.</p>}
      {spec.path&&<>
        <Range label="Position" value={spec.offset} min={0} max={100} format={n=>`${n}%`} onChange={offset=>onChange({offset},'offset')}/>
        <div className="check-row"><label className="check-label"><input type="checkbox" checked={spec.reverse} onChange={e=>onChange({reverse:e.target.checked})}/>Reverse direction</label><label className="check-label"><input type="checkbox" checked={spec.below} onChange={e=>onChange({below:e.target.checked})}/>Below path</label></div>
        {guide&&<button type="button" className="text-button" onClick={onRemoveGuide}>Remove “{guide.name}” from the design</button>}
      </>}
    </div>}
    {spec.layout!=='path'&&<Range label="Rotation" value={Math.round(spec.rotation)} min={-180} max={180} format={n=>`${n}°`} onChange={rotation=>onChange({rotation},'rotation')}/>}
    {fill&&<div className="border-options">
      <label>Border<select value={spec.border?.kind||'none'} onChange={e=>onChange({border:e.target.value==='none'?undefined:{color:spec.border?.color||'#664538',width:spec.border?.width||1,kind:e.target.value as NonNullable<TextSpec['border']>['kind']}})}><option value="none">None</option><option value="running">Running outline</option><option value="bean">Bean outline</option><option value="satin">Satin border</option></select></label>
      {spec.border&&<div className="setting-grid">
        <label>Colour<div className="colour-picker"><input type="color" aria-label="Border colour" value={spec.border.color} onChange={e=>onChange({border:{...spec.border!,color:e.target.value}},'borderColor')}/><span>{spec.border.color.toUpperCase()}</span></div></label>
        {spec.border.kind==='satin'&&<label>Width · mm<input type="number" min={textLimits.borderWidth[0]} max={textLimits.borderWidth[1]} step=".1" value={spec.border.width} onChange={e=>{const n=number(e.target.value,textLimits.borderWidth);if(n!==null)onChange({border:{...spec.border!,width:n}},'borderWidth');}}/></label>}
      </div>}
    </div>}
    {missing.length>0&&<p className="text-warning" role="status">Not in this font: {missing.slice(0,12).join(' ')}</p>}
    {fill&&spec.size<5&&<p className="text-warning">Fill letters under 5 mm lose detail. Use 6 mm or more, or a bean stitch outline.</p>}
    <button type="button" className="text-button convert-text" onClick={onConvert}>Convert to shapes</button>
  </section>;
}
