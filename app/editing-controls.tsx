'use client';
import {Button,Input,Section,Select} from '@/design-system';
import {OverlayControls} from './stitch-overlays';
import {memo} from 'react';
import {useT} from './i18n';
import {scaleHandles,handlePoint,type Rect,type Align} from '@/lib/editing';
import {unitValue,type ViewSettings} from '@/lib/view-settings';
import type {Key} from '@/lib/i18n';
import type {Point} from '@/lib/project';

export const TransformBox=memo(function TransformBox({box,canvasScale}:{box:Rect;canvasScale:number}){
  const {t}=useT(),s=canvasScale,r=4/s,cx=box.x+box.width/2,ry=box.y-25/s;
  return <g className="transform-box"><rect x={box.x} y={box.y} width={box.width} height={box.height} fill="none" stroke="var(--accent)" strokeWidth={1/s} pointerEvents="none"/><path d={`M${cx} ${box.y}V${ry}`} stroke="var(--accent)" strokeWidth={1/s} pointerEvents="none"/>{scaleHandles.map(h=>{const [x,y]=handlePoint(box,h),label=t('Scale selection {v0}',{v0:t(`handle.${h}`)});return <g key={h} data-transform={h} className={`scale-${h}`}><rect x={x-8/s} y={y-8/s} width={16/s} height={16/s} fill="transparent"/><rect x={x-r} y={y-r} width={2*r} height={2*r} fill="var(--surface-raised)" stroke="var(--accent)" strokeWidth={1.3/s} pointerEvents="none"/><title>{label}</title></g>;})}<g data-transform="rotate" style={{cursor:'crosshair'}}><circle cx={cx} cy={ry} r={9/s} fill="transparent"/><circle cx={cx} cy={ry} r={r} fill="var(--surface-raised)" stroke="var(--accent)" strokeWidth={1.3/s} pointerEvents="none"/><title>{t('Rotate selection')}</title></g></g>;
});
const alignments:Record<Align,Key>={left:'Align left',centre:'Align centre',right:'Align right',top:'Align top',middle:'Align middle',bottom:'Align bottom',horizontal:'Distribute horizontally',vertical:'Distribute vertically'};
export function SelectionTools({box,rotation,multi,disabled,size,onField,onAction,onAlign}:{box:Rect;rotation:number;multi:boolean;disabled:boolean;size:string;onField:(key:'x'|'y'|'width'|'height'|'rotation',value:number)=>void;onAction:(action:'flipH'|'flipV'|'rotate')=>void;onAlign:(mode:Align)=>void}){
  const {t}=useT(),fields={x:'Selection X · mm',y:'Selection Y · mm',width:'Selection width · mm',height:'Selection height · mm',rotation:'Selection rotation · °'} as const;
  return <fieldset disabled={disabled} className="tool-section selection-tools"><Section id="transform" title={t('Transform selection')} summaryExtra={size}><div className="setting-grid">{(Object.keys(fields) as (keyof typeof fields)[]).map(key=><label key={key}>{t(fields[key])}<Input key={(key==='rotation'?rotation:box[key]).toFixed(3)} type="number" step={key==='rotation'?1:.1} min={key==='width'||key==='height'?.01:undefined} defaultValue={Number((key==='rotation'?rotation:box[key]).toFixed(3))} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} onBlur={e=>{const n=e.currentTarget.valueAsNumber;if(Number.isFinite(n))onField(key,n);e.currentTarget.value=String(Number((key==='rotation'?rotation:box[key]).toFixed(3)));}}/></label>)}</div><div className="selection-actions">{(['flipH','flipV','rotate'] as const).map((a,i)=><Button variant="secondary" key={a} title={t((['Flip horizontal','Flip vertical','Rotate 90°'] as const)[i])+(i<2?` (Shift+${i?'V':'H'})`:'')} onClick={()=>onAction(a)}>{t((['Flip horizontal','Flip vertical','Rotate 90°'] as const)[i])}</Button>)}</div>{multi&&<div className="align-tools" role="group" aria-label={t('Align and distribute')}>{(Object.keys(alignments) as Align[]).map(mode=><Button variant="secondary" key={mode} onClick={()=>onAlign(mode)}>{t(alignments[mode])}</Button>)}</div>}</Section></fieldset>;
}
export function ViewControls({value,onChange}:{value:ViewSettings;onChange:(patch:Partial<ViewSettings>)=>void}){
  const {t}=useT();return <><h2 className="view-settings-heading">{t('View settings')}</h2><label>{t('Display units')}<Select value={value.units} onChange={e=>onChange({units:e.target.value as ViewSettings['units']})}>{(['mm','cm','in'] as const).map((unit,i)=><option key={unit} value={unit}>{t((['Millimetres','Centimetres','Inches'] as const)[i])}</option>)}</Select></label><div className="setting-grid"><label>{t('Grid size · mm')}<Input type="number" min=".5" max="50" step=".5" value={value.gridSize} onChange={e=>{const n=e.target.valueAsNumber;if(n>=.5&&n<=50)onChange({gridSize:n});}}/></label><label>{t('Fine grid subdivisions')}<Input type="number" min="1" max="10" step="1" value={value.subdivisions} onChange={e=>{const n=e.target.valueAsNumber;if(Number.isInteger(n)&&n>=1&&n<=10)onChange({subdivisions:n});}}/></label></div>{(['showGrid','snapGrid','snapObjects','rulers'] as const).map((key,i)=><label className="check-label" key={key}><Input type="checkbox" checked={value[key]} onChange={e=>onChange({[key]:e.target.checked})}/>{t((['Show grid','Snap to grid','Snap to objects','Show rulers'] as const)[i])}</label>)}<OverlayControls value={value} onChange={onChange}/></>;
}
export const CanvasRulers=memo(function CanvasRulers({width,height,scale,origin,units,hoop,selection}:{width:number;height:number;scale:number;origin:Point;units:ViewSettings['units'];hoop:{width:number;height:number};selection:Rect|null}){
  const {formatNumber}=useT();let step=units==='in'?2.54:1;while(step*scale<56)step*=2;
  const ticks=(axis:0|1,extent:number)=>Array.from({length:Math.min(500,Math.ceil(extent/(scale*step))+1)},(_,i)=>{const v=(Math.ceil(origin[axis]/step)+i)*step,pos=(v-origin[axis])*scale;return {v,pos};});
  const band=(axis:0|1,start:number,length:number,extent:number,className:string)=>{
    const from=Math.max(0,Math.min(extent,(start-origin[axis])*scale)),to=Math.max(0,Math.min(extent,(start+length-origin[axis])*scale));
    return axis===0?<rect className={className} x={from} width={to-from} height="20"/>:<rect className={className} y={from} width="20" height={to-from}/>;
  };
  return <div className="canvas-rulers" aria-hidden="true">
    <svg width={width} height="20" className="ruler-top">
      <rect width="100%" height="20"/>
      {band(0,0,hoop.width,width,'ruler-hoop-band')}
      {selection&&band(0,selection.x,selection.width,width,'ruler-selection-band')}
      {ticks(0,width).map(({v,pos})=><g key={v} className={v>=0&&v<=hoop.width?'ruler-in-hoop':undefined}><path d={`M${pos} 14v6`}/><text x={pos+3} y="11">{formatNumber(Number(unitValue(v,units).toFixed(3)))}</text></g>)}
    </svg>
    <svg width="20" height={height} className="ruler-left">
      <rect width="20" height="100%"/>
      {band(1,0,hoop.height,height,'ruler-hoop-band')}
      {selection&&band(1,selection.y,selection.height,height,'ruler-selection-band')}
      {ticks(1,height).map(({v,pos})=><g key={v} className={v>=0&&v<=hoop.height?'ruler-in-hoop':undefined}><path d={`M14 ${pos}h6`}/><text transform={`translate(11 ${pos+3}) rotate(-90)`}>{formatNumber(Number(unitValue(v,units).toFixed(3)))}</text></g>)}
    </svg>
    <span className="ruler-corner">{units}</span>
  </div>;
});
const shortcuts:[Key,Key][]=[['Ctrl / ⌘ C','Copy selection'],['Ctrl / ⌘ X','Cut selection'],['Ctrl / ⌘ V','Paste selection'],['Ctrl / ⌘ D','Duplicate selection'],['Ctrl / ⌘ A','Select all unlocked objects'],['Ctrl / ⌘ L','Lock / unlock selection'],['Right-click / Shift F10','Open the canvas menu'],['Arrow keys','Nudge 0.1 mm'],['Shift + arrow keys','Nudge 1 mm'],['Shift H','Flip horizontal'],['Shift V','Flip vertical'],['Ctrl / ⌘ Z / Shift Z','Undo / Redo'],['Ctrl / ⌘ G / Shift G','Group / Ungroup'],['Delete / Backspace','Delete selection or point'],['Enter','Finish drawing or point editing'],['Escape','Cancel drawing / exit editing'],['+ / − / Scroll','Zoom in / out'],['Corner drag + Shift','Proportional corner scale'],['Handle drag + Alt','Scale from centre'],['Rotate drag + Shift','Snap rotation to 15°'],['Ctrl / ⌘ + click','Toggle selection membership'],['Drag on empty canvas','Select objects in a box'],['Ctrl / ⌘ + box drag','Add boxed objects to selection'],['Shift + layer click','Select a layer range'],['Space / middle or right drag','Pan canvas'],['Left / right or double-click','Draw corner / smooth point'],['Ctrl / ⌘ + drag','Axis-lock point drag / snap drawing to 15°'],['Double-click point','Toggle corner / curve point'],['Focus end handle + Delete','Reset entry / exit point'],['A','Edit angles'],['F','Edit flow field'],['Ctrl / ⌘ + rectangle drag','Draw a square'],['Shift + canvas drag','Pan canvas']];
export function ShortcutHelp({tools,onClose}:{tools:{key:string;alt?:string;label:string}[];onClose:()=>void}){
  const {t}=useT();return <div className="shortcut-backdrop" onClick={onClose}><section className="shortcut-help" role="dialog" aria-modal="true" aria-label={t('Keyboard shortcuts')} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Tab'){const button=e.currentTarget.querySelector('button');e.preventDefault();button?.focus();}}}><div className="overlay-heading"><h2>{t('Keyboard shortcuts')}</h2><Button variant="secondary" autoFocus aria-label={t('Close shortcuts')} onClick={onClose}>×</Button></div><p>{t('Internal clipboard: saved in this browser, separate from the system clipboard.')}</p><dl>{tools.map(tool=><div key={tool.key}><dt>{tool.key}{tool.alt?` / ${tool.alt}`:''}</dt><dd>{tool.label}</dd></div>)}{shortcuts.map(([keys,description])=><div key={keys}><dt>{t(keys)}</dt><dd>{t(description)}</dd></div>)}<div><dt>0</dt><dd>{t('Fit hoop')}</dd></div><div><dt>?</dt><dd>{t('Keyboard shortcuts')}</dd></div></dl></section></div>;
}
