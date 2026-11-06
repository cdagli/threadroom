'use client';
import {Button,Icon,Input,Section,SegmentedControl,Select,Textarea} from '@/design-system';
import {useT} from './i18n';
import dynamic from 'next/dynamic';
import {Loading} from './panel-loading';
import {errorText,type Translator} from '@/lib/i18n';
import {useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject} from 'react';
import {loadCatalog, previewRef, weightNames} from '@/lib/fonts';
import {satinFonts,satinLetteringDefaults,columnLimits,columnWidth,type SatinFontId} from '@/lib/satin-lettering';
import {textLimits, type FontRef, type TextLayout, type TextSpec} from '@/lib/text';

function usePreview(load:()=>Promise<string>,key:string) {
  const [family,setFamily]=useState<string|null>(null);
  useEffect(()=>{let live=true;setFamily(null);load().then(f=>{if(live)setFamily(f);}).catch(()=>{});return()=>{live=false;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key]);
  return family;
}
const FontPicker=dynamic(()=>import('./font-picker').then(m=>m.FontPicker),{loading:Loading});
const shapesFor=(t:Translator):{id:TextLayout;label:string;icon:string}[]=>[
  {id:'straight',label:t("Straight"),icon:'M3 15h18'},{id:'arc',label:t("Arc"),icon:'M3 17C6 7 18 7 21 17'},
  {id:'wave',label:t("Wave"),icon:'M2 12c3-6 6-6 8 0s5 6 8 0 3-4 4-3'},{id:'path',label:t("Path"),icon:'M3 18c4 0 3-11 9-11s4 8 9 8M3 18h0M21 15h0'},
];
const alignsFor=(t:Translator):{id:TextSpec['align'];label:string;icon:string}[]=>[{id:'left',label:t("Align left"),icon:'M4 6h16M4 10h10M4 14h16M4 18h10'},{id:'center',label:t("Align centre"),icon:'M4 6h16M7 10h10M4 14h16M7 18h10'},{id:'right',label:t("Align right"),icon:'M4 6h16M10 10h10M4 14h16M10 18h10'}];
function Range({label,value,min,max,step=1,format,onChange}:{label:string;value:number;min:number;max:number;step?:number;format?:(n:number)=>string;onChange:(n:number)=>void}) {
  const {formatNumber}=useT();
  return <label>{label} <span className="field-value">{format?format(value):formatNumber(value)}</span><Input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>;
}

export type TextPanelProps={
  spec:TextSpec; fill:boolean; loading:boolean; missing:string[]; textArea:RefObject<HTMLTextAreaElement|null>;
  guides:{id:string;name:string}[]; guide:{id:string;name:string}|null;
  onChange:(patch:Partial<TextSpec>,merge?:string)=>void; onUseGuide:(id:string)=>void; onRemoveGuide:()=>void; onDrawPath:()=>void; onConvert:()=>void; onReady:()=>void;
};
export default function TextPanel({spec,fill,loading,missing,textArea,guides,guide,onChange,onUseGuide,onRemoveGuide,onDrawPath,onConvert,onReady}:TextPanelProps) {
  const {t,formatNumber}=useT();
  const shapes=shapesFor(t),aligns=alignsFor(t);
  useEffect(()=>{onReady();},[onReady]);
  const family=usePreview(()=>spec.satin?Promise.resolve(''):previewRef(spec.font),`${spec.satin?.font??''}-${spec.font.source}-${spec.font.id}-${spec.font.weight}-${spec.font.italic}`);
  const [weights,setWeights]=useState<{weights:number[];italic:boolean}|null>(null);
  useEffect(()=>{
    let live=true;setWeights(null);
    if(!spec.satin&&spec.font.source==='catalog')loadCatalog().then(all=>{const f=all.find(x=>x.id===spec.font.id);if(live&&f)setWeights({weights:f.weights,italic:f.italic});}).catch(()=>{});
    return()=>{live=false;};
  },[spec.font.id,spec.font.source,spec.satin]);
  const multiline=spec.content.includes('\n'),number=(n:string,[min,max]:readonly [number,number])=>{const v=Number(n);return Number.isFinite(v)&&v>=min&&v<=max?v:null;};
  return <section className="panel-section text-panel" aria-label={t("Text")}>
    <Section id="text" title={t("Text")} defaultOpen summaryExtra={loading?<span className="text-status" role="status">{t("Loading font…")}</span>:undefined}>
    <Textarea ref={textArea} className="text-input" aria-label={t("Text")} rows={2} maxLength={textLimits.content} value={spec.content} spellCheck={false}
      style={family?{fontFamily:`'${family}'`,fontWeight:spec.font.weight,fontStyle:spec.font.italic?'italic':'normal'}:undefined}
      onChange={e=>onChange({content:e.target.value},'content')}/>
    <label>{t("Text style")}<Select value={spec.satin?'satin':'outlines'} onChange={e=>onChange({satin:e.target.value==='satin'?{...satinLetteringDefaults}:undefined,border:undefined})}><option value="outlines">{t("Fill / outline")}</option><option value="satin">{t("Satin lettering")}</option></Select></label>
    {spec.satin?<>
      <label>{t("Satin font")}<Select value={spec.satin.font} onChange={e=>onChange({satin:{...spec.satin!,font:e.target.value as SatinFontId}})}>{Object.entries(satinFonts).map(([id,font])=><option key={id} value={id}>{font.name}</option>)}</Select></label>
      <label>{t("Column width")} · %<Input type="number" min={columnLimits[0]} max={columnLimits[1]} step="1" value={spec.satin.columnWidth} onChange={e=>{const n=number(e.target.value,columnLimits);if(n!==null)onChange({satin:{...spec.satin!,columnWidth:n}},'columnWidth');}}/><span className="field-value">{formatNumber(columnWidth(spec))} mm</span></label>
      <p className="text-hint">{t("For 4–10 mm text. Columns are limited to 1–10 mm.")}</p>
    </>:<FontPicker value={spec.font} onChange={font=>onChange({font})}/> }
    {!spec.satin&&spec.font.source==='catalog'&&weights&&(weights.weights.length>1||weights.italic)&&<div className="style-row">
      <label>{t("Weight")}<Select value={spec.font.weight} onChange={e=>onChange({font:{...spec.font,weight:Number(e.target.value)}})}>{weights.weights.map(w=><option key={w} value={w}>{weightNames[w]?t(weightNames[w]):formatNumber(w)}</option>)}</Select></label>
      {weights.italic&&<Button variant="ghost" type="button" className="italic-toggle" aria-pressed={spec.font.italic} aria-label={t("Italic")} title={t("Italic")} onClick={()=>onChange({font:{...spec.font,italic:!spec.font.italic}})}>{t('I')}</Button>}
    </div>}
    <div className="setting-grid">
      <label>{t("Letter height · mm")}<Input type="number" min={textLimits.size[0]} max={textLimits.size[1]} step=".5" value={Math.round(spec.size*10)/10} onChange={e=>{const n=number(e.target.value,textLimits.size);if(n!==null)onChange({size:n},'size');}}/></label>
      <label>{t("Spacing · %")}<Input type="number" min={textLimits.tracking[0]} max={textLimits.tracking[1]} step="1" value={spec.tracking} onChange={e=>{const n=number(e.target.value,textLimits.tracking);if(n!==null)onChange({tracking:n},'tracking');}}/></label>
    </div>
    <div className="text-row">
      <SegmentedControl className="segmented" role="group" aria-label={t("Alignment")}>{aligns.map(a=><Button variant="ghost" key={a.id} type="button" aria-label={a.label} title={a.label} aria-pressed={spec.align===a.id} onClick={()=>onChange({align:a.id})}><Icon size={16} path={a.icon}/></Button>)}</SegmentedControl>
      {multiline&&<label className="inline-number">{t("Lines")}<Input type="number" aria-label={t("Line spacing")} min={textLimits.lineHeight[0]} max={textLimits.lineHeight[1]} step=".1" value={spec.lineHeight} onChange={e=>{const n=number(e.target.value,textLimits.lineHeight);if(n!==null)onChange({lineHeight:n},'lineHeight');}}/></label>}
    </div>
    <Button variant="link" type="button" className="text-button convert-text" onClick={onConvert}>{t("Convert to shapes")}</Button>
    </Section>
    <Section id="text-shape" title={t("Text shape")} forceOpen={spec.layout==='path'&&!spec.path} summaryExtra={shapes.find(s=>s.id===spec.layout)?.label}>
    <SegmentedControl className="segmented shape-switch" role="group" aria-label={t("Text shape")}>{shapes.map(s=><Button variant="ghost" key={s.id} type="button" aria-pressed={spec.layout===s.id} onClick={()=>{if(s.id==='path'&&!spec.path){onChange({layout:'path'});return;}onChange({layout:s.id});}}><Icon size={16} path={s.icon}/><span>{s.label}</span></Button>)}</SegmentedControl>
    {spec.layout==='arc'&&<Range label={spec.bend>=0?t("Arch up"):t("Arch down")} value={spec.bend} min={-100} max={100} format={n=>Math.abs(n)===100?t("Circle"):`${formatNumber(Math.abs(n))}%`} onChange={bend=>onChange({bend},'bend')}/>}
    {spec.layout==='wave'&&<div className="setting-grid">
      <Range label={t("Height")} value={spec.waveHeight} min={0} max={1.5} step={.05} format={n=>`${formatNumber(Math.round(n*100))}%`} onChange={waveHeight=>onChange({waveHeight},'waveHeight')}/>
      <Range label={t("Length")} value={spec.waveLength} min={1} max={20} step={.5} format={n=>`${formatNumber(n)}×`} onChange={waveLength=>onChange({waveLength},'waveLength')}/>
    </div>}
    {spec.layout==='path'&&<div className="path-options">
      <div className="path-source">
        <Button variant="secondary" type="button" onClick={onDrawPath}>{spec.path?t("Redraw path"):t("Draw path")}</Button>
        {guides.length>0&&<Select aria-label={t("Follow an existing line")} value="" onChange={e=>{if(e.target.value)onUseGuide(e.target.value);}}><option value="">{t("Follow a line…")}</option>{guides.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</Select>}
      </div>
      {!spec.path&&<p className="text-hint">{t("Draw a path on the hoop, or follow a line or shape you already have.")}</p>}
      {spec.path&&<>
        <Range label={t("Position")} value={spec.offset} min={0} max={100} format={n=>`${formatNumber(n)}%`} onChange={offset=>onChange({offset},'offset')}/>
        <div className="check-row"><label className="check-label"><Input type="checkbox" checked={spec.reverse} onChange={e=>onChange({reverse:e.target.checked})}/>{t("Reverse direction")}</label><label className="check-label"><Input type="checkbox" checked={spec.below} onChange={e=>onChange({below:e.target.checked})}/>{t("Below path")}</label></div>
        {guide&&<Button variant="link" type="button" className="text-button" onClick={onRemoveGuide}>{t('removeGuide',{name:guide.name})}</Button>}
      </>}
    </div>}
    {spec.layout!=='path'&&<Range label={t("Rotation")} value={Math.round(spec.rotation)} min={-180} max={180} format={n=>`${formatNumber(n)}°`} onChange={rotation=>onChange({rotation},'rotation')}/>}
    </Section>
    {fill&&!spec.satin&&<Section id="text-border" title={t("Border")} summaryExtra={spec.border?undefined:t("None")}><div className="border-options">
      <label>{t("Border")}<Select value={spec.border?.kind||'none'} onChange={e=>onChange({border:e.target.value==='none'?undefined:{thread:spec.border?.thread,color:spec.border?.color||'#664538',width:spec.border?.width||1,kind:e.target.value as NonNullable<TextSpec['border']>['kind']}})}><option value="none">{t("None")}</option><option value="running">{t("Running outline")}</option><option value="bean">{t("Bean outline")}</option><option value="satin">{t("Satin border")}</option></Select></label>
      {spec.border&&<div className="setting-grid">
        <label>{t("Colour")}<div className="colour-picker"><Input type="color" aria-label={t("Border colour")} value={spec.border.color} onChange={e=>onChange({border:{...spec.border!,color:e.target.value,thread:undefined}},'borderColor')}/><span>{spec.border.color.toUpperCase()}</span></div></label>
        {spec.border.kind==='satin'&&<label>{t("Width · mm")}<Input type="number" min={textLimits.borderWidth[0]} max={textLimits.borderWidth[1]} step=".1" value={spec.border.width} onChange={e=>{const n=number(e.target.value,textLimits.borderWidth);if(n!==null)onChange({border:{...spec.border!,width:n}},'borderWidth');}}/></label>}
      </div>}
    </div></Section>}
    {missing.length>0&&<p className="text-warning" role="status">{t("Not in this font:")} {missing.slice(0,12).join(' ')}</p>}
    {fill&&!spec.satin&&spec.size<5&&<p className="text-warning">{t("Fill letters under 5 mm lose detail. Use 6 mm or more, or a bean stitch outline.")}</p>}
  </section>;
}
