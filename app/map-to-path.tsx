'use client';
import {Button,Input,Select} from '@/design-system';
import {useMemo,useState} from 'react';
import {useT} from './i18n';
import {errorText} from '@/lib/i18n';
import {canMapPath,defaultPathSettings,mapToPath,unlinkPath,updatePathSettings} from '@/lib/map-to-path';
import type {PathSettings} from '@/lib/path-binding';
import {designBounds,objectGeometry} from '@/lib/editor-render';
import type {Project} from '@/lib/project';
export default function MapToPathContent({project,selection,active=true,onChange,onSelect,onUseTextPath,onDrawPath}:{project:Project;selection:string[];active?:boolean;onChange:(p:Project,label?:string,merge?:string)=>void;onSelect:(id:string)=>void;onUseTextPath:(id:string)=>void;onDrawPath:(ids:string[])=>void}){
  const {t}=useT(),[draft,setDraft]=useState(defaultPathSettings),[pathId,setPathId]=useState(''),[error,setError]=useState('');
  const group=project.groups?.find(g=>g.pathBinding&&(selection.some(id=>g.pathBinding!.members.flat().includes(id))||selection.includes(g.pathBinding.pathId))),binding=group?.pathBinding;
  const paths=project.objects.filter(o=>canMapPath(o)&&(!o.group||!project.groups?.some(g=>g.id===o.group&&g.pathBinding))),selectedPath=paths.find(o=>o.id===pathId)?.id||paths.filter(o=>selection.includes(o.id)).at(-1)?.id||paths.find(o=>!selection.includes(o.id))?.id||'';
  const value=binding?.settings??draft,prototypeIds=selection.filter(id=>id!==selectedPath),run=(f:()=>void)=>{try{f();setError('');}catch(e){setError(errorText(e,t,'Map to path exceeds the hoop or design limits.'));}};
  const preview=useMemo(()=>{if(!active||binding||!prototypeIds.length)return null;try{return mapToPath(project,prototypeIds,selectedPath,draft,t('Along path'),'map-preview');}catch{return null;}},[project,selection.join('|'),selectedPath,draft,binding,t,active]);
  const patch=(patch:Partial<PathSettings>)=>{const next={...value,...patch};if(group)run(()=>onChange(updatePathSettings(project,group.id,next),'',`path:${group.id}`));else setDraft(next);};
  if(!selection.length)return null;
  const text=project.objects.find(o=>selection.includes(o.id)&&o.text),drawPath=()=>{setPathId('');onDrawPath(prototypeIds);};
  if(!binding&&text&&!paths.length)return <>
    <p className="section-copy">{t('To bend text along a curve, use Text shape → Path.')}</p>
    <div className="selection-actions"><Button variant="secondary" type="button" onClick={()=>onUseTextPath(text.id)}>{t('Use text path')}</Button><Button variant="secondary" type="button" onClick={drawPath}>{t('Draw path')}</Button></div>
  </>;
  const objects=preview?.objects.filter(o=>o.group==='map-preview')??[],box=designBounds(objects);
  return <>
    {!binding&&<><p className="section-copy">{t('Select objects and choose an open guide path. Preview the repeats, then apply.')}</p><label>{t('Guide path')}<Select value={selectedPath} onChange={e=>setPathId(e.target.value)}><option value="">{t('Choose a path')}</option>{paths.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</Select></label><Button variant="secondary" type="button" onClick={drawPath}>{t('Draw path')}</Button></>}
    <label>{t('Repeat mode')}<Select value={value.mode} onChange={e=>patch({mode:e.target.value as PathSettings['mode']})}>{(['fill','count','spacing'] as const).map((v,i)=><option key={v} value={v}>{t((['Fill path','Exact count','Fixed spacing'] as const)[i])}</option>)}</Select></label>
    {value.mode==='count'&&<label>{t('Repeat count')}<Input type="number" min="1" max="80" step="1" value={value.count} onChange={e=>{const count=e.target.valueAsNumber;if(Number.isInteger(count)&&count>=1&&count<=80)patch({count});}}/></label>}
    {value.mode!=='count'&&<label>{t('Gap · mm')}<Input type="number" min="0" max="100" step=".1" value={value.spacing} onChange={e=>{const spacing=e.target.valueAsNumber;if(spacing>=0&&spacing<=100)patch({spacing});}}/></label>}
    <label>{t('Start offset · mm')}<Input type="number" min="0" max="1000" step=".5" value={value.offset} onChange={e=>{const offset=e.target.valueAsNumber;if(offset>=0&&offset<=1000)patch({offset});}}/></label>
    {(['rotate','reverse','hidePath'] as const).map((key,i)=><label className="check-label" key={key}><Input type="checkbox" checked={value[key]} onChange={e=>patch({[key]:e.target.checked})}/>{t((['Rotate along path','Reverse path','Hide guide from stitches and layers'] as const)[i])}</label>)}
    <label className="check-label"><Input type="checkbox" checked={value.align==='center'} onChange={e=>patch({align:e.target.checked?'center':'start'})}/>{t('Align centre')}</label>
    {binding&&group?<div className="selection-actions"><Button variant="secondary" type="button" onClick={()=>onSelect(binding.pathId)}>{t('Edit guide path')}</Button><Button variant="secondary" type="button" onClick={()=>run(()=>onChange(unlinkPath(project,group.id),t('Unlinked from path')))}>{t('Unlink from path')}</Button></div>:<>
      {preview&&<svg className="path-preview" viewBox={`${box.x-3} ${box.y-3} ${box.width+6} ${box.height+6}`} role="img" aria-label={t('Path layout preview')}>{objects.map(o=><path key={o.id} d={objectGeometry(o).path} fill="none" stroke={o.color} strokeWidth=".4"/>)}</svg>}
      {!preview&&<p className="section-copy">{t(selectedPath?'Map to path exceeds the hoop or design limits.':'Choose or draw an open guide path first.')}</p>}
      <Button variant="primary" type="button" disabled={!preview} onClick={()=>run(()=>{const next=mapToPath(project,prototypeIds,selectedPath,draft,t('Along path'));onChange(next,t('Objects mapped to path'));onSelect(next.groups!.at(-1)!.pathBinding!.members[0][0]);})}>{t('Apply map to path')}</Button>
    </>}{error&&<p role="alert">{error}</p>}
  </>;
}
