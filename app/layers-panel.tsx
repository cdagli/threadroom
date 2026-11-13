'use client';
import {Button,Icon,IconButton,Input,SegmentedControl} from '@/design-system';
import {useT} from './i18n';
import {memo, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode} from 'react';
import {colourGroups, stackRows, stackTarget, type ColourRun, type LayerRow} from '@/lib/layers';
import {threadLabel} from './thread-label';
import {satinFonts} from '@/lib/satin-lettering';
import {objectGeometry} from '@/lib/editor-render';
import {useStableCallback} from './use-stable-callback';
import {isFillKind, kindNames, type Compiled, type StitchObject, type Project} from '@/lib/project';

type Props={project:Project;compiled:Compiled|null;selection:string[];disabled:boolean;imported:boolean;onSelect:(id:string,keys:{ctrlKey:boolean;metaKey:boolean;shiftKey:boolean})=>void;onSelection:(ids:string[])=>void;onRename:(id:string,name:string,group:boolean)=>void;onHide:(ids:string[])=>void;onLock:(ids:string[])=>void;onMove:(ids:string[],index:number,group:string|null,wholeGroup?:string)=>void;onPlace:(ids:string[],index:number)=>void;onPosition:(id:string,position:number)=>void;children:ReactNode};
function Eye({hidden}:{hidden:boolean}){return <Icon size={16} name={hidden?'eyeOff':'eye'}/>;}
function Padlock({locked}:{locked:boolean}){return <Icon size={15} name={locked?'lock':'unlock'}/>;}
export default function LayersPanel({project,compiled,selection,disabled,imported,onSelect,onSelection,onRename,onHide,onLock,onMove,onPlace,onPosition,children}:Props){
  const {t}=useT();
  // Objects view: one row per object; Colours view: one row per thread across the whole design.
  const [view,setView]=useState<'objects'|'colours'>('objects'),[positioning,setPositioning]=useState<{id:string;value:string}|null>(null),position=useRef(positioning);position.current=positioning;
  useEffect(()=>{try{if(localStorage.getItem('threadroom-layers-view')==='colours')setView('colours');}catch{/* Storage is optional. */}},[]);
  function chooseView(next:'objects'|'colours'){setView(next);try{localStorage.setItem('threadroom-layers-view',next);}catch{/* The view still switches. */}}
  const priorRuns=useRef<ColourRun[]>([]);
  const runs=useMemo(()=>{
    if(view!=='colours')return [];
    const previous=new Map(priorRuns.current.map(r=>[r.key,r]));
    return priorRuns.current=colourGroups(project,compiled).map(r=>{
      const old=previous.get(r.key);
      return old&&old.color===r.color&&old.thread===r.thread&&old.index===r.index&&old.end===r.end&&old.stitches===r.stitches&&old.ids.length===r.ids.length&&old.ids.every((id,i)=>id===r.ids[i])?old:r;
    });
  },[view,project.objects,compiled]);
  const list=useRef<HTMLDivElement>(null),drag=useRef<{ids:string[];start:[number,number];active:boolean;index:number;group:string|null;wholeGroup?:string;run?:boolean}|null>(null),skipClick=useRef(false);
  const [collapsed,setCollapsed]=useState(new Set<string>()),[line,setLine]=useState<number|null>(null),[targetGroup,setTargetGroup]=useState<string|null>(null),[renaming,setRenaming]=useState<{id:string;name:string;group:boolean}|null>(null),rename=useRef(renaming);rename.current=renaming;
  const rows=useMemo(()=>stackRows(project,collapsed),[project,collapsed]);
  // The last selected object's row scrolls into view (new objects land at the top of a long list).
  const lastSelected=selection.at(-1);
  useEffect(()=>{if(lastSelected)list.current?.querySelector<HTMLElement>(`[data-layer="object:${CSS.escape(lastSelected)}"]`)?.scrollIntoView({block:'nearest'});},[lastSelected,view]);
  function finishRename(save:boolean){const r=rename.current;rename.current=null;setRenaming(null);if(save&&r)onRename(r.id,r.name.trim()||(r.group?project.groups?.find(g=>g.id===r.id)?.name:project.objects.find(o=>o.id===r.id)?.name)||t("Group"),r.group);}
  function down(e:ReactPointerEvent<HTMLDivElement>,row:LayerRow){
    if(disabled||e.button!==0||(e.target as HTMLElement).closest('button,input'))return;
    skipClick.current=false;drag.current={ids:row.type==='group'?row.ids:selection.includes(row.ids[0])?selection:row.ids,start:[e.clientX,e.clientY],active:false,index:row.index,group:row.group??null,wholeGroup:row.type==='group'?row.group:undefined};
    try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* Pointer-up cancels an inactive drag. */}
  }
  function move(e:ReactPointerEvent<HTMLDivElement>){
    const d=drag.current,el=list.current;if(!d||!el)return;
    if(!d.active){if(Math.hypot(e.clientX-d.start[0],e.clientY-d.start[1])<5)return;d.active=true;onSelection(d.ids);}
    e.preventDefault();const elements=Array.from(el.querySelectorAll<HTMLElement>('[data-layer]')),element=elements.find(r=>e.clientY<r.getBoundingClientRect().bottom)??elements.at(-1);if(!element)return;
    if(d.run){const run=runs.find(r=>r.key===element.dataset.layer);if(!run)return;const box=element.getBoundingClientRect(),after=e.clientY>box.top+box.height/2;d.index=after?run.end:run.index;d.group=null;setLine((after?box.bottom:box.top)-el.getBoundingClientRect().top+el.scrollTop);const area=el.getBoundingClientRect();if(e.clientY<area.top+24)el.scrollTop-=10;else if(e.clientY>area.bottom-24)el.scrollTop+=10;return;}
    const row=rows.find(r=>r.key===element.dataset.layer)!;let box=element.getBoundingClientRect(),after=e.clientY>box.top+box.height/2;
    const target=stackTarget(row,after,d.wholeGroup!==undefined),outside=e.clientY>elements.at(-1)!.getBoundingClientRect().bottom+4;d.index=outside?0:target.index;d.group=outside?null:target.group;
    // Whole groups cannot nest: show the line at the block boundary moveGroup will use.
    if(d.wholeGroup!==undefined&&row.group!==undefined){
      const header=rows.find(r=>r.type==='group'&&r.group===row.group)!;
      if(d.index>header.index){d.index=header.end;box=elements.find(r=>r.dataset.layer===header.key)!.getBoundingClientRect();after=false;}
      else{const last=elements.filter(r=>rows.find(x=>x.key===r.dataset.layer)?.group===row.group).at(-1)!;box=last.getBoundingClientRect();after=true;}
    }
    setTargetGroup(d.group);setLine((after?box.bottom:box.top)-el.getBoundingClientRect().top+el.scrollTop);
    const area=el.getBoundingClientRect();if(e.clientY<area.top+24)el.scrollTop-=10;else if(e.clientY>area.bottom-24)el.scrollTop+=10;
  }
  function up(e:ReactPointerEvent<HTMLDivElement>,cancel=false){const d=drag.current;drag.current=null;setLine(null);setTargetGroup(null);if(d?.active){skipClick.current=true;if(!cancel){if(d.run)onPlace(d.ids,d.index);else onMove(d.ids,d.index,d.group,d.wholeGroup);}}if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}
  function nameInput(){return <Input aria-label={renaming!.group?t("Group name"):t("Layer name")} maxLength={40} autoFocus value={renaming!.name} onFocus={e=>e.target.select()} onChange={e=>setRenaming({...renaming!,name:e.target.value})} onClick={e=>e.stopPropagation()} onBlur={()=>finishRename(true)} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();finishRename(true);}if(e.key==='Escape'){e.preventDefault();finishRename(false);}}}/>;}
  function finishPosition(save:boolean){const p=position.current;position.current=null;setPositioning(null);const n=Number(p?.value);if(save&&p&&p.value.trim()!==''&&Number.isFinite(n))onPosition(p.id,n);}
  function positionInput(){return <Input className="order-input" type="number" aria-label={t('Sew order position')} min={1} max={project.objects.length} step={1} autoFocus value={positioning!.value} onFocus={e=>e.target.select()} onChange={e=>setPositioning({...positioning!,value:e.target.value})} onClick={e=>e.stopPropagation()} onBlur={()=>finishPosition(true)} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();finishPosition(true);}if(e.key==='Escape'){e.preventDefault();finishPosition(false);}}}/>;}
  const beginPosition=useStableCallback((id:string)=>{if(!disabled)setPositioning({id,value:String(project.objects.findIndex(o=>o.id===id)+1)});});
  const runDown=useStableCallback((key:string,e:ReactPointerEvent<HTMLDivElement>)=>{const run=runs.find(r=>r.key===key);if(disabled||!run||e.button!==0)return;skipClick.current=false;drag.current={ids:run.ids,start:[e.clientX,e.clientY],active:false,index:run.index,group:null,run:true};try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* Pointer-up cancels an inactive drag. */}});
  const runClick=useStableCallback((key:string)=>{if(skipClick.current){skipClick.current=false;return;}const run=runs.find(r=>r.key===key);if(run&&!disabled)onSelection(run.ids);});
  const rowDown=useStableCallback((id:string,e:ReactPointerEvent<HTMLDivElement>)=>down(e,rows.find(r=>r.object?.id===id)!));
  const rowClick=useStableCallback((id:string,e:{ctrlKey:boolean;metaKey:boolean;shiftKey:boolean})=>{if(skipClick.current){skipClick.current=false;return;}if(!disabled)onSelect(id,e);});
  const select=useStableCallback(onSelect),hide=useStableCallback(onHide),lock=useStableCallback(onLock),beginRename=useStableCallback((o:StitchObject)=>setRenaming({id:o.id,name:o.name,group:false}));
  const groupDown=useStableCallback((id:string,e:ReactPointerEvent<HTMLDivElement>)=>down(e,rows.find(r=>r.type==='group'&&r.group===id)!));
  const selectGroup=useStableCallback((id:string)=>{if(!disabled)onSelection(rows.find(r=>r.type==='group'&&r.group===id)!.ids);});
  const groupClick=useStableCallback((id:string)=>{if(skipClick.current){skipClick.current=false;return;}selectGroup(id);});
  const collapseGroup=useStableCallback((id:string)=>setCollapsed(c=>{const next=new Set(c);if(next.has(id))next.delete(id);else next.add(id);return next;}));
  const renameGroup=useStableCallback((id:string,name:string)=>setRenaming({id,name,group:true}));
  const hideGroup=useStableCallback((id:string)=>onHide(rows.find(r=>r.type==='group'&&r.group===id)!.ids)),lockGroup=useStableCallback((id:string)=>onLock(rows.find(r=>r.type==='group'&&r.group===id)!.ids));
  return <section className="panel-section objects-section">
    <SegmentedControl className="layers-view" role="radiogroup" aria-label={t('Layers view')}>{(['objects','colours'] as const).map(v=><Button variant="ghost" key={v} type="button" role="radio" aria-checked={view===v} onClick={()=>chooseView(v)}>{t(v==='objects'?'Objects':'Colours')}</Button>)}</SegmentedControl>
    <div ref={list} className={`object-list ${line!==null?'reordering':''}`} aria-label={t("Layers")} onPointerMove={move} onPointerUp={e=>up(e)} onPointerCancel={e=>up(e,true)} onLostPointerCapture={e=>{if(drag.current)up(e,true);}}>
      {view==='colours'?runs.map(run=><ColourRunRow key={run.key} run={run} selected={run.ids.every(id=>selection.includes(id))} disabled={disabled} onDown={runDown} onClick={runClick}/>):rows.map(row=>{
        if(row.type==='group'){
          const hidden=row.ids.every(id=>project.objects.find(o=>o.id===id)?.hidden),locked=row.ids.every(id=>project.objects.find(o=>o.id===id)?.locked),selected=row.ids.every(id=>selection.includes(id));
          return <LayerGroupRow key={row.key} group={row.group!} name={row.name} count={row.ids.length} collapsed={!!row.collapsed} hidden={hidden} locked={locked} selected={selected} disabled={disabled} renameInput={renaming?.group&&renaming.id===row.group?nameInput():null} onDown={groupDown} onClick={groupClick} onSelect={selectGroup} onCollapse={collapseGroup} onRename={renameGroup} onHide={hideGroup} onLock={lockGroup}/>;
        }
        const o=row.object!;return <LayerObjectRow key={o.id} o={o} i={row.index} selected={selection.includes(o.id)} grouped={row.group!==undefined} disabled={disabled} renameInput={renaming?.id===o.id&&!renaming.group?nameInput():null} positionInput={positioning?.id===o.id?positionInput():null} onPosition={beginPosition} onDown={rowDown} onClick={rowClick} onSelect={select} onHide={hide} onLock={lock} onRename={beginRename}/>;})}
      {line!==null&&<div className="layer-insertion" style={{top:line}}>{view==='objects'&&<span>{targetGroup===null?t("Outside groups"):project.groups?.find(g=>g.id===targetGroup)?.name}</span>}</div>}
    </div>
    {!project.objects.length&&<p className="empty-list">{imported?t("PES preview only"):t("No objects")}</p>}
    {children}
  </section>;
}

