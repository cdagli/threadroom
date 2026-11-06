'use client';
import {Input} from '@/design-system';
import {memo,useMemo} from 'react';
import {useT} from './i18n';
import type {Command} from '@/lib/project';
import type {ViewSettings} from '@/lib/view-settings';
import {overlayPaths} from '@/lib/stitch-overlays';
export function OverlayControls({value,onChange}:{value:ViewSettings;onChange:(patch:Partial<ViewSettings>)=>void}){
  const {t}=useT();return <div className="overlay-controls" role="group" aria-label={t('Stitch overlays')}>{(['showJumps','showTrims','showTies','showNeedlePoints'] as const).map((key,i)=><label className="check-label" key={key}><Input type="checkbox" checked={value[key]} onChange={e=>onChange({[key]:e.target.checked})}/>{t((['Show jumps','Show trims','Show ties','Show selected needle points'] as const)[i])}</label>)}</div>;
}
export const StitchOverlays=memo(function StitchOverlays({commands,count,selection,scale,view}:{commands:Command[];count:number;selection:string[];scale:number;view:ViewSettings}){
  const selectionKey=view.showNeedlePoints?JSON.stringify(selection):'';
  const paths=useMemo(()=>view.showTrims||view.showTies||view.showNeedlePoints?overlayPaths(commands,count,view.showNeedlePoints?selection:[],scale):{trims:'',ties:'',needles:''},[commands,count,selectionKey,scale,view.showTrims,view.showTies,view.showNeedlePoints]);
  return <g pointerEvents="none">{view.showTrims&&<path d={paths.trims} fill="none" stroke="var(--danger)" strokeWidth={1.8/scale} strokeLinecap="round"/>}{view.showTies&&<path d={paths.ties} fill="var(--success)" stroke="var(--surface-raised)" strokeWidth={1/scale}/>}{view.showNeedlePoints&&<path d={paths.needles} fill="var(--text)"/>}</g>;
});
