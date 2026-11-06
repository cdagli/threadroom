'use client';
import {Toolbar} from '@/design-system';
import {useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {worldToClient,type Viewport} from '@/lib/viewport';
import type {Rect} from '@/lib/editing';
import {useStableCallback} from './use-stable-callback';

type Surface={
  canvas:RefObject<SVGSVGElement|null>;container:RefObject<HTMLElement|null>;rail:RefObject<HTMLElement|null>;
};

// Read the screen-space box on each placement, including canvas/chrome resizes.
export function useSelectionAnchor({screenBox,canvas,container,rail,topClearance=0}:Surface&{screenBox:(canvasRect:DOMRect)=>Rect;topClearance?:number}){
  const bar=useRef<HTMLDivElement>(null),[position,setPosition]=useState({left:0,top:0,ready:false});
  const place=useStableCallback(()=>{
    const el=bar.current,area=container.current,svg=canvas.current;if(!el||!area||!svg)return;
    const rect=svg.getBoundingClientRect(),parent=area.getBoundingClientRect(),gap=8,box=screenBox(rect);
    const minTop=Math.max(rect.top+gap,(area.querySelector('.canvas-top-row')?.getBoundingClientRect().bottom??rect.top)+gap);
    const ruler=area.querySelector('.canvas-rulers')?20:0;
    const minLeft=rect.left+ruler+gap,maxRight=Math.min(rect.right,rail.current?.getBoundingClientRect().left??rect.right)-gap;
    // The selection box and rotation handle are the only vertical reservations.
    const above=box.y-topClearance-gap-el.offsetHeight;
    const placeAbove=above>=minTop&&box.y-above<=40;
    const top=Math.max(minTop,Math.min(placeAbove?above:box.y+box.height+gap,rect.bottom-gap-el.offsetHeight));
    // Stay clear of the settings overlay when the bar shares its vertical band.
    const settings=area.querySelector('.settings-overlay')?.getBoundingClientRect();
    const left=settings&&top<settings.bottom&&top+el.offsetHeight>settings.top?Math.max(minLeft,settings.right+gap):minLeft;
    const next={left:Math.max(left,Math.min(box.x+(box.width-el.offsetWidth)/2,maxRight-el.offsetWidth))-parent.left,top:top-parent.top,ready:true};
    setPosition(old=>old.left===next.left&&old.top===next.top&&old.ready?old:next);
  });
  useLayoutEffect(()=>{place();});
  useLayoutEffect(()=>{
    const observer=new ResizeObserver(place);
    for(const el of [bar.current,canvas.current,container.current,rail.current,container.current?.querySelector('.canvas-top-row'),container.current?.querySelector('.settings-overlay')])if(el)observer.observe(el);
    window.addEventListener('resize',place);
    return()=>{observer.disconnect();window.removeEventListener('resize',place);};
  },[place,canvas,container,rail]);
  return {ref:bar,style:{left:position.left,top:position.top,visibility:position.ready?undefined:'hidden' as const}};
}

export function SelectionAnchor({box,view,hoop,canvas,container,rail,topClearance,className='',label,children}:Surface&{
  box:Rect;view:Viewport;hoop:{width:number;height:number};topClearance?:number;
  className?:string;label:string;children:ReactNode;
}){
  const anchor=useSelectionAnchor({canvas,container,rail,topClearance,screenBox:rect=>{
    const [x,y]=worldToClient(view,[box.x,box.y],rect,hoop),[right,bottom]=worldToClient(view,[box.x+box.width,box.y+box.height],rect,hoop);
    return {x,y,width:right-x,height:bottom-y};
  }});
  return <Toolbar {...anchor} className={`selection-bar ${className}`} role="toolbar" aria-label={label}>{children}</Toolbar>;
}
