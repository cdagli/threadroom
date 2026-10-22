'use client';
import {useState} from 'react';
import dynamic from 'next/dynamic';
import {Loading} from './panel-loading';
const Worksheet=dynamic(()=>import('./worksheet-dialog'),{loading:Loading});
import {useT} from './i18n';
import {type Compiled,type Project} from '@/lib/project';
import {estimatedSeconds,production,sewingSpeed} from '@/lib/production';
import {type Units} from '@/lib/view-settings';

export function SewingSpeed({project,onChange}:{project:Project;onChange:(p:Project)=>void}){
  const {t}=useT();return <label>{t('Sewing speed · stitches/min')}<input type="number" min={production.minSpeed} max={production.maxSpeed} step="50" value={sewingSpeed(project)} onChange={e=>{const n=Number(e.target.value);if(n>=production.minSpeed&&n<=production.maxSpeed)onChange({...project,sewingSpeed:n});}}/></label>;
}
export function SewingTime({compiled,project}:{compiled:Compiled|null;project:Project}){
  const {t}=useT();return <p className="section-copy">{t('Estimated sewing time')}: <strong>{compiled?t('≈ {minutes} min',{minutes:Math.ceil(estimatedSeconds(compiled.stats,sewingSpeed(project))/60)}):'—'}</strong></p>;
}
export function WorksheetButton({project,compiled,units='mm',disabled=false,menu=false}:{project:Project;compiled:Compiled|null;units?:Units;disabled?:boolean;menu?:boolean}){
  const {t}=useT(),[snapshot,setSnapshot]=useState<{project:Project;compiled:Compiled}|null>(null);
  return <><button type="button" role={menu?'menuitem':undefined} disabled={disabled||!compiled} title={!compiled?t('Worksheet needs up-to-date stitches.'):undefined} onClick={e=>{const pop=e.currentTarget.closest<HTMLElement>('[popover]');pop?.hidePopover();if(compiled)setSnapshot({project,compiled});}}>{t('Worksheet')}</button>{snapshot&&<Worksheet {...snapshot} units={units} onClose={()=>setSnapshot(null)}/>}</>;
}