const LayerPreview=memo(function LayerPreview({o}:{o:StitchObject}){
  const geometry=objectGeometry(o),b=geometry.bounds,pad=Math.max(b.width,b.height,1)*.1;
  return <svg className="layer-preview" width="32" height="32" viewBox={`${b.x-pad} ${b.y-pad} ${Math.max(b.width,1)+2*pad} ${Math.max(b.height,1)+2*pad}`} aria-hidden="true"><path d={geometry.path} fill={isFillKind(o.kind)?o.color:'none'} fillRule={o.text||o.fillRule==='nonzero'?'nonzero':'evenodd'} stroke={isFillKind(o.kind)?'none':o.color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round"/></svg>;
});
const LayerObjectRow=memo(function LayerObjectRow({o,i,selected,grouped,disabled,renameInput,positionInput,onPosition,onDown,onClick,onSelect,onHide,onLock,onRename}:{o:StitchObject;i:number;selected:boolean;grouped:boolean;disabled:boolean;renameInput:ReactNode;positionInput:ReactNode;onPosition:(id:string)=>void;onDown:(id:string,e:ReactPointerEvent<HTMLDivElement>)=>void;onClick:Props['onSelect'];onSelect:Props['onSelect'];onHide:Props['onHide'];onLock:Props['onLock'];onRename:(o:StitchObject)=>void}){
  const {t}=useT();
  return <div data-layer={`object:${o.id}`} className={`object-row ${selected?'selected':''} ${o.hidden?'hidden-object':''} ${o.locked?'locked-object':''} ${grouped?'group-member':''}`} role="button" tabIndex={disabled?-1:0} aria-label={o.name} aria-pressed={selected} aria-disabled={disabled} onPointerDown={e=>onDown(o.id,e)} onClick={e=>{onClick(o.id,e);}} onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!disabled)onSelect(o.id,e);}}}>
        <LayerPreview o={o}/>{positionInput??<Button variant="swatch" type="button" className="layer-thread-dot" style={{background:o.color}} disabled={disabled} aria-label={t('Sew order {v0}: change position',{v0:i+1})} title={t('Click to type a new sew position')} onClick={e=>{e.stopPropagation();onPosition(o.id);}}/>}
        <span className="layer-name">{renameInput?renameInput:<strong title={o.name} onDoubleClick={e=>{e.stopPropagation();if(!disabled)onRename(o);}}>{o.name}</strong>}<small>{o.text?t("Text · {v0} · {v1}",{v0:o.text.satin?satinFonts[o.text.satin.font].name:o.text.font.family,v1:t(kindNames[o.kind])}):t(kindNames[o.kind])}</small></span>
        <IconButton variant="ghost" className="icon-button layer-lock" disabled={disabled} aria-label={t(o.locked?'unlockNamed':'lockNamed',{name:o.name})} aria-pressed={!!o.locked} title={o.locked?t('Unlock object'):t('Lock object (Ctrl / ⌘ L)')} onClick={e=>{e.stopPropagation();onLock([o.id]);}}><Padlock locked={!!o.locked}/></IconButton>
        <IconButton variant="ghost" className="icon-button layer-eye" disabled={disabled} aria-label={t(o.hidden?'showNamed':'hideNamed',{name:o.name})} aria-pressed={!o.hidden} title={o.hidden?t("Show object"):t("Hide object (still exported)")} onClick={e=>{e.stopPropagation();onHide([o.id]);}}><Eye hidden={!!o.hidden}/></IconButton>
      </div>;
});

