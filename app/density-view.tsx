'use client';
import {Button,Input,Select} from '@/design-system';
import {memo,useEffect,useMemo,useRef,useState} from 'react';
import {stitchLengths,lengthBins,type Density} from '@/lib/density';
import type {Compiled} from '@/lib/project';
import {useT} from './i18n';
import {editorTask,taskCancelled} from '@/lib/editor-task';
export function useDensity(compiled:Compiled|null,radius:number){
  const task=useRef<ReturnType<typeof editorTask>|null>(null),[result,setResult]=useState<{compiled:Compiled;radius:number;field:Density}|null>(null);
  useEffect(()=>{
    if(!compiled||result?.compiled===compiled&&result.radius===radius)return;const job=task.current??=editorTask();let live=true;
    void job.run({kind:'density',commands:compiled.commands,radius}).then(field=>{if(live)setResult({compiled,radius,field});}).catch(e=>{if(!taskCancelled(e))console.error(e);});
    return()=>{live=false;job.cancel();};
  },[compiled,radius]);
  return result?.compiled===compiled&&result.radius===radius?result.field:null;
}
// Heat map in canvas millimetres inside the design SVG: above the stitches, under travel, selection,
// snapping guides and the playback needle. It takes no pointer events, so locks and hit-testing are unchanged.
export const DensityHeat=memo(function DensityHeat({field}:{field:Density}){
  const probe=useRef<SVGGElement>(null),[href,setHref]=useState('');
  useEffect(()=>{
    if(!field.width||!probe.current){setHref('');return;}
    const el=document.createElement('canvas');el.width=field.width;el.height=field.height;const c=el.getContext('2d');if(!c)return;
    const css=getComputedStyle(probe.current),colours=[0,1,2,3,4].map(i=>css.getPropertyValue(`--density-${i}`).trim()).map(h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16))),pixels=c.createImageData(field.width,field.height);
    field.values.forEach((value,i)=>{if(!value)return;const v=value/field.max*4,lo=Math.min(3,Math.floor(v)),mix=v-lo;for(let k=0;k<3;k++)pixels.data[i*4+k]=Math.round(colours[lo][k]*(1-mix)+colours[lo+1][k]*mix);pixels.data[i*4+3]=185;});
    c.putImageData(pixels,0,0);setHref(el.toDataURL());el.width=el.height=0;
  },[field]);
  return <g ref={probe} pointerEvents="none" aria-hidden="true">{href&&<image href={href} x={field.x} y={field.y} width={field.width*field.cell} height={field.height*field.cell} preserveAspectRatio="none" style={{imageRendering:'pixelated'}}/>}</g>;
});
export function DensityLegend({field,radius,travel,onRadius,onClose}:{field:Density;radius:number;travel:boolean;onRadius:(n:number)=>void;onClose:()=>void}){
  const {t,formatNumber}=useT();
  return <div className={`density-legend ${travel?'with-travel':''}`} role="note" aria-label={t('Needle density')}><div className="density-heading"><strong>{t('Needle density')}</strong><Button variant="secondary" aria-label={t('Close')} onClick={onClose}>×</Button></div><span>{t('Penetrations per mm²')}</span><div className="density-ramp"/><span>{formatNumber(0)} — {formatNumber(field.max,1)}</span><label>{t('Density radius · mm')}<Select controlSize="sm" value={radius} onChange={e=>onRadius(Number(e.target.value))}>{[.5,1,1.5,3].map(n=><option key={n} value={n}>{formatNumber(n)}</option>)}</Select></label><small>{t('Full stitch plan, including ties. Advisory, not a fabric safety limit.')}</small></div>;
}
export function StitchDiagnostics({compiled}:{compiled:Compiled|null}){
  const {t,formatNumber}=useT(),[threshold,setThreshold]=useState(.3),stats=useMemo(()=>compiled?stitchLengths(compiled.commands,threshold):null,[compiled,threshold]);
  if(!stats)return <p className="section-copy">{t('Diagnostics need up-to-date stitches.')}</p>;
  const max=Math.max(1,...stats.bins);
  return <section className="stitch-diagnostics" aria-label={t('Stitch diagnostics')}><h3>{t('Stitch-length histogram')}</h3><label>{t('Short-stitch threshold · mm')}<Input type="number" min=".1" max="2" step=".1" value={threshold} onChange={e=>{const n=Number(e.target.value);if(n>=.1&&n<=2)setThreshold(n);}}/></label><p>{t('Short stitches: {count}',{count:stats.short})} · {t('Stationary penetrations: {count}',{count:stats.stationary})}</p><div className="length-histogram" role="list" aria-label={t('Stitch-length histogram')}>{stats.bins.map((count,i)=>{const range=Number.isFinite(lengthBins[i+1])?`${formatNumber(lengthBins[i])}–${formatNumber(lengthBins[i+1])}`:`≥ ${formatNumber(lengthBins[i])}`;return <div role="listitem" key={i} aria-label={t('Length bin',{range,count})} title={t('Length bin',{range,count})}><span>{formatNumber(count)}</span><i style={{height:Math.max(1,count/max*55)}}/><small>{range}</small></div>;})}</div><p>{t('Stitch lengths',{mean:formatNumber(stats.mean,2),longest:formatNumber(stats.longest,2)})}</p><small>{t('Full stitch plan, including ties. Advisory, not a fabric safety limit.')}</small></section>;
}
