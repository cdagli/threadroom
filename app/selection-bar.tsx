'use client';
import {useId,useRef,type RefObject} from 'react';
import type {Viewport} from '@/lib/viewport';
import type {Rect} from '@/lib/editing';
import type {MenuAction} from '@/lib/context-menu';
import type {Key} from '@/lib/i18n';
import {useT} from './i18n';
import {SelectionAnchor} from './selection-anchor';

type Order='top'|'up'|'down'|'bottom';
type Props={
  box:Rect;view:Viewport;hoop:{width:number;height:number};
  canvas:RefObject<SVGSVGElement|null>;container:RefObject<HTMLElement|null>;rail:RefObject<HTMLElement|null>;
  allLocked:boolean;multi:boolean;grouped:boolean;edit:'text'|'points'|null;
  orderDisabled:Record<Order,boolean>;
  onEdit:()=>void;onAction:(action:MenuAction)=>void;onOrder:(where:Order)=>void;onMore:(x:number,y:number)=>void;
};
const paths={
  duplicate:'M9 9h11v11H9V9M15 9V4H4v11h5',
  group:'M3 8V3h5m8 0h5v5m0 8v5h-5M8 21H3v-5M8 8h8v8H8V8',
  ungroup:'M3 8V3h5m8 0h5v5m0 8v5h-5M8 21H3v-5M7 7h4v4H7V7m6 6h4v4h-4v-4',
  arrange:'M6 4v16m-3-3 3 3 3-3M13 5h8m-8 7h6m-6 7h4',
  lock:'M6 11h12v10H6V11m2 0V8a4 4 0 0 1 8 0v3',
  unlock:'M6 11h12v10H6V11m2 0V8a4 4 0 0 1 7.5-2',
  delete:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  more:'M5 12h0m7 0h0m7 0h0',
};
function Icon({name}:{name:keyof typeof paths}){
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name==='more'?3:1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}

export function SelectionBar({box,view,hoop,canvas,container,rail,allLocked,multi,grouped,edit,orderDisabled,onEdit,onAction,onOrder,onMore}:Props){
  const {t}=useT(),arrange=useRef<HTMLDivElement>(null),arrangeId=useId();
  function actionButton(action:MenuAction,label:Key,icon:keyof typeof paths,shortcut?:string){
    return <button type="button" aria-label={t(label)} title={`${t(label)}${shortcut?` (${shortcut})`:''}`} onClick={()=>onAction(action)}><Icon name={icon}/></button>;
  }
  // Leave room for the rotation handle (25 px offset plus its 9 px hit radius).
  return <SelectionAnchor box={box} view={view} hoop={hoop} canvas={canvas} container={container} rail={rail} topClearance={34} label={t('Selection actions')}>
    {!allLocked&&<>
      {edit&&<button type="button" className="selection-edit" title={t(edit==='text'?'Edit text':'Edit points')} onClick={onEdit}>{t(edit==='text'?'Edit text':'Edit points')}</button>}
      {actionButton('duplicate','Duplicate','duplicate','⌘D')}
      {multi&&actionButton('group','groupAction','group','⌘G')}
      {grouped&&actionButton('ungroup','Ungroup','ungroup','⇧⌘G')}
      <button type="button" className="selection-arrange-button" aria-label={t('Arrange')} title={t('Arrange')} popoverTarget={arrangeId}><Icon name="arrange"/></button>
      <div ref={arrange} id={arrangeId} className="selection-arrange" popover="auto" role="group" aria-label={t('Arrange')}>
        {(['top','up','down','bottom'] as const).map((where,i)=><button key={where} type="button" disabled={orderDisabled[where]} title={t(`move.${where}`)} onClick={()=>{arrange.current?.hidePopover();onOrder(where);}}><span aria-hidden="true">{['⇈','↑','↓','⇊'][i]}</span>{t(`move.${where}`)}</button>)}
      </div>
    </>}
    {actionButton(allLocked?'unlock':'lock',allLocked?'Unlock':'Lock',allLocked?'unlock':'lock','⌘L')}
    {!allLocked&&<button type="button" aria-label={t('Delete')} title={t('Delete (Delete key)')} disabled={allLocked} onClick={()=>onAction('delete')}><Icon name="delete"/></button>}
    <button type="button" aria-label={t('More')} title={`${t('More')} (⇧F10)`} onClick={e=>{const rect=e.currentTarget.getBoundingClientRect();onMore(rect.left,rect.bottom+4);}}><Icon name="more"/></button>
  </SelectionAnchor>;
}
