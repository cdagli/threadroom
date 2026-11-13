'use client';
import {Button,Hint,Input,Section,SegmentedControl,Select,SubSection} from '@/design-system';
import {useT} from './i18n';
import dynamic from 'next/dynamic';
import {Loading} from './panel-loading';
import {useStableCallback} from './use-stable-callback';
const PatternPicker=dynamic(()=>import('./pattern-picker'),{loading:Loading});
import {type PointerEvent,type ReactNode} from 'react';
import {longShortSpacing,fillUnderlayPreset,hasCrossStyle,fillCenter,underlayNames,underlayOptions,type StitchObject,type Resolved,type FillUnderlay,type Setting,type FillGradient} from '@/lib/project';
import type {Key} from '@/lib/i18n';
import {fillPatterns} from '@/lib/fill-patterns';
import {setGuidedAngle,sweeping} from '@/lib/angle-guides';
import {GuideControls,DensityControl,lockedAngle,type AngleEditing} from './angle-settings';
import {LongShortSettings,type Shading} from './long-short-settings';
export function CrossSettings({item,onChange}:{item:StitchObject;onChange:(patch:Partial<StitchObject>)=>void}) {
  const {t}=useT(),legacy=item.kind==='cross'&&!hasCrossStyle(item);
  return <><label><span className="field-heading">{t("Cross style")}</span><Select value={legacy?'rows':item.crossStyle??'cross'} onChange={e=>onChange(e.target.value==='rows'?{crossStyle:undefined,crossSize:undefined,threadCount:undefined,coverage:undefined,dense:undefined,flipped:undefined}:{crossStyle:e.target.value as StitchObject['crossStyle']})}>{item.kind==='cross'&&<option value="rows">{t("Legacy rows")}</option>}{([['cross','Cross'],['upright','Upright'],['double','Double'],['smyrna','Smyrna'],['half','Half']] as const).map(([v,label])=><option key={v} value={v}>{t(label)}</option>)}</Select></label>{!legacy&&<>{item.kind==='cross'&&<div className="setting-grid">{fillPatterns.find(p=>p.id==='crossStitchFill')!.params.map(f=><label key={f.key}><span className="field-heading">{t(f.label)}</span><Input type="number" min={f.min} max={f.max} step={f.step} value={item[f.key as 'crossSize']??f.default} onChange={e=>{const n=Number(e.target.value);if(e.target.value!==''&&n>=f.min&&n<=f.max&&Math.abs((n-f.min)/f.step-Math.round((n-f.min)/f.step))<1e-7)onChange({[f.key]:n});}}/></label>)}</div>}{(['flipped','dense'] as const).map(key=><label className="check-label" key={key}><Input type="checkbox" checked={item[key]??false} onChange={e=>onChange({[key]:e.target.checked})}/>{t(key==='flipped'?'Flipped':'Dense')}</label>)}</>}</>;
}
export function StitchAngle({value,onChange,locked}:{value:number;onChange:(angle:number)=>void;locked?:string|null}) {
  const {t}=useT();
  if(locked)return <div className="stitch-angle"><label><span className="field-heading">{t("Stitch angle · °")}<Hint text={t("hint.stitchAngle")}/></span><Input type="number" value={value} disabled readOnly/></label><p className="fabric-advice">{locked}</p></div>;
  const set=(e:PointerEvent<SVGSVGElement>)=>{const b=e.currentTarget.getBoundingClientRect(),a=Math.round(Math.atan2(e.clientY-b.top-b.height/2,e.clientX-b.left-b.width/2)*180/Math.PI);onChange(a);};
  return <div className="stitch-angle"><label><span className="field-heading">{t("Stitch angle · °")}<Hint text={t("hint.stitchAngle")}/></span><Input type="number" min="-180" max="180" step="1" value={value} onChange={e=>{const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n)&&n>=-180&&n<=180)onChange(n);}}/></label><svg className="angle-dial" width="48" height="48" viewBox="0 0 48 48" role="slider" aria-label={t("Stitch angle")} aria-valuemin={-180} aria-valuemax={180} aria-valuenow={value} tabIndex={0} onKeyDown={e=>{if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();onChange(e.key==='Home'?-180:e.key==='End'?180:Math.max(-180,Math.min(180,value+(['ArrowLeft','ArrowDown'].includes(e.key)?-1:1))));}}} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);set(e);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))set(e);}} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}><circle cx="24" cy="24" r="21" fill="none" stroke="currentColor"/><path d="M24 3v4m0 34v4M3 24h4m34 0h4" stroke="currentColor"/><g transform={`rotate(${value} 24 24)`}><path d="M7 24H41" stroke="currentColor"/><circle cx="41" cy="24" r="3" fill="currentColor"/></g></svg></div>;
}

