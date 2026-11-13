'use client';
import {BandSlider,Button,HelpText,Hint,Input,Section,SegmentedControl} from '@/design-system';
import {useT} from './i18n';
import type {ReactNode} from 'react';
import type {StitchObject} from '@/lib/project';
import {band,isRadial} from '@/lib/long-short';
import {fillPatterns} from '@/lib/fill-patterns';
import type {PatternParams} from '@/lib/fill-patterns';

export type Shading={layers:StitchObject[];onSelect:(id:string)=>void;onAdd:()=>void;onRemove:()=>void;onEdge:(index:number,value:number)=>void};
const spec=(key:keyof PatternParams)=>fillPatterns.find(p=>p.id==='longShort')!.params.find(f=>f.key===key)!;

// Long & short, in the order a beginner works: colours first, then direction, then texture.
// Shared settings (direction, length, variation, blend) apply to every colour of the set.
// density and angle are FillSettings' shared controls, passed in to avoid an import cycle.
export function LongShortSettings({item,onChange,shading,density,angle}:{item:StitchObject;onChange:(patch:Partial<StitchObject>)=>void;shading:Shading;density:ReactNode;angle:ReactNode}){
  const {t,formatNumber}=useT(),params=item.patternParams??{},radial=isRadial(item),{layers}=shading;
  const value=(key:keyof PatternParams)=>params[key]??spec(key).default;
  const set=(key:keyof PatternParams,v:number)=>{const next={...params,[key]:v};if(v===spec(key).default)delete next[key];onChange({patternParams:Object.keys(next).length?next:undefined});};
  const [a,b]=band(item),canAdd=Math.round((a+b)/2)-a>=4&&b-Math.round((a+b)/2)>=4,length=item.fillLength??4;
  const slider=(key:keyof PatternParams,label:string,hint:string,unit:string)=>{const f=spec(key);return <label className="long-short-slider"><span className="field-heading">{label}<Hint text={hint}/><span className="field-value">{formatNumber(value(key))}{unit}</span></span><Input type="range" min={f.min} max={f.max} step={f.step} value={value(key)} onChange={e=>set(key,Number(e.target.value))}/></label>;};
  return <>
    <Section id="long-short-shading" title={<>{t("Shading")}<Hint text={t("hint.longShort")}/></>} summaryExtra={t("{count} colours",{count:layers.length})} defaultOpen>
      <BandSlider className="long-short-bands" bands={layers.map((o,i)=>({id:o.id,color:o.color,selected:o.id===item.id,label:`${t("Colour {v0} of {v1}",{v0:i+1,v1:layers.length})} · ${o.thread?.name??o.color.toUpperCase()}`}))}
        edges={layers.slice(0,-1).map(o=>band(o)[1])} startLabel={t(radial?"Centre":"Start side")} endLabel={t(radial?"Outer edge":"End side")}
        edgeLabel={i=>t("Where colours {v0} and {v1} meet",{v0:i+1,v1:i+2})} onSelect={shading.onSelect} onEdgeChange={shading.onEdge}/>
      <div className="long-short-actions">
        <Button variant="soft" size="sm" disabled={!canAdd} onClick={shading.onAdd}>{t("Add a shade colour")}</Button>
        {layers.length>1&&<Button variant="secondary" size="sm" onClick={shading.onRemove}>{t("Remove this colour")}</Button>}
      </div>
      {layers.length>1&&slider('blend',t("Blend width · mm"),t("hint.blendWidth"),' mm')}
    </Section>
    <Section id="fill-direction" title={t("Direction")} summaryExtra={radial?t("Toward the centre"):`${formatNumber(item.angle)}°`}>
      <div className="density-choice">
        <span className="field-heading">{t("Direction")}<Hint text={t("hint.longShortDirection")}/></span>
        <SegmentedControl role="radiogroup" aria-label={t("Direction")}>{([[1,"Toward the centre"],[0,"Straight"]] as const).map(([v,label])=><Button variant="ghost" size="sm" key={v} role="radio" aria-checked={(radial?1:0)===v} onClick={()=>set('radial',v)}>{t(label)}</Button>)}</SegmentedControl>
      </div>
      {radial?<><HelpText>{t("Drag the centre marker on the canvas to aim the stitches.")}</HelpText>{item.center&&<Button variant="link" type="button" className="field-value reset" onClick={()=>onChange({center:undefined})}>{t("Reset center")}</Button>}</>
        :angle}
    </Section>
    <Section id="fill-density" title={t("Density")} defaultOpen>
      {density}
      <label className="long-short-slider"><span className="field-heading">{t("Stitch length · mm")}<Hint text={t("hint.longShortLength")}/><span className="field-value">{formatNumber(length)} mm</span></span><Input type="range" min="2" max="6" step=".5" value={length} onChange={e=>{const n=Number(e.target.value);onChange({fillLength:n===4?undefined:n});}}/></label>
      {slider('variation',t("Natural variation · %"),t("hint.variation"),' %')}
    </Section>
  </>;
}
