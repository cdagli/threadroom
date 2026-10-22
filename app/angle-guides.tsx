'use client';
import {useT} from './i18n';
import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import type {AngleGuide,Point} from '@/lib/project';
import {addGuide,crossingGuides,moveGuideEnd,removeGuide} from '@/lib/angle-guides';
// Edit angles (and the Streamlines flow field): click twice to add a guide, drag an end to move it,
// Delete removes the guide whose end is selected, Escape cancels a half-drawn guide, then leaves.
// Drags stay local until release, so each gesture is one undo step.
export function AngleGuideEditor({guides,canvasScale,onChange,onExit}:{guides:AngleGuide[];canvasScale:number;onChange:(guides:AngleGuide[])=>void;onExit:()=>void}){
  const {t}=useT(),root=useRef<SVGGElement>(null);
  const [start,setStart]=useState<Point|null>(null),[hover,setHover]=useState<Point|null>(null),[selected,setSelected]=useState<number|null>(null);
  const [moving,setMoving]=useState<AngleGuide[]|null>(null),drag=useRef<{index:number;end:'a'|'b';moved:boolean}|null>(null);
  const shown=moving??guides,crossing=crossingGuides(shown);
  const world=(e:{clientX:number;clientY:number}):Point=>{const m=root.current?.getScreenCTM();if(!m)return [0,0];const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());return [p.x,p.y];};
  const latest=useRef({start,selected,guides,onChange,onExit});latest.current={start,selected,guides,onChange,onExit};
  useEffect(()=>{
    // Capture phase: runs before the studio's shortcuts, which would otherwise delete the object.
    const key=(e:KeyboardEvent)=>{
      if(e.target instanceof HTMLElement&&e.target.closest('input,select,textarea,[contenteditable="true"]'))return;
      const s=latest.current;
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(s.start)setStart(null);else if(s.selected!==null)setSelected(null);else s.onExit();}
      else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();e.stopPropagation();if(s.selected!==null&&s.guides[s.selected]){s.onChange(removeGuide(s.guides,s.selected));setSelected(null);}}
      else if(e.key==='Enter'){e.preventDefault();e.stopPropagation();}
    };
    window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
  },[]);
  function place(e:ReactPointerEvent<SVGRectElement>){
    if(e.button!==0)return;e.preventDefault();e.stopPropagation();const p=world(e);setSelected(null);
    if(!start){setStart(p);setHover(p);return;}
    const next=addGuide(guides,start,p);if(next){onChange(next);setSelected(next.length-1);}setStart(null);
  }
  function grab(e:ReactPointerEvent<SVGElement>,index:number,end:'a'|'b'){
    if(e.button!==0)return;e.preventDefault();e.stopPropagation();setStart(null);setSelected(index);drag.current={index,end,moved:false};
    try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* Release still ends the drag. */}
  }
  function move(e:ReactPointerEvent<SVGElement>){const d=drag.current;if(!d)return;e.stopPropagation();d.moved=true;setMoving(m=>moveGuideEnd(m??guides,d.index,d.end,world(e)));}
  function release(e:ReactPointerEvent<SVGElement>){const d=drag.current;if(!d)return;e.stopPropagation();drag.current=null;if(d.moved&&moving)onChange(moving);setMoving(null);}
  const r=5/canvasScale,head=7/canvasScale;
  return <g ref={root} className="angle-guides">
    <rect x="-1000" y="-1000" width="3000" height="3000" fill="transparent" onPointerDown={place} onPointerMove={e=>{if(start)setHover(world(e));}}/>
    {shown.map((g,i)=>{const dx=g.b[0]-g.a[0],dy=g.b[1]-g.a[1],l=Math.hypot(dx,dy)||1,u=[dx/l,dy/l],c=crossing[i]?'var(--danger)':'var(--accent)',w=(selected===i?2.4:1.6)/canvasScale;
      const tip=`M${g.b[0]} ${g.b[1]}L${g.b[0]-u[0]*head-u[1]*head*.5} ${g.b[1]-u[1]*head+u[0]*head*.5}L${g.b[0]-u[0]*head+u[1]*head*.5} ${g.b[1]-u[1]*head-u[0]*head*.5}Z`;
      return <g key={i} role="group" aria-label={t('Angle guide {v0}',{v0:i+1})}>
        <path d={`M${g.a[0]} ${g.a[1]}L${g.b[0]} ${g.b[1]}`} stroke="var(--surface-raised)" strokeWidth={w+2.5/canvasScale} strokeLinecap="round" pointerEvents="none"/>
        <path d={`M${g.a[0]} ${g.a[1]}L${g.b[0]} ${g.b[1]}`} stroke={c} strokeWidth={w} pointerEvents="none"/>
        <path d={tip} fill={c} stroke="var(--surface-raised)" strokeWidth={1/canvasScale} pointerEvents="none"/>
        {(['a','b'] as const).map(end=><circle key={end} className="angle-guide-end" cx={g[end][0]} cy={g[end][1]} r={r} fill={selected===i?c:'var(--surface-raised)'} stroke={c} strokeWidth={1.6/canvasScale} style={{cursor:'grab'}}
          onPointerDown={e=>grab(e,i,end)} onPointerMove={move} onPointerUp={release} onLostPointerCapture={release}><title>{t(end==='a'?'Start of angle guide {v0}':'End of angle guide {v0}',{v0:i+1})}</title></circle>)}
      </g>;})}
    {start&&hover&&<g pointerEvents="none"><path d={`M${start[0]} ${start[1]}L${hover[0]} ${hover[1]}`} stroke="var(--accent)" strokeWidth={1.4/canvasScale} strokeDasharray={`${4/canvasScale} ${3/canvasScale}`}/><circle cx={start[0]} cy={start[1]} r={r*.7} fill="var(--accent)"/></g>}
  </g>;
}