// Beginner-friendly density: three named levels around the fabric's recommended spacing.
// Normal clears the override so the value keeps following the fabric.
export function densityLevels(base:number,min:number,max:number){
  const round=(n:number)=>Math.round(Math.min(max,Math.max(min,n))*100)/100;
  return [{id:'airy',label:'Airy',value:round(base*1.3)},{id:'normal',label:'Normal',value:base},{id:'dense',label:'Dense',value:round(base*.8)}] as const satisfies readonly {id:string;label:Key;value:number}[];
}
export function densityLabel(spacing:number,base:number,min:number,max:number):Key {
  return densityLevels(base,min,max).find(l=>Math.abs(l.value-spacing)<.005)?.label??'Custom';
}
export function DensityChoice({spacing,base,min,max,onChange}:{spacing:number;base:number;min:number;max:number;onChange:(spacing:number|undefined)=>void}){
  const {t}=useT(),levels=densityLevels(base,min,max),current=levels.find(l=>Math.abs(l.value-spacing)<.005);
  return <div className="density-choice">
    <span className="field-heading">{t("Density level")}<Hint text={t("hint.densityLevel")}/>{!current&&<span className="field-value inherited">{t("Custom")}</span>}</span>
    <SegmentedControl role="radiogroup" aria-label={t("Density level")}>{levels.map(l=><Button variant="ghost" size="sm" key={l.id} role="radio" aria-checked={current?.id===l.id} onClick={()=>onChange(l.id==='normal'?undefined:l.value)}>{t(l.label)}</Button>)}</SegmentedControl>
  </div>;
}
// Hand-made look: 0 is off; each level lets stitches wander further from their row.
export function HandStitch({item,onChange}:{item:StitchObject;onChange:(patch:Partial<StitchObject>)=>void}){
  const {t}=useT(),level=item.handStitch??0;
  return <label><span className="field-heading">{t("Hand-made look · {v0}",{v0:level?t("{v0} of 5",{v0:level}):t("Off")})}<Hint text={t("hint.handStitch")}/>{item.handStitch?<Button variant="link" type="button" className="field-value reset" onClick={e=>{e.preventDefault();onChange({handStitch:undefined});}}>{t("Turn off")}</Button>:null}</span><Input type="range" min="0" max="5" step="1" value={level} onChange={e=>{const n=Number(e.target.value) as StitchObject['handStitch'];onChange({handStitch:n||undefined});}}/></label>;
}

