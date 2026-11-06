'use client';
import {useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

export function Hint({text}:{text:string}){
  const id=useId(),anchor=useRef<HTMLSpanElement>(null),bubble=useRef<HTMLSpanElement>(null);
  const [hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[dismissed,setDismissed]=useState(false);
  const [position,setPosition]=useState({left:0,top:0});
  const visible=(hovered||focused)&&!dismissed;
  useLayoutEffect(()=>{
    if(!visible)return;
    function place(){
      const rect=anchor.current!.getBoundingClientRect(),tip=bubble.current!,gap=8,margin=12;
      const left=Math.max(margin,Math.min(rect.left,window.innerWidth-tip.offsetWidth-margin));
      const top=rect.bottom+gap+tip.offsetHeight<=window.innerHeight-margin?rect.bottom+gap:Math.max(margin,rect.top-tip.offsetHeight-gap);
      setPosition({left,top});
    }
    place();
    window.addEventListener('resize',place);
    window.addEventListener('scroll',place,true);
    return ()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[visible,text]);
  return <><span ref={anchor} className="settings-hint" role="button" tabIndex={0} aria-label={text} aria-describedby={visible?id:undefined} onMouseEnter={()=>{setHovered(true);setDismissed(false);}} onMouseLeave={()=>setHovered(false)} onFocus={()=>{setFocused(true);setDismissed(false);}} onBlur={()=>setFocused(false)} onClick={e=>{e.preventDefault();e.stopPropagation();}} onKeyDown={e=>{if(['Enter',' ','Escape'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.key==='Escape')setDismissed(true);}}}>?<span className="hint-hit-area" aria-hidden="true"/></span>{visible&&createPortal(<span ref={bubble} id={id} role="tooltip" className="settings-tooltip" style={position}>{text}</span>,document.body)}</>;
}

export function ToolHint({title,text}:{title:string;text:string}){
  return <div className="tool-guidance" role="status" title={`${title} · ${text}`}><strong>{title}</strong><span>{text}</span></div>;
}
