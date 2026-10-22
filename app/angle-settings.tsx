'use client';
import {useT} from './i18n';
import type {StitchObject} from '@/lib/project';
import {crossingGuides,guideLimits,guideMode} from '@/lib/angle-guides';
export type AngleEditing={active:boolean;onToggle:()=>void};
// Fill settings: the Edit angles toggle (Edit flow field for Streamlines) with the guide count.
export function GuideControls({item,angles,onChange}:{item:StitchObject;angles?:AngleEditing;onChange:(patch:Partial<StitchObject>)=>void}){
  const {t}=useT(),mode=guideMode(item),guides=item.angleGuides??[];
  if(!mode||!angles)return null;
  return <div className="guide-controls" style={{display:"grid",gap:6}}><button type="button" className="edit-points-button" aria-pressed={angles.active} title={t(mode==='flow'?'Click twice to add a flow guide; stitches follow its arrow. Drag either end to move it. Delete with an end selected removes that guide.':'Click twice to add an angle guideline. Drag either end to move it. Delete with an end selected removes that guide. Crossing or touching guides turn red.')} onClick={angles.onToggle}>{angles.active?t('Done editing'):t(mode==='flow'?'Edit flow field':'Edit angles')}<kbd>A</kbd></button>
    {guides.length>0&&<div className="field-heading"><span className="field-value inherited">{t(mode==='flow'?'Flow guides · {v0}':'Angle guides · {v0}',{v0:guides.length})}</span><button type="button" className="field-value reset" onClick={()=>onChange({angleGuides:undefined})}>{t('Clear guides')}</button></div>}
    {mode==='angles'&&crossingGuides(guides).some(Boolean)&&<p className="fabric-advice" role="status">{t('Crossing guides are ignored: the first guide sets the angle.')}</p>}
  </div>;
}
// Why the angle input is locked, or null when it is editable.
export function lockedAngle(item:StitchObject,t:ReturnType<typeof useT>['t']):string|null {
  const n=item.angleGuides?.length??0,mode=guideMode(item);
  return mode==='flow'&&n?t('The flow guides set the direction. Change them with Edit flow field.'):mode==='angles'&&n>1?t('More than one stitch angle. Change them with Edit angles.'):null;
}
// Ember's fill Density Control: shown only while two or more guides sweep the rows.
export function DensityControl({item,onChange}:{item:StitchObject;onChange:(patch:Partial<StitchObject>)=>void}){
  const {t,formatNumber}=useT(),on=item.rowShortening??true,trigger=item.densityTrigger??guideLimits.defaultTrigger,[lo,hi]=guideLimits.trigger;
  return <details className="fill-section" open><summary>{t('Density control')}</summary><p className="fabric-advice">{t('Where rows converge closer than the trigger × row space, alternate rows stop short so the inside of a bend is not overfilled.')}</p>
    <label className="check-label"><input type="checkbox" checked={on} onChange={e=>onChange({rowShortening:e.target.checked?undefined:false})}/>{t('Row shortening')}</label>
    <label><span className="field-heading">{t('Density trigger')} · {formatNumber(trigger,2)}{item.densityTrigger!==undefined?<button type="button" className="field-value reset" onClick={()=>onChange({densityTrigger:undefined})}>{t('Reset')}</button>:<span className="field-value inherited">{t('Default')}</span>}</span><input type="range" min={lo} max={hi} step=".01" disabled={!on} value={trigger} aria-label={t('Density trigger')} onChange={e=>{const n=Number(e.target.value);if(n>=lo&&n<=hi)onChange({densityTrigger:n});}}/></label>
  </details>;
}
