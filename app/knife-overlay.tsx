'use client';
import {memo} from 'react';
import {pathData,type Point} from '@/lib/project';
export const KnifeOverlay=memo(function KnifeOverlay({a,b,canvasScale}:{a:Point;b:Point;canvasScale:number}){
  return <g pointerEvents="none"><path d={pathData([[a,b]],false)} stroke="var(--surface-raised)" strokeWidth={4/canvasScale} strokeLinecap="round"/><path d={pathData([[a,b]],false)} stroke="var(--danger)" strokeWidth={1.5/canvasScale} strokeDasharray={`${5/canvasScale} ${3/canvasScale}`}/>{[a,b].map((q,i)=><circle key={i} cx={q[0]} cy={q[1]} r={3/canvasScale} fill="var(--danger)"/>)}</g>;
});
