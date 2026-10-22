'use client';
import {memo} from 'react';
import {isFillKind,isWideKind,type StitchObject} from '@/lib/project';
import {objectGeometry} from '@/lib/editor-render';

export const CanvasObject=memo(function CanvasObject({o,selected,primary,hidden,editing,stale,offline,movable,canvasScale}:{o:StitchObject;selected:boolean;primary:boolean;hidden:boolean;editing:boolean;stale:boolean;offline:boolean;movable:boolean;canvasScale:number}){
  if(hidden)return null;
  const geometry=objectGeometry(o),area=isFillKind(o.kind)||!!o.rails;void editing;
  return <g data-object={o.id}>{o.text?.layout==='path'&&o.text.path&&primary&&<path d={geometry.guide} fill="none" stroke="var(--accent)" strokeWidth={1/canvasScale} strokeDasharray={`${4/canvasScale} ${3/canvasScale}`} pointerEvents="none"/>}<path d={geometry.path} fill={area?o.color:'none'} opacity={!stale?0:offline?1:.35} pointerEvents="none" fillRule={o.text?'nonzero':'evenodd'} stroke={area?(primary?'var(--accent)':'none'):o.color} strokeWidth={offline?(isWideKind(o.kind)?o.satinWidth:.5):.3} strokeLinejoin="round" strokeLinecap="round" style={{cursor:movable?'move':undefined}}/>{stale&&o.text?.border&&isFillKind(o.kind)&&<path d={geometry.border} fill="none" stroke={o.text.border.color} opacity={offline?1:.35} strokeWidth={o.text.border.kind==='satin'?o.text.border.width:o.text.border.kind==='bean'?.45:.3} strokeLinejoin="round" pointerEvents="none"/>}<path d={geometry.path} fill={area?'transparent':'none'} fillRule={o.text?'nonzero':'evenodd'} stroke="transparent" strokeWidth={Math.max(2,isWideKind(o.kind)?o.satinWidth:0)} style={{cursor:movable?'move':undefined}}/>{selected&&<path d={geometry.path} fill="none" stroke="var(--accent)" strokeWidth={1/canvasScale} pointerEvents="none"/>}</g>;
});
