'use client';
import {memo,useState} from 'react';
import {useT} from './i18n';
import {shapeOptions,cutHoles,flattenOverlaps,combineShapes,offsetShapes,type ShapeResult} from '@/lib/shape-ops';
import {pathData,type Point,type Project} from '@/lib/project';

// Shape section of the object settings: booleans, cut holes, flatten, offset and the two drawing modes.
// keep (Keep cutting shapes) lives in the studio so the canvas menu's Cut holes follows the same choice.
export function ShapeTools({project,selection,disabled,keep,onKeep,onResult,onMode}:{project:Project;selection:string[];disabled:boolean;keep:boolean;onKeep:(keep:boolean)=>void;onResult:(run:()=>ShapeResult)=>void;onMode:(mode:'holes'|'knife')=>void}){
  const {t}=useT(),[mm,setMm]=useState(1),[copy,setCopy]=useState(true);
  const can=shapeOptions(project,selection),single=selection.length===1;
  const amount=Math.abs(mm);
  return <fieldset disabled={disabled} className="panel-section selection-tools shape-tools"><h2>{t('Shape tools')}</h2>
    {can.combine&&<div className="selection-actions">{(['union','subtract','intersect'] as const).map((op,i)=><button key={op} type="button" title={t((['Join the shapes into one; the first keeps its stitch settings','Remove the later shapes from the first one','Keep only the area where all shapes overlap'] as const)[i])} onClick={()=>onResult(()=>combineShapes(project,selection,op,t))}>{t((['Union','Subtract','Intersect'] as const)[i])}</button>)}</div>}
    {(can.cut||can.flatten)&&<div className="selection-actions">
      <button type="button" disabled={!can.cut} title={t('Cut the other shapes out of the fill sewn first')} onClick={()=>onResult(()=>cutHoles(project,selection,keep,t))}>{t('Cut holes')}</button>
      <button type="button" disabled={!can.flatten} title={t('Remove fill hidden under later fills, keeping a 0.4 mm overlap')} onClick={()=>onResult(()=>flattenOverlaps(project,selection,undefined,t))}>{t('Flatten overlaps')}</button>
    </div>}
    {can.cut&&<label className="check-label"><input type="checkbox" checked={keep} onChange={e=>onKeep(e.target.checked)}/>{t('Keep cutting shapes')}</label>}
    {can.offset&&<><div className="setting-grid shape-offset"><label>{t('Offset · mm')}<input type="number" min=".05" max="20" step=".1" value={mm} onChange={e=>{const n=e.target.valueAsNumber;if(Number.isFinite(n))setMm(n);}}/></label>
      <div className="selection-actions"><button type="button" title={t('Grow the outline by this distance with rounded corners')} onClick={()=>onResult(()=>offsetShapes(project,selection,amount,copy,t))}>{t('Grow')}</button><button type="button" title={t('Shrink the outline by this distance')} onClick={()=>onResult(()=>offsetShapes(project,selection,-amount,copy,t))}>{t('Shrink')}</button></div></div>
      <label className="check-label"><input type="checkbox" checked={copy} onChange={e=>setCopy(e.target.checked)}/>{t('Add as a new object')}</label></>}
    <div className="selection-actions">
      <button type="button" disabled={!(single&&can.fills===1)} title={t('Draw closed shapes inside the selected fill to punch holes (O)')} onClick={()=>onMode('holes')}>{t('Draw holes')}</button>
      <button type="button" disabled={!can.knife} title={t('Split shapes along a straight line (K)')} onClick={()=>onMode('knife')}>{t('Knife')}</button>
    </div>
  </fieldset>;
}
export const KnifeOverlay=memo(function KnifeOverlay({a,b,canvasScale}:{a:Point;b:Point;canvasScale:number}){
  return <g pointerEvents="none"><path d={pathData([[a,b]],false)} stroke="var(--surface-raised)" strokeWidth={4/canvasScale} strokeLinecap="round"/><path d={pathData([[a,b]],false)} stroke="var(--danger)" strokeWidth={1.5/canvasScale} strokeDasharray={`${5/canvasScale} ${3/canvasScale}`}/>{[a,b].map((q,i)=><circle key={i} cx={q[0]} cy={q[1]} r={3/canvasScale} fill="var(--danger)"/>)}</g>;
});
