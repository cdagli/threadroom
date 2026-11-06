'use client';
import dynamic from 'next/dynamic';
import {useState,type ComponentProps} from 'react';
import {useT} from './i18n';
import {Loading} from './panel-loading';
import {Section} from './settings-section';
import type MapToPathContent from './map-to-path';
const Content=dynamic(()=>import('./map-to-path'),{loading:Loading});
export function MapToPath(props:Omit<ComponentProps<typeof MapToPathContent>,'active'>&{disabled:boolean}){
  const {t}=useT(),binding=props.project.groups?.some(g=>g.pathBinding&&(props.selection.some(id=>g.pathBinding!.members.flat().includes(id))||props.selection.includes(g.pathBinding.pathId))),[opened,setOpened]=useState(false),[expanded,setExpanded]=useState(false);
  return <fieldset className="tool-section map-to-path" disabled={props.disabled}><Section id="map-to-path" title={t('Map to path')} forceOpen={!!binding} onToggle={open=>{setExpanded(open);if(open)setOpened(true);}}>{(opened||binding)&&<Content {...props} active={expanded||!!binding}/>}</Section></fieldset>;
}