export function FillUnderlays({item,resolved,onChange}:{item:StitchObject;resolved:Resolved;onChange:(patch:Partial<StitchObject>)=>void}) {
  const {t}=useT();
  const list=resolved.fillUnderlays??fillUnderlayPreset(resolved.underlay,item.length),edit=(index:number,patch:Partial<FillUnderlay>)=>onChange({fillUnderlays:list.map((u,i)=>i===index?{...u,length:Math.max(1,u.length),...patch}:{...u,length:Math.max(1,u.length)})});
  const changed=item.underlay!==undefined||item.fillUnderlays!==undefined;
  return <SubSection title={<>{t("Underlays")}<Hint text={t("hint.underlays")}/>{changed&&<Button variant="link" type="button" className="field-value reset" onClick={()=>onChange({underlay:undefined,fillUnderlays:undefined})}>{t("Reset")}</Button>}</>}>
    <label className="check-label"><Input type="checkbox" checked={resolved.underlay.includes('edge')} onChange={e=>onChange({underlay:e.target.checked?'edge-tatami':'tatami'})}/><span className="field-heading">{t("Edge walk")}<Hint text={t("hint.edgeWalk")}/></span></label>
    {list.map((u,i)=><div className="fill-underlay" key={i}><div className="underlay-heading"><span>{t("Underlay {v0}",{v0:i+1})}</span><Button variant="link" type="button" className="text-button" onClick={()=>onChange({fillUnderlays:list.filter((_,j)=>i!==j)})}>{t("Delete")}</Button></div><div className="setting-grid">{([{key:'angle',hint:'hint.underlayAngle',label:'Relative angle · °',min:-180,max:180,step:1},{key:'spacing',hint:'hint.underlaySpacing',label:'Row space · mm',min:1,max:4,step:.1},{key:'length',hint:'hint.underlayLength',label:'Length · mm',min:1,max:5,step:.1},{key:'inset',hint:'hint.underlayInset',label:'Inset · mm',min:0,max:2,step:.1}] as const).map(f=><label key={f.key}><span className="field-heading">{t(f.label)}<Hint text={t(f.hint)}/></span><Input type="number" min={f.min} max={f.max} step={f.step} value={u[f.key]} onChange={e=>{const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n)&&n>=f.min&&n<=f.max)edit(i,{[f.key]:n});}}/></label>)}</div></div>)}
    <Button variant="secondary" type="button" className="edit-points-button add-underlay" disabled={list.length>=3} onClick={()=>onChange({fillUnderlays:[...list.map(u=>({...u,length:Math.max(1,u.length)})),{angle:[90,45,135][list.length],spacing:2,length:Math.max(1,item.length),inset:.4}]})}>{t("Add underlay")}</Button>
  </SubSection>;
}

type NumberField={key:'spacing'|'pullCompensation'|'splitLength';hint:Key;label:Key;min:number;max:number;step:number};

