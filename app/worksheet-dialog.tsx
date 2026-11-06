'use client';
import {Button,Dialog,Select} from '@/design-system';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useT} from './i18n';
import {fabrics,hoops,type Compiled,type Project} from '@/lib/project';
import {checkProject,explain,stitchWarnings} from '@/lib/check';
import {estimatedSeconds,production,sewingSpeed,stitchBounds,threadSequence} from '@/lib/production';
import {brotherThreads} from '@/lib/threads';
import {formatLength,type Units} from '@/lib/view-settings';

import {SewingTime} from './worksheet';
export default function Worksheet({project,compiled,units,onClose}:{project:Project;compiled:Compiled;units:Units;onClose:()=>void}){
  const {t,formatNumber}=useT(),length=(mm:number)=>formatLength(mm,units,formatNumber),dialog=useRef<HTMLDialogElement>(null),title=useId(),[paper,setPaper]=useState<'A4'|'Letter'>('A4');
  const rows=useMemo(()=>threadSequence(compiled,project),[compiled,project]),view=useMemo(()=>stitchBounds(compiled),[compiled]);
  const issues=useMemo(()=>[...checkProject(project),...stitchWarnings(compiled.warnings,project)],[project,compiled]);
  const fails=issues.filter(i=>i.severity==='fail').length,checks=issues.length-fails,fabric=fabrics[project.fabric];
  useEffect(()=>{if(!dialog.current?.open)dialog.current?.showModal();},[]);
  const preview=(index?:number)=><svg viewBox={view} role="img" aria-label={index===undefined?t('Design preview'):t('Colour step {step}',{step:index+1})}>{rows.filter(r=>index===undefined||r.index===index).map(r=><path key={r.index} d={r.path} stroke={r.color} strokeWidth=".25" strokeLinecap="round" fill="none"/>)}</svg>;
  return createPortal(<Dialog ref={dialog} className="worksheet-dialog" aria-labelledby={title} onCancel={onClose} onClose={onClose} onKeyDown={e=>e.stopPropagation()} onKeyUp={e=>e.stopPropagation()}>
    <style media="print">{`@page{size:${paper};margin:12mm}`}</style>
    <div className="worksheet-controls"><label>{t('Paper size')}<Select value={paper} onChange={e=>setPaper(e.target.value as 'A4'|'Letter')}><option value="A4">{t('A4')}</option><option value="Letter">{t('Letter')}</option></Select></label><Button variant="primary" type="button" onClick={()=>window.print()}>{t('Print worksheet')}</Button><Button variant="secondary" type="button" onClick={onClose}>{t('Close')}</Button></div>
    <article className="worksheet-sheet"><h1 id={title}>{t('Worksheet')} · {project.name}</h1>
      <div className="worksheet-overview"><div className="worksheet-thumbnail">{preview()}</div><dl>
        <dt>{t('Design size')}</dt><dd>{length(compiled.stats.width)} × {length(compiled.stats.height)}</dd>
        <dt>{t('Hoop')}</dt><dd>{length(hoops[project.hoop].width)} × {length(hoops[project.hoop].height)}</dd><dt>{t('Fabric')}</dt><dd>{t(fabric.label)}</dd>
        <dt>{t('Stitches')}</dt><dd>{formatNumber(compiled.stats.stitches)}</dd><dt>{t('Thread changes')}</dt><dd>{formatNumber(compiled.stats.colorChanges)}</dd><dt>{t('Trims')}</dt><dd>{formatNumber(compiled.stats.trims)}</dd>
      </dl></div>
      <p>{t('Stabilizer:')} {t(fabric.stabilizer)} {t('· Topping:')} {t(fabric.topping)}</p>
      <SewingTime project={project} compiled={compiled}/><p>{t('Time estimate assumptions',{speed:sewingSpeed(project),change:production.colorChangeSeconds,trim:production.trimSeconds})}</p>
      <h2>{t('Thread sequence')}</h2><table><thead><tr><th>{t('Step')}</th><th>{t('Thread colour')}</th><th>{t('Objects')}</th><th>{t('Stitches')}</th><th>{t('Preview')}</th></tr></thead><tbody>{rows.map(r=>{
        const b=r.thread&&brotherThreads.find(b=>b.code===r.thread!.code);
        return <tr key={r.index}><td>{formatNumber(r.index+1)}</td><td><span className="thread-swatch" style={{background:r.color}}/>{b?t('Brother {code} {name}',{code:b.code,name:t(`thread.${b.name}`)}):t('Custom thread · {color}',{color:r.color.toUpperCase()})}</td><td>{[...r.objects].join(', ')||'—'}</td><td>{formatNumber(r.stitches)}</td><td className="worksheet-step">{preview(r.index)}</td></tr>;
      })}</tbody></table>
      <h2>{t('Design check')}</h2><p>{issues.length?[fails?t('failsSummary',{count:fails}):'',checks?t('checksSummary',{count:checks}):''].filter(Boolean).join(' · '):compiled.engine==='Imported PES'?t('Imported PES: design checks unavailable.'):t('Ready to stitch: no problems found.')}</p>
      {!!issues.length&&<ul>{issues.map((w,i)=><li key={i}>{explain(w,project,'',t).title}: {explain(w,project,'',t).why}</li>)}</ul>}
    </article>
  </Dialog>,document.body);
}