const LayerGroupRow=memo(function LayerGroupRow({group,name,count,collapsed,hidden,locked,selected,disabled,renameInput,onDown,onClick,onSelect,onCollapse,onRename,onHide,onLock}:{group:string;name:string;count:number;collapsed:boolean;hidden:boolean;locked:boolean;selected:boolean;disabled:boolean;renameInput:ReactNode;onDown:(id:string,e:ReactPointerEvent<HTMLDivElement>)=>void;onClick:(id:string)=>void;onSelect:(id:string)=>void;onCollapse:(id:string)=>void;onRename:(id:string,name:string)=>void;onHide:(id:string)=>void;onLock:(id:string)=>void}){
  const {t}=useT();
            return <div data-layer={`group:${group}`} className={`object-row group-row ${selected?'selected':''} ${hidden?'hidden-object':''} ${locked?'locked-object':''}`} role="button" tabIndex={disabled?-1:0} aria-label={t('groupSummary',{name,count})} aria-pressed={selected} aria-disabled={disabled} onPointerDown={e=>onDown(group,e)} onClick={()=>{onClick(group);}} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();if(!disabled)onSelect(group);}}}>
            <IconButton variant="ghost" className={`icon-button group-collapse ${collapsed?'':'open'}`} disabled={disabled} aria-label={t(collapsed?'expandNamed':'collapseNamed',{name})} aria-expanded={!collapsed} title={collapsed?t("Expand group"):t("Collapse group")} onClick={e=>{e.stopPropagation();onCollapse(group);}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></IconButton>
            <span className="layer-name">{renameInput?renameInput:<strong title={name} onDoubleClick={e=>{e.stopPropagation();if(!disabled)onRename(group,name);}}>{name}</strong>}<small>{t('objects.other',{count})}</small></span>
            <IconButton variant="ghost" className="icon-button layer-lock" disabled={disabled} aria-label={t(locked?'unlockNamed':'lockNamed',{name})} aria-pressed={locked} title={locked?t('Unlock group'):t('Lock group')} onClick={e=>{e.stopPropagation();onLock(group);}}><Padlock locked={locked}/></IconButton>
            <IconButton variant="ghost" className="icon-button layer-eye" disabled={disabled} aria-label={t(hidden?'showNamed':'hideNamed',{name})} aria-pressed={!hidden} title={hidden?t("Show group"):t("Hide group (still exported)")} onClick={e=>{e.stopPropagation();onHide(group);}}><Eye hidden={hidden}/></IconButton>
          </div>;
});

const ColourRunRow=memo(function ColourRunRow({run,selected,disabled,onDown,onClick}:{run:ColourRun;selected:boolean;disabled:boolean;onDown:(key:string,e:ReactPointerEvent<HTMLDivElement>)=>void;onClick:(key:string)=>void}){
  const {t}=useT(),name=run.thread?threadLabel(t,run.thread):t('Custom thread · {color}',{color:run.color.toUpperCase()});
  const detail=[t('objects.other',{count:run.ids.length}),...(run.stitches!==null?[t('stitchCount.other',{count:run.stitches})]:[])].join(' · ');
  return <div data-layer={run.key} className={`object-row colour-run ${selected?'selected':''}`} role="button" tabIndex={disabled?-1:0} aria-label={`${name}, ${detail}`} aria-pressed={selected} aria-disabled={disabled} title={t('Drag to move these objects together in sew order')} onPointerDown={e=>onDown(run.key,e)} onClick={()=>onClick(run.key)} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onClick(run.key);}}}>
    <span className="thread-swatch run-swatch" style={{background:run.color}}/>
    <span className="layer-name"><strong title={name}>{name}</strong><small>{detail}</small></span>
  </div>;
});
