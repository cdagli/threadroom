'use client';
import {useState} from 'react';
import dynamic from 'next/dynamic';
import {Loading} from './panel-loading';
import {useT} from './i18n';
import type {Project,RefImage} from '@/lib/project';
const PixelCross=dynamic(()=>import('./pixel-cross-dialog'),{loading:Loading});
// image: the selected (or topmost visible) reference image in project.images.
export function PixelCrossButton({project,image,disabled,onChange}:{project:Project;image?:RefImage;disabled:boolean;onChange:(p:Project,label?:string)=>void}){
  const {t}=useT(),[open,setOpen]=useState(false);return <><button type="button" disabled={disabled} onClick={()=>setOpen(true)}>{t('Pixel art to cross stitch')}</button>{open&&<PixelCross project={project} image={image} onChange={onChange} onClose={()=>setOpen(false)}/>}</>;
}
