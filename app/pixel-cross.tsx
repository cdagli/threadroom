'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useT} from './i18n';
import {errorText} from '@/lib/i18n';
import {artworkPixels} from '@/lib/artwork-color';
import {addPixelCross,pixelGrid,type PixelGrid} from '@/lib/pixel-cross';
import type {Project} from '@/lib/project';
export function PixelCrossButton({project,disabled,onChange}:{project:Project;disabled:boolean;onChange:(p:Project,label?:string)=>void}){
  const {t}=useT(),[open,setOpen]=useState(false);return <><button type="button" disabled={disabled} onClick={()=>setOpen(true)}>{t('Pixel art to cross stitch')}</button>{open&&<PixelCross project={project} onChange={onChange} onClose={()=>setOpen(false)}/>}</>;
}
function PixelCross({project,onChange,onClose}:{project:Project;onChange:(p:Project,label?:string)=>void;onClose:()=>void}){
  const {t,formatNumber}=useT(),dialog=useRef<HTMLDialogElement>(null),canvas=useRef<HTMLCanvasElement>(null),title=useId();
  const [src,setSrc]=useState(project.artwork?.src??''),[columns,setColumns]=useState(32),[rows,setRows]=useState(32),[size,setSize]=useState(2),[colours,setColours]=useState(8),[brother,setBrother]=useState(false),[grid,setGrid]=useState<PixelGrid|null>(null),[paint,setPaint]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  useEffect(()=>{dialog.current?.showModal();},[]);
  useEffect(()=>{let cancelled=false;setGrid(null);setError('');if(!src)return;setLoading(true);
    void artworkPixels(src,t).then(p=>{if(!cancelled){setGrid(pixelGrid(p,columns,rows,colours,brother));setPaint(0);}}).catch(e=>{if(!cancelled)setError(errorText(e,t,'Could not read the reference image.'));}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};
  },[src,columns,rows,colours,brother,t]);
  useEffect(()=>{const ctx=canvas.current?.getContext('2d');if(!ctx||!grid)return;ctx.clearRect(0,0,columns*12,rows*12);grid.cells.forEach((c,i)=>{if(c>=0){ctx.fillStyle=grid.palette[c].color;ctx.fillRect(i%columns*12,Math.floor(i/columns)*12,12,12);}});ctx.strokeStyle='#8b8b8b';ctx.lineWidth=.5;ctx.beginPath();for(let x=0;x<=columns;x++){ctx.moveTo(x*12,0);ctx.lineTo(x*12,rows*12);}for(let y=0;y<=rows;y++){ctx.moveTo(0,y*12);ctx.lineTo(columns*12,y*12);}ctx.stroke();},[grid,columns,rows]);
  function draw(e:React.PointerEvent<HTMLCanvasElement>){if(!grid)return;const r=e.currentTarget.getBoundingClientRect(),x=Math.floor((e.clientX-r.left)/r.width*columns),y=Math.floor((e.clientY-r.top)/r.height*rows);if(x<0||y<0||x>=columns||y>=rows)return;setGrid(g=>g&&({...g,cells:g.cells.map((c,i)=>i===y*columns+x?paint:c)}));}
  const number=(label:'Grid columns'|'Grid rows'|'Palette colours',value:number,set:(n:number)=>void,max:number)=><label>{t(label)}<input type="number" min="1" max={max} step="1" value={value} onChange={e=>{const n=e.target.valueAsNumber;if(Number.isInteger(n)&&n>=1&&n<=max)set(n);}}/></label>;
  return createPortal(<dialog ref={dialog} className="pixel-cross-dialog" aria-labelledby={title} onCancel={onClose} onClose={onClose} onKeyDown={e=>e.stopPropagation()} onKeyUp={e=>e.stopPropagation()}><h2 id={title}>{t('Pixel art to cross stitch')}</h2>
    <p className="section-copy">{t('Preview the nearest-colour grid. Choose a colour and paint cells before creating cross stitches.')}</p>
    <label>{t('Import pixel image')}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(!f)return;const reader=new FileReader();reader.onload=()=>setSrc(String(reader.result));reader.onerror=()=>setError(t('Could not read the reference image.'));reader.readAsDataURL(f);}}/></label>
    {project.artwork&&<button type="button" onClick={()=>setSrc(project.artwork!.src)}>{t('Use reference image')}</button>}
    <div className="setting-grid">{number('Grid columns',columns,setColumns,96)}{number('Grid rows',rows,setRows,96)}{number('Palette colours',colours,setColours,32)}<label>{t('Cell size · mm')}<input type="number" min="1" max="20" step=".5" value={size} onChange={e=>{const n=e.target.valueAsNumber;if(n>=1&&n<=20&&Number.isInteger(n*2))setSize(n);}}/></label></div>
    <label className="check-label"><input type="checkbox" checked={brother} onChange={e=>setBrother(e.target.checked)}/>{t('Match Brother threads')}</label>
    <p>{t('Grid dimensions')}: {formatNumber(columns*size)} × {formatNumber(rows*size)} mm</p>
    {loading&&<p role="status">{t('Working…')}</p>}
    {grid&&<><div className="pixel-palette" role="group" aria-label={t('Paint colour')}>{grid.palette.map((p,i)=><button key={i} type="button" aria-pressed={paint===i} title={p.thread?`${p.thread.name} · ${p.thread.code}`:p.color} aria-label={t('Use thread {v0}',{v0:p.color})} onClick={()=>setPaint(i)}><i style={{background:p.color}}/>{p.thread?.code??formatNumber(i+1)}</button>)}<button type="button" aria-pressed={paint===-1} onClick={()=>setPaint(-1)}>{t('Erase cell')}</button></div><canvas ref={canvas} width={columns*12} height={rows*12} role="img" aria-label={t('Pixel cross stitch preview')} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);draw(e);}} onPointerMove={e=>{if(e.buttons===1)draw(e);}}/><p className="section-copy">{t('Painting is optional. Create directly from the preview or paint cells with a pointer.')}</p></>}
    {error&&<p role="alert" className="error">{error}</p>}
    <div className="selection-actions"><button type="button" disabled={!grid||loading} onClick={()=>{if(!grid)return;try{onChange(addPixelCross(project,grid,size,t),t('Cross stitches created'));onClose();}catch(e){setError(errorText(e,t,'Invalid pixel grid settings.'));}}}>{t('Create cross stitches')}</button><button type="button" onClick={onClose}>{t('Cancel')}</button></div>
  </dialog>,document.body);
}
