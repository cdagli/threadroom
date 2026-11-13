'use client';
import {useEffect,useState,useId} from 'react';
import {backgroundLook,backgroundTile} from '@/lib/thread';
import type {CanvasBackground} from '@/lib/canvas-background';
import type {Fabric} from '@/lib/project';
export default function FabricBackground({fabric,background,width,height}:{fabric:Fabric;background?:CanvasBackground;width:number;height:number}){
  const id=useId(),[tile,setTile]=useState<{src:string;period:number}|null>(null);
  useEffect(()=>setTile(backgroundTile(fabric,background)),[fabric,background]);
  return <g pointerEvents="none">
    {tile&&<defs><pattern id={id} width={tile.period} height={tile.period} patternUnits="userSpaceOnUse"><image href={tile.src} width={tile.period} height={tile.period} opacity=".65"/></pattern></defs>}
    <rect width={width} height={height} rx="3" fill={backgroundLook(fabric,background).base}/>
    {tile&&<rect width={width} height={height} rx="3" fill={`url(#${id})`}/>}
  </g>;
}
