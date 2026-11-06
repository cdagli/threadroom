'use client';
import {Button,Icon,IconButton,Input} from '@/design-system';
import {memo} from 'react';
import {useT} from './i18n';
import type {RefImage} from '@/lib/project';

type Props={images:RefImage[];active:string|null;selected:string|null;disabled:boolean;onSelect:(id:string)=>void;onChange:(id:string,patch:Partial<RefImage>,merge?:string)=>void;onMove:(id:string,delta:number)=>void;onDelete:(id:string)=>void};
const path=(d:string)=><Icon size={15} path={d}/>;
const eye='M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7m10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6',slash='m3 3 18 18',trash='M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7';
// Ember's image list: the top row is drawn last (on top); every image stays under the stitches.
export default memo(function ImagesPanel({images,active,selected,disabled,onSelect,onChange,onMove,onDelete}:Props){
  const {t,formatNumber}=useT(),current=images.find(i=>i.id===active),rows=[...images].reverse();
  return <div className="image-list-section">
    <ul className="image-list" aria-label={t("Reference images")}>{rows.map((i,row)=><li key={i.id} className={`image-row${i.id===selected?' selected':''}${i.hidden?' hidden-image':''}${i.locked?' locked-image':''}`}>
      <Button variant="secondary" className="image-select" aria-pressed={i.id===selected} title={i.locked?t("Locked images can be selected here, not on the canvas"):t("Select to move, scale or rotate on the canvas")} onClick={()=>onSelect(i.id)}>
        <img src={i.src} alt="" width={36} height={36}/><span>{i.name}</span>
      </Button>
      <IconButton className="image-toggle" aria-pressed={!!i.hidden} aria-label={i.hidden?t("Show “{v0}”",{v0:i.name}):t("Hide “{v0}”",{v0:i.name})} title={i.hidden?t("Show image"):t("Hide image")} disabled={disabled} onClick={()=>onChange(i.id,{hidden:i.hidden?undefined:true})}>{path(i.hidden?eye+slash:eye)}</IconButton>
      <IconButton className="image-toggle" aria-pressed={!!i.locked} aria-label={i.locked?t("Unlock “{v0}”",{v0:i.name}):t("Lock “{v0}”",{v0:i.name})} title={i.locked?t("Unlock image"):t("Lock image: it can’t be selected on the canvas")} disabled={disabled} onClick={()=>onChange(i.id,{locked:i.locked?undefined:true})}>{path(i.locked?'M6 11h12v10H6V11m2 0V8a4 4 0 0 1 8 0v3':'M6 11h12v10H6V11m2 0V8a4 4 0 0 1 7.7-1.5')}</IconButton>
      <IconButton className="image-toggle" aria-label={t("Bring “{v0}” forward",{v0:i.name})} title={t("Bring forward")} disabled={disabled||row===0} onClick={()=>onMove(i.id,1)}>↑</IconButton>
      <IconButton className="image-toggle" aria-label={t("Send “{v0}” backward",{v0:i.name})} title={t("Send backward")} disabled={disabled||row===rows.length-1} onClick={()=>onMove(i.id,-1)}>↓</IconButton>
      <IconButton className="image-toggle" aria-label={t("Delete “{v0}”",{v0:i.name})} title={t("Delete image")} disabled={disabled||i.locked} onClick={()=>onDelete(i.id)}>{path(trash)}</IconButton>
    </li>)}</ul>
    {current&&<fieldset className="image-settings" disabled={disabled||current.locked}>
      <div className="asset-name" title={current.name}>{current.id===selected?current.name:t("Top visible image: {v0}",{v0:current.name})}</div>
      <label>{t("Image width · mm")}<Input key={`${current.id}-${current.width.toFixed(2)}`} type="number" min="5" max="500" step="1" defaultValue={Math.round(current.width*10)/10} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} onBlur={e=>{const w=e.currentTarget.valueAsNumber;if(w>=5&&w<=500&&Math.abs(w-current.width)>.05){const height=current.height*w/current.width;onChange(current.id,{width:w,height,x:current.x+current.width/2-w/2,y:current.y+current.height/2-height/2});}}}/></label>
      <label>{t("Reference opacity")} <span className="field-value">{formatNumber(Math.round(current.opacity*100))}%</span><Input type="range" min=".05" max="1" step=".05" value={current.opacity} onChange={e=>onChange(current.id,{opacity:Number(e.target.value)},'opacity')}/></label>
    </fieldset>}
  </div>;
});
