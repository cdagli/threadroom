'use client';
import {useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode} from 'react';
import {layerRows, layerTarget, type LayerRow} from '@/lib/layers';
import {bounds, isFillKind, kindNames, pathData, type Project} from '@/lib/project';

type Props={project:Project;selection:string[];disabled:boolean;imported:boolean;onSelect:(id:string,keys:{ctrlKey:boolean;metaKey:boolean;shiftKey:boolean})=>void;onSelection:(ids:string[])=>void;onRename:(id:string,name:string,group:boolean)=>void;onHide:(ids:string[])=>void;onMove:(ids:string[],index:number,group:string|null,wholeGroup?:string)=>void;children:ReactNode};
function Eye({hidden}:{hidden:boolean}){return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7m10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6"/>{hidden&&<path d="m3 3 18 18"/>}</svg>;}
export default function LayersPanel({project,selection,disabled,imported,onSelect,onSelection,onRename,onHide,onMove,children}:Props){
  const list=useRef<HTMLDivElement>(null),drag=useRef<{ids:string[];start:[number,number];active:boolean;index:number;group:string|null;wholeGroup?:string}|null>(null),skipClick=useRef(false);
  const [collapsed,setCollapsed]=useState(new Set<string>()),[line,setLine]=useState<number|null>(null),[targetGroup,setTargetGroup]=useState<string|null>(null),[renaming,setRenaming]=useState<{id:string;name:string;group:boolean}|null>(null),rename=useRef(renaming);rename.current=renaming;
  const rows=layerRows(project,collapsed);
  function finishRename(save:boolean){const r=rename.current;rename.current=null;setRenaming(null);if(save&&r)onRename(r.id,r.name.trim()||(r.group?project.groups?.find(g=>g.id===r.id)?.name:project.objects.find(o=>o.id===r.id)?.name)||'Group',r.group);}
  function down(e:ReactPointerEvent<HTMLDivElement>,row:LayerRow){
    if(disabled||e.button!==0||(e.target as HTMLElement).closest('button,input'))return;
    skipClick.current=false;drag.current={ids:row.type==='group'?row.ids:selection.includes(row.ids[0])?selection:row.ids,start:[e.clientX,e.clientY],active:false,index:row.index,group:row.group??null,wholeGroup:row.type==='group'?row.group:undefined};
    try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* Pointer-up cancels an inactive drag. */}
  }
  function move(e:ReactPointerEvent<HTMLDivElement>){
    const d=drag.current,el=list.current;if(!d||!el)return;
    if(!d.active){if(Math.hypot(e.clientX-d.start[0],e.clientY-d.start[1])<5)return;d.active=true;onSelection(d.ids);}
    e.preventDefault();const elements=Array.from(el.querySelectorAll<HTMLElement>('[data-layer]')),element=elements.find(r=>e.clientY<r.getBoundingClientRect().bottom)??elements.at(-1);if(!element)return;
    const row=rows.find(r=>r.key===element.dataset.layer)!;let box=element.getBoundingClientRect(),after=e.clientY>box.top+box.height/2;
    const target=layerTarget(row,after,d.wholeGroup!==undefined),outside=e.clientY>elements.at(-1)!.getBoundingClientRect().bottom+4;d.index=outside?project.objects.length:target.index;d.group=outside?null:target.group;
    // Whole groups cannot nest: show the line at the block boundary moveGroup will use.
    if(d.wholeGroup!==undefined&&row.group!==undefined){
      const header=rows.find(r=>r.type==='group'&&r.group===row.group)!;
      if(d.index<header.end){d.index=header.index;box=elements.find(r=>r.dataset.layer===header.key)!.getBoundingClientRect();after=false;}
      else{const last=elements.filter(r=>rows.find(x=>x.key===r.dataset.layer)?.group===row.group).at(-1)!;box=last.getBoundingClientRect();after=true;}
    }
    setTargetGroup(d.group);setLine((after?box.bottom:box.top)-el.getBoundingClientRect().top+el.scrollTop);
    const area=el.getBoundingClientRect();if(e.clientY<area.top+24)el.scrollTop-=10;else if(e.clientY>area.bottom-24)el.scrollTop+=10;
  }
  function up(e:ReactPointerEvent<HTMLDivElement>,cancel=false){const d=drag.current;drag.current=null;setLine(null);setTargetGroup(null);if(d?.active){skipClick.current=true;if(!cancel)onMove(d.ids,d.index,d.group,d.wholeGroup);}if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}
  function nameInput(){return <input aria-label={renaming!.group?'Group name':'Layer name'} maxLength={40} autoFocus value={renaming!.name} onFocus={e=>e.target.select()} onChange={e=>setRenaming({...renaming!,name:e.target.value})} onClick={e=>e.stopPropagation()} onBlur={()=>finishRename(true)} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();finishRename(true);}if(e.key==='Escape'){e.preventDefault();finishRename(false);}}}/>;}
  return <section className="panel-section objects-section">
    <div ref={list} className={`object-list ${line!==null?'reordering':''}`} aria-label="Layers" onPointerMove={move} onPointerUp={e=>up(e)} onPointerCancel={e=>up(e,true)} onLostPointerCapture={e=>{if(drag.current)up(e,true);}}>
      {rows.map(row=>{
        if(row.type==='group'){
          const hidden=row.ids.every(id=>project.objects.find(o=>o.id===id)?.hidden),selected=row.ids.every(id=>selection.includes(id));
          return <div key={row.key} data-layer={row.key} className={`object-row group-row ${selected?'selected':''} ${hidden?'hidden-object':''}`} role="button" tabIndex={disabled?-1:0} aria-label={`${row.name}, ${row.ids.length} objects`} aria-pressed={selected} aria-disabled={disabled} onPointerDown={e=>down(e,row)} onClick={()=>{if(skipClick.current){skipClick.current=false;return;}if(!disabled)onSelection(row.ids);}} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();if(!disabled)onSelection(row.ids);}}}>
            <button className={`icon-button group-collapse ${row.collapsed?'':'open'}`} disabled={disabled} aria-label={`${row.collapsed?'Expand':'Collapse'} ${row.name}`} aria-expanded={!row.collapsed} title={row.collapsed?'Expand group':'Collapse group'} onClick={e=>{e.stopPropagation();setCollapsed(c=>{const next=new Set(c);if(next.has(row.group!))next.delete(row.group!);else next.add(row.group!);return next;});}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>
            <span className="layer-name">{renaming?.group&&renaming.id===row.group?nameInput():<strong onDoubleClick={e=>{e.stopPropagation();if(!disabled)setRenaming({id:row.group!,name:row.name,group:true});}}>{row.name}</strong>}<small>{row.ids.length} objects</small></span>
            <button className="icon-button layer-eye" disabled={disabled} aria-label={`${hidden?'Show':'Hide'} ${row.name}`} aria-pressed={!hidden} title={hidden?'Show group':'Hide group (still exported)'} onClick={e=>{e.stopPropagation();onHide(row.ids);}}><Eye hidden={hidden}/></button>
          </div>;
        }
        const o=row.object!,i=row.index,b=bounds([o]),pad=Math.max(b.width,b.height,1)*.1;return <div key={o.id} data-layer={row.key} className={`object-row ${selection.includes(o.id)?'selected':''} ${o.hidden?'hidden-object':''} ${row.group!==undefined?'group-member':''}`} role="button" tabIndex={disabled?-1:0} aria-label={o.name} aria-pressed={selection.includes(o.id)} aria-disabled={disabled} onPointerDown={e=>down(e,row)} onClick={e=>{if(skipClick.current){skipClick.current=false;return;}if(!disabled)onSelect(o.id,e);}} onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!disabled)onSelect(o.id,e);}}}>
        <span className="order">{String(i+1).padStart(2,'0')}</span><svg className="layer-preview" width="32" height="32" viewBox={`${b.x-pad} ${b.y-pad} ${Math.max(b.width,1)+2*pad} ${Math.max(b.height,1)+2*pad}`} aria-hidden="true"><path d={pathData(o.rings,isFillKind(o.kind))} fill={isFillKind(o.kind)?o.color:'none'} fillRule={o.text?'nonzero':'evenodd'} stroke={isFillKind(o.kind)?'none':o.color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round"/></svg>
        <span className="layer-name">{renaming?.id===o.id&&!renaming.group?nameInput():<strong onDoubleClick={e=>{e.stopPropagation();if(!disabled)setRenaming({id:o.id,name:o.name,group:false});}}>{o.name}</strong>}<small>{o.text?`Text · ${o.text.font.family} · ${kindNames[o.kind]}`:kindNames[o.kind]}</small></span>
        <button className="icon-button layer-eye" disabled={disabled} aria-label={`${o.hidden?'Show':'Hide'} ${o.name}`} aria-pressed={!o.hidden} title={o.hidden?'Show object':'Hide object (still exported)'} onClick={e=>{e.stopPropagation();onHide([o.id]);}}><Eye hidden={!!o.hidden}/></button>
      </div>;})}
      {line!==null&&<div className="layer-insertion" style={{top:line}}><span>{targetGroup===null?'Outside groups':project.groups?.find(g=>g.id===targetGroup)?.name}</span></div>}
    </div>
    {!project.objects.length&&<p className="empty-list">{imported?'PES preview only':'No objects'}</p>}
    {children}
  </section>;
}