// Fill settings, grouped the way a beginner thinks about a fill:
// Pattern (what it looks like) → Direction → Density → Advanced (fabric technicalities).
export function FillSettings({item,resolved,onChange,source,hoop,angles,baseSpacing,finish,shading}:{item:StitchObject;resolved:Resolved;onChange:(patch:Partial<StitchObject>)=>void;source:(key:Setting)=>ReactNode;hoop:{width:number;height:number};angles?:AngleEditing;baseSpacing:number;finish:ReactNode;shading?:Shading}) {
  const changePattern=useStableCallback(onChange);
  const {t,formatNumber}=useT(),sweep=sweeping(item);
  const stream=item.fillPattern==='streamlines',cross=item.fillPattern==='crossStitchFill',circular=item.fillPattern==='circular',satin=item.fillPattern==='sweepSatin';
  const engine=fillPatterns.find(p=>p.id===item.fillPattern)?.mode==='engine',center=item.center??fillCenter(item);
  const g=item.gradient,gradient=(patch:Partial<FillGradient>)=>{if(g)onChange({gradient:{...g,...patch} as FillGradient});};
  const reset=(key:'fillLength')=>item[key]!==undefined?<Button variant="link" type="button" className="field-value reset" onClick={e=>{e.preventDefault();onChange({[key]:undefined});}}>{t("Reset")}</Button>:null;
  const field=(f:NumberField)=><label key={f.key}><span className="field-heading">{t(f.label)}<Hint text={t(f.hint)}/>{source(f.key)}</span><Input type="number" min={f.min} max={f.max} step={f.step} value={resolved[f.key]} onChange={e=>{const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n)&&n>=f.min&&n<=f.max)onChange({[f.key]:n});}}/></label>;
  const locked=lockedAngle(item,t),guideCount=item.angleGuides?.length??0;
  const rowRange:[number,number]=satin?[.2,1]:[.3,2],rows=!cross&&!stream&&!circular;
  const pattern=fillPatterns.find(p=>p.id===(item.fillPattern??'even'));
  if(item.fillPattern==='longShort'&&shading)return <>
    <Section id="fill-pattern" title={t("Pattern")} summaryExtra={pattern&&t(pattern.name)} defaultOpen>
      <div className="settings-core"><PatternPicker value={item.fillPattern} params={item.patternParams} onChange={changePattern}/></div>
    </Section>
    <LongShortSettings item={item} onChange={onChange} shading={shading} density={<DensityChoice spacing={resolved.spacing} base={longShortSpacing} min={.2} max={1} onChange={spacing=>onChange({spacing})}/>} angle={<StitchAngle value={item.angle} onChange={angle=>onChange({angle})}/>}/>
    <Section id="advanced" title={t("Advanced")}>{finish}</Section>
  </>;
  return <>
    <Section id="fill-pattern" title={<>{t("Pattern")}{item.text?.autoStitch&&<Hint text={t("Chosen automatically for this letter size")}/>}</>} summaryExtra={pattern&&t(pattern.name)} defaultOpen>
      <div className="settings-core">
        <PatternPicker value={item.fillPattern} params={item.patternParams} onChange={changePattern}/>
        {cross&&<CrossSettings item={item} onChange={onChange}/>}
        {!satin&&<HandStitch item={item} onChange={onChange}/>}
        {satin&&!item.text&&<div className="density-choice">
          <span className="field-heading">{t("Raised")}<Hint text={t("hint.padding")}/></span>
          <SegmentedControl role="radiogroup" aria-label={t("Raised")}>{([[undefined,'Flat'],[1,'1 layer'],[2,'2 layers']] as const).map(([value,label])=><Button variant="ghost" size="sm" key={label} role="radio" aria-checked={item.padding===value} onClick={()=>onChange({padding:value})}>{t(label)}</Button>)}</SegmentedControl>
        </div>}
      </div>
    </Section>
    <Section id="fill-direction" title={t("Direction")} summaryExtra={guideCount?t('Angle guides · {v0}',{v0:guideCount}):circular?undefined:`${formatNumber(item.angle)}°`}>
      {!circular&&<StitchAngle value={item.angle} locked={locked} onChange={angle=>onChange(setGuidedAngle(item,angle))}/>}
      <GuideControls item={item} angles={angles} onChange={onChange}/>
      {circular&&<><div className="setting-grid">{(["Center X · mm","Center Y · mm"] as const).map((label,i)=><label key={label}><span className="field-heading">{t(label)}</span><Input type="number" min="0" max={i?hoop.height:hoop.width} step=".001" value={+center[i].toFixed(3)} onChange={e=>{const n=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(n)&&n>=0&&n<=(i?hoop.height:hoop.width))onChange({center:i===0?[n,center[1]]:[center[0],n]});}}/></label>)}</div>{item.center&&<Button variant="link" type="button" className="field-value reset" onClick={()=>onChange({center:undefined})}>{t("Reset center")}</Button>}</>}
    </Section>
    <Section id="fill-density" title={t("Density")} summaryExtra={rows?t(densityLabel(resolved.spacing,baseSpacing,...rowRange)):undefined} defaultOpen>
      {rows&&<DensityChoice spacing={resolved.spacing} base={baseSpacing} min={rowRange[0]} max={rowRange[1]} onChange={spacing=>onChange({spacing})}/>}
      <div className="setting-grid fill-dimensions">
        {satin?field({key:'spacing',hint:'hint.spacing',label:'Spacing',min:.2,max:1,step:.01})
          :!cross&&!stream&&<label><span className="field-heading">{t("Row space · mm")}<Hint text={t("hint.rowSpace")}/>{source('spacing')}</span><Input type="number" min={circular?.05:.3} max={circular?50:2} step=".05" value={resolved.spacing} onChange={e=>{const n=Number(e.target.value);if(n>=(circular?.05:.3)&&n<=(circular?50:2))onChange({spacing:n});}}/></label>}
        {!satin&&pattern?.usesStitchSpacing&&<label><span className="field-heading">{t("Stitch length · mm")}<Hint text={t("hint.stitchLength")}/>{reset('fillLength')}</span><Input type="number" min="1" max="6" step=".1" value={item.fillLength??(engine?4:item.length)} onChange={e=>{const n=Number(e.target.value);if(n>=1&&n<=6)onChange({fillLength:n});}}/></label>}
      </div>
      {!engine&&!sweep&&!satin&&<><label className="check-label"><Input type="checkbox" checked={!!g} onChange={e=>onChange({gradient:e.target.checked?{mode:'ramp',start:0,end:1,endSpacing:Math.min(4,Math.max(4*resolved.spacing,1))}:undefined})}/><span className="field-heading">{t("Fade the density")}<Hint text={t("hint.gradient")}/></span></label>{g&&<div className="fill-underlay"><label><span className="field-heading">{t("Gradient mode")}<Hint text={t("hint.gradientMode")}/></span><Select value={g.mode} onChange={e=>onChange({gradient:e.target.value==='ramp'?{mode:'ramp',start:0,end:1,endSpacing:g.endSpacing}:{mode:'plateau',center:.5,width:.2,endSpacing:g.endSpacing}})}><option value="ramp">{t("Ramp")}</option><option value="plateau">{t("Plateau")}</option></Select></label><div className="setting-grid">{(g.mode==='ramp'?[{key:'start',hint:'hint.gradientStart',label:'Start · %',value:g.start},{key:'end',hint:'hint.gradientEnd',label:'End · %',value:g.end}] as const:[{key:'center',hint:'hint.gradientCenter',label:'Center · %',value:g.center},{key:'width',hint:'hint.gradientWidth',label:'Width · %',value:g.width}] as const).map(f=><label key={f.key}><span className="field-heading">{t(f.label)}<Hint text={t(f.hint)}/></span><Input type="number" min="0" max="100" step="1" value={Math.round(f.value*100)} onChange={e=>{const n=Number(e.target.value);if(e.target.value!==''&&n>=0&&n<=100)gradient({[f.key]:n/100});}}/></label>)}</div><label><span className="field-heading">{t("End row space · mm")}<Hint text={t("hint.gradientEndSpacing")}/></span><Input type="number" min=".3" max="4" step=".1" value={g.endSpacing} onChange={e=>{const n=Number(e.target.value);if(n>=.3&&n<=4)gradient({endSpacing:n});}}/></label></div>}</>}
      {!engine&&sweep&&<DensityControl item={item} onChange={onChange}/>}
    </Section>
    <Section id="advanced" title={t("Advanced")}>
      {(!engine||satin)&&<SubSection title={t("Fabric")}>
        {field({key:'pullCompensation',hint:'hint.pullCompensation',label:'Pull compensation · mm',min:0,max:1,step:.05})}
        {satin&&<>{field({key:'splitLength',hint:'hint.splitAbove',label:'Split above · mm',min:3,max:12,step:.5})}<label className="check-label"><Input type="checkbox" checked={resolved.shortStitches} onChange={e=>onChange({shortStitches:e.target.checked})}/><span className="field-heading">{t("Short stitches on curves")}<Hint text={t("hint.shortStitches")}/></span>{source('shortStitches')}</label><label><span className="field-heading">{t("Underlay")}<Hint text={t("hint.underlay")}/>{source('underlay')}</span><Select value={resolved.underlay} onChange={e=>onChange({underlay:e.target.value as StitchObject['underlay']})}>{underlayOptions('satin').map(u=><option key={u} value={u}>{t(underlayNames[u])}</option>)}</Select></label></>}
      </SubSection>}
      {!engine&&!satin&&<FillUnderlays item={item} resolved={resolved} onChange={onChange}/>}
      {finish}
    </Section>
  </>;
}
