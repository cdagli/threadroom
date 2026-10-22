'use client';
import dynamic from 'next/dynamic';
import {useState,type ComponentProps} from 'react';
import {useT} from './i18n';
import {Loading} from './panel-loading';
import type MapToPathContent from './map-to-path';
const Content=dynamic(()=>import('./map-to-path'),{loading:Loading});
export function MapToPath(props:Omit<ComponentProps<typeof MapToPathContent>,'active'>&{disabled:boolean}){
  const {t}=useT(),binding=props.project.groups?.some(g=>g.pathBinding&&(props.selection.some(id=>g.pathBinding!.members.flat().includes(id))||props.selection.includes(g.pathBinding.pathId))),[opened,setOpened]=useState(false),[expanded,setExpanded]=useState(false);
  return <fieldset className="panel-section map-to-path" disabled={props.disabled}><details open={!!binding} onToggle={e=>{setExpanded(e.currentTarget.open);if(e.currentTarget.open)setOpened(true);}}><summary>{t('Map to path')}</summary>{(opened||binding)&&<Content {...props} active={expanded||!!binding}/>}</details></fieldset>;
}
