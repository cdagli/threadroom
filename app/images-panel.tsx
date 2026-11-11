'use client';
import {SelectionRow,Icon,IconButton} from '@/design-system';
import {memo} from 'react';
import {useT} from './i18n';
import type {RefImage} from '@/lib/project';

type Props={images:RefImage[];selected:string|null;disabled:boolean;onSelect:(id:string)=>void;onChange:(id:string,patch:Partial<RefImage>,merge?:string)=>void;onMove:(id:string,delta:number)=>void;onDelete:(id:string)=>void};
const path=(d:string)=><Icon size={15} path={d}/>;
const trash='M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7';
// Ember's image list: the top row is drawn last (on top); every image stays under the stitches.
export default memo(function ImagesPanel({images,selected,disabled,onSelect,onChange,onMove,onDelete}:Props){
  const {t}=useT(),rows=[...images].reverse();
  return <div className="image-list-section">
    <ul className="image-list" aria-label={t("Reference images")}>{rows.map((i,row)=><li key={i.id} className={`image-row${i.id===selected?' selected':''}${i.hidden?' hidden-image':''}${i.locked?' locked-image':''}`}>
      <SelectionRow className="image-select" size="lg" aria-pressed={i.id===selected} title={i.locked?t("Locked images can be selected here, not on the canvas"):t("Select to move, scale or rotate on the canvas")} disabled={disabled} onClick={()=>onSelect(i.id)}>
        <img src={i.src} alt="" width={36} height={36}/><span>{i.name}</span>
      </SelectionRow>
      <div className="image-row-actions">
      <IconButton className="image-toggle" size="sm" aria-pressed={!!i.locked} aria-label={i.locked?t("Unlock “{v0}”",{v0:i.name}):t("Lock “{v0}”",{v0:i.name})} title={i.locked?t("Unlock image"):t("Lock image: it can’t be selected on the canvas")} disabled={disabled} onClick={()=>onChange(i.id,{locked:i.locked?undefined:true})}>{path(i.locked?'M6 11h12v10H6V11m2 0V8a4 4 0 0 1 8 0v3':'M6 11h12v10H6V11m2 0V8a4 4 0 0 1 7.7-1.5')}</IconButton>
      <IconButton className="image-toggle" size="sm" aria-label={t("Bring “{v0}” forward",{v0:i.name})} title={t("Bring forward")} disabled={disabled||row===0} onClick={()=>onMove(i.id,1)}>↑</IconButton>
      <IconButton className="image-toggle" size="sm" aria-label={t("Send “{v0}” backward",{v0:i.name})} title={t("Send backward")} disabled={disabled||row===rows.length-1} onClick={()=>onMove(i.id,-1)}>↓</IconButton>
      <IconButton className="image-toggle" size="sm" aria-label={t("Delete “{v0}”",{v0:i.name})} variant="danger" title={t("Delete image")} disabled={disabled||i.locked} onClick={()=>onDelete(i.id)}>{path(trash)}</IconButton>
      </div>
    </li>)}</ul>

  </div>;
});
