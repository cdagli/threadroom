'use client';
import {Button,Hint,Input,Section} from '@/design-system';
import {useEffect,useState,type ReactNode} from 'react';
import type {Key} from '@/lib/i18n';
import {useT} from './i18n';
import {shapeOptions,cutHoles,flattenOverlaps,combineShapes,offsetShapes,type ShapeResult} from '@/lib/shape-ops';
import {type Project} from '@/lib/project';

// Shape section of the object settings: booleans, cut holes, flatten, offset and the two drawing modes.
// keep (Keep cutting shapes) lives in the studio so the canvas menu's Cut holes follows the same choice.
export function ShapeTools({project,selection,disabled,keep,onKeep,onResult,onMode,focusOffset=0}:{project:Project;selection:string[];disabled:boolean;keep:boolean;onKeep:(keep:boolean)=>void;onResult:(run:()=>ShapeResult)=>void;onMode:(mode:'holes'|'knife')=>void;focusOffset?:number}){
  useEffect(()=>{if(focusOffset)requestAnimationFrame(()=>{const field=document.querySelector<HTMLInputElement>('.shape-offset input');field?.focus();field?.select();});},[focusOffset]);
  const {t}=useT(),[mm,setMm]=useState(1),[copy,setCopy]=useState(true);
  const can=shapeOptions(project,selection),single=selection.length===1;
  const amount=Math.abs(mm);
  const group=(label:Key,hint:Key,body:ReactNode)=><div className="tool-group"><div className="tool-group-label">{t(label)}<Hint text={t(hint)}/></div>{body}</div>;
  return <fieldset disabled={disabled} className="tool-section selection-tools shape-tools"><Section id="shape-tools" title={t('Shape tools')} openSignal={focusOffset}>
    {can.combine&&group('Combine shapes','hint.combineShapes',<div className="selection-actions">{(['union','subtract','intersect'] as const).map((op,i)=><Button variant="secondary" key={op} type="button" title={t((['Join the shapes into one; the first keeps its stitch settings','Remove the later shapes from the first one','Keep only the area where all shapes overlap'] as const)[i])} onClick={()=>onResult(()=>combineShapes(project,selection,op,t))}>{t((['Union','Subtract','Intersect'] as const)[i])}</Button>)}</div>)}
    {(can.cut||can.flatten)&&group('Overlaps','hint.overlaps',<><div className="selection-actions two">
      <Button variant="secondary" type="button" disabled={!can.cut} title={t('Cut the other shapes out of the fill sewn first')} onClick={()=>onResult(()=>cutHoles(project,selection,keep,t))}>{t('Cut holes')}</Button>
      <Button variant="secondary" type="button" disabled={!can.flatten} title={t('Remove fill hidden under later fills, keeping a 0.4 mm overlap')} onClick={()=>onResult(()=>flattenOverlaps(project,selection,undefined,t))}>{t('Flatten overlaps')}</Button>
    </div>{can.cut&&<label className="check-label"><Input type="checkbox" checked={keep} onChange={e=>onKeep(e.target.checked)}/>{t('Keep cutting shapes')}</label>}</>)}
    {can.offset&&group('Offset outline','hint.offset',<><div className="shape-offset"><Input aria-label={t('Offset · mm')} unit="mm" type="number" min=".05" max="20" step=".1" value={mm} onChange={e=>{const n=e.target.valueAsNumber;if(Number.isFinite(n))setMm(n);}}/>
      <Button variant="secondary" type="button" title={t('Grow the outline by this distance with rounded corners')} onClick={()=>onResult(()=>offsetShapes(project,selection,amount,copy,t))}>{t('Grow')}</Button><Button variant="secondary" type="button" title={t('Shrink the outline by this distance')} onClick={()=>onResult(()=>offsetShapes(project,selection,-amount,copy,t))}>{t('Shrink')}</Button></div>
      <label className="check-label"><Input type="checkbox" checked={copy} onChange={e=>setCopy(e.target.checked)}/>{t('Add as a new object')}</label></>)}
    {group('Draw on the shape','hint.drawOnShape',<div className="selection-actions two">
      <Button variant="secondary" type="button" disabled={!(single&&can.fills===1)} title={t('Draw closed shapes inside the selected fill to punch holes (O)')} onClick={()=>onMode('holes')}>{t('Draw holes')}</Button>
      <Button variant="secondary" type="button" disabled={!can.knife} title={t('Split shapes along a straight line (K)')} onClick={()=>onMode('knife')}>{t('Knife')}</Button>
    </div>)}
  </Section></fieldset>;
}
