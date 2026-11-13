'use client';
import {useRef,type KeyboardEvent,type PointerEvent} from 'react';

export type Band={id:string;color:string;label:string;selected?:boolean};

// Coloured bands along one track with draggable meeting points between neighbours.
// Bands are buttons (choose one); each meeting point is a slider (arrows ±1, Shift ±10).
// edges[i] sits between bands[i] and bands[i+1]; values are 0–100.
export function BandSlider({bands,edges,startLabel,endLabel,edgeLabel,onSelect,onEdgeChange,className=''}:{
  bands:Band[];edges:number[];startLabel:string;endLabel:string;edgeLabel:(index:number)=>string;
  onSelect:(id:string)=>void;onEdgeChange:(index:number,value:number)=>void;className?:string;
}){
  const track=useRef<HTMLDivElement>(null);
  const stops=[0,...edges,100];
  const at=(e:PointerEvent)=>{const b=track.current!.getBoundingClientRect();return Math.round(Math.max(0,Math.min(100,(e.clientX-b.left)/b.width*100)));};
  const key=(i:number)=>(e:KeyboardEvent)=>{
    const step=e.shiftKey?10:1,v=edges[i];
    const next=e.key==='ArrowLeft'||e.key==='ArrowDown'?v-step:e.key==='ArrowRight'||e.key==='ArrowUp'?v+step:e.key==='Home'?0:e.key==='End'?100:null;
    if(next===null)return;
    e.preventDefault();onEdgeChange(i,next);
  };
  return <div className={`ds-band-slider ${className}`}>
    <div className="ds-band-track" ref={track}>
      {bands.map((b,i)=><button type="button" key={b.id} className="ds-band" aria-pressed={!!b.selected} aria-label={b.label} title={b.label}
        style={{left:`${stops[i]}%`,width:`${stops[i+1]-stops[i]}%`,background:b.color}} onClick={()=>onSelect(b.id)}/>)}
      {edges.map((v,i)=><div key={i} className="ds-band-edge" role="slider" tabIndex={0} aria-label={edgeLabel(i)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-valuetext={`${v}%`}
        style={{left:`${v}%`}} onKeyDown={key(i)}
        onPointerDown={e=>{e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))onEdgeChange(i,at(e));}}
        onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}/>)}
    </div>
    <div className="ds-band-ends" aria-hidden="true"><span>{startLabel}</span><span>{endLabel}</span></div>
  </div>;
}
