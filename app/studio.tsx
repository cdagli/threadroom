'use client';
import {useEffect, useRef, useState, useMemo, type PointerEvent as ReactPointerEvent} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {dragHistory} from '@/lib/drag';
import {bounds, defaultLocks, defaultTrimJump, demo, fabrics, fromFabric, hoops, isLockSetting, lockLimits, lockNames, isFillKind, isWideKind, kindNames, object, palette, pathData, resolve, satinLimits, underlayNames, underlayOptions, usesPull, usesShortStitches, usesSpacing, validProject, withFabric, type Compiled, type Fabric, type Kind, type Lock, type Locks, type Point, type Project, type Setting, type StitchObject, type Underlay} from '@/lib/project';
import {curvePoints, moveGeometry, simplifyPath, geometryPayload, closestInsertion, insertionHandles, insertGeometryPoint, removeGeometryPoint, routeEnds, withEnd} from '@/lib/curves';
import {clientToWorld, panViewport, viewportScale, zoomViewport, type Viewport} from '@/lib/viewport';
import {traceArtwork} from '@/lib/trace';
import {parse} from '@/lib/pes-parser';
import {exportSVG} from '@/lib/svg-export';
import {defaultText, layoutText, mergedOutline, type TextSpec} from '@/lib/text';
import {defaultFont, ensureFonts, loadedFonts} from '@/lib/fonts';
import StitchSelector from './stitch-selector';
import TextPanel from './text-panel';

type Tool = 'select' | 'freehand' | 'curve' | 'region' | 'points' | 'text' | 'pan';
const tools: {id:Tool;icon:string;label:string;key:string;hint:string}[]=[
  {id:'select',icon:'select',label:'Select',key:'V',hint:'Drag to move · Edit points to reshape · Drag the green/red dots to set start and end.'},
  {id:'freehand',icon:'pen',label:'Freehand',key:'B',hint:'Draw a stroke. Release to finish.'},
  {id:'curve',icon:'curve',label:'Curve',key:'C',hint:'Click to trace · Drag points to adjust · Enter to finish.'},
  {id:'region',icon:'region',label:'Fill',key:'F',hint:'Click around the shape. Click the first point or Close shape to finish.'},
  {id:'points',icon:'points',label:'Points',key:'P',hint:'Click to place stitch points, then Done.'},
  {id:'text',icon:'text',label:'Text',key:'T',hint:'Click the hoop to place text.'},
  {id:'pan',icon:'hand',label:'Pan',key:'H',hint:'Drag to move the canvas.'},
];
const icons: Record<string,string> = {
  settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
  image:'M3 4h18v16H3V4m0 12 6-6 4 4 3-3 5 5M16 8h0',
  close:'m6 6 12 12M18 6 6 18',
  curve:'M3 18C5 18 5 6 12 6s7 12 9 12M3 18h0M12 6h0M21 18h0',
  hand:'M8 13V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v7c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 3',
  needle:'M19 3 5 21M16 6l2 2M5 21l1-5 3 3-4 2',
  upload:'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  download:'M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5',
  select:'m5 3 14 10-7 1-3 7-4-18',
  pen:'m4 20 4-1L20 7l-3-3L5 16l-1 4m10-13 3 3',
  region:'m5 5 13-1 2 13-12 3-5-8 2-7M5 5h0M18 4h0M20 17h0M8 20h0',
  points:'M3 17l6-10 6 10 6-10M3 17h0M9 7h0M15 17h0M21 7h0',
  undo:'M9 4 4 9l5 5M4 9h10a6 6 0 0 1 0 12',
  redo:'m15 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12',
  plus:'M12 5v14M5 12h14',
  minus:'M5 12h14',
  fit:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  play:'m8 4 12 8-12 8V4',
  pause:'M8 4v16M16 4v16',
  trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  check:'m5 12 4 4L19 6',
  layers:'m3 8 9-5 9 5-9 5-9-5m0 5 9 5 9-5m-18 5 9 5 9-5',
  text:'M5 6V4h14v2M12 4v16M9 20h6',
};
function Icon({name, size=18}: {name: string; size?: number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name]||icons.needle}/></svg>;
}
function download(blob: Blob, name: string) {
  const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function pesBlob(encoded: string) {return new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))], {type:'application/octet-stream'});}
const textName=(content:string)=>content.trim().split('\n')[0].slice(0,30)||'Text';
// Text kinds that sew along the outline need each glyph contour closed.
const reclose=(rings:Point[][],closed:boolean)=>rings.map(r=>{const shut=r.length>1&&r[0][0]===r[r.length-1][0]&&r[0][1]===r[r.length-1][1];return closed&&!shut?[...r,r[0]]:!closed&&shut?r.slice(0,-1):r;});
const outsideHoop=(rings:Point[][],hoop:{width:number;height:number})=>rings.some(r=>r.some(([x,y])=>x<0||y<0||x>hoop.width||y>hoop.height));
const initial: Project={version:1,name:'Sleepy little bear',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:defaultLocks,trimJump:defaultTrimJump,objects:[]};

