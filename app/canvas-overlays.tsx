'use client';
import {useT} from './i18n';
import {memo,useMemo} from 'react';
import {pathData,type Point,type Command} from '@/lib/project';
import {routeEnds} from '@/lib/curves';
import type {Warning} from '@/lib/check';
import {measureAngle} from '@/lib/measure';
import {unitValue,type Units} from '@/lib/view-settings';
import {AnnotationLabel} from '@/design-system';

export const IssueMarker=memo(function IssueMarker({focus,canvasScale,view,title,severityLabel,detail,onOpen,onClose}:{focus:Warning;canvasScale:number;view:[number,number,number,number];title:string;severityLabel:string;detail:string;onOpen:()=>void;onClose:()=>void}){
  const {t}=useT();
  // Work in screen pixels so zoom never inflates the annotation or its hit targets.
  const [x0,y0,x1,y1]=focus.bounds,pad=10,width=Math.max((x1-x0)*canvasScale+2*pad,32),height=Math.max((y1-y0)*canvasScale+2*pad,32);
  const x=(x0+x1)/2-width/2/canvasScale,y=(y0+y1)/2-height/2/canvasScale,c=8;
  const corners=`M0 ${c}V0H${c} M${width-c} 0H${width}V${c} M${width} ${height-c}V${height}H${width-c} M${c} ${height}H0V${height-c}`;
  const [vx,vy,vw,vh]=view,screenX=(x-vx)*canvasScale,screenY=(y-vy)*canvasScale;
  // Leave space for the editor's floating rail on the right.
  const labelWidth=Math.min(300,Math.max(0,vw*canvasScale-88));
  const labelX=Math.max(12,Math.min(screenX,vw*canvasScale-labelWidth-76))-screenX;
  const labelY=Math.max(76,Math.min(screenY-44,vh*canvasScale-110))-screenY;
  return <g className={`issue-marker ${focus.severity}`} transform={`translate(${x} ${y}) scale(${1/canvasScale})`}>
    <g pointerEvents="none" aria-hidden="true" fill="none" stroke="currentColor">
      <rect width={width} height={height} strokeWidth={1} strokeDasharray="3 5" opacity={.55}/>
      <path d={corners} stroke="var(--surface-raised)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"/>
      <path d={corners} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"/>
    </g>
    <foreignObject x={labelX-4} y={labelY-4} width={labelWidth+8} height={42} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
      <div style={{padding:4}}><AnnotationLabel title={title} severity={focus.severity} detail={detail} openLabel={`${title} · ${severityLabel} · ${t('Show issue details')}`} closeLabel={t('Close issue')} onOpen={onOpen} onClose={onClose}/></div>
    </foreignObject>
  </g>;
});
export const EndHandles=memo(function EndHandles({ends,canvasScale,onReset}:{ends:NonNullable<ReturnType<typeof routeEnds>>;canvasScale:number;onReset:(key:'entry'|'exit')=>void}){
  const {t}=useT();
  return <>{(['entry','exit'] as const).map(k=>{const [x,y]=ends[k],c=k==='entry'?'var(--success)':'var(--danger)',same=Math.hypot(ends.entry[0]-ends.exit[0],ends.entry[1]-ends.exit[1])*canvasScale<10,label=t(k==='entry'?'entryPoint':'exitPoint')+(ends.auto[k]?t('automatic'):'');
                return <g key={k} className="end-handle" data-end={k} role="button" tabIndex={0} aria-label={label} onKeyDown={e=>{if((e.key==='Delete'||e.key==='Backspace')&&!ends.auto[k]){e.preventDefault();e.stopPropagation();onReset(k);}}}><circle cx={x} cy={y} r={(k==='exit'&&same?6:12)/canvasScale} fill="transparent"/><circle cx={x} cy={y} r={(k==='entry'&&same?6.5:4.5)/canvasScale} fill={ends.auto[k]?'var(--surface-raised)':c} stroke={c} strokeWidth={1.6/canvasScale} pointerEvents="none"/><title>{t("{v0} · drag along the outline{v1}",{v0:label,v1:ends.auto[k]?'':t(' · Delete to reset')})}</title></g>;})}</>;
});
export const DraftOverlay=memo(function DraftOverlay({draft,displayDraft,closeable,closeHover,color,hover,drawing,freehand,brushWidth,curved,corners,canvasScale}:{draft:Point[];displayDraft:Point[];closeable:boolean;closeHover:boolean;color:string;hover:Point|null;drawing:boolean;freehand:boolean;brushWidth?:number;curved:boolean;corners:boolean[];canvasScale:number}){
  const {t}=useT();
  const paths=useMemo(()=>[displayDraft],[displayDraft]);
  const bands=!hover||drawing?[]:[[draft[draft.length-1],hover]];
  return <><path d={pathData(paths,false)} fill="none" stroke={color} strokeWidth={brushWidth??(freehand?.1:1/canvasScale)} strokeOpacity={brushWidth?.45:undefined} strokeLinecap={brushWidth?'round':undefined} strokeLinejoin={brushWidth?'round':undefined} pointerEvents="none"/>{bands.length>0&&<path d={pathData(bands,false)} fill="none" stroke="var(--draft-cursor)" strokeWidth={1/canvasScale} pointerEvents="none"/>}{!freehand&&draft.map(([x,y],i)=>{
    const first=i===0&&closeable&&draft.length>2,corner=!curved||corners[i],r=(corner?3:3.5)/canvasScale,c='var(--draft-node)';
    return <g key={i} data-draft-point={i} transform={`translate(${x} ${y})`}><g className="node-marker" style={{transform:first&&closeHover?'scale(2)':'scale(1)'}}>{corner?<rect x={-r} y={-r} width={2*r} height={2*r} fill="none" stroke={c} strokeWidth={2/canvasScale}/>:<circle r={r} fill="none" stroke={c} strokeWidth={2/canvasScale}/>}</g><circle r={12/canvasScale} fill="transparent"><title>{first?t("Click to close shape · drag to move point"):t("Drag to adjust point")}</title></circle></g>;
  })}</>;
});
export const ShapeOverlay=memo(function ShapeOverlay({shapePreview,shapeDraft,canvasScale}:{shapePreview:Point[];shapeDraft:{start:Point;end:Point};canvasScale:number}){
  return <g pointerEvents="none"><path d={pathData([shapePreview],true)} fill="var(--draft-fill)" stroke="var(--accent)" strokeWidth={1.5/canvasScale}/><path d={`M${shapeDraft.start[0]} ${shapeDraft.start[1]}L${shapeDraft.end[0]} ${shapeDraft.end[1]}`} stroke="var(--danger)" strokeWidth={1.2/canvasScale} strokeDasharray={`${4/canvasScale} ${3/canvasScale}`}/><circle cx={shapeDraft.start[0]} cy={shapeDraft.start[1]} r={3/canvasScale} fill="var(--danger)"/></g>;
});
export const MeasureOverlay=memo(function MeasureOverlay({measure,canvasScale,units='mm'}:{measure:{a:Point;b:Point};canvasScale:number;units?:Units}){
  const {formatNumber}=useT();
  const {a,b}=measure,d=Math.hypot(b[0]-a[0],b[1]-a[1]),f=11/canvasScale;return <g className="measure" pointerEvents="none"><path d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} stroke="var(--surface-raised)" strokeWidth={4/canvasScale} strokeLinecap="round"/><path d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} stroke="var(--measure-line)" strokeWidth={1.5/canvasScale}/>{[a,b].map((q,i)=><circle key={i} cx={q[0]} cy={q[1]} r={3/canvasScale} fill="var(--measure-line)" stroke="var(--surface-raised)" strokeWidth={1/canvasScale}/>)}<text x={(a[0]+b[0])/2} y={(a[1]+b[1])/2-8/canvasScale} fontSize={f} textAnchor="middle" fill="var(--measure-line)" stroke="var(--surface-raised)" strokeWidth={3/canvasScale} paintOrder="stroke" fontWeight="600">{formatNumber(unitValue(d,units),units==='in'?3:1)} {units} · {formatNumber(measureAngle(a,b),1)}°{units!=='in'&&<tspan x={(a[0]+b[0])/2} dy={22/canvasScale} fontSize={9/canvasScale}>{formatNumber(d/25.4,3)} in</tspan>}</text></g>;
});
export const NeedleMarker=memo(function NeedleMarker({needle,canvasScale}:{needle:Command;canvasScale:number}){
  const {t}=useT();
  return <g className="needle-marker" pointerEvents="none"><circle cx={needle.x} cy={needle.y} r={Math.max(.6,7/canvasScale)} fill="var(--needle-fill)" stroke="var(--surface-raised)" strokeWidth={3.2/canvasScale}/><circle cx={needle.x} cy={needle.y} r={Math.max(.6,7/canvasScale)} fill="none" stroke="var(--text)" strokeWidth={1.6/canvasScale}/><circle cx={needle.x} cy={needle.y} r={1.6/canvasScale} fill="var(--text)"/><title>{t("Needle position")}</title></g>;
});
