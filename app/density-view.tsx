'use client';
import {memo,useEffect,useMemo,useRef,useState} from 'react';
import {needleDensity,stitchLengths,lengthBins} from '@/lib/density';
import type {Compiled} from '@/lib/project';
import {useT} from './i18n';
export const DensityLayer=memo(function DensityLayer({compiled,view,canvasSize,travel,onClose}:{compiled:Compiled;view:[number,number,number,number];canvasSize:{width:number;height:number};travel:boolean;onClose:()=>void}){
  const {t,formatNumber}=useT(),[radius,setRadius]=useState(1.5),field=useMemo(()=>needleDensity(compiled.commands,radius),[compiled.commands,radius]),canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const el=canvas.current;if(!el||!field.width)return;el.width=field.width;el.height=field.height;const c=el.getContext('2d');if(!c)return;
    const css=getComputedStyle(el),colours=[0,1,2,3,4].map(i=>css.getPropertyValue(`--density-${i}`).trim()).map(h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16))),pixels=c.createImageData(field.width,field.height);
    field.values.forEach((value,i)=>{if(!value)return;const v=value/field.max*4,lo=Math.min(3,Math.floor(v)),mix=v-lo;for(let k=0;k<3;k++)pixels.data[i*4+k]=Math.round(colours[lo][k]*(1-mix)+colours[lo+1][k]*mix);pixels.data[i*4+3]=185;});
    c.putImageData(pixels,0,0);
  },[field]);
  const [x,y,w,h]=view,s=Math.min(canvasSize.width/w,canvasSize.height/h),left=(canvasSize.width-w*s)/2+(field.x-x)*s,top=(canvasSize.height-h*s)/2+(field.y-y)*s;
  return <><canvas ref={canvas} className="density-canvas" style={{left,top,width:field.width*field.cell*s,height:field.height*field.cell*s}} aria-hidden="true"/><div className={`density-legend ${travel?'with-travel':''}`} role="note" aria-label={t('Needle density')}><div className="density-heading"><strong>{t('Needle density')}</strong><button aria-label={t('Close')} onClick={onClose}>×</button></div><span>{t('Penetrations per mm²')}</span><div className="density-ramp"/><span>{formatNumber(0)} — {formatNumber(field.max,1)}</span><label>{t('Density radius · mm')}<select value={radius} onChange={e=>setRadius(Number(e.target.value))}>{[.5,1,1.5,3].map(n=><option key={n} value={n}>{formatNumber(n)}</option>)}</select></label><small>{t('Full stitch plan, including ties. Advisory, not a fabric safety limit.')}</small></div></>;
});
export function StitchDiagnostics({compiled}:{compiled:Compiled|null}){
  const {t,formatNumber}=useT(),[threshold,setThreshold]=useState(.3),stats=useMemo(()=>compiled?stitchLengths(compiled.commands,threshold):null,[compiled,threshold]);
  if(!stats)return <p className="section-copy">{t('Diagnostics need up-to-date stitches.')}</p>;
  const max=Math.max(1,...stats.bins);
  return <section className="stitch-diagnostics" aria-label={t('Stitch diagnostics')}><h3>{t('Stitch-length histogram')}</h3><label>{t('Short-stitch threshold · mm')}<input type="number" min=".1" max="2" step=".1" value={threshold} onChange={e=>{const n=Number(e.target.value);if(n>=.1&&n<=2)setThreshold(n);}}/></label><p>{t('Short stitches: {count}',{count:stats.short})} · {t('Stationary penetrations: {count}',{count:stats.stationary})}</p><div className="length-histogram" role="list" aria-label={t('Stitch-length histogram')}>{stats.bins.map((count,i)=>{const range=Number.isFinite(lengthBins[i+1])?`${formatNumber(lengthBins[i])}–${formatNumber(lengthBins[i+1])}`:`≥ ${formatNumber(lengthBins[i])}`;return <div role="listitem" key={i} aria-label={t('Length bin',{range,count})} title={t('Length bin',{range,count})}><span>{formatNumber(count)}</span><i style={{height:Math.max(1,count/max*55)}}/><small>{range}</small></div>;})}</div><p>{t('Stitch lengths',{mean:formatNumber(stats.mean,2),longest:formatNumber(stats.longest,2)})}</p><small>{t('Full stitch plan, including ties. Advisory, not a fabric safety limit.')}</small></section>;
}
