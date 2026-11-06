'use client';
import {Button,Icon,IconButton,MenuItem,Popover} from '@/design-system';
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
export function SelectionBar({box,view,hoop,canvas,container,rail,allLocked,multi,grouped,edit,orderDisabled,onEdit,onAction,onOrder,onMore}:Props){
  const {t}=useT(),arrange=useRef<HTMLDivElement>(null),arrangeId=useId();
  function actionButton(action:MenuAction,label:Key,icon:string,shortcut?:string){
    return <IconButton variant="ghost" type="button" aria-label={t(label)} title={`${t(label)}${shortcut?` (${shortcut})`:''}`} onClick={()=>onAction(action)}><Icon name={icon}/></IconButton>;
  }
  // Leave room for the rotation handle (25 px offset plus its 9 px hit radius).
  return <SelectionAnchor box={box} view={view} hoop={hoop} canvas={canvas} container={container} rail={rail} topClearance={34} label={t('Selection actions')}>
    {!allLocked&&<>
      {edit&&<Button variant="soft" type="button" className="selection-edit" title={t(edit==='text'?'Edit text':'Edit points')} onClick={onEdit}>{t(edit==='text'?'Edit text':'Edit points')}</Button>}
      {actionButton('duplicate','Duplicate','duplicate','⌘D')}
      {multi&&actionButton('group','groupAction','group','⌘G')}
      {grouped&&actionButton('ungroup','Ungroup','ungroup','⇧⌘G')}
      <IconButton variant="ghost" type="button" className="selection-arrange-button" aria-label={t('Arrange')} title={t('Arrange')} popoverTarget={arrangeId}><Icon name="arrange"/></IconButton>
      <Popover ref={arrange} id={arrangeId} className="selection-arrange" popover="auto" role="group" aria-label={t('Arrange')}>
        {(['top','up','down','bottom'] as const).map((where,i)=><MenuItem variant="ghost" key={where} type="button" disabled={orderDisabled[where]} title={t(`move.${where}`)} onClick={()=>{arrange.current?.hidePopover();onOrder(where);}}><span aria-hidden="true">{['⇈','↑','↓','⇊'][i]}</span>{t(`move.${where}`)}</MenuItem>)}
      </Popover>
    </>}
    {actionButton(allLocked?'unlock':'lock',allLocked?'Unlock':'Lock',allLocked?'unlock':'lock','⌘L')}
    {!allLocked&&<IconButton variant="ghost" type="button" aria-label={t('Delete')} title={t('Delete (Delete key)')} disabled={allLocked} onClick={()=>onAction('delete')}><Icon name="delete"/></IconButton>}
    <IconButton variant="ghost" type="button" aria-label={t('More')} title={`${t('More')} (⇧F10)`} onClick={e=>{const rect=e.currentTarget.getBoundingClientRect();onMore(rect.left,rect.bottom+4);}}><Icon name="more"/></IconButton>
  </SelectionAnchor>;
}
