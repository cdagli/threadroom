'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useT} from './i18n';
import {exportImage,imageFilename,imageSize} from '@/lib/image-export';
import type {Compiled,Project} from '@/lib/project';

function Modal({title,children,onClose}:{title:string;children:React.ReactNode;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),id=useId();useEffect(()=>{dialog.current?.showModal();},[]);
  return createPortal(<dialog ref={dialog} className="io-dialog" aria-labelledby={id} onCancel={onClose} onClose={onClose} onKeyDown={e=>e.stopPropagation()} onKeyUp={e=>e.stopPropagation()}><h2 id={id}>{title}</h2>{children}</dialog>,document.body);
}
export function SVGImportChoice({file,onChoose,onClose}:{file:File;onChoose:(shapes:boolean)=>void;onClose:()=>void}){
  const {t}=useT();return <Modal title={t('Import SVG')} onClose={onClose}><p>{file.name}</p><p>{t('Import editable shapes, or keep the SVG as artwork for tracing.')}</p><div className="io-actions"><button onClick={()=>onChoose(true)}>{t('Import as shapes')}</button><button onClick={()=>onChoose(false)}>{t('Import as artwork')}</button><button onClick={onClose}>{t('Cancel')}</button></div></Modal>;
}
export function ExportImageButton({project,compiled,disabled}:{project:Project;compiled:Compiled|null;disabled:boolean}){
  const {t}=useT(),[open,setOpen]=useState(false);
  return <><button role="menuitem" disabled={disabled||!compiled?.commands.some(c=>c.type==='stitch')} title={!compiled?t('Image export needs up-to-date stitches.'):undefined} onClick={e=>{e.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover();setOpen(true);}}>{t('Export image')}</button>{open&&compiled&&<ImageOptions project={project} compiled={compiled} onClose={()=>setOpen(false)}/>}</>;
}
function ImageOptions({project,compiled,onClose}:{project:Project;compiled:Compiled;onClose:()=>void}){
  const {t,formatNumber}=useT(),[scale,setScale]=useState(300/25.4),[transparent,setTransparent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(false),size=imageSize(compiled,scale),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  async function save(){setBusy(true);setError(false);try{const blob=await exportImage(compiled,project.fabric,scale,transparent);if(!mounted.current)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=imageFilename(project.name);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);onClose();}catch{if(mounted.current)setError(true);}finally{if(mounted.current)setBusy(false);}}
  return <Modal title={t('Export image')} onClose={onClose}><label>{t('Image resolution')}<select value={scale} disabled={busy} onChange={e=>setScale(Number(e.target.value))}>{[5,300/25.4,20,40].map(n=><option key={n} value={n}>{t('{value} px/mm',{value:formatNumber(n,2)})}</option>)}</select></label><label className="check-label"><input type="checkbox" checked={transparent} disabled={busy} onChange={e=>setTransparent(e.target.checked)}/>{t('Transparent background')}</label><p>{t('Image dimensions',{width:size.pixelWidth,height:size.pixelHeight})}</p><p>{t('Includes the full stitch plan with a 5 mm margin. Maximum 8,000 pixels per side.')}</p>{error&&<p role="alert">{t('The PNG image could not be exported.')}</p>}<div className="io-actions"><button disabled={busy} onClick={()=>void save()}>{busy?t('Rendering image…'):t('Download PNG')}</button><button onClick={onClose}>{t('Cancel')}</button></div></Modal>;
}
