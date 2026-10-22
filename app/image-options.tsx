'use client';
import {useEffect,useRef,useState} from 'react';
import {useT} from './i18n';
import {exportCommands,exportImage,imageFilename,imageSize} from '@/lib/image-export';
import type {Compiled,Project} from '@/lib/project';

import {Modal} from './io-modal';
export default function ImageOptions({project,compiled,onClose}:{project:Project;compiled:Compiled;onClose:()=>void}){
  const {t,formatNumber}=useT(),[scale,setScale]=useState(300/25.4),[transparent,setTransparent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(false),[withImages,setWithImages]=useState(false),hasImages=!!project.images?.some(i=>!i.hidden),size=imageSize({commands:exportCommands(compiled,project)},scale),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  async function save(){setBusy(true);setError(false);try{const blob=await exportImage(compiled,project,scale,transparent,withImages&&hasImages);if(!mounted.current)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=imageFilename(project.name);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);onClose();}catch{if(mounted.current)setError(true);}finally{if(mounted.current)setBusy(false);}}
  return <Modal title={t('Export image')} onClose={onClose}><label>{t('Image resolution')}<select value={scale} disabled={busy} onChange={e=>setScale(Number(e.target.value))}>{[5,300/25.4,20,40].map(n=><option key={n} value={n}>{t('{value} px/mm · {dpi} dpi',{value:formatNumber(n,2),dpi:formatNumber(Math.round(n*25.4))})}</option>)}</select></label><label className="check-label"><input type="checkbox" checked={transparent} disabled={busy} onChange={e=>setTransparent(e.target.checked)}/>{t('Transparent background')}</label>{hasImages&&<label className="check-label"><input type="checkbox" checked={withImages} disabled={busy} onChange={e=>setWithImages(e.target.checked)}/>{t('Include reference images')}</label>}<p>{t('Image dimensions',{width:size.pixelWidth,height:size.pixelHeight})}</p><p>{t('Includes the visible stitches with a 5 mm margin. Maximum 8,000 pixels per side.')}</p>{error&&<p role="alert">{t('The PNG image could not be exported.')}</p>}<div className="io-actions"><button disabled={busy} onClick={()=>void save()}>{busy?t('Rendering image…'):t('Download PNG')}</button><button onClick={onClose}>{t('Cancel')}</button></div></Modal>;
}