export default function Studio() {
  const [project,setProject]=useState<Project>(initial);
  const [ready,setReady]=useState(false), [saved,setSaved]=useState(true);
  const [selected,setSelected]=useState<string|null>(null), [tool,setTool]=useState<Tool>('select');
  const [history,setHistory]=useState<Project[]>([]), [future,setFuture]=useState<Project[]>([]);
  const [view,setView]=useState<'artwork'|'stitches'>('artwork');
  const [compiled,setCompiled]=useState<Compiled|null>(null), [busy,setBusy]=useState(false);
  const [message,setMessage]=useState(''), [error,setError]=useState(''), [apiState,setApiState]=useState<'checking'|'ready'|'offline'>('checking');
  const [draft,saveDraft]=useState<Point[]>([]), [drawing,setDrawing]=useState(false);
  const draftRef=useRef<Point[]>([]);
  function setDraft(next:Point[]|((points:Point[])=>Point[])){const value=typeof next==='function'?next(draftRef.current):next;draftRef.current=value;saveDraft(value);}
  const [curveClosed,setCurveClosed]=useState(false),[hover,setHover]=useState<Point|null>(null);
  const [imageOpacity,setImageOpacity]=useState(.5);
  const [spacePan,setSpacePan]=useState(false),[panMode,setPanMode]=useState(false);
  const [navigating,setNavigating]=useState(false);
  const draftDrag=useRef<{index:number;start:Point;before:Point[];moved:boolean}|null>(null);
  const closedDraft=tool==='region'||(tool==='curve'&&curveClosed);
  const canFinish=draft.length>=(closedDraft?3:2);
  const hasDraft=draft.length>0;
  const [colours,setColours]=useState(5), [ignoreBg,setIgnoreBg]=useState(true);
  const [showImage,setShowImage]=useState(true), [showJumps,setShowJumps]=useState(false);
  const [editPoints,setEditPoints]=useState(false);
  const [pointMode,setPointMode]=useState<'move'|'add'|'remove'>('move'),[activePoint,setActivePoint]=useState<[number,number]|null>(null);
  const [continuation,setContinuation]=useState<{id:string;fromStart:boolean;base:number}|null>(null);
  const [pathTarget,setPathTarget]=useState<string|null>(null),[guide,setGuide]=useState<{text:string;id:string;name:string}|null>(null);
  const [fontLoading,setFontLoading]=useState(0),[fontsReady,setFontsReady]=useState(0);
  const textArea=useRef<HTMLTextAreaElement>(null),lastFont=useRef(defaultFont),lastMerge=useRef<{key:string;time:number}|null>(null);
  const [zoom,setZoom]=useState(1), [pan,setPan]=useState<Point>([0,0]);
  const [canvasSize,setCanvasSize]=useState({width:1,height:1});
  const [playing,setPlaying]=useState(false), [progress,setProgress]=useState(1);
  const file=useRef<HTMLInputElement>(null), svg=useRef<SVGSVGElement>(null);
  const current=useRef(project); current.current=project;
  const revision=useRef(0), playback=useRef(0);
  const drag=useRef<{id:string;start:Point;source:StitchObject;before:Project;point?:[number,number];end?:'entry'|'exit';moved?:boolean}|null>(null);
  const panDrag=useRef<{start:Point;source:Point}|null>(null);
  const dragUndo=useRef(dragHistory<Project>()),endDragRef=useRef(()=>{});
  const viewport=useRef<Viewport>({zoom:1,pan:[0,0]});viewport.current={zoom,pan};
  const wheelHandler=useRef<((event:WheelEvent)=>void)|null>(null);
  const touches=useRef(new Map<number,Point>());
  const touchStart=useRef<{draft:Point[];project:Project}|null>(null);
  const touchNavigation=useRef(false);
  const pinch=useRef<{view:Viewport;anchor:Point;center:Point;distance:number}|null>(null);
  const hoop=hoops[project.hoop], item=project.objects.find(o=>o.id===selected), resolved=item&&resolve(item,project.fabric,project.locks), fabric=fabrics[project.fabric];
  const size=bounds(project.objects);
  const viewWidth=hoop.width*1.18/zoom, viewHeight=hoop.height*1.18/zoom;
  const viewX=hoop.width/2-viewWidth/2+pan[0], viewY=hoop.height/2-viewHeight/2+pan[1];
  const canvasScale=viewportScale({zoom,pan},canvasSize,hoop)||1;
  const editing=editPoints&&tool==='select'&&!!item&&!item.text&&view==='artwork'&&!hasDraft;
  const handles=useMemo(()=>editing&&item?insertionHandles(item):[],[editing,item]);
  const addPreview=editing&&pointMode==='add'&&item&&hover?closestInsertion(item,hover):null;
  const canUndoDraft=hasDraft&&draft.length>(continuation?.base||0);
  const ends=useMemo(()=>tool==='select'&&view==='artwork'&&item&&!editing&&!hasDraft&&!continuation?routeEnds(project,item.id):null,[tool,view,item,editing,hasDraft,continuation,project]);

  useEffect(()=>{
    const canvas=svg.current;if(!canvas)return;
    const observer=new ResizeObserver(()=>{const rect=canvas.getBoundingClientRect();setCanvasSize({width:rect.width,height:rect.height});});observer.observe(canvas);
    const wheel=(e:WheelEvent)=>wheelHandler.current?.(e);
    canvas.addEventListener('wheel',wheel,{passive:false});
    return()=>{observer.disconnect();canvas.removeEventListener('wheel',wheel);};
  },[]);
  useEffect(()=>{setActivePoint(null);setPointMode('move');},[selected,editPoints]);
  useEffect(()=>{if(tool!=='curve')setPathTarget(null);},[tool]);
  const missingGlyphs=useMemo(()=>{
    if(!item?.text||fontLoading)return [];void fontsReady;
    const fonts=loadedFonts(item.text.font);if(!fonts.length)return [];
    return [...new Set(item.text.content.replace(/\s/g,''))].filter(c=>!fonts.some(f=>f.charToGlyphIndex(c)>0));
  },[item?.text,fontLoading,fontsReady]);

  function applyViewport(next:Viewport){viewport.current=next;setZoom(next.zoom);setPan(next.pan);setHover(null);}
  function zoomBy(factor:number,client?:Point){
    const view=viewport.current,rect=svg.current!.getBoundingClientRect();
    const anchor=client?clientToWorld(view,client,rect,hoop):[hoop.width/2+view.pan[0],hoop.height/2+view.pan[1]] as Point;
    applyViewport(zoomViewport(view,anchor,view.zoom*factor,hoop));
  }
  wheelHandler.current=(e:WheelEvent)=>{
    e.preventDefault();if(drag.current||draftDrag.current||drawing||panDrag.current)return;
    const delta=e.deltaMode===1?16:e.deltaMode===2?canvasSize.height:1;
    if(e.shiftKey||e.altKey||(!e.ctrlKey&&!e.metaKey&&Math.abs(e.deltaX)>Math.abs(e.deltaY)*.5)){
      const scale=viewportScale(viewport.current,svg.current!.getBoundingClientRect(),hoop);
      applyViewport(panViewport(viewport.current,[e.shiftKey&&!e.deltaX?-e.deltaY*delta:-e.deltaX*delta,e.shiftKey?0:-e.deltaY*delta],scale));
    }else zoomBy(Math.exp(-Math.max(-200,Math.min(200,e.deltaY*delta))*(e.ctrlKey||e.metaKey ? .01 : .002)),[e.clientX,e.clientY]);
  };

  useEffect(()=>{
    const up=()=>endDragRef.current();
    window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
    return()=>{window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);};
  },[]);
  useEffect(()=>{
    let p:Project=demo();
    try {const text=localStorage.getItem('threadroom-project-v1');if(text){const value=JSON.parse(text);if(validProject(value))p=value;}}catch{/* Storage is optional. */}
    setProject(p);setSelected(p.objects[0]?.id||null);setReady(true);
    fetch('/api/export').then(r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>setApiState(data.python?'ready':'offline')).catch(()=>setApiState('offline'));
  },[]);
  useEffect(()=>{
    if(!ready)return;
    const timer=setTimeout(()=>{try{localStorage.setItem('threadroom-project-v1',JSON.stringify(project));setSaved(true);}catch{setSaved(false);}},500);
    return()=>clearTimeout(timer);
  },[project,ready]);
  useEffect(()=>{
    if(!playing||!compiled)return;
    let last=performance.now();
    const tick=(now:number)=>{const delta=(now-last)/1000;last=now;setProgress(p=>{const n=Math.min(1,p+delta*450/compiled.commands.length);if(n>=1)setPlaying(false);return n;});playback.current=requestAnimationFrame(tick);};
    playback.current=requestAnimationFrame(tick);return()=>cancelAnimationFrame(playback.current);
  },[playing,compiled]);

  function commit(next:Project, label='', merge?:string) {
    // Typing and slider drags coalesce into one undo step per field.
    const now=performance.now(),same=!!merge&&lastMerge.current?.key===merge&&now-lastMerge.current.time<1500;
    lastMerge.current=merge?{key:merge,time:now}:null;
    // Read the previous state now: the updater may run after current.current changes.
    const previous=current.current;if(!same){setHistory(h=>[...h.slice(-29),previous]);setFuture([]);}
    current.current=next;setProject(next);invalidate();setSaved(false);if(label)setMessage(label);
  }
  function invalidate(){revision.current++;setCompiled(null);setPlaying(false);setProgress(1);setView('artwork');setError('');}
  function layoutObject(o:StitchObject):StitchObject{
    if(!o.text)return o;const fonts=loadedFonts(o.text.font);if(!fonts.length)return o;
    return {...o,rings:layoutText(o.text,fonts,!isFillKind(o.kind)).rings};
  }
  function relayout(id:string){
    const p=current.current,o=p.objects.find(x=>x.id===id);if(!o?.text)return;
    const next=layoutObject(o);if(next===o)return;
    current.current={...p,objects:p.objects.map(x=>x.id===id?next:x)};setProject(current.current);invalidate();setSaved(false);
  }
  function loadTextFonts(id:string,spec:TextSpec){
    setFontLoading(n=>n+1);
    ensureFonts(spec.font,spec.content).then(changed=>{if(changed)relayout(id);setFontsReady(n=>n+1);}).catch(e=>setError(e instanceof Error?e.message:'The font could not be loaded.')).finally(()=>setFontLoading(n=>n-1));
  }
  function updateText(patch:Partial<TextSpec>,merge?:string){
    if(!item?.text)return;
    const text={...item.text,...patch},name=patch.content!==undefined&&item.name===textName(item.text.content)?textName(text.content):item.name;
    if(patch.font)lastFont.current=text.font;
    const next=layoutObject({...item,name,text});
    commit({...project,objects:project.objects.map(o=>o.id===item.id?next:o)},'',merge&&`${item.id}:${merge}`);
    if(patch.font||patch.content!==undefined)loadTextFonts(item.id,text);
  }
  function placeText(p:Point){
    const text=defaultText(lastFont.current,p),o=layoutObject({...object('Your text',[],'fill',item?.color||palette[3]),underlay:'edge',text});
    commit({...project,objects:[...project.objects,o]});setSelected(o.id);setTool('select');setEditPoints(false);
    loadTextFonts(o.id,text);
    requestAnimationFrame(()=>{textArea.current?.focus();textArea.current?.select();});
  }
  function focusText(){requestAnimationFrame(()=>{textArea.current?.focus();textArea.current?.select();});}
  function convertText(){
    if(!item?.text)return;
    if(!item.rings.length){setError('Type some text before converting it to shapes.');return;}
    const {text,...shape}=item;void text;
    commit({...project,objects:project.objects.map(o=>o.id===item.id?{...shape,rings:reclose(shape.rings,!isFillKind(shape.kind))}:o)},'Text converted to editable shapes');
  }
  function useGuide(id:string){
    const source=project.objects.find(o=>o.id===id);if(!source||!item?.text)return;
    const path=source.curve?curvePoints(source.curve.points,source.curve.closed):source.rings[0];
    const closed=!source.curve&&isFillKind(source.kind)||!!source.curve?.closed;
    updateText({layout:'path',path:closed?[...path,path[0]]:path.map(p=>[...p] as Point)});
    setGuide({text:item.id,id,name:source.name});
  }
  function removeGuide(){if(!guide)return;commit({...project,objects:project.objects.filter(o=>o.id!==guide.id)});setGuide(null);}
  function drawTextPath(){if(!item?.text)return;const id=item.id;setCurveClosed(false);chooseTool('curve');setPathTarget(id);}
  function updateObject(patch:Partial<StitchObject>){if(!item)return;let next={...item,...patch};for(const key of Object.keys(patch) as (keyof StitchObject)[])if(patch[key]===undefined)delete next[key];
    if(next.text&&patch.kind){const relaid=layoutObject(next);next=relaid!==next?relaid:{...next,rings:reclose(next.rings,!isFillKind(patch.kind))};if(patch.kind==='manual')next.kind='running';}if(next.curve&&patch.kind==='manual'){next={...next,rings:[next.curve.points]};delete next.curve;}else if(next.curve&&patch.kind){next={...next,curve:{...next.curve,closed:isFillKind(patch.kind)},rings:[curvePoints(next.curve.points,isFillKind(patch.kind))]};}commit({...project,objects:project.objects.map(o=>o.id===selected?next:o)});}
  function undo(){endDrag();setActivePoint(null);if(draftRef.current.length){if(canUndoDraft)setDraft(d=>d.slice(0,-1));return;}if(!history.length)return;const before=history[history.length-1];setFuture(f=>[current.current,...f]);setHistory(history.slice(0,-1));setProject(before);setSelected(before.objects.some(o=>o.id===selected)?selected:before.objects[0]?.id||null);invalidate();setDraft([]);}
  function redo(){setActivePoint(null);if(!future.length)return;const previous=current.current;setHistory(h=>[...h,previous]);setProject(future[0]);setSelected(future[0].objects.some(o=>o.id===selected)?selected:future[0].objects[0]?.id||null);setFuture(future.slice(1));invalidate();}
  function closePanel(id:string){const panel=document.getElementById(id);if(panel?.matches(':popover-open'))panel.hidePopover();}
  function point(e:ReactPointerEvent<SVGSVGElement>):Point {
    return clientToWorld(viewport.current,[e.clientX,e.clientY],svg.current!.getBoundingClientRect(),hoop);
  }
  function cancelDrawing(){draftDrag.current=null;setPanMode(false);setDraft([]);setDrawing(false);setHover(null);setError('');if(continuation){setTool('select');setEditPoints(true);}setContinuation(null);if(pathTarget)setSelected(pathTarget);setPathTarget(null);}
  function finish(points=draftRef.current, automatic=false){
    if(points.length<(closedDraft?3:2))return;
    const kind:Kind=closedDraft?'fill':tool==='points'?'manual':'running';
    const rings=tool==='curve'?[curvePoints(points,closedDraft)]:[tool==='freehand'?simplifyPath(points):points];
    if(rings.flat().some(([x,y])=>x<0||y<0||x>hoop.width||y>hoop.height)){setError('Curve exceeds the hoop. Drag its points inward, then finish.');return;}
    const target=pathTarget&&project.objects.find(o=>o.id===pathTarget);
    if(target&&target.text){
      const next=layoutObject({...target,text:{...target.text,layout:'path',path:rings[0]}});
      commit({...project,objects:project.objects.map(o=>o.id===target.id?next:o)});setGuide(null);cancelDrawing();setTool('select');setSelected(target.id);return;
    }
    const anchors=continuation?.fromStart?[...points].reverse():points;
    const existing=continuation&&project.objects.find(o=>o.id===continuation.id);
    const next=existing?{...existing,rings:[curvePoints(anchors,false)]}:object(closedDraft?'Traced fill':tool==='curve'?'Curve':tool==='points'?'Point stitches':'Freehand line',rings,kind,item?.color||palette[3]);
    if(tool==='curve')next.curve={points:anchors.map(p=>[...p]),closed:closedDraft};
    commit({...project,objects:existing?project.objects.map(o=>o.id===next.id?next:o):[...project.objects,next]});setSelected(next.id);setActivePoint(null);cancelDrawing();
    if(!automatic){setTool('select');setEditPoints(tool==='curve');}
  }
  function deleteSelected(){if(!selected)return;commit({...project,objects:project.objects.filter(o=>o.id!==selected)});setSelected(null);}
  function finishEditing(){setEditPoints(false);setActivePoint(null);setPointMode('move');svg.current?.focus({preventScroll:true});}
  function savePointChange(next:StitchObject){
    if(next.rings.flat().some(([x,y])=>x<0||y<0||x>hoop.width||y>hoop.height)){setError('That adjustment extends outside the hoop. Move the point inward.');return false;}
    commit({...project,objects:project.objects.map(o=>o.id===next.id?next:o)});return true;
  }
  function addPoint(ring:number,index:number,p:Point){if(!item)return;const next=insertGeometryPoint(item,ring,index,p);if(next===item)return;if(savePointChange(next)){setActivePoint([ring,index]);setPointMode('move');}}
  function removePoint(location=activePoint){if(!item||!location)return;const next=removeGeometryPoint(item,...location);if(next===item){setError(`Keep at least ${item.curve?.closed||isFillKind(item.kind)?3:2} points in this path.`);return;}if(savePointChange(next)){setActivePoint(null);svg.current?.focus({preventScroll:true});}}
  function continueCurve(){
    if(!item?.curve||item.curve.closed)return;
    const fromStart=activePoint?.[1]===0,points=item.curve.points.map(p=>[...p] as Point);
    setContinuation({id:item.id,fromStart,base:points.length});setDraft(fromStart?points.reverse():points);setTool('curve');setCurveClosed(false);setPanMode(false);setActivePoint(null);svg.current?.focus({preventScroll:true});
  }
  // Avoid intercepting text input or native controls; shortcuts act on the canvas.
  useEffect(()=>{
    const typing=(target:EventTarget|null)=>target instanceof HTMLElement&&!!target.closest('input,select,textarea,[contenteditable="true"]');
    const keydown=(e:KeyboardEvent)=>{
      if(typing(e.target)||document.querySelector('[popover]:popover-open'))return;
      if(e.target instanceof HTMLElement&&e.target.closest('button,a')&&(e.key==='Enter'||e.code==='Space'))return;
      if(e.code==='Space'&&!(e.target instanceof HTMLElement&&e.target.closest('button,a'))){e.preventDefault();setSpacePan(true);return;}
      if(e.key==='Escape'){e.preventDefault();if(hasDraft)cancelDrawing();else if(editing)finishEditing();else{setTool('select');setEditPoints(false);setSelected(null);}return;}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey&&!hasDraft)redo();else undo();return;}
      if(e.ctrlKey||e.metaKey||e.altKey)return;
      if(e.key==='+'||e.key==='='){e.preventDefault();zoomBy(1.2);return;}
      if(e.key==='-'||e.key==='_'){e.preventDefault();zoomBy(1/1.2);return;}
      if(e.key==='Enter'&&hasDraft){e.preventDefault();finish();return;}
      if(e.key==='Enter'&&editing){e.preventDefault();finishEditing();return;}
      if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();if(hasDraft){if(canUndoDraft)setDraft(d=>d.slice(0,-1));}else if(editing)removePoint();else deleteSelected();return;}
      const next=tools.find(t=>t.key.toLowerCase()===e.key.toLowerCase());if(next&&(!hasDraft||next.id==='pan')){e.preventDefault();chooseTool(next.id);}
    };
    const keyup=(e:KeyboardEvent)=>{if(e.code==='Space')setSpacePan(false);};
    const blur=()=>{setSpacePan(false);};
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);
    return()=>{window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);};
  });
  // Drags commit one undo step when they end: on pointer-up, lost capture, a window pointer-up
  // (if capture failed) or, as a last resort, the next pointer-down.
  function capture(e:ReactPointerEvent<SVGSVGElement>){try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* Window pointer-up still ends the drag. */}}
  function startDrag(d:Omit<NonNullable<typeof drag.current>,'before'>,e:ReactPointerEvent<SVGSVGElement>){endDrag();drag.current={...d,before:current.current};dragUndo.current.begin(current.current);capture(e);}
  function endDrag(){drag.current=null;const before=dragUndo.current.end();if(before){setHistory(h=>[...h.slice(-29),before]);setFuture([]);}}
  endDragRef.current=endDrag;
  function dragTo(next:Project){dragUndo.current.update(next);current.current=next;setProject(next);invalidate();setSaved(false);}
  function pointerDown(e:ReactPointerEvent<SVGSVGElement>){
    e.currentTarget.focus({preventScroll:true});
    if(e.pointerType==='touch'){
      if(!touches.current.size){touchStart.current={draft:draftRef.current,project:current.current};touchNavigation.current=false;}
      touches.current.set(e.pointerId,[e.clientX,e.clientY]);capture(e);
      if(touches.current.size>=2){
        touchNavigation.current=true;setNavigating(true);const points=Array.from(touches.current.values()).slice(0,2),center:Point=[(points[0][0]+points[1][0])/2,(points[0][1]+points[1][1])/2];
        if(touchStart.current){setDraft(touchStart.current.draft);if(drag.current){dragUndo.current.cancel();current.current=touchStart.current.project;setProject(touchStart.current.project);}}
        setDrawing(false);draftDrag.current=null;drag.current=null;panDrag.current=null;
        pinch.current={view:viewport.current,anchor:clientToWorld(viewport.current,center,e.currentTarget.getBoundingClientRect(),hoop),center,distance:Math.max(1,Math.hypot(points[0][0]-points[1][0],points[0][1]-points[1][1]))};return;
      }
      if(touchNavigation.current)return;
    }
    endDrag();if(e.button>2)return;
    if(e.button===1||e.button===2||view==='stitches'||tool==='pan'||panMode||spacePan||(tool==='select'&&e.shiftKey)){setNavigating(true);panDrag.current={start:[e.clientX,e.clientY],source:viewport.current.pan};capture(e);return;}
    if(e.button!==0)return;
    const p=point(e);if(p[0]<0||p[1]<0||p[0]>hoop.width||p[1]>hoop.height)return;
    if(tool==='freehand'){setDraft([p]);setDrawing(true);capture(e);}
    else if(tool==='region'||tool==='points'||tool==='curve'){
      const scale=canvasScale;
      const target=e.target as SVGElement;
      const anchor=target.closest('[data-draft-point]')?.getAttribute('data-draft-point');
      const index=anchor!==undefined&&anchor!==null?Number(anchor):closedDraft&&canFinish&&Math.hypot(p[0]-draft[0][0],p[1]-draft[0][1])*scale<12?0:-1;
      if(index>=0){draftDrag.current={index,start:[e.clientX,e.clientY],before:draft,moved:false};capture(e);return;}
      if(tool==='curve'&&draft.length>=200){setError('Use at most 200 curve points. Finish this curve to start another.');return;}
      if(!draft.length||Math.hypot(p[0]-draft[draft.length-1][0],p[1]-draft[draft.length-1][1])*scale>3)setDraft(d=>[...d,p]);
    }
    else if(tool==='text'){
      const id=(e.target as SVGElement).closest('[data-object]')?.getAttribute('data-object'),hit=project.objects.find(o=>o.id===id&&o.text);
      if(hit){setSelected(hit.id);setTool('select');focusText();}else placeText(p);
    }
    else {
      const target=e.target as SVGElement;
      const id=target.closest('[data-object]')?.getAttribute('data-object');
      const source=project.objects.find(o=>o.id===id);
      const node=target.closest('[data-point]'),insertion=target.closest('[data-insert]'),end=target.closest('[data-end]')?.getAttribute('data-end');
      if(ends&&item&&(end==='entry'||end==='exit')){startDrag({id:item.id,start:p,source:item,end},e);return;}
      if(editing&&item){
        if(insertion){const handle=handles.find(h=>h.ring===Number(insertion.getAttribute('data-ring'))&&h.index===Number(insertion.getAttribute('data-insert')));if(handle)addPoint(handle.ring,handle.index,handle.point);return;}
        if(source?.id===item.id&&node){const location:[number,number]=[Number(node.getAttribute('data-ring')),Number(node.getAttribute('data-point'))];setActivePoint(location);if(pointMode==='remove'){removePoint(location);return;}startDrag({id:source.id,start:p,source,point:location},e);return;}
        if(pointMode==='add'){const nearest=closestInsertion(item,p);if(nearest&&nearest.distance*scaleForCanvas()<16)addPoint(nearest.ring,nearest.index,nearest.point);return;}
        if(source?.id===item.id){setActivePoint(null);return;}
      }
      if(source){setSelected(source.id);setActivePoint(null);startDrag({id:source.id,start:p,source},e);}
      else if(!editing)setSelected(null);
    }
  }
  function scaleForCanvas(){return viewportScale(viewport.current,svg.current!.getBoundingClientRect(),hoop);}
  function pointerMove(e:ReactPointerEvent<SVGSVGElement>){
    if(e.pointerType==='touch'&&touches.current.has(e.pointerId)){
      touches.current.set(e.pointerId,[e.clientX,e.clientY]);
      if(touchNavigation.current){
        const points=Array.from(touches.current.values()).slice(0,2),start=pinch.current;
        if(points.length===2&&start){const center:Point=[(points[0][0]+points[1][0])/2,(points[0][1]+points[1][1])/2],distance=Math.hypot(points[0][0]-points[1][0],points[0][1]-points[1][1]);const next=zoomViewport(start.view,start.anchor,start.view.zoom*distance/start.distance,hoop);applyViewport(panViewport(next,[center[0]-start.center[0],center[1]-start.center[1]],viewportScale(next,e.currentTarget.getBoundingClientRect(),hoop)));}return;
      }
    }
    const p=point(e);
    if(['curve','region','points'].includes(tool)||(editing&&pointMode==='add'))setHover(p[0]>=0&&p[1]>=0&&p[0]<=hoop.width&&p[1]<=hoop.height?p:null);
    if(panDrag.current){const d=panDrag.current;applyViewport(panViewport({zoom:viewport.current.zoom,pan:d.source},[e.clientX-d.start[0],e.clientY-d.start[1]],scaleForCanvas()));return;}
    if(draftDrag.current){const d=draftDrag.current;if(Math.hypot(e.clientX-d.start[0],e.clientY-d.start[1])>3)d.moved=true;if(d.moved)setDraft(d.before.map((a,i)=>i===d.index?[Math.max(0,Math.min(hoop.width,p[0])),Math.max(0,Math.min(hoop.height,p[1]))]:a));return;}
    if(drawing){if(p[0]>=0&&p[1]>=0&&p[0]<=hoop.width&&p[1]<=hoop.height)setDraft(d=>!d.length||Math.hypot(p[0]-d[d.length-1][0],p[1]-d[d.length-1][1])>0.5?[...d,p]:d);}
    const d=drag.current;
    if(d){
      const dx=p[0]-d.start[0],dy=p[1]-d.start[1];
      if(!d.moved&&Math.hypot(dx,dy)*canvasScale<.5)return;
      d.moved=true;
      if(d.end){const next=withEnd(d.source,d.end,p);dragTo({...d.before,objects:d.before.objects.map(o=>o.id===d.id?next:o)});return;}
      const next=moveGeometry(d.source,([x,y],ri,i)=>d.point&&(d.point[0]!==ri||d.point[1]!==i)?[x,y]:[x+dx,y+dy]);
      // Objects already outside the hoop (e.g. text that grew) can be dragged back in.
      if(outsideHoop(next.rings,hoop)&&!outsideHoop(d.source.rings,hoop))return;
      dragTo({...d.before,objects:d.before.objects.map(o=>o.id===d.id?next:o)});
    }
  }
  function pointerUp(e:ReactPointerEvent<SVGSVGElement>){
    if(e.pointerType==='touch'){touches.current.delete(e.pointerId);if(touchNavigation.current){pinch.current=null;if(!touches.current.size){touchNavigation.current=false;touchStart.current=null;setNavigating(false);}return;}if(!touches.current.size)touchStart.current=null;}
    setNavigating(false);
    panDrag.current=null;
    if(draftDrag.current){const d=draftDrag.current;draftDrag.current=null;if(d.index===0&&closedDraft&&canFinish&&!d.moved)finish();return;}
    endDrag();
    if(drawing){setDrawing(false);if(draftRef.current.length>=2)finish(draftRef.current,true);else cancelDrawing();}
  }
  function pointerCancel(e:ReactPointerEvent<SVGSVGElement>){touches.current.delete(e.pointerId);pinch.current=null;touchNavigation.current=touches.current.size>0;setNavigating(false);panDrag.current=null;if(drag.current){const before=dragUndo.current.cancel()??drag.current.before;drag.current=null;current.current=before;setProject(before);}if(draftDrag.current){setDraft(draftDrag.current.before);draftDrag.current=null;}if(drawing)cancelDrawing();}
  function chooseTool(t:Tool){if(draftRef.current.length){if(t==='pan')setPanMode(p=>!p);else if(t===tool)setPanMode(false);return;}setTool(t);cancelDrawing();if(t!=='pan')setView('artwork');setPlaying(false);if(t==='text')ensureFonts(lastFont.current,'Your text').catch(()=>{});}
  function fit(){applyViewport({zoom:1,pan:[0,0]});}
  function fitArtwork(width=project.artwork?.width||hoop.width,height=project.artwork?.height||hoop.height){applyViewport({zoom:Math.max(1,Math.min(6,Math.min(hoop.width/width,hoop.height/height)*.82)),pan:[0,0]});}
  function editObject(){setTool('select');setView('artwork');setEditPoints(true);setActivePoint(null);setPointMode('move');}
  const displayDraft=tool==='curve'?curvePoints(draft,closedDraft):draft;
  function changeHoop(value:string){
    const nextHoop=hoops[value],dx=(nextHoop.width-hoop.width)/2,dy=(nextHoop.height-hoop.height)/2;
    commit({...project,hoop:value,objects:project.objects.map(o=>moveGeometry(o,([x,y])=>[x+dx,y+dy])),artwork:project.artwork?{...project.artwork,x:project.artwork.x+dx,y:project.artwork.y+dy}:undefined});fit();
  }
  function resizeDesign(width:number){
    if(!size.width||!Number.isFinite(width)||width<=0)return;
    const scale=width/size.width,cx=size.x+size.width/2,cy=size.y+size.height/2;
    commit({...project,objects:project.objects.map(o=>moveGeometry(o,([x,y])=>[cx+(x-cx)*scale,cy+(y-cy)*scale]))});
  }
  async function importFile(f:File){
    if(hasDraft){setError('Finish or cancel the current path before importing.');return;}
    setError('');setMessage('');setDraft([]);chooseTool('select');
    try{
      if(f.size>8*1024*1024)throw new Error('Choose a file smaller than 8 MB.');
      if(/\.json$/i.test(f.name)){
        const p:unknown=JSON.parse(await f.text());if(!validProject(p))throw new Error('This is not a supported Threadroom project.');
        commit(p);setSelected(p.objects[0]?.id||null);fit();closePanel('artwork-panel');return;
      }
      if(/\.(pes|pec)$/i.test(f.name)){
        const data=await f.arrayBuffer(), parsed=parse(data,f.name), h=hoops[project.hoop];
        if(parsed.commands.length>100000)throw new Error('This prototype previews files with up to 100,000 stitch commands.');
        const dx=h.width/2-(parsed.bounds.minX+parsed.bounds.maxX)/2,dy=h.height/2-(parsed.bounds.minY+parsed.bounds.maxY)/2;
        commit({...project,name:parsed.name,objects:[],artwork:undefined});
        let binary='';for(const b of new Uint8Array(data))binary+=String.fromCharCode(b);
        setCompiled({pes:btoa(binary),filename:f.name,commands:parsed.commands.filter(c=>c.type==='stitch'||c.type==='jump').map(c=>({...c,x:c.x+dx,y:c.y+dy,fromX:c.fromX+dx,fromY:c.fromY+dy})),threads:parsed.blocks,stats:{stitches:parsed.stitches,jumps:parsed.jumps,jumpLength:Math.round(parsed.commands.filter((c,i)=>i&&c.type==='jump').reduce((s,c)=>s+Math.hypot(c.x-c.fromX,c.y-c.fromY),0)*10)/10,trims:parsed.trims,colorChanges:parsed.colorChanges,width:parsed.width,height:parsed.height,maxStitch:0,bytes:f.size,durationMs:0},engine:'Imported PES',pesVersion:'Imported'});
        setView('stitches');setSelected(null);fit();closePanel('artwork-panel');return;
      }
      if(!/\.(png|jpe?g|webp|svg)$/i.test(f.name))throw new Error('Choose PNG, JPG, WebP, SVG, PES, PEC, or a Threadroom JSON project.');
      const src=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(f);});
      await loadImage(src,f.name);closePanel('artwork-panel');
    }catch(e){setError(e instanceof Error?e.message:'This file could not be opened.');}
  }
  async function loadImage(src:string,name:string){
    const img=new Image();img.src=src;await img.decode();
    if(img.naturalWidth*img.naturalHeight>25_000_000)throw new Error('Use an image smaller than 25 megapixels.');
    const ratio=img.naturalHeight/img.naturalWidth, width=Math.min(60,hoop.width*0.75,hoop.height*0.75/ratio),height=width*ratio;
    commit({...project,name:name.replace(/\.[^.]+$/,''),objects:[],artwork:{src,name,width,height,x:(hoop.width-width)/2,y:(hoop.height-height)/2}});setSelected(null);setShowImage(true);setImageOpacity(.65);fitArtwork(width,height);setTool('curve');setCurveClosed(true);
  }
  async function trace(){
    if(!project.artwork||hasDraft)return;setBusy(true);setError('');
    const before=project, version=revision.current;
    try{const objects=await traceArtwork(before.artwork!,colours,ignoreBg);if(revision.current!==version)return;commit({...before,objects},`${objects.length} regions traced`);setSelected(objects[0]?.id||null);setShowImage(true);setImageOpacity(.25);setEditPoints(false);setTool('select');closePanel('artwork-panel');}catch(e){setError(e instanceof Error?e.message:'Tracing failed.');}finally{setBusy(false);}
  }
  async function generate(exportFile=false){
    if(hasDraft){setError('Finish or cancel the current path before previewing.');return;}
    if(compiled){if(exportFile)download(pesBlob(compiled.pes),compiled.filename);else setView('stitches');return;}
    setBusy(true);setError('');const version=revision.current;
    try{
      const response=await fetch('/api/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(geometryPayload(project)),signal:AbortSignal.timeout(60000)});
      if(!response.headers.get('Content-Type')?.includes('application/json'))throw new Error(`The export URL returned a web page (HTTP ${response.status}), rather than the embroidery API. Restart npm run dev to reconnect Python and Next.js.`);
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Export failed.');
      if(version!==revision.current){setMessage('The design changed while generating. Generate again to preview the latest version.');return;}
      setCompiled(result);setView('stitches');setProgress(1);setApiState('ready');
      setMessage('');
      if(exportFile)download(pesBlob(result.pes),result.filename);
    }catch(e){setError(e instanceof Error&&e.name!=='SyntaxError'?e.message:'The Python API is unavailable. Start with npm run dev, or check the Vercel Python Function logs.');}finally{setBusy(false);}
  }
  const stitchPaths=useMemo(()=>{
    if(!compiled)return[];const n=Math.floor(compiled.commands.length*progress), paths=compiled.threads.map(()=>({stitch:'',jump:''}));
    for(const c of compiled.commands.slice(0,n)){if(!paths[c.block])continue;paths[c.block][c.type==='stitch'?'stitch':'jump']+=`M${c.fromX} ${c.fromY}L${c.x} ${c.y}`;}
    return paths;
  },[compiled,progress]);
  const outside=project.objects.some(o=>o.rings.flat().some(([x,y])=>x<0||y<0||x>hoop.width||y>hoop.height));
  const imported=compiled?.engine==='Imported PES';
  const needle=compiled?.commands[Math.max(0,Math.floor(compiled.commands.length*progress)-1)];
  const count=compiled?compiled.commands.slice(0,Math.floor(compiled.commands.length*progress)).filter(c=>c.type==='stitch').length:0;

  const source=(key:Setting)=>!item?null:item[key]!==undefined?<button type="button" className="field-value reset" title={isLockSetting(key)?'Reset to the Setup value':fromFabric(item.kind,key)?'Reset to the fabric default':'Reset to the default'} onClick={e=>{e.preventDefault();updateObject({[key]:undefined});}}>Reset</button>:<span className="field-value inherited">{isLockSetting(key)?'Setup':fromFabric(item.kind,key)?'Fabric':'Default'}</span>;
  const lockOptions=Object.entries(lockNames).map(([k,v])=><option key={k} value={k}>{v}</option>);
  const setLocks=(patch:Partial<Locks>,merge?:string)=>commit({...project,locks:{...project.locks,...patch}},'',merge&&`setup:${merge}`);
  const inRange=(v:string,[a,b]:readonly [number,number])=>v!==''&&Number(v)>=a&&Number(v)<=b;
  return <main className="studio" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)void importFile(f);}}>
    <header className="topbar">
      <a className="brand" href="/" aria-label="Threadroom home"><span>threadroom<span className="brand-dot">.</span></span></a>
      <div className="project-title"><input aria-label="Project name" value={project.name} maxLength={40} onChange={e=>commit({...project,name:e.target.value})}/><span className={`save-indicator ${saved?'':'unsaved'}`} role="status" aria-label={saved?'Saved locally':'Unsaved'} title={saved?'Saved locally':'Unsaved'}/></div>
      <div className="top-actions"><button className="icon-button" aria-label="Save project" title="Save project" disabled={imported||hasDraft} onClick={()=>download(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),'threadroom-project.json')}><Icon name="download" size={17}/></button><Button label="Export PES" size="sm" variant="primary" isLoading={busy} isDisabled={hasDraft||!ready||(!project.objects.length&&!compiled)||outside} onClick={()=>void generate(true)}/></div>
    </header>
    <input ref={file} type="file" tabIndex={-1} className="visually-hidden" aria-label="Import artwork or project" accept=".png,.jpg,.jpeg,.webp,.svg,.pes,.pec,.json" onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);e.target.value='';}}/>
    <div id="setup-panel" className="toolbar-popover setup-popover" popover="auto" role="dialog" aria-labelledby="setup-title">
      <div className="popover-heading"><h2 id="setup-title">Setup</h2><button className="icon-button" aria-label="Close settings" popoverTarget="setup-panel" popoverTargetAction="hide"><Icon name="close" size={16}/></button></div>
          <label>Machine<select value={project.machine} onChange={()=>{}}><option value="brother-pr1x">Brother PR1X</option></select></label>
          <label>Hoop<select disabled={hasDraft} value={project.hoop} onChange={e=>changeHoop(e.target.value)}>{Object.entries(hoops).map(([key,h])=><option key={key} value={key}>{h.label}</option>)}</select></label>
          <label>Fabric<select disabled={hasDraft} value={project.fabric} onChange={e=>commit(withFabric(project,e.target.value as Fabric))}>{Object.entries(fabrics).map(([key,f])=><option key={key} value={key}>{f.label}</option>)}</select></label>
          <p className="fabric-advice">Stabilizer: {fabric.stabilizer} · Topping: {fabric.topping}</p>
          <div className="setting-grid setup-locks"><label>Tie-in<select disabled={hasDraft} value={project.locks.tieIn} onChange={e=>setLocks({tieIn:e.target.value as Lock})}>{lockOptions}</select></label><label>Tie-off<select disabled={hasDraft} value={project.locks.tieOff} onChange={e=>setLocks({tieOff:e.target.value as Lock})}>{lockOptions}</select></label>
            <label>Lock size · mm<input type="number" disabled={hasDraft} min={lockLimits.size[0]} max={lockLimits.size[1]} step=".1" value={project.locks.lockSize} onChange={e=>{if(inRange(e.target.value,lockLimits.size))setLocks({lockSize:Number(e.target.value)},'lockSize');}}/></label><label>Trim jumps longer than · mm<input type="number" disabled={hasDraft} min={lockLimits.trim[0]} max={lockLimits.trim[1]} step=".5" value={project.trimJump} title="Shorter jumps sew as one stitch without a trim" onChange={e=>{if(inRange(e.target.value,lockLimits.trim))commit({...project,trimJump:Number(e.target.value)},'','setup:trimJump');}}/></label></div>
      <div className="engine-state"><span className={`status-dot ${apiState==='ready'?'':'muted'}`}/>{apiState==='ready'?'Engine connected':apiState==='checking'?'Connecting…':'Engine offline'}</div>
    </div>
    <div id="artwork-panel" className="toolbar-popover artwork-popover" popover="auto" role="dialog" aria-labelledby="artwork-title">
      <div className="popover-heading"><h2 id="artwork-title">Artwork</h2><button className="icon-button" aria-label="Close artwork tools" popoverTarget="artwork-panel" popoverTargetAction="hide"><Icon name="close" size={16}/></button></div>
          <button className="upload-box" disabled={hasDraft} onClick={()=>file.current?.click()}><Icon name="upload"/><strong>Import file</strong></button>

          <div className="sample-buttons"><button disabled={hasDraft} onClick={()=>{const p=demo();commit(p);setSelected(p.objects[0].id);fit();closePanel('artwork-panel');}}>Bear sample</button><button disabled={hasDraft} onClick={()=>{commit({...initial,name:'Untitled embroidery',objects:[]});setSelected(null);setDraft([]);fit();closePanel('artwork-panel');}}>Blank canvas</button></div>
          {project.artwork&&<div className="artwork-settings">
            <div className="asset-name">{project.artwork.name}</div>
            <Button label="Auto trace" variant="primary" icon={<Icon name="region"/>} isLoading={busy} isDisabled={hasDraft} width="100%" onClick={()=>void trace()}/>
            <div className="manual-trace"><button disabled={hasDraft} onClick={()=>{setCurveClosed(true);chooseTool('curve');setShowImage(true);closePanel('artwork-panel');}}>Trace outline</button><button disabled={hasDraft} onClick={()=>{setCurveClosed(false);chooseTool('curve');setShowImage(true);closePanel('artwork-panel');}}>Trace line</button></div>
            <label>Image width · mm<input type="number" min="5" max={hoop.width} step="1" disabled={hasDraft} value={Math.round(project.artwork.width*10)/10} onChange={e=>{const w=Number(e.target.value);if(w>0&&w<=hoop.width){const a=project.artwork!;const height=a.height*w/a.width;commit({...project,artwork:{...a,width:w,height,x:(hoop.width-w)/2,y:(hoop.height-height)/2}});}}}/></label>
            <label>Reference opacity<input type="range" min=".1" max="1" step=".05" value={imageOpacity} onChange={e=>{setImageOpacity(Number(e.target.value));setShowImage(true);}}/></label>
            <button className="text-button" onClick={()=>fitArtwork()}>Fit image</button>
            <details className="trace-options"><summary>Trace settings</summary><label>Colours<select value={colours} onChange={e=>setColours(Number(e.target.value))}>{[2,3,4,5,6,8].map(n=><option key={n} value={n}>{n}</option>)}</select></label><label className="check-label"><input type="checkbox" checked={ignoreBg} onChange={e=>setIgnoreBg(e.target.checked)}/>Remove background</label></details>
          </div>}

    </div>
    <div className="workspace">
      <section className="editor-area" aria-label="Embroidery editor">
        <div className="editor-toolbar">
          <div className="tools" role="toolbar" aria-label="Editor tools">
            <button className="tool" aria-label="Artwork tools" title="Add artwork and trace" popoverTarget="artwork-panel" disabled={hasDraft}><Icon name="image"/><span>Artwork</span></button><span className="toolbar-divider"/>
            {view==='artwork'?<>
              {tools.map(t=><button key={t.id} className={(t.id==='pan'?(tool==='pan'||panMode):tool===t.id&&!panMode)?'tool active':'tool'} disabled={hasDraft&&t.id!==tool&&t.id!=='pan'} title={`${t.label} (${t.key}) · ${t.hint}`} aria-label={t.label} aria-pressed={t.id==='pan'?(tool==='pan'||panMode):tool===t.id&&!panMode} onClick={()=>chooseTool(t.id)}><Icon name={t.icon}/><span>{t.label}</span></button>)}
              <span className="toolbar-divider"/><button className="tool" title="Undo (Ctrl / ⌘ Z)" aria-label="Undo" disabled={!hasDraft&&!history.length} onClick={undo}><Icon name="undo"/></button><button className="tool" title="Redo (Ctrl / ⌘ Shift Z)" aria-label="Redo" disabled={hasDraft||!future.length} onClick={redo}><Icon name="redo"/></button>
            </>:<button className="tool active" title="Drag to pan the preview" aria-label="Pan" aria-pressed={true} onClick={()=>chooseTool('pan')}><Icon name="hand"/><span>Pan</span></button>}
          </div>
          {view==='stitches'&&compiled&&<div className="stitch-playback" role="group" aria-label="Stitch playback controls">
            <button className="play-button" aria-label={playing?'Pause playback':'Play stitches'} title={playing?'Pause':'Play'} onClick={()=>{if(progress>=1)setProgress(0);setPlaying(p=>!p);}}><Icon name={playing?'pause':'play'} size={16}/></button>
            <input className="playback" type="range" aria-label="Stitch playback" min="0" max="1" step=".001" value={progress} onChange={e=>{setProgress(Number(e.target.value));setPlaying(false);}}/>
            <span className="stitch-counter">{count.toLocaleString()} / {compiled.stats.stitches.toLocaleString()}</span>
          </div>}
          <div className="toolbar-end"><button className="tool settings-tool" aria-label="Machine settings" title="Machine, hoop and fabric" popoverTarget="setup-panel" disabled={hasDraft}><Icon name="settings"/></button><div className="view-switch"><button aria-pressed={view==='artwork'} onClick={()=>{setView('artwork');setPlaying(false);}}>Design</button><button aria-label="Stitches" aria-busy={busy} title="Generate stitch preview" aria-pressed={view==='stitches'} onClick={()=>void generate()} disabled={hasDraft||busy||outside||(!project.objects.length&&!compiled)}>{busy?'Working…':'Stitches'}</button></div></div>
        </div>
        {view==='artwork'&&<div className="tool-options">
          <div className="tool-guidance"><strong>{editing?'Edit points':continuation?'Continue curve':pathTarget?'Text path':tools.find(t=>t.id===tool)?.label}</strong><span>{panMode?'Drag to pan · Click the drawing tool to resume':editing?'Drag a point · Click + to add · Delete removes the selected point':hasDraft&&tool!=='freehand'?'Drag points to adjust · Enter to finish · Esc to cancel':pathTarget?'Click points along the path for your text, then Done.':tool==='select'&&item?.text?'Drag to move · Double-click or Edit text to change the words.':tools.find(t=>t.id===tool)?.hint}</span></div>
          {tool==='curve'&&!continuation&&!pathTarget&&<div className="curve-mode" aria-label="Curve type"><button disabled={hasDraft} aria-pressed={!curveClosed} onClick={()=>setCurveClosed(false)}>Line</button><button disabled={hasDraft} aria-pressed={curveClosed} onClick={()=>setCurveClosed(true)}>Filled shape</button></div>}
          {['curve','region','points'].includes(tool)&&<div className="draw-actions"><button title="Remove last point (Backspace)" disabled={!canUndoDraft} onClick={()=>setDraft(d=>d.slice(0,-1))}>Undo point</button><button title="Cancel (Esc)" onClick={()=>{cancelDrawing();setTool('select');}}>Cancel</button><Button label={closedDraft?'Close shape':'Done'} variant="primary" size="sm" isDisabled={!canFinish} onClick={()=>finish()}/></div>}
          {editing&&<div className="point-actions" role="group" aria-label="Point editing tools">
            <button aria-label="Move points" title="Drag a point to move it" aria-pressed={pointMode==='move'} onClick={()=>setPointMode('move')}><Icon name="select" size={15}/><span>Move</span></button>
            <button aria-label="Add point" title="Click the curve to insert a point" aria-pressed={pointMode==='add'} disabled={!!item?.curve&&item.curve.points.length>=200} onClick={()=>setPointMode('add')}><Icon name="plus" size={15}/><span>Add point</span></button>
            <button aria-label="Remove point" title="Click a point to remove it, or select one and press Delete" aria-pressed={pointMode==='remove'} onClick={()=>setPointMode('remove')}><Icon name="minus" size={15}/><span>Remove</span></button>
            {item?.curve&&!item.curve.closed&&<button aria-label="Continue curve" title={activePoint?.[1]===0?'Continue from the first point':'Continue from the last point'} disabled={item.curve.points.length>=200} onClick={continueCurve}><Icon name="curve" size={15}/><span>Continue</span></button>}
          </div>}
          {tool==='select'&&item&&!item.text&&<button className="edit-points-button" aria-pressed={editPoints} onClick={()=>{setView('artwork');if(editPoints)finishEditing();else editObject();}}>{editPoints?'Done editing':'Edit points'}</button>}
          {tool==='select'&&item?.text&&<button className="edit-points-button" onClick={focusText}>Edit text</button>}
        </div>}
        <div className="canvas-topline"><span><span className="status-dot"/> {hoop.label} hoop</span></div>
        <div className="canvas-wrap">
          <svg ref={svg} className={`design-canvas tool-${view==='stitches'||spacePan||panMode||navigating?'pan':editing?`edit-${pointMode}`:tool}`} tabIndex={0} viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`} role={editing?'group':'img'} aria-label="Embroidery canvas" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel} onLostPointerCapture={()=>{if(drag.current)endDrag();}} onPointerLeave={()=>setHover(null)} onContextMenu={e=>e.preventDefault()} onDoubleClick={e=>{const id=(e.target as SVGElement).closest('[data-object]')?.getAttribute('data-object');if(tool!=='select'||!id)return;if(project.objects.find(o=>o.id===id)?.text)focusText();else editObject();}}>
            <defs><pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M 5 0 L 0 0 0 5" fill="none" stroke="#d7d0c2" strokeWidth="0.1"/></pattern><pattern id="cloth" width="0.55" height="0.55" patternUnits="userSpaceOnUse"><path d="M0 0H.55M0 0V.55" stroke="#c8bba4" opacity=".15" strokeWidth=".06"/></pattern><filter id="hoop-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#8d8068" floodOpacity=".15"/></filter></defs>
            <rect x="-1000" y="-1000" width="3000" height="3000" fill="#f0ede5"/>
            <rect x="-2" y="-2" width={hoop.width+4} height={hoop.height+4} rx="5" fill="#d9c9aa" filter="url(#hoop-shadow)"/>
            <rect x="0" y="0" width={hoop.width} height={hoop.height} rx="3" fill="#faf7ee" stroke="#b6a583" strokeWidth=".35"/>
            <rect width={hoop.width} height={hoop.height} rx="3" fill="url(#cloth)" pointerEvents="none"/>
            <rect width={hoop.width} height={hoop.height} rx="3" fill="url(#grid)" opacity=".65" pointerEvents="none"/>
            <path d={`M${hoop.width/2-2} ${hoop.height/2}h4M${hoop.width/2} ${hoop.height/2-2}v4`} stroke="#b2aa9b" strokeWidth=".15" pointerEvents="none"/>
            {showImage&&project.artwork&&view==='artwork'&&<image href={project.artwork.src} x={project.artwork.x} y={project.artwork.y} width={project.artwork.width} height={project.artwork.height} opacity={imageOpacity} pointerEvents="none"/>}
            {view==='artwork'?project.objects.filter(o=>o.id!==continuation?.id).map(o=><g key={o.id} data-object={o.id}>{o.text?.layout==='path'&&o.text.path&&selected===o.id&&<path d={pathData([o.text.path],false)} fill="none" stroke="#7b9670" strokeWidth={1/canvasScale} strokeDasharray={`${4/canvasScale} ${3/canvasScale}`} pointerEvents="none"/>}<path d={pathData(o.rings,isFillKind(o.kind))} fill={isFillKind(o.kind)?o.color:'none'} fillRule={o.text?'nonzero':'evenodd'} stroke={isFillKind(o.kind)?(selected===o.id?'#4d6853':'none'):o.color} strokeWidth={isWideKind(o.kind)?o.satinWidth:selected===o.id?.35:.5} strokeLinejoin="round" strokeLinecap="round" style={{cursor:tool==='select'&&!editing?'move':undefined}}/>{o.text?.border&&isFillKind(o.kind)&&<path d={pathData(mergedOutline(o.rings),false)} fill="none" stroke={o.text.border.color} strokeWidth={o.text.border.kind==='satin'?o.text.border.width:o.text.border.kind==='bean'?.45:.3} strokeLinejoin="round" pointerEvents="none"/>}<path d={pathData(o.rings,isFillKind(o.kind))} fill={o.text?'transparent':'none'} fillRule="nonzero" stroke="transparent" strokeWidth="2"/>{editing&&selected===o.id&&<>
              {pointMode!=='remove'&&handles.filter(h=>{const anchors=o.curve?o.curve.points:o.rings[h.ring];return [anchors[(h.index-1)%anchors.length],anchors[h.index%anchors.length]].every(p=>Math.hypot(p[0]-h.point[0],p[1]-h.point[1])*canvasScale>24);}).map(h=><g className="insertion-handle" key={`insert-${h.ring}-${h.index}`} data-ring={h.ring} data-insert={h.index} role="button" tabIndex={0} aria-label={`Add point on segment ${h.index}`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();addPoint(h.ring,h.index,h.point);}}}><circle cx={h.point[0]} cy={h.point[1]} r={11/canvasScale} fill="transparent"/><circle cx={h.point[0]} cy={h.point[1]} r={5/canvasScale} fill="#fffef9" stroke="#7b9670" strokeWidth={1/canvasScale}/><path d={`M${h.point[0]-2.5/canvasScale} ${h.point[1]}h${5/canvasScale}M${h.point[0]} ${h.point[1]-2.5/canvasScale}v${5/canvasScale}`} stroke="#64805e" strokeWidth={1/canvasScale} pointerEvents="none"/><title>Add point</title></g>)}
              {(o.curve?[o.curve.points]:o.rings).map((ring,ri)=>ring.map(([x,y],i)=><g className="anchor-handle" key={`${ri}-${i}`} data-ring={ri} data-point={i} role="button" tabIndex={0} aria-label={`Point ${i+1}${o.rings.length>1?` in path ${ri+1}`:''}`} aria-pressed={activePoint?.[0]===ri&&activePoint?.[1]===i} onFocus={()=>setActivePoint([ri,i])} onKeyDown={e=>{
                if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();const step=(e.shiftKey?10:1)/canvasScale;savePointChange(moveGeometry(o,([a,b],r,n)=>r===ri&&n===i?[a+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),b+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)]:[a,b]));}
                else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();e.stopPropagation();removePoint([ri,i]);}
                else if(e.key===' '){e.preventDefault();e.stopPropagation();setActivePoint([ri,i]);}
              }}><circle cx={x} cy={y} r={12/canvasScale} fill="transparent"/><circle cx={x} cy={y} r={5/canvasScale} fill={activePoint?.[0]===ri&&activePoint?.[1]===i?'#526b57':'white'} stroke="#4d6853" strokeWidth={1.5/canvasScale} pointerEvents="none"/><title>{pointMode==='remove'?'Click to remove':'Drag to move · Delete to remove'}</title></g>))}
            </>}</g>):stitchPaths.map((p,i)=><g key={i}>{showJumps&&<path d={p.jump} fill="none" stroke="#c47c64" strokeWidth=".2" strokeDasharray=".6 .6"/>}<path d={p.stitch} fill="none" stroke={compiled!.threads[i].color} strokeWidth=".22" strokeLinecap="round"/></g>)}
            {ends&&(['entry','exit'] as const).map(k=>{const [x,y]=ends[k],c=k==='entry'?'#2f8a4a':'#c4453a',same=Math.hypot(ends.entry[0]-ends.exit[0],ends.entry[1]-ends.exit[1])*canvasScale<10,label=`${k==='entry'?'Entry':'Exit'} point${ends.auto[k]?' (automatic)':''}`;
              return <g key={k} className="end-handle" data-end={k} role="button" tabIndex={0} aria-label={label} onKeyDown={e=>{if((e.key==='Delete'||e.key==='Backspace')&&item&&!ends.auto[k]){e.preventDefault();e.stopPropagation();updateObject({[k]:undefined});}}}><circle cx={x} cy={y} r={(k==='exit'&&same?6:12)/canvasScale} fill="transparent"/><circle cx={x} cy={y} r={(k==='entry'&&same?6.5:4.5)/canvasScale} fill={ends.auto[k]?'#fffef9':c} stroke={c} strokeWidth={1.6/canvasScale} pointerEvents="none"/><title>{`${label} · drag along the outline${ends.auto[k]?'':' · Delete to reset'}`}</title></g>;})}
            {addPreview&&addPreview.distance*canvasScale<16&&<circle cx={addPreview.point[0]} cy={addPreview.point[1]} r={5/canvasScale} fill="#e4ecda" stroke="#526b57" strokeWidth={1.5/canvasScale} pointerEvents="none"/>}
            {draft.length>0&&<><path d={pathData([displayDraft],closedDraft)} fill={closedDraft?'#84998433':'none'} stroke="#526b57" strokeWidth=".4"/>{hover&&!drawing&&<path d={pathData([[draft[draft.length-1],hover]],false)} fill="none" stroke="#526b57" strokeWidth=".3" strokeDasharray="1 .6" pointerEvents="none"/>}{tool!=='freehand'&&draft.map(([x,y],i)=><g key={i} data-draft-point={i}><circle cx={x} cy={y} r={(i===0&&closedDraft?6:4)/canvasScale} fill={i===0&&closedDraft?'white':'#526b57'} stroke="#526b57" strokeWidth={1.5/canvasScale}/><circle cx={x} cy={y} r={12/canvasScale} fill="transparent"><title>{i===0&&closedDraft&&canFinish?'Click to close shape · drag to move point':'Drag to adjust point'}</title></circle></g>)}</>}
            {view==='stitches'&&progress<1&&needle&&<circle cx={needle.x} cy={needle.y} r="1" fill="#fff" stroke="#526b57" strokeWidth=".5"/>}
          </svg>
          {!project.objects.length&&!project.artwork&&view==='artwork'&&<div className="empty-canvas"><Icon name="needle" size={32}/><p>Import artwork or draw a path.</p></div>}
          <div className="canvas-navigation-hint">Scroll to zoom · Space / right-drag to pan</div>
          <div className="zoom-controls"><button aria-label="Zoom out" title="Zoom out (−)" onClick={()=>zoomBy(1/1.2)}><Icon name="minus" size={16}/></button><span>{Math.round(zoom*100)}%</span><button aria-label="Zoom in" title="Zoom in (+)" onClick={()=>zoomBy(1.2)}><Icon name="plus" size={16}/></button><span className="toolbar-divider"/><button aria-label="Fit hoop" onClick={fit}><Icon name="fit" size={16}/></button></div>
        </div>
        {(error||message)&&<div className={`feedback ${error?'error':''}`} role={error?'alert':'status'}>{error||message}<button aria-label="Dismiss message" onClick={()=>{setError('');setMessage('');}}>×</button></div>}
      </section>
      <aside className="right-panel">
        <section className="panel-section"><div className="section-heading"><Icon name="layers"/><h2>Objects</h2><span className="count-badge">{project.objects.length}</span></div>
          <div className="object-list">{project.objects.map((o,i)=><button key={o.id} className={`object-row ${selected===o.id?'selected':''}`} disabled={hasDraft} onClick={()=>{setSelected(o.id);setView('artwork');}}><span className="order">{String(i+1).padStart(2,'0')}</span><span className="swatch" style={{background:o.color}}/><span><strong>{o.name}</strong><small>{o.text?`Text · ${o.text.font.family}`:kindNames[o.kind]}</small></span><span className="row-chevron">›</span></button>)}</div>
          {!project.objects.length&&<p className="empty-list">{imported?'PES preview only':'No objects'}</p>}
        </section>
        {item?.text&&<fieldset disabled={hasDraft} className="text-fieldset"><TextPanel spec={item.text} fill={isFillKind(item.kind)} loading={fontLoading>0} missing={missingGlyphs} textArea={textArea}
          guides={project.objects.filter(o=>o.id!==item.id&&!o.text&&o.rings.length).map(o=>({id:o.id,name:o.name}))} guide={guide?.text===item.id&&project.objects.some(o=>o.id===guide.id)?guide:null}
          onChange={updateText} onUseGuide={useGuide} onRemoveGuide={removeGuide} onDrawPath={drawTextPath} onConvert={convertText}/></fieldset>}
        {item&&<fieldset disabled={hasDraft} className="panel-section settings"><div className="settings-heading"><h2>{item.text?'Stitches':'Object settings'}</h2><button aria-label="Delete selected object" onClick={deleteSelected}><Icon name="trash" size={16}/></button></div>
          <label>Object name<input value={item.name} maxLength={40} onChange={e=>updateObject({name:e.target.value})}/></label>
          <StitchSelector value={item.kind} canFill={!item.rings.some(r=>r.length<3)} onChange={kind=>updateObject({kind,spacing:undefined,underlay:undefined})}/>
          <label>Thread colour<div className="colour-picker"><input type="color" aria-label="Thread colour" value={item.color} onChange={e=>updateObject({color:e.target.value})}/><span>{item.color.toUpperCase()}</span>{palette.slice(0,4).map(c=><button key={c} aria-label={`Use thread ${c}`} style={{background:c}} onClick={()=>updateObject({color:c})}/>)}</div></label>
          <div className="setting-grid"><label>Length · mm<input type="number" min=".5" max="3" step=".1" value={item.length} onChange={e=>{const n=Number(e.target.value);if(n>=.5&&n<=3)updateObject({length:n});}}/></label>{usesSpacing(item.kind)&&<label htmlFor="spacing-input">{item.kind==='cross'?'Cross size':'Spacing'} · mm{source('spacing')}<input id="spacing-input" type="number" min=".3" max="2" step=".05" value={resolved!.spacing} onChange={e=>{const n=Number(e.target.value);if(n>=.3&&n<=2)updateObject({spacing:n});}}/></label>}</div>
          {isFillKind(item.kind)&&<label>Fill direction <span className="field-value">{item.angle}°</span><input type="range" min="-90" max="90" value={item.angle} onChange={e=>updateObject({angle:Number(e.target.value)})}/></label>}
          {isWideKind(item.kind)&&<div className="setting-grid"><label>Width · mm<input type="number" min={satinLimits.width[0]} max={satinLimits.width[1]} step=".5" value={item.satinWidth} onChange={e=>{const n=Number(e.target.value);if(n>=satinLimits.width[0]&&n<=satinLimits.width[1])updateObject({satinWidth:n});}}/></label><label htmlFor="split-input">Split above · mm{source('splitLength')}<input id="split-input" type="number" min={satinLimits.split[0]} max={satinLimits.split[1]} step=".5" value={resolved!.splitLength} onChange={e=>{const n=Number(e.target.value);if(e.target.value!==''&&n>=satinLimits.split[0]&&n<=satinLimits.split[1])updateObject({splitLength:n});}}/></label></div>}
          {usesShortStitches(item.kind)&&<label className="check-label"><input type="checkbox" checked={resolved!.shortStitches} onChange={e=>updateObject({shortStitches:e.target.checked})}/>Short stitches on curves{source('shortStitches')}</label>}
          {usesPull(item.kind)&&<label htmlFor="pull-input">Pull compensation · mm{source('pullCompensation')}<input id="pull-input" type="number" min="0" max="1" step=".05" value={resolved!.pullCompensation} onChange={e=>{const n=Number(e.target.value);if(e.target.value!==''&&n>=0&&n<=1)updateObject({pullCompensation:n});}}/></label>}
          {underlayOptions(item.kind).length>1&&<label htmlFor="underlay-input">Underlay{source('underlay')}<select id="underlay-input" value={resolved!.underlay} onChange={e=>updateObject({underlay:e.target.value as Underlay})}>{underlayOptions(item.kind).map(u=><option key={u} value={u}>{underlayNames[u]}</option>)}</select></label>}
          <div className="setting-grid"><label htmlFor="tie-in-input">Tie-in{source('tieIn')}<select id="tie-in-input" value={resolved!.tieIn} onChange={e=>updateObject({tieIn:e.target.value as Lock})}>{lockOptions}</select></label><label htmlFor="tie-off-input">Tie-off{source('tieOff')}<select id="tie-off-input" value={resolved!.tieOff} onChange={e=>updateObject({tieOff:e.target.value as Lock})}>{lockOptions}</select></label></div>
          {(resolved!.tieIn!=='none'||resolved!.tieOff!=='none')&&<label htmlFor="lock-size-input">Lock size · mm{source('lockSize')}<input id="lock-size-input" type="number" min={lockLimits.size[0]} max={lockLimits.size[1]} step=".1" value={resolved!.lockSize} onChange={e=>{if(inRange(e.target.value,lockLimits.size))updateObject({lockSize:Number(e.target.value)});}}/></label>}
          <div className="ends-row"><span><i className="end-dot entry"/>Entry · <i className="end-dot exit"/>exit</span>{item.entry||item.exit?<button type="button" className="field-value reset" title="Return to automatic entry and exit" onClick={()=>updateObject({entry:undefined,exit:undefined})}>Reset</button>:<span className="field-value inherited">Auto</span>}</div>
          <div className="reorder"><Button label="Sew earlier" size="sm" isDisabled={project.objects[0].id===item.id} onClick={()=>{const items=[...project.objects],i=items.findIndex(o=>o.id===item.id);[items[i-1],items[i]]=[items[i],items[i-1]];commit({...project,objects:items});}}/><Button label="Sew later" size="sm" isDisabled={project.objects.at(-1)?.id===item.id} onClick={()=>{const items=[...project.objects],i=items.findIndex(o=>o.id===item.id);[items[i+1],items[i]]=[items[i],items[i+1]];commit({...project,objects:items});}}/></div>
        </fieldset>}
        <section className="panel-section design-summary"><h2>Design</h2><div className="summary-grid"><div><span>Design size</span><strong>{(compiled?.stats.width||size.width).toFixed(1)} × {(compiled?.stats.height||size.height).toFixed(1)}<small> mm</small></strong></div><div><span>Stitches</span><strong>{compiled?compiled.stats.stitches.toLocaleString():'—'}</strong></div><div><span>Thread changes</span><strong>{compiled?compiled.stats.colorChanges:'—'}</strong></div></div>
          {compiled&&<p className="section-copy">{compiled.stats.jumps} jumps · {compiled.stats.jumpLength.toLocaleString()} mm · {compiled.stats.trims} trims</p>}
          {!!size.width&&<label>Design width · mm<input key={`${size.width.toFixed(2)}-${project.hoop}`} type="number" disabled={hasDraft} min="5" max={hoop.width} step="1" defaultValue={Number(size.width.toFixed(1))} onBlur={e=>{const n=Number(e.target.value);if(Math.abs(n-size.width)>.15)resizeDesign(n);}}/></label>}
          {outside&&<div className="hoop-check warning"><Icon name="region" size={15}/>Design exceeds hoop</div>}
          {project.objects.length>0&&<label className="check-label"><input type="checkbox" disabled={hasDraft} checked={editPoints} onChange={e=>{if(e.target.checked)editObject();else finishEditing();}}/>Edit points</label>}{project.artwork&&<label className="check-label"><input type="checkbox" checked={showImage} onChange={e=>setShowImage(e.target.checked)}/>Show reference</label>}{compiled&&<label className="check-label"><input type="checkbox" checked={showJumps} onChange={e=>setShowJumps(e.target.checked)}/>Show jumps</label>}
          <Button label="Export editable SVG" size="sm" isDisabled={hasDraft||!project.objects.length} onClick={()=>download(new Blob([exportSVG(project)],{type:'image/svg+xml'}),'threadroom-artwork.svg')}/>
        </section>
      </aside>
    </div>
  </main>;
}
