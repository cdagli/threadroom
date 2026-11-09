'use client';
import {MenuItem} from '@/design-system';
import {useEffect,useLayoutEffect,useRef,useState,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {useT} from './i18n';
import {menuPosition,menuStep,type MenuAction,type MenuEntry} from '@/lib/context-menu';
import type {Key} from '@/lib/i18n';

// Also used for the AI agent toast (app/agent-tools.tsx).
export const menuLabels:Record<MenuAction,Key>={cut:'Cut',copy:'Copy',paste:'Paste',duplicate:'Duplicate',delete:'Delete',group:'groupAction',ungroup:'Ungroup',lock:'Lock',unlock:'Unlock',hide:'Hide',show:'Show',editPoints:'Edit points',editAngles:'Edit angles',editFlow:'Edit flow field',front:'Bring to front (sew last)',forward:'Bring forward (sew later)',backward:'Send backward (sew earlier)',back:'Send to back (sew first)',flipH:'Flip horizontal',flipV:'Flip vertical',rotate:'Rotate 90°',cutHoles:'Cut holes',flatten:'Flatten overlaps',union:'Union',subtract:'Subtract',intersect:'Intersect',offset:'Offset…',knife:'Knife',selectAll:'Select all',unlockAll:'Unlock all',fit:'Zoom to fit',grid:'Show grid'};
const keys:Partial<Record<MenuAction,string>>={cut:'Ctrl/⌘ X',copy:'Ctrl/⌘ C',paste:'Ctrl/⌘ V',duplicate:'Ctrl/⌘ D',delete:'Del',group:'Ctrl/⌘ G',ungroup:'⇧ Ctrl/⌘ G',lock:'Ctrl/⌘ L',unlock:'Ctrl/⌘ L',flipH:'⇧ H',flipV:'⇧ V',knife:'K',editAngles:'A',editFlow:'A',selectAll:'Ctrl/⌘ A'};
// Rendered at the pointer (fixed position); focus moves into it and returns to the canvas on close.
export function ContextMenu({x,y,entries,grid,onAction,onClose}:{x:number;y:number;entries:MenuEntry[];grid:boolean;onAction:(a:MenuAction)=>void;onClose:()=>void}){
  const {t}=useT(),menu=useRef<HTMLDivElement>(null),[place,setPlace]=useState({left:x,top:y,ready:false});
  useLayoutEffect(()=>{const el=menu.current;if(!el)return;const r=el.getBoundingClientRect(),p=menuPosition(x,y,r.width,r.height,window.innerWidth,window.innerHeight);setPlace({...p,ready:true});},[x,y,entries]);
  useEffect(()=>{if(!place.ready)return;const first=menuStep(entries,-1,'ArrowDown');menu.current?.querySelector<HTMLElement>(`[data-index="${first}"]`)?.focus();},[place.ready,entries]);
  useEffect(()=>{
    const away=(e:Event)=>{if(!menu.current?.contains(e.target as Node))onClose();};
    const blur=()=>onClose();
    window.addEventListener('pointerdown',away,true);window.addEventListener('resize',blur);window.addEventListener('blur',blur);window.addEventListener('wheel',away,{capture:true,passive:true});
    return()=>{window.removeEventListener('pointerdown',away,true);window.removeEventListener('resize',blur);window.removeEventListener('blur',blur);window.removeEventListener('wheel',away,{capture:true});};
  },[onClose]);
  function key(e:ReactKeyboardEvent<HTMLDivElement>){
    e.stopPropagation();
    if(e.key==='Escape'||e.key==='Tab'||(e.shiftKey&&e.key==='F10')||e.key==='ContextMenu'){e.preventDefault();onClose();return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const index=Number((document.activeElement as HTMLElement|null)?.dataset.index??-1),next=menuStep(entries,index,e.key);menu.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus();}
  }
  return <div ref={menu} className="context-menu" role="menu" aria-label={t('Canvas actions')} style={{left:place.left,top:place.top,visibility:place.ready?undefined:'hidden'}} onKeyDown={key} onKeyUp={e=>e.stopPropagation()} onContextMenu={e=>e.preventDefault()}>
    {entries.map((entry,i)=>entry==='separator'?<hr key={i} role="separator"/>:<MenuItem variant="ghost" key={i} type="button" role={entry.action==='grid'?'menuitemcheckbox':'menuitem'} aria-checked={entry.action==='grid'?grid:undefined} data-index={i} tabIndex={-1} disabled={entry.disabled} onClick={()=>{onClose();onAction(entry.action);}}><span>{t(menuLabels[entry.action])}{entry.action==='grid'&&grid?' ✓':''}</span>{keys[entry.action]&&<kbd>{keys[entry.action]}</kbd>}</MenuItem>)}
  </div>;
}
