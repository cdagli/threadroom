'use client';
import {useMemo,useState} from 'react';
import dynamic from 'next/dynamic';
import {Loading} from './panel-loading';
import {useT} from './i18n';
import {visibleCommands} from '@/lib/layers';
import type {Compiled,Project} from '@/lib/project';
export const SVGImportChoice=dynamic(()=>import('./svg-import-choice'),{loading:Loading});
const ImageOptions=dynamic(()=>import('./image-options'),{loading:Loading});
export function ExportImageButton({project,compiled,disabled}:{project:Project;compiled:Compiled|null;disabled:boolean}){
  const {t}=useT(),[open,setOpen]=useState(false),commands=useMemo(()=>compiled?visibleCommands(compiled.commands,project.objects).commands:[],[compiled,project.objects]);
  return <><button role="menuitem" disabled={disabled||!compiled||!commands.some(c=>c.type==='stitch')} title={!compiled?t('Image export needs up-to-date stitches.'):undefined} onClick={e=>{e.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover();setOpen(true);}}>{t('Export image')}</button>{open&&compiled&&<ImageOptions project={project} compiled={compiled} onClose={()=>setOpen(false)}/>}</>;
}
