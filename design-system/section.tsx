'use client';
import {useEffect,useRef,type ReactNode} from 'react';

const storageKey='threadroom.sections';
const sections=new Map<string,boolean>();
let loaded=false;

function readSections(){
  if(loaded)return;
  loaded=true;
  try{
    const saved:unknown=JSON.parse(localStorage.getItem(storageKey)??'{}');
    if(saved&&typeof saved==='object'&&!Array.isArray(saved))for(const [id,open] of Object.entries(saved))if(typeof open==='boolean')sections.set(id,open);
  }catch{/* Storage can be unavailable; keep remembering sections in this session. */}
}

export function Section({id,title,summaryExtra,defaultOpen=false,forceOpen=false,openSignal,onToggle,children}:{id:string;title:ReactNode;summaryExtra?:ReactNode;defaultOpen?:boolean;forceOpen?:boolean;openSignal?:number;onToggle?:(open:boolean)=>void;children:ReactNode}){
  const details=useRef<HTMLDetailsElement>(null),ready=useRef(false),forced=useRef(false);
  useEffect(()=>{
    readSections();
    details.current!.open=forceOpen||(sections.get(id)??defaultOpen);
    ready.current=true;
    return ()=>{ready.current=false;};
  // forceOpen and openSignal are handled below; this only restores the remembered state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[id,defaultOpen]);
  useEffect(()=>{if(forceOpen&&!details.current!.open){forced.current=true;details.current!.open=true;}},[forceOpen]);
  useEffect(()=>{if(openSignal)details.current!.open=true;},[openSignal]);
  return <details ref={details} className="fill-section" data-section={id} open={defaultOpen||forceOpen} onToggle={e=>{const open=e.currentTarget.open;onToggle?.(open);if(forced.current){forced.current=false;return;}if(!ready.current)return;sections.set(id,open);try{localStorage.setItem(storageKey,JSON.stringify(Object.fromEntries(sections)));}catch{/* The in-memory preference still works. */}}}><summary><span className="section-title">{title}</span>{summaryExtra!==undefined&&<span className="section-extra">{summaryExtra}</span>}</summary><div className="section-content">{children}</div></details>;
}
// A titled group inside a Section, for related settings that do not need their own toggle.
export function SubSection({title,children}:{title:ReactNode;children:ReactNode}){
  return <div className="ds-subsection"><h3 className="ds-subsection-title">{title}</h3>{children}</div>;
}
