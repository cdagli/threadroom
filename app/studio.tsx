'use client';
import dynamic from 'next/dynamic';
import {flushSync} from 'react-dom';
import {Loading} from './panel-loading';
import {StitchOverlays,OverlayControls} from './stitch-overlays';
import {measurePoint} from '@/lib/measure';
import {MapToPath} from './map-to-path-control';
import {syncPathBindings} from '@/lib/map-to-path';
import {PixelCrossButton} from './pixel-cross';
import {useT} from './i18n';
import {TransformBox,SelectionTools,ViewControls,CanvasRulers,ShortcutHelp} from './editing-controls';
import {around,centre,translate,handlePoint,scaleGesture,rotationGesture,selectionBounds,transformSelection,alignSelection,snapBounds,copySelection,readClipboard,pasteSelection,type ScaleHandle,type SnapGuide,type Matrix,type Align} from '@/lib/editing';
import {defaultView,formatLength,playbackRate,playbackSpeeds,readViewSettings,type ViewSettings} from '@/lib/view-settings';
import {createT,errorText,TranslationError} from '@/lib/i18n';
import {FillSettings, CrossSettings, StitchAngle} from './fill-settings';
import {Section} from './settings-section';
import {Hint,ToolHint} from './hint';
import {Fragment, Profiler, useEffect, useLayoutEffect, useRef, useState, useMemo, type PointerEvent as ReactPointerEvent} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {dragHistory, frameQueue, keyBurst} from '@/lib/drag';
import {bounds, normalizeGroups, groupObjects, ungroupObjects, moveObjects, moveGroup, defaultLocks, defaultTrimJump, demo, fabrics, fromFabric, hoops, hasCrossStyle, isLockSetting, isRopeKind, ropeDefaults, ropeLimits, usesSplit, lockLimits, lockNames, isFillKind, isWideKind, kindNames, object, palette, pathData, resolve, satinLimits, underlayNames, underlayOptions, usesPull, usesShortStitches, usesSpacing, validProject, withFabric, type Compiled, type Fabric, type Kind, type Lock, type Locks, type Point, type Project, type RefImage, type Setting, type StitchObject, type Underlay} from '@/lib/project';
import {curvePoints, curveRing, setCorner, isCorner, draftRails, withRails, blockOutline, reclose, isClosedShape, stitchGroups, changeStitchKind, moveGeometry, geometryPayload, closestInsertion, insertionHandles, insertGeometryPoint, removeGeometryPoint, routeEnds, withEnd} from '@/lib/curves';
import {draftClick,completeDraft,movedForDrawing,snapAngle,lockAxis,type DraftState} from '@/lib/drawing';
import {fitFreehand} from '@/lib/spline';
import {clientToWorld, fitViewport, keepViewportOnResize, panViewport, viewportScale, worldToClient, zoomViewport, type Viewport} from '@/lib/viewport';
import {canvasMenu, objectMenu, type MenuAction, type MenuEntry} from '@/lib/context-menu';
import {ContextMenu} from './context-menu';
import {SelectionBar} from './selection-bar';
import {SelectionAnchor} from './selection-anchor';
import {editorTask,taskCancelled} from '@/lib/editor-task';
import {artworkPixels, traceArtworkPixels, sampleArtwork} from '@/lib/artwork-color';
import {defaultTolerance, toleranceLimits, type Pixels} from '@/lib/click-to-stitch';
import {activeImage, imageBounds, imageLimits, insideImage, migrateImages, moveImage, removeImage, toImageFrame, transformImage, updateImage} from '@/lib/images';
import ImagesPanel from './images-panel';
import {parse} from '@/lib/pes-parser';
import {SVGImportChoice,ExportImageButton} from './io-controls';
import {DensityHeat,DensityLegend,StitchDiagnostics,useDensity} from './density-view';
import {exportSVG} from '@/lib/svg-export';
import {checkProject, engineWarning, explain, fixFor, severityNames, sortWarnings, stitchWarnings, type Box, type Warning} from '@/lib/check';
import {defaultText, fitTextInHoop, layoutText, textSourcePoint, type TextSpec} from '@/lib/text';
import {defaultFont, ensureFonts, loadedFonts} from '@/lib/fonts';
import {layoutSatinText,convertSatinText,ensureSatinFonts,satinFontsLoaded} from '@/lib/satin-lettering';
import {circle, diamond, fitRadius, fitRect, heart, hexagon, rect, shapeNames, star, triangle, type ShapeKind} from '@/lib/shapes';
import StitchSelector from './stitch-selector';
const TextPanel=dynamic(()=>import('./text-panel'),{loading:Loading});
import ThreadView from './thread-view';
const ThreadPicker=dynamic(()=>import('./thread-picker'),{loading:Loading});
import {SewingSpeed,SewingTime,WorksheetButton} from './worksheet';
import {recolorObject} from '@/lib/threads';
import LayersPanel from './layers-panel';
import {IssueMarker, EndHandles, DraftOverlay, ShapeOverlay, MeasureOverlay, NeedleMarker} from './canvas-overlays';
import {CanvasObject} from './canvas-object';
import {PointHandles} from './point-handles';
import {useStableCallback} from './use-stable-callback';
import {KnifeOverlay} from './knife-overlay';
const ShapeTools=dynamic(()=>import('./shape-tools').then(m=>m.ShapeTools),{loading:Loading});
import {combineShapes,cutHole,cutHoles,flattenOverlaps,knifeShapes,shapeRegion,type ShapeResult} from '@/lib/shape-ops';
import {AngleGuideEditor} from './angle-guides';
import {RedworkAction} from './redwork-action';
import {guideMode,seedGuide,withGuides} from '@/lib/angle-guides';
import {breakApart,canBreakApart,canConvertToRedwork,convertToRedwork} from '@/lib/redwork';
import {changedObjectIds, commandPaths, designBounds, objectGeometry, sewnStitches} from '@/lib/editor-render';
import {selectIds, visibleCommands, toggleLock, unlockAll, unlockedIds, selectableIds, placeObjects, positionIndex} from '@/lib/layers';

type PanelTab = 'layers' | 'artwork' | 'setup' | 'info';
type Tool = 'select' | 'pan' | 'measure' | 'open' | 'closed' | 'blocks' | 'freehand' | 'points' | 'text' | 'shape' | 'holes' | 'knife' | 'stitch';
// Open, closed and blocks draw curves whose points are corners (left click) or smooth (right/double-click).
const pathTool=(t:Tool)=>t==='open'||t==='closed'||t==='blocks'||t==='holes';
// Cut holes and the knife are reached from the Shape tools section, click to stitch from the Artwork
// tab; all three also have shortcuts, not dock buttons.
const drawTool=(t:Tool)=>['open','closed','blocks','freehand','points'].includes(t);
const dockTool=(t:Tool)=>t!=='holes'&&t!=='knife'&&t!=='stitch';
const shapeKinds=Object.keys(shapeNames) as ShapeKind[];
const shapeMakers={circle,star,triangle,diamond,hexagon,heart};
const icons: Record<string,string> = {
  settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
  eyedropper:'m14 5 5 5m-3-7 5 5-3 3-2-2-9 9-4 1 1-4 9-9-2-2 3-3',
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
  alert:'M12 4 2.5 20h19L12 4m0 6v4.5m0 2.5v.5',
  info:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18m0-4.5V11m0-3h0',
  chevron:'m6 9 6 6 6-6',
  panel:'M3 4h18v16H3V4m12 0v16',
  ruler:'M3 8h18v8H3V8m4 0v3m4-3v4m4-4v3m4-3v4',
  open:'M4 18 9 7l6 9 5-10M4 18h0M9 7h0M15 16h0M20 6h0',
  closed:'m12 3 9 7-3.5 10h-11L3 10l9-7',
  blocks:'M4 7l2 10 2-10 2 10 2-10 2 10 2-10 2 10 2-10',
  shapes:'M8 3 12.5 10.5h-9L8 3m9 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8M3 14h7v7H3v-7',
  eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7m10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  circle:'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16',
  rect:'M4 6h16v12H4V6',
  star:'m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7L12 3',
  triangle:'M12 4 21 19H3L12 4',
  diamond:'m12 3 9 9-9 9-9-9 9-9',
  hexagon:'m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3',
  heart:'M12 20 4.6 12.6a4.5 4.5 0 0 1 7.4-5.2 4.5 4.5 0 0 1 7.4 5.2L12 20',
  lock:'M6 11h12v10H6V11m2 0V8a4 4 0 0 1 8 0v3',
  holes:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  knife:'M4 20 18 6l2 2-9 9-7 3M14 10l2 2',
  wand:'m4 20 11-11m-2-2 2 2M17 3v3m-1.5-1.5h3M20 9v2m-1-1h2M9 4v2M8 5h2',
  route:'M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4m12-12a2 2 0 1 0 0-4 2 2 0 0 0 0 4M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
};
function Icon({name, size=18}: {name: string; size?: number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name]||icons.needle}/></svg>;
}
function ToolGroupButton<T extends string>({id,label,groupLabel,title,icon,active,selected,options,divider=false,onActivate,onSelect}:{
  id:string;label:string;groupLabel:string;title:string;icon:string;active:boolean;selected:T;
  options:{id:T;icon:string;label:string;shortcut?:string;title?:string}[];divider?:boolean;
  onActivate:()=>void;onSelect:(id:T)=>void;
}) {
  const popover=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null);
  function close(){if(popover.current?.matches(':popover-open'))popover.current.hidePopover();}
  return <span className="tool-slot">
    {divider&&<span className="toolbar-divider"/>}
    <button ref={button} type="button" className={`tool ${active?'active':''}`} style={{anchorName:`--${id}`}} aria-label={groupLabel} aria-pressed={active} title={title} popoverTarget={id} popoverTargetAction="show" onClick={onActivate}>
      <Icon name={icon}/><span>{label}</span><i className="tool-group-caret" aria-hidden="true"/>
    </button>
    <div ref={popover} id={id} className="tool-group-flyout" style={{positionAnchor:`--${id}`}} popover="auto" role="group" aria-label={groupLabel} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();button.current?.focus({preventScroll:true});}}}>
      {options.map(option=><button key={option.id} type="button" aria-pressed={selected===option.id} title={option.title??option.label} onClick={()=>{onSelect(option.id);close();button.current?.focus({preventScroll:true});}}>
        <Icon name={option.icon}/><span>{option.label}</span>{option.shortcut&&<kbd>{option.shortcut}</kbd>}
      </button>)}
    </div>
  </span>;
}
function download(blob: Blob, name: string) {
  const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function pesBlob(encoded: string) {return new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))], {type:'application/octet-stream'});}

const outsideHoop=(rings:Point[][],hoop:{width:number;height:number})=>rings.some(r=>r.some(([x,y])=>x<0||y<0||x>hoop.width||y>hoop.height));
// Satin blocks reach their rails, not just the centre line stored in rings.
const extent=(o:StitchObject)=>o.rails?[blockOutline(o.rails)]:o.rings;
const initial: Project={version:1,name:'Sleepy little bear',machine:'brother-pr1x',hoop:'100x100',fabric:'woven',locks:defaultLocks,trimJump:defaultTrimJump,objects:[]};

// NEXT_PUBLIC_EDITOR_PERF=1 records complete editor subtree timings in development only.
export default process.env.NODE_ENV==='development'&&process.env.NEXT_PUBLIC_EDITOR_PERF==='1'?ProfiledStudio:StudioEditor;
function ProfiledStudio(){return <Profiler id="Studio" onRender={recordRender}><StudioEditor/></Profiler>;}
function recordRender(id:string,phase:string,ms:number){performance.measure(`${id}:${phase}`,{start:performance.now()-ms,duration:ms});}
function StudioEditor() {
  const {t,lang,setLang,formatNumber}=useT();
  const pathHint=t("Left click: corner · Right/double-click: smooth · Ctrl / ⌘: 15° snap · Enter: finish");
  const tools: {id:Tool;icon:string;label:string;key:string;alt?:string;title:string;hint:string}[]=[
    {id:'select',icon:'select',label:t("Select"),key:'S',alt:'V',title:t("Select objects"),hint:t("Drag to move · Double-click to edit points · Drag the green/red dots to set start and end.")},
    {id:'pan',icon:'hand',label:t("Pan"),key:'H',title:t("Panning"),hint:t("Drag to move the canvas. Hold Space to pan with any tool.")},
    {id:'measure',icon:'ruler',label:t("Measure"),key:'M',title:t("Measuring"),hint:t('Drag to measure length and angle. Shift: snap to 15°.')},
    {id:'open',icon:'open',label:t("Open"),key:'1',title:t("Drawing Open Shape"),hint:t("{v0}. Or click the first point.",{v0:pathHint})},
    {id:'closed',icon:'closed',label:t("Closed"),key:'2',title:t("Drawing Closed Shape"),hint:t("{v0}. Or click the first point.",{v0:pathHint})},
    {id:'blocks',icon:'blocks',label:t("Blocks"),key:'3',title:t("Drawing Blocks"),hint:t("{v0}. Click left and right rail points in turn; satin is sewn between the rails.",{v0:pathHint})},
    {id:'freehand',icon:'pen',label:t("Freehand"),key:'4',title:t("Drawing Freehand"),hint:t("Click and drag to draw, release to complete.")},
    {id:'points',icon:'points',label:t("Points"),key:'P',title:t("Placing Points"),hint:t("Click to place stitch points, then Done.")},
    {id:'text',icon:'text',label:t("Text"),key:'T',title:t("Adding Text"),hint:t("Click the hoop to place text.")},
    {id:'shape',icon:'shapes',label:t("Shapes"),key:'R',title:t("Drawing Shape"),hint:t("Click to set the center, click again to set the size.")},
    {id:'holes',icon:'holes',label:t("Cut holes"),key:'O',title:t("Cutting holes"),hint:t("Draw a closed shape inside the selected fill to punch a hole. {v0}",{v0:pathHint})},
    {id:'stitch',icon:'wand',label:t("Click to stitch"),key:'7',title:t("Click to stitch"),hint:t("Click a colour area of the reference image to fill it · Shift-click: outline · Esc: stop")},
    {id:'knife',icon:'knife',label:t("Knife"),key:'K',title:t("Cutting with the knife"),hint:t("Drag a straight line across a shape to split it · Ctrl / ⌘: 15° snap · Esc: stop")},
  ];

  const textName=(content:string)=>content.trim().split('\n')[0].slice(0,30)||t("Text");
  const [project,setProject]=useState<Project>(()=>({...initial,name:t('Sleepy little bear')}));
  const [ready,setReady]=useState(false), [saved,setSaved]=useState(true);
  const [selection,setSelection]=useState<string[]>([]), [tool,setTool]=useState<Tool>('select');
  const [lastDraw,setLastDraw]=useState<Tool>('open');
  useEffect(()=>{if(drawTool(tool))setLastDraw(tool);},[tool]);
  const selected=selection.at(-1)??null,anchor=useRef<string|null>(null);
  function setSelected(id:string|null){setSelection(id?[id]:[]);anchor.current=id;}
  function selectObject(id:string,keys:{ctrlKey:boolean;metaKey:boolean;shiftKey:boolean}){
    setSelection(ids=>selectIds(project.objects.map(o=>o.id),ids,id,keys.shiftKey?'range':keys.ctrlKey||keys.metaKey?'toggle':'replace',anchor.current));
    if(!keys.shiftKey)anchor.current=id;setEditPoints(false);
  }
  const [history,setHistory]=useState<Project[]>([]), [future,setFuture]=useState<Project[]>([]);
  const [timeline,setTimeline]=useState(false);
  const [pendingSVG,setPendingSVG]=useState<File|null>(null),[density,setDensity]=useState(false),[densityRadius,setDensityRadius]=useState(1.5);
  const [compiledSource,setCompiledSource]=useState<Project|null>(null);
  const [compiled,setCompiled]=useState<Compiled|null>(null), [busy,setBusy]=useState(false);
  const [message,setMessage]=useState(''), [error,setError]=useState(''), [apiState,setApiState]=useState<'checking'|'ready'|'offline'>('checking');
  useEffect(()=>{if(!message||error)return;const timer=setTimeout(()=>setMessage(''),4000);return()=>clearTimeout(timer);},[message,error]);
  const [draft,saveDraft]=useState<Point[]>([]), [drawing,setDrawing]=useState(false);
  const draftRef=useRef<Point[]>([]);
  function setDraft(next:Point[]|((points:Point[])=>Point[])){const value=typeof next==='function'?next(draftRef.current):next;draftRef.current=value;saveDraft(value);stopPlayback();}
  // One flag per draft point: true for a corner (left click), false for a smooth curve point.
  const [corners,saveCorners]=useState<boolean[]>([]),cornersRef=useRef<boolean[]>([]);
  function setCorners(next:boolean[]|((c:boolean[])=>boolean[])){const value=typeof next==='function'?next(cornersRef.current):next;cornersRef.current=value;saveCorners(value);}
  function popDraft(){setDraft(d=>d.slice(0,-1));setCorners(c=>c.slice(0,-1));}
  const [hover,setHover]=useState<Point|null>(null),[angleSnap,setAngleSnap]=useState(false);
  // Click to stitch: the image chosen when the tool starts, its working-resolution pixels and the hovered region.
  const [tolerance,setTolerance]=useState(defaultTolerance),[stitchImage,setStitchImage]=useState<string|null>(null),[stitchHover,setStitchHover]=useState<Point[][]|null>(null);
  const stitchPixels=useRef<{src:string;promise:Promise<Pixels>;px?:Pixels}|null>(null),lastStitch=useRef<{key:string;rings:Point[][]|null}|null>(null);
  const tasks=useRef<ReturnType<typeof editorTask>[]|null>(null);
  if(!tasks.current)tasks.current=Array.from({length:5},()=>editorTask());
  const [traceTask,svgTask,pixelsTask,hoverTask,clickTask]=tasks.current;
  const traceRequest=useRef(0),svgRequest=useRef(0),stitchSession=useRef(0),clickQueue=useRef(Promise.resolve());
  useEffect(()=>{setStitchHover(null);lastStitch.current=null;stitchSession.current++;hoverTask.cancel();clickTask.cancel();},[tool,stitchImage,tolerance]);
  useEffect(()=>()=>{revision.current++;stitchSession.current++;stitchPixels.current=null;tasks.current?.forEach(task=>task.cancel());},[]);
  const clickHistory=useRef<Pick<DraftState,'lastLeft'|'lastRight'>>({});
  const draftPress=useRef<{start:Point;button:number;moved:boolean;detail:number}|null>(null);
  const [measure,setMeasure]=useState<{a:Point;b:Point}|null>(null),measuring=useRef(false);
  const [shapeKind,setShapeKind]=useState<ShapeKind>('circle'),[shapeDraft,setShapeDraft]=useState<{start:Point;end:Point;square:boolean}|null>(null);
  const shapePress=useRef<{client:Point;moved:boolean}|null>(null);
  // Point capture retargets double-clicks to the canvas, so remember which anchor was pressed.
  const pressedAnchor=useRef<number|null>(null);
  // Pointer capture retargets click/dblclick to the svg, so double-click reads the object under the press.
  const pressedObject=useRef<string|null>(null);
  const [settingsCollapsed,setSettingsCollapsed]=useState(false),[focusOffset,setFocusOffset]=useState(0);
  const [cutKeep,setCutKeep]=useState(false);
  // A selected reference image (never together with selected objects) is moved and transformed on the canvas.
  const [imageSel,setImageSel]=useState<string|null>(null);
  useEffect(()=>{if(selection.length)setImageSel(null);},[selection]);
  const [colourPick,setColourPick]=useState<{ids:string[];image:string}|null>(null),[pickHint,setPickHint]=useState('');
  const colourPickRef=useRef(colourPick);
  function cancelColourPick(){colourPickRef.current=null;setColourPick(null);setPickHint('');}
  const images=project.images??[],selImage=images.find(i=>i.id===imageSel),art=activeImage(project,imageSel);
  useEffect(()=>{cancelColourPick();},[tool,selection.join('|'),art?.id]);
  useEffect(()=>{if(!pickHint)return;const timer=setTimeout(()=>setPickHint(''),3000);return()=>clearTimeout(timer);},[pickHint]);
  const [spacePan,setSpacePan]=useState(false),[panMode,setPanMode]=useState(false);
  const [navigating,setNavigating]=useState(false),[selectionDragging,setSelectionDragging]=useState(false);
  const draftDrag=useRef<{index:number;start:Point;before:Point[];moved:boolean}|null>(null);
  const closedDraft=tool==='closed'||tool==='holes';
  const canFinish=draft.length>=(closedDraft?3:tool==='blocks'?4:2);
  const hasDraft=draft.length>0;
  const [colours,setColours]=useState(5), [ignoreBg,setIgnoreBg]=useState(true);
  const [showImage,setShowImage]=useState(true),[look,setLook]=useState<'lines'|'thread'>('lines');
  const [viewSettings,setViewSettings]=useState<ViewSettings>(defaultView),[shortcutHelp,setShortcutHelp]=useState(false),[cursor,setCursor]=useState<Point|null>(null),[snapGuides,setSnapGuides]=useState<SnapGuide[]>([]);
  const showTravel=viewSettings.showJumps,speed=viewSettings.playbackSpeed;
  const displayLength=(mm:number)=>formatLength(mm,viewSettings.units,formatNumber);
  const clipboard=useRef<Project|null>(null),pasteCount=useRef(0),nudgeBurst=useRef(keyBurst());
  const transformDrag=useRef<{before:Project;ids:string[];box:ReturnType<typeof selectionBounds>;start:Point;angle:number;handle:ScaleHandle|'rotate'|'move';image?:string}|null>(null);
  useEffect(()=>{setMessage('');setError('');setPickHint('');},[lang]);
  const [designIssues,setDesignIssues]=useState<Warning[]>([]),[checkError,setCheckError]=useState(''),[focusKey,setFocusKey]=useState<string|null>(null);
  const [editPoints,setEditPoints]=useState(false),[angleMode,setAngleMode]=useState(false);
  const [panelTab,setPanelTab]=useState<PanelTab>('layers'),[panelOpen,setPanelOpen]=useState(true);
  const [pointMode,setPointMode]=useState<'move'|'add'|'remove'>('move'),[activePoint,setActivePoint]=useState<[number,number]|null>(null);
  const [continuation,setContinuation]=useState<{id:string;fromStart:boolean;base:number}|null>(null);
  const [pathTarget,setPathTarget]=useState<string|null>(null),[guide,setGuide]=useState<{text:string;id:string;name:string}|null>(null);
  const [fontLoading,setFontLoading]=useState(0),[fontsReady,setFontsReady]=useState(0);
  const textFocus=useRef(false),textArea=useRef<HTMLTextAreaElement>(null),lastFont=useRef(defaultFont),lastMerge=useRef<{key:string;time:number}|null>(null);
  const [view,setView]=useState<Viewport>({zoom:1,pan:[0,0]}),{zoom,pan}=view;
  const [canvasSize,setCanvasSize]=useState({width:1,height:1});
  const [playing,setPlaying]=useState(false), [progress,setProgress]=useState(1);
  const file=useRef<HTMLInputElement>(null), svg=useRef<SVGSVGElement>(null);
  const stage=useRef<HTMLElement>(null),rail=useRef<HTMLElement>(null);
  const measuredCanvas=useRef<{width:number;height:number;hoop:string}|null>(null);
  const current=useRef(project); current.current=project;
  const revision=useRef(0), playback=useRef(0),playRequest=useRef(0);
  const compiling=useRef<{version:number;controller:AbortController;promise:Promise<Compiled|null>}|null>(null);
  const drag=useRef<{id:string;start:Point;source:StitchObject;before:Project;ids?:string[];point?:[number,number];end?:'entry'|'exit';moved?:boolean}|null>(null);
  const panDrag=useRef<{start:Point;source:Point;button?:number;target?:string|null}|null>(null);
  const [menu,setMenu]=useState<{x:number;y:number;entries:MenuEntry[]}|null>(null);
  const moveQueue=useRef<ReturnType<typeof frameQueue>|null>(null);
  if(!moveQueue.current)moveQueue.current=frameQueue(run=>requestAnimationFrame(run),id=>cancelAnimationFrame(id));
  useEffect(()=>()=>moveQueue.current?.cancel(),[]);
  const dragUndo=useRef(dragHistory<Project>()),endDragRef=useRef(()=>{});
  const viewport=useRef(view);viewport.current=view;
  const wheelHandler=useRef<((event:WheelEvent)=>void)|null>(null);
  const touches=useRef(new Map<number,Point>());
  const touchStart=useRef<{draft:Point[];corners:boolean[];project:Project}|null>(null);
  const touchNavigation=useRef(false);
  const pinch=useRef<{view:Viewport;anchor:Point;center:Point;distance:number}|null>(null);
  const hoop=hoops[project.hoop], item=project.objects.find(o=>o.id===selected), resolved=item&&resolve(item,project.fabric,project.locks), fabric=fabrics[project.fabric];
  const items=selection.flatMap(id=>project.objects.filter(o=>o.id===id)),multi=items.length>1,allLocked=items.length>0&&items.every(o=>o.locked);
  // Transforms act on the unlocked part of the selection; a locked-only selection is read-only.
  const movableIds=useMemo(()=>unlockedIds(project,selection),[project.objects,selection.join('|')]);
  const selectionBox=useMemo(()=>selectionBounds(project,movableIds.length?movableIds:selection),[project.objects,movableIds,selection.join('|')]);
  const selectionRotation=items[0]?.rotation??items[0]?.text?.rotation??0;
  const size=useMemo(()=>designBounds(project.objects),[project.objects]);
  const canvasScale=viewportScale(view,canvasSize,hoop)||1;
  const viewWidth=canvasSize.width/canvasScale, viewHeight=canvasSize.height/canvasScale;
  const viewX=hoop.width/2-viewWidth/2+pan[0], viewY=hoop.height/2-viewHeight/2+pan[1];
  const editing=editPoints&&tool==='select'&&!!item&&!item.hidden&&!item.locked&&!multi&&!item.text&&!hasDraft;
  const angles=angleMode&&tool==='select'&&!!item&&!item.hidden&&!item.locked&&!multi&&!editing&&!hasDraft&&!!guideMode(item),flowGuides=!!item&&guideMode(item)==='flow';
  const transient=!!(colourPick||pickHint||panMode||angles||editing||continuation||pathTarget);
  const showToolHint=transient||hasDraft||!!shapeDraft||drawing;
  const pointBox=useMemo(()=>editing&&item?bounds([{...item,rings:item.rails?.points??(item.curve?[item.curve.points]:item.rings)}]):null,[editing,item]);
  const handles=useMemo(()=>editing&&item?insertionHandles(item):[],[editing,item]);
  const addPreview=editing&&pointMode==='add'&&item&&hover?closestInsertion(item,hover):null;
  const canUndoDraft=hasDraft&&draft.length>(continuation?.base||0);
  const selectedIndex=project.objects.indexOf(item!),previousObject=project.objects[selectedIndex-1],nextObject=project.objects[selectedIndex+1];
  const ends=useMemo(()=>tool==='select'&&item&&!item.hidden&&!item.locked&&!multi&&!editing&&!hasDraft&&!continuation?routeEnds(project,item.id):null,[tool,item,multi,editing,hasDraft,continuation,previousObject,nextObject,project.fabric,project.locks]);

  useEffect(()=>{setActivePoint(null);setPointMode('move');},[selected,editPoints]);
  useEffect(()=>setAngleMode(false),[selected,tool]);
  useEffect(()=>{if(tool!=='open')setPathTarget(null);},[tool]);
  const missingGlyphs=useMemo(()=>{
    if(!item?.text||fontLoading)return [];void fontsReady;
    if(item.text.satin)return satinFontsLoaded()?layoutSatinText(item.text).missing:[];
    const fonts=loadedFonts(item.text.font);if(!fonts.length)return [];
    return [...new Set(item.text.content.replace(/\s/g,''))].filter(c=>!fonts.some(f=>f.charToGlyphIndex(c)>0));
  },[item?.text,fontLoading,fontsReady]);

  function applyViewport(next:Viewport){viewport.current=next;setView(next);setHover(null);}
  const fitMeasured=useStableCallback(()=>{
    const canvas=svg.current,area=stage.current;if(!canvas||!area)return;
    const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const css=getComputedStyle(area),px=(name:string)=>parseFloat(css.getPropertyValue(name));
    const gap=px('--gap'),ruler=viewSettings.rulers?px('--canvas-ruler-size'):0;
    // Always reserve the full settings width, even with no selection or a collapsed overlay.
    const insets={top:ruler+2*gap+px('--canvas-top-height'),right:px('--rail')+gap,bottom:2*gap+px('--canvas-dock-height'),left:ruler+2*gap+px('--settings-width')};
    measuredCanvas.current={width:rect.width,height:rect.height,hoop:current.current.hoop};
    setCanvasSize({width:rect.width,height:rect.height});
    applyViewport(fitViewport(rect,hoops[current.current.hoop],insets));
  });
  const syncCanvasSize=useStableCallback(()=>{
    if(!ready)return;
    const rect=svg.current?.getBoundingClientRect();if(!rect?.width||!rect.height)return;
    const before=measuredCanvas.current;
    // Only initial load and a new hoop request an automatic fit.
    if(!before||before.hoop!==current.current.hoop){fitMeasured();return;}
    if(before.width===rect.width&&before.height===rect.height)return;
    measuredCanvas.current={width:rect.width,height:rect.height,hoop:current.current.hoop};
    applyViewport(keepViewportOnResize(viewport.current,before,rect,hoops[current.current.hoop]));
    setCanvasSize({width:rect.width,height:rect.height});
  });
  // Compensate in the layout phase when React changes panel width; the observer handles window resizes.
  useLayoutEffect(()=>{syncCanvasSize();});
  useEffect(()=>{
    const canvas=svg.current;if(!canvas)return;
    // ResizeObserver runs before paint; commit compensation before the browser draws the new size.
    const observer=new ResizeObserver(()=>flushSync(syncCanvasSize));observer.observe(canvas);
    const wheel=(e:WheelEvent)=>wheelHandler.current?.(e);
    canvas.addEventListener('wheel',wheel,{passive:false});
    return()=>{observer.disconnect();canvas.removeEventListener('wheel',wheel);};
  },[syncCanvasSize]);
  function zoomBy(factor:number,client?:Point){
    const view=viewport.current,rect=svg.current!.getBoundingClientRect();
    const anchor=client?clientToWorld(view,client,rect,hoop):[hoop.width/2+view.pan[0],hoop.height/2+view.pan[1]] as Point;
    applyViewport(zoomViewport(view,anchor,view.zoom*factor,hoop));
  }
  wheelHandler.current=(e:WheelEvent)=>{
    e.preventDefault();if(drag.current||transformDrag.current||draftDrag.current||drawing||panDrag.current)return;
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
    let initialT=t;try{if(localStorage.getItem('threadroom-lang')==='en')initialT=createT('en');}catch{/* Storage is optional. */}
    try{setViewSettings(readViewSettings(localStorage.getItem('threadroom-view-v1')));clipboard.current=readClipboard(localStorage.getItem('threadroom-clipboard-v1'));}catch{/* Storage is optional. */}
    let p:Project=demo(initialT);
    try {const text=localStorage.getItem('threadroom-project-v1');if(text){const value=JSON.parse(text);if(validProject(value))p=normalizeGroups(value);}}catch{/* Storage is optional. */}
    let live=true;
    const restore=()=>{if(!live)return;try{p=syncPathBindings(migrateImages(normalizeGroups(p)));}catch{p=migrateImages(demo(initialT));}current.current=p;setProject(p);setSelected(p.objects[0]?.id||null);setReady(true);if(narrowScreen())setPanelOpen(false);};
    if(p.objects.some(o=>o.text?.satin))void ensureSatinFonts().then(restore).catch(e=>setError(errorText(e,t,'The font could not be loaded.')));else restore();
    fetch('/api/export').then(r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>setApiState(data.python?'ready':'offline')).catch(()=>setApiState('offline'));
    return()=>{live=false;};
  },[]);
  useEffect(()=>{
    if(!ready)return;
    const timer=setTimeout(()=>{try{localStorage.setItem('threadroom-project-v1',JSON.stringify(project));setSaved(true);}catch{setSaved(false);}},500);
    return()=>clearTimeout(timer);
  },[project,ready]);
  useEffect(()=>{if(ready)try{localStorage.setItem('threadroom-view-v1',JSON.stringify(viewSettings));}catch{/* Storage is optional. */}},[viewSettings,ready]);
  // Design check: geometry checks shortly after each change; stitch checks from a background compile.
  useEffect(()=>{if(!ready)return;const timer=setTimeout(()=>setDesignIssues(checkProject(project)),250);return()=>clearTimeout(timer);},[project,ready]);
  const cannotSew=designIssues.some(w=>w.code==='outside-hoop')||!project.objects.some(o=>o.rings.length);
  const compileFresh=!!compiled&&(compiled.engine==='Imported PES'||compiledSource===project);
  const staleIds=useMemo(()=>changedObjectIds(compiledSource,project),[compiledSource,project]);
  useEffect(()=>{
    if(!ready||apiState!=='ready'||compileFresh||hasDraft||cannotSew)return;
    const version=revision.current,timer=setTimeout(()=>{void compile(current.current,version).catch(()=>{});},350);
    return()=>clearTimeout(timer);
  },[project,compileFresh,ready,apiState,hasDraft,cannotSew]);
  useEffect(()=>()=>compiling.current?.controller.abort(),[]);
  function compile(p:Project,version:number):Promise<Compiled|null>{
    const old=compiling.current;if(old?.version===version&&!old.controller.signal.aborted)return old.promise;
    old?.controller.abort();const controller=new AbortController();
    const promise=(async()=>{
      // Wait for the aborted fetch to settle before starting another request.
      await old?.promise.catch(()=>{});if(controller.signal.aborted||version!==revision.current)return null;
      let connected=false;
      try{
        const response=await fetch('/api/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(geometryPayload(p)),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(60000)])});
        if(!response.headers.get('Content-Type')?.includes('application/json'))throw new TranslationError(t,"The export URL returned a web page (HTTP {v0}), rather than the embroidery API. Restart npm run dev to reconnect Python and Next.js.",{v0:response.status});
        const result=await response.json();if(controller.signal.aborted||version!==revision.current)return null;
        connected=true;setApiState('ready');if(!response.ok){const message=errorText(result.error,t,'The stitch engine rejected this design.');setCheckError(typeof result.error==='string'?result.error:'The stitch engine rejected this design.');throw new Error(message);}
        setCompiledSource(p);setCompiled(result);setProgress(1);setCheckError('');return result as Compiled;
      }catch(e){if(controller.signal.aborted||version!==revision.current)return null;if(!connected)setApiState('offline');throw e;}
    })().finally(()=>{if(compiling.current?.promise===promise)compiling.current=null;});
    compiling.current={version,controller,promise};return promise;
  }
  useEffect(()=>{
    if(!playing||!compiled)return;
    let last=performance.now();
    const tick=(now:number)=>{const delta=(now-last)/1000;last=now;setProgress(p=>{const n=Math.min(1,p+delta*playbackRate*speed/compiled.commands.length);if(n>=1)setPlaying(false);return n;});playback.current=requestAnimationFrame(tick);};
    playback.current=requestAnimationFrame(tick);return()=>cancelAnimationFrame(playback.current);
  },[playing,compiled,speed]);

  function commit(next:Project, label='', merge?:string) {
    try{next=syncPathBindings(migrateImages(normalizeGroups(next)),current.current);}catch(e){setError(errorText(e,t,'Map to path exceeds the hoop or design limits.'));return;}
    // Typing and slider drags coalesce into one undo step per field.
    const now=performance.now(),same=!!merge&&lastMerge.current?.key===merge&&now-lastMerge.current.time<1500;
    lastMerge.current=merge?{key:merge,time:now}:null;
    // Read the previous state now: the updater may run after current.current changes.
    const previous=current.current;if(next===previous)return;if(!same){setHistory(h=>[...h.slice(-29),previous]);setFuture([]);}
    current.current=next;setProject(next);setSelection(ids=>ids.filter(id=>next.objects.some(o=>o.id===id)));invalidate();setSaved(false);if(label)setMessage(label);
  }
  function stopPlayback(){playRequest.current++;setPlaying(false);setProgress(1);}
  function invalidate(){revision.current++;traceTask.cancel();svgTask.cancel();hoverTask.cancel();clickTask.cancel();lastStitch.current=null;setStitchHover(null);compiling.current?.controller.abort();if(!current.current.objects.length||compiled?.engine==='Imported PES'){setCompiled(null);setCompiledSource(null);}setCheckError('');stopPlayback();setError('');}
  function layoutObject(o:StitchObject):StitchObject{
    if(!o.text)return o;if(o.text.satin)return {...o,kind:'satin-block',rings:layoutSatinText(o.text).rings};
    const fonts=loadedFonts(o.text.font);if(!fonts.length)return o;
    return {...o,rings:layoutText(o.text,fonts,!isFillKind(o.kind)).rings};
  }
  function relayout(id:string){
    const p=current.current,o=p.objects.find(x=>x.id===id);if(!o?.text)return;
    const next=layoutObject(o);if(next===o)return;
    current.current=syncPathBindings({...p,objects:p.objects.map(x=>x.id===id?next:x)},p);setProject(current.current);invalidate();setSaved(false);
  }
  // A newly placed text that would leave the hoop shrinks and moves inside it once its font is laid out.
  function fitPlacedText(id:string){
    const p=current.current,o=p.objects.find(x=>x.id===id);if(!o?.text)return;
    const text=fitTextInHoop(o.text,bounds([o]),hoops[p.hoop]);if(!text)return;
    current.current={...p,objects:p.objects.map(x=>x.id===id?{...o,text}:x)};relayout(id);
  }
  function loadTextFonts(id:string,spec:TextSpec,fit=false){
    if(spec.satin)return;
    setFontLoading(n=>n+1);
    ensureFonts(spec.font,spec.content,t).then(changed=>{if(changed)relayout(id);if(fit)fitPlacedText(id);setFontsReady(n=>n+1);}).catch(e=>setError(errorText(e,t,'The font could not be loaded.'))).finally(()=>setFontLoading(n=>n-1));
  }
  async function updateText(patch:Partial<TextSpec>,merge?:string){
    if(!item?.text||item.locked)return;
    if(patch.satin&&!satinFontsLoaded()){const version=revision.current;setFontLoading(n=>n+1);try{await ensureSatinFonts();}catch(e){setError(errorText(e,t,'The font could not be loaded.'));return;}finally{setFontLoading(n=>n-1);}if(version!==revision.current)return;setFontsReady(n=>n+1);}
    const text={...item.text,...patch},name=patch.content!==undefined&&item.name===textName(item.text.content)?textName(text.content):item.name;
    if(patch.font)lastFont.current=text.font;
    const next=layoutObject({...item,name,text,...(patch.satin&&!item.text.satin?{kind:'satin-block' as const,underlay:undefined,spacing:undefined}:item.text.satin&&!text.satin?{kind:'fill' as const,underlay:undefined,spacing:undefined}:{})});
    commit({...project,objects:project.objects.map(o=>o.id===item.id?next:o)},'',merge&&`${item.id}:${merge}`);
    if(patch.font||patch.content!==undefined||item.text.satin&&!text.satin)loadTextFonts(item.id,text);
  }
  function placeText(p:Point){
    const text=defaultText(lastFont.current,p,undefined,t),o=layoutObject({...object(t("Your text"),[],'fill',item?.color||palette[3]),fillPattern:'tatami',underlay:'edge',text});
    commit({...project,objects:[...project.objects,o]});setSelected(o.id);setTool('select');setEditPoints(false);
    loadTextFonts(o.id,text,true);setSettingsCollapsed(false);
    textFocus.current=true;requestAnimationFrame(focusTextReady);
  }
  function focusText(){setSettingsCollapsed(false);textFocus.current=true;requestAnimationFrame(focusTextReady);}
  function convertText(){
    if(!item?.text)return;
    if(!item.rings.length){setError(t("Type some text before converting it to shapes."));return;}
    if(item.text.satin){const next=convertSatinText(project,item.id);if(!next){setError(t("Converting this text would exceed 80 objects. Shorten the text first."));return;}commit(next,t("Text converted to editable shapes"));setSelected(next.objects.find(o=>o.id.startsWith(`${item.id}-satin-`))!.id);return;}
    const {text,...shape}=item;void text;
    commit({...project,objects:project.objects.map(o=>o.id===item.id?{...shape,rings:reclose(shape.rings,!isFillKind(shape.kind))}:o)},t("Text converted to editable shapes"));
  }
  function useGuide(id:string){
    const source=current.current.objects.find(o=>o.id===id&&!o.hidden);if(!source||!item?.text)return;
    const path=source.curve?curveRing(source.curve):source.rings[0];
    const closed=!source.curve&&isFillKind(source.kind)||!!source.curve?.closed;
    updateText({layout:'path',path:(closed?[...path,path[0]]:path).map(p=>textSourcePoint(item.text!,p))});
    setGuide({text:item.id,id,name:source.name});
  }
  function removeGuide(){if(!guide)return;commit({...project,objects:project.objects.filter(o=>o.id!==guide.id)});setGuide(null);}
  function drawTextPath(){if(!item?.text)return;const id=item.id;chooseTool('open');setPathTarget(id);}
  function updateObject(patch:Partial<StitchObject>){if(!item||item.locked)return;if(patch.kind&&patch.kind!==item.kind&&isFillKind(patch.kind)&&!isClosedShape(item))return;
    let next={...(patch.kind?changeStitchKind(item,patch.kind):item),...patch};if(patch.color!==undefined&&!patch.thread)delete next.thread;for(const key of Object.keys(patch) as (keyof StitchObject)[])if(patch[key]===undefined)delete next[key];
    if(next.text&&patch.kind){const relaid=layoutObject(next);next=relaid!==next?relaid:{...next,rings:reclose(next.rings,!isFillKind(patch.kind))};if(patch.kind==='manual')next.kind='running';}commit({...project,objects:project.objects.map(o=>o.id===selected?next:o)});}
  // Undo/redo keeps the selected objects that still exist; it never jumps to an unrelated object.
  function restoreSelection(p:Project){if(!selection.length&&p.images?.some(i=>i.id===imageSel))return;setSelection(ids=>{const kept=ids.filter(id=>p.objects.some(o=>o.id===id));return kept.length===ids.length?ids:kept;});}
  function undo(){endDrag();setActivePoint(null);if(draftRef.current.length){if(canUndoDraft)popDraft();return;}if(!history.length)return;const before=history[history.length-1];setFuture(f=>[current.current,...f]);setHistory(history.slice(0,-1));current.current=before;setProject(before);restoreSelection(before);invalidate();setDraft([]);}
  function redo(){setActivePoint(null);if(!future.length)return;const previous=current.current;setHistory(h=>[...h,previous]);current.current=future[0];setProject(future[0]);restoreSelection(future[0]);setFuture(future.slice(1));invalidate();}
  // Phones show the side panel as a drawer over the canvas, so it closes when the canvas is needed.
  function narrowScreen(){return window.matchMedia('(max-width: 760px)').matches;}
  function openTab(t:PanelTab){if(panelOpen&&panelTab===t){setPanelOpen(false);return;}setPanelTab(t);setPanelOpen(true);}
  function leavePanel(){setPanelTab('layers');if(narrowScreen())setPanelOpen(false);}
  function closePanel(id:string){const panel=document.getElementById(id);if(panel?.matches(':popover-open'))panel.hidePopover();}
  function point(e:ReactPointerEvent<SVGSVGElement>):Point {
    return clientToWorld(viewport.current,[e.clientX,e.clientY],svg.current!.getBoundingClientRect(),hoop);
  }
  function cancelDrawing(){moveQueue.current?.cancel();draftDrag.current=null;draftPress.current=null;clickHistory.current={};setPanMode(false);setDraft([]);setCorners([]);setShapeDraft(null);shapePress.current=null;setDrawing(false);setHover(null);setError('');if(continuation){setTool('select');setEditPoints(true);}setContinuation(null);if(pathTarget)setSelected(pathTarget);setPathTarget(null);}
  function finish(points=draftRef.current,how:'enter'|'first'|'switch'='enter'){
    const fit=tool==='freehand'?fitFreehand(points):null,flags=fit?.corners??cornersRef.current.slice(0,points.length);
    points=fit?.points??points;
    if(fit&&points.length<2){cancelDrawing();return true;}
    if(tool==='holes'){
      if(points.length<3)return false;
      const ring=curveRing({points,closed:true,corners:flags,spline:'levien'});
      if(!item||!applyShape(()=>cutHole(project,item.id,ring,t),false))return false;
      cancelDrawing();setTool('holes');return true;
    }
    const completion=completeDraft(pathTool(tool)||tool==='points'?tool as 'open'|'closed'|'blocks'|'points':'open',points,flags,how);if(!completion)return false;
    const closed=fit?.closed??completion.closed,kind:Kind=fit?'running':completion.kind;
    const reverse=continuation?.fromStart,anchors=reverse?[...points].reverse():points,anchorCorners=reverse?[...flags].reverse():flags;
    const existing=continuation&&project.objects.find(o=>o.id===continuation.id);
    const rails=kind==='satin-block'&&!existing?draftRails(points,flags):null;
    const curve:StitchObject['curve']=tool==='points'||rails?undefined:{points:anchors.map(p=>[...p]),closed,corners:anchorCorners,...(existing?.curve?.spline||!existing?{spline:'levien' as const}:{})};
    const rings=rails?extent(withRails(object('',[]),rails)):curve?[curveRing(curve,!isFillKind(closed?kind:existing?.kind??kind))]:[points];
    if(outsideHoop(rings,hoop)){setError(t("Curve exceeds the hoop. Drag its points inward, then finish."));return false;}
    const target=pathTarget&&project.objects.find(o=>o.id===pathTarget);
    if(target&&target.text){
      const next=layoutObject({...target,text:{...target.text,layout:'path',path:rings[0].map(p=>textSourcePoint(target.text!,p))}});
      commit({...project,objects:project.objects.map(o=>o.id===target.id?next:o)});setGuide(null);cancelDrawing();setTool('select');setSelected(target.id);return true;
    }
    const next=existing?{...existing,rings,...(closed?{kind,name:t("Closed shape"),fillPattern:'tatami' as const}:{})}:object(closed&&!fit?t("Closed shape"):tool==='blocks'?t("Satin block"):tool==='open'?t("Open shape"):tool==='points'?t("Point stitches"):t("Freehand line"),rings,kind,item?.color||palette[3]);
    if(!existing&&kind==='fill')next.fillPattern='tatami';
    if(curve)next.curve=curve;
    const created=rails?withRails(next,rails):next;
    commit({...project,objects:existing?project.objects.map(o=>o.id===next.id?next:o):[...project.objects,created]});setSelected(next.id);setActivePoint(null);cancelDrawing();setEditPoints(false);setTool(tool);return true;
  }
  function shapeOf(d:{start:Point;end:Point;square:boolean}){
    if(shapeKind==='rect')return rect(d.start,fitRect(d.start,d.end,hoop,d.square),d.square);
    const r=fitRadius(shapeKind,d.start,Math.hypot(d.end[0]-d.start[0],d.end[1]-d.start[1]),hoop);
    return shapeMakers[shapeKind](d.start,r);
  }
  function finishShape(d:{start:Point;end:Point;square:boolean}){
    setShapeDraft(null);shapePress.current=null;
    const shape=shapeOf(d),xs=shape.points.map(p=>p[0]),ys=shape.points.map(p=>p[1]);
    if(Math.max(...xs)-Math.min(...xs)<1||Math.max(...ys)-Math.min(...ys)<1){setError(t("Click again a little further away to size the shape."));return;}
    const curve={points:shape.points,closed:true,corners:shape.corners,spline:'levien' as const},o={...object(t(shapeNames[shapeKind]),[curveRing(curve)],'fill',item?.color||palette[3]),fillPattern:'tatami' as const,curve};
    commit({...project,objects:[...project.objects,o]});setSelected(o.id);setEditPoints(false);setError('');
  }
  // Shape operations commit one undo step and select the results; failures show their reason.
  function applyShape(run:()=>ShapeResult,select=true){
    let r:ShapeResult;try{r=run();}catch{r={error:t("Shape operation failed.")};}
    if('error' in r){setError(r.error);return false;}
    commit(r.project,r.message);if(select){setSelection(r.ids);anchor.current=r.ids[0]??null;}setEditPoints(false);setError('');return true;
  }
  function finishKnife(d:{start:Point;end:Point;square:boolean}){
    setShapeDraft(null);shapePress.current=null;const end=d.square?snapAngle(d.start,d.end):d.end;
    if(Math.hypot(end[0]-d.start[0],end[1]-d.start[1])<.5){setError(t("Drag across a shape to cut it."));return;}
    applyShape(()=>knifeShapes(current.current,selection.length?selection:null,d.start,end,t));
  }
  function shapeMode(mode:'holes'|'knife'){chooseTool(mode);}
  function toggleCorner(index:number,ring=activePoint?.[0]??0){
    if(!item?.curve&&!item?.rails)return;const corner=!isCorner(item,ring,index);
    if(savePointChange(setCorner(item,index,corner,ring)))setMessage(corner?t("Point is now a corner."):t("Point is now a curve point."));
  }
  function editableSelection(){const ids=unlockedIds(current.current,selection);if(selection.length&&!ids.length)setMessage(t('Locked objects can’t be changed. Unlock them first.'));return ids;}
  function editSelection(m:Matrix,rotation=0,merge?:string){
    const p=current.current,image=!selection.length&&p.images?.find(i=>i.id===imageSel);
    if(image){if(image.locked){setMessage(t('This image is locked. Unlock it first.'));return;}const next=transformImage(p,image.id,m);if(!next)setError(t('The image can’t be transformed that way.'));else if(next!==p)commit(next,'',merge);return;}
    const ids=editableSelection();if(!ids.length)return;const next=transformSelection(p,ids,m,rotation);if(!next){setError(t('Transform stays inside the hoop.'));return;}if(next!==p)commit(next,'',merge);
  }
  function selectionAction(action:'flipH'|'flipV'|'rotate'){
    const b=selectionBounds(current.current,unlockedIds(current.current,selection));editSelection(around(centre(b),action==='flipH'?-1:1,action==='flipV'?-1:1,action==='rotate'?90:0),action==='rotate'?90:0);
  }
  function selectionField(key:'x'|'y'|'width'|'height'|'rotation',value:number){
    const b=selectionBounds(current.current,unlockedIds(current.current,selection));if(key==='rotation'){const delta=value-selectionRotation;editSelection(around(centre(b),1,1,delta),delta);}
    else if(key==='x'||key==='y')editSelection(translate(key==='x'?value-b.x:0,key==='y'?value-b.y:0));
    else if(value>0&&b[key]>1e-6)editSelection(around([b.x,b.y],key==='width'?value/b.width:1,key==='height'?value/b.height:1));
  }
  function alignSelected(mode:Align){const ids=editableSelection();if(!ids.length)return;const next=alignSelection(current.current,ids,mode);if(next)commit(next);else setError(t('Transform stays inside the hoop.'));}
  function copySelected(cut=false){
    if(!selection.length)return;clipboard.current=copySelection(current.current,selection);pasteCount.current=0;
    try{localStorage.setItem('threadroom-clipboard-v1',JSON.stringify(clipboard.current));}catch{/* The in-memory clipboard still works. */}
    if(cut)deleteSelected();else setMessage(t('Copied selection'));
  }
  function pasteSelected(duplicate=false){
    const clip=duplicate?copySelection(current.current,selection):clipboard.current;if(!clip?.objects.length){setError(t('Clipboard is empty or unavailable.'));return;}
    const next=pasteSelection(current.current,clip,duplicate?3:3*(pasteCount.current+1),()=>crypto.randomUUID());
    if(!next){setError(t('Cannot paste: keep the objects inside the hoop and the project within 80 objects.'));return;}
    if(!duplicate)pasteCount.current++;commit(next.project);setSelection(next.ids);anchor.current=next.ids[0]??null;setTool('select');setEditPoints(false);
    for(const o of next.project.objects)if(next.ids.includes(o.id)&&o.text)loadTextFonts(o.id,o.text);
  }
  function nudge(key:string,shift:boolean,repeat:boolean){
    const amount=shift?1:.1,now=performance.now(),id=selection.join('|'),merge=nudgeBurst.current.step(id,now,repeat);
    if(!merge)lastMerge.current=null;else if(lastMerge.current?.key===`nudge:${id}`)lastMerge.current.time=now;
    editSelection(translate(key==='ArrowLeft'?-amount:key==='ArrowRight'?amount:0,key==='ArrowUp'?-amount:key==='ArrowDown'?amount:0),0,`nudge:${id}`);
  }
  function snapBox(box:ReturnType<typeof selectionBounds>,p:Project,ids:string[],point=false){
    return snapBounds(box,p.objects.filter(o=>!ids.includes(o.id)&&!o.hidden&&o.rings.length).map(o=>objectGeometry(o).bounds),6/canvasScale,viewSettings.snapGrid?viewSettings.gridSize/viewSettings.subdivisions:null,viewSettings.snapObjects,point);
  }
  function cancelTransform(){
    moveQueue.current?.cancel();setSelectionDragging(false);const before=dragUndo.current.cancel();transformDrag.current=null;drag.current=null;setSnapGuides([]);
    if(before){current.current=before;setProject(before);invalidate();setSaved(false);}
  }
  function deleteSelected(){if(!selected){if(selImage&&!selImage.locked)deleteImage(selImage.id);return;}const ids=editableSelection();if(!ids.length)return;commit({...project,objects:project.objects.filter(o=>!ids.includes(o.id))});setSelection(selection.filter(id=>!ids.includes(id)));}
  function lockSelection(ids=selection){if(!ids.length){if(selImage)changeImage(selImage.id,{locked:selImage.locked?undefined:true});return;}const next=toggleLock(current.current,ids),locked=next.objects.some(o=>ids.includes(o.id)&&o.locked);commit(next,t(locked?'locked.other':'unlocked.other',{count:ids.length}));if(locked)setEditPoints(false);}
  function unlockEverything(){commit(unlockAll(current.current),t('All objects unlocked'));}
  function selectAll(){const ids=selectableIds(current.current);setSelection(ids);anchor.current=ids[0]??null;setEditPoints(false);setTool('select');}
  function groupSelection(){if(items.length<2)return;commit(groupObjects(project,selection,undefined,t).project);}
  function ungroupSelection(){commit(ungroupObjects(project,selection));}
  function hideObjects(ids:string[]){const hidden=!project.objects.filter(o=>ids.includes(o.id)).every(o=>o.hidden);commit({...project,objects:project.objects.map(o=>ids.includes(o.id)?{...o,hidden}:o)});}
  function renameObject(id:string,name:string,group:boolean){commit(group?{...project,groups:project.groups?.map(g=>g.id===id?{...g,name:name.slice(0,40)}:g)}:{...project,objects:project.objects.map(o=>o.id===id?{...o,name:name.slice(0,40)}:o)});}
  // Reference images: one undo step per change; opacity and size fields coalesce while dragging.
  function changeImage(id:string,patch:Partial<RefImage>,merge?:string){commit(updateImage(current.current,id,patch),'',merge&&`image:${id}:${merge}`);}
  function deleteImage(id:string){commit(removeImage(current.current,id));if(imageSel===id)setImageSel(null);}
  function selectImage(id:string|null){setSelected(null);setEditPoints(false);setImageSel(id);}
  function toggleColourPick(){
    if(colourPickRef.current){cancelColourPick();return;}
    if(!art||!unlockedIds(current.current,selection).length||hasDraft)return;
    endDrag();const session={ids:unlockedIds(current.current,selection),image:art.id};colourPickRef.current=session;setColourPick(session);setPickHint('');setShowImage(true);setHover(null);
    svg.current?.focus({preventScroll:true});
    void artworkPixels(art.src,t).catch(e=>{if(colourPickRef.current===session)setPickHint(errorText(e,t,'Could not read the reference image.'));});
  }
  async function pickColour(p:Point){
    const session=colourPickRef.current,art=current.current.images?.find(i=>i.id===session?.image);if(!session||!art)return;
    if(!insideImage(art,p)){setPickHint(t("Click inside the reference image."));return;}
    try{
      const pixels=await artworkPixels(art.src,t);
      if(colourPickRef.current!==session||!current.current.images?.includes(art))return;
      const color=sampleArtwork(pixels,art,toImageFrame(art,p));if(!color){setPickHint(t("No visible image pixels here. Try another point."));return;}
      const before=current.current;cancelColourPick();
      commit({...before,objects:before.objects.map(o=>session.ids.includes(o.id)?recolorObject(o,color):o)},t("Thread colour picked: {v0}",{v0:color.toUpperCase()}));
    }catch(e){if(colourPickRef.current===session)setPickHint(errorText(e,t,'Could not read the reference image.'));}
  }
  function reorderSelection(where:'top'|'up'|'down'|'bottom'){
    const indices=project.objects.flatMap((o,i)=>selection.includes(o.id)?[i]:[]);if(!indices.length)return;
    const index=where==='top'?0:where==='bottom'?project.objects.length:where==='up'?indices[0]-1:indices.at(-1)!+2;
    const group=items[0]?.group,whole=group!==undefined&&items.every(o=>o.group===group)&&project.objects.filter(o=>o.group===group).length===items.length;
    const target=project.objects[index]?.group,into=group!==undefined&&items.every(o=>o.group===group)&&target===group?group:null;
    commit(whole?moveGroup(project,group,index):moveObjects(project,selection,index,into));
  }
  function finishEditing(){setEditPoints(false);setActivePoint(null);setPointMode('move');svg.current?.focus({preventScroll:true});}
  function savePointChange(next:StitchObject){
    if(extent(next).flat().some(([x,y])=>x<0||y<0||x>hoop.width||y>hoop.height)){setError(t("That adjustment extends outside the hoop. Move the point inward."));return false;}
    commit({...project,objects:project.objects.map(o=>o.id===next.id?next:o)});return true;
  }
  function addPoint(ring:number,index:number,p:Point,corner=false){if(!item)return;const next=insertGeometryPoint(item,ring,index,p,corner);if(next===item)return;if(savePointChange(next)){setActivePoint([ring,index]);setPointMode('move');}}
  function removePoint(location=activePoint){if(!item||!location)return;const next=removeGeometryPoint(item,...location);if(next===item){setError(item.rails?t("Keep at least two rungs in a satin block."):t("Keep at least {v0} points in this path.",{v0:item.curve?.closed||isFillKind(item.kind)?3:2}));return;}if(savePointChange(next)){setActivePoint(null);svg.current?.focus({preventScroll:true});}}
  function continueCurve(){
    if(!item?.curve||item.curve.closed)return;
    const fromStart=activePoint?.[1]===0,points=item.curve.points.map(p=>[...p] as Point),flags=item.curve.points.map((_,i)=>item.curve!.corners?.[i]??false);
    setContinuation({id:item.id,fromStart,base:points.length});setDraft(fromStart?points.reverse():points);setCorners(fromStart?flags.reverse():flags);setTool('open');setPanMode(false);setActivePoint(null);svg.current?.focus({preventScroll:true});
  }
  // Avoid intercepting text input or native controls; shortcuts act on the canvas.
  useEffect(()=>{
    const typing=(target:EventTarget|null)=>target instanceof HTMLElement&&!!target.closest('input,select,textarea,[contenteditable="true"]');
    const keydown=(e:KeyboardEvent)=>{
      setAngleSnap(e.ctrlKey||e.metaKey);
      if(e.key==='Escape'&&colourPickRef.current){e.preventDefault();cancelColourPick();return;}
      if(shortcutHelp){if(e.key==='Escape'||e.key==='?'){e.preventDefault();setShortcutHelp(false);requestAnimationFrame(()=>svg.current?.focus());}return;}
      if(typing(e.target)||document.querySelector('[popover]:popover-open'))return;
      if(e.key==='?'){e.preventDefault();endDrag();setShortcutHelp(true);return;}
      if(e.key==='Escape'&&(transformDrag.current||drag.current)){e.preventDefault();cancelTransform();return;}
      if(transformDrag.current||drag.current)return;
      if((e.key==='ContextMenu'||e.shiftKey&&e.key==='F10')&&tool==='select'&&!editing&&!hasDraft){e.preventDefault();const rect=svg.current!.getBoundingClientRect(),b=selectionBox,[x,y]=selection.length?worldToClient(viewport.current,[b.x+b.width/2,b.y+b.height/2],rect,hoop):[rect.left+rect.width/2,rect.top+rect.height/2];openMenu(x,y,null,true);return;}
      if(e.target instanceof HTMLElement&&e.target.closest('button,a')&&(e.key==='Enter'||e.code==='Space'))return;
      if(e.code==='Space'&&!(e.target instanceof HTMLElement&&e.target.closest('button,a'))){e.preventDefault();setSpacePan(true);return;}
      if(e.key==='Escape'&&focusKey){e.preventDefault();setFocusKey(null);return;}
      if(e.key==='Escape'&&(shapeDraft||measure)){e.preventDefault();moveQueue.current?.cancel();setShapeDraft(null);shapePress.current=null;setMeasure(null);return;}
      if(e.key==='Escape'){e.preventDefault();if(hasDraft)cancelDrawing();else if(editing)finishEditing();else{setTool('select');setEditPoints(false);setSelected(null);setImageSel(null);}return;}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey&&!hasDraft)redo();else undo();return;}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='g'){e.preventDefault();if(!hasDraft){if(e.shiftKey)ungroupSelection();else groupSelection();}return;}
      if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='l'){e.preventDefault();if(!hasDraft)lockSelection();return;}
      if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='a'){e.preventDefault();if(!hasDraft&&!editing)selectAll();return;}
      if((e.ctrlKey||e.metaKey)&&['c','x','v','d'].includes(e.key.toLowerCase())){if(!hasDraft){e.preventDefault();const key=e.key.toLowerCase();if(key==='c'||key==='x')copySelected(key==='x');else pasteSelected(key==='d');}return;}
      if(e.ctrlKey||e.metaKey||e.altKey)return;
      if(!hasDraft&&(selection.length||selImage)&&e.key.startsWith('Arrow')){e.preventDefault();nudge(e.key,e.shiftKey,e.repeat);return;}
      if(!hasDraft&&selection.length&&e.shiftKey&&['h','v'].includes(e.key.toLowerCase())){e.preventDefault();selectionAction(e.key.toLowerCase()==='h'?'flipH':'flipV');return;}
      if(e.key==='+'||e.key==='='){e.preventDefault();zoomBy(1.2);return;}
      if(e.key==='-'||e.key==='_'){e.preventDefault();zoomBy(1/1.2);return;}
      if(e.key==='0'){e.preventDefault();fit();return;}
      if(e.key==='Enter'&&hasDraft){e.preventDefault();finish();return;}
      if(e.key==='Enter'&&editing){e.preventDefault();finishEditing();return;}
      if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();if(hasDraft){if(canUndoDraft)popDraft();}else if(editing)removePoint();else deleteSelected();return;}
      if(tool==='select'&&!hasDraft&&!e.ctrlKey&&!e.metaKey&&(e.key.toLowerCase()==='a'||e.key.toLowerCase()==='f'&&!!item&&guideMode(item)==='flow')){e.preventDefault();toggleAngles();return;}
      if(tool==='select'&&!hasDraft&&!editing&&!e.ctrlKey&&!e.metaKey&&e.key.toLowerCase()==='w'){e.preventDefault();redwork();return;}
      const key=e.key.toLowerCase(),next=tools.find(t=>t.key.toLowerCase()===key||t.alt?.toLowerCase()===key);if(next){e.preventDefault();chooseTool(next.id);}
    };
    const keyup=(e:KeyboardEvent)=>{setAngleSnap(e.ctrlKey||e.metaKey);if(e.code==='Space')setSpacePan(false);};
    const blur=()=>{setSpacePan(false);setAngleSnap(false);nudgeBurst.current.clear();lastMerge.current=null;endDrag();};
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);
    return()=>{window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);};
  });
  // Drags commit one undo step when they end: on pointer-up, lost capture, a window pointer-up
  // (if capture failed) or, as a last resort, the next pointer-down.
  function capture(e:ReactPointerEvent<SVGSVGElement>){try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* Window pointer-up still ends the drag. */}}
  function startDrag(d:Omit<NonNullable<typeof drag.current>,'before'>,e:ReactPointerEvent<SVGSVGElement>){endDrag();setSelectionDragging(true);drag.current={...d,before:current.current};dragUndo.current.begin(current.current);capture(e);}
  function endDrag(){moveQueue.current?.flush();setSelectionDragging(false);drag.current=null;transformDrag.current=null;setSnapGuides(g=>g.length?[]:g);lastMerge.current=null;const before=dragUndo.current.end();if(before){setHistory(h=>[...h.slice(-29),before]);setFuture([]);}}
  endDragRef.current=endDrag;
  function dragTo(next:Project){try{next=syncPathBindings(normalizeGroups(next),drag.current?.before??transformDrag.current?.before??current.current);}catch{return;}dragUndo.current.update(next);current.current=next;setProject(next);invalidate();setSaved(false);}
  function pointerDown(e:ReactPointerEvent<SVGSVGElement>){
    closePanel('draw-tools');closePanel('shape-tools');
    e.currentTarget.focus({preventScroll:true});
    if(colourPickRef.current){e.preventDefault();if(e.button===0)void pickColour(point(e));return;}
    if(e.pointerType==='touch'){
      if(!touches.current.size){touchStart.current={draft:draftRef.current,corners:cornersRef.current,project:current.current};touchNavigation.current=false;}
      touches.current.set(e.pointerId,[e.clientX,e.clientY]);capture(e);
      if(touches.current.size>=2){
        moveQueue.current?.cancel();
        touchNavigation.current=true;setNavigating(true);const points=Array.from(touches.current.values()).slice(0,2),center:Point=[(points[0][0]+points[1][0])/2,(points[0][1]+points[1][1])/2];
        if(touchStart.current){setDraft(touchStart.current.draft);setCorners(touchStart.current.corners);if(drag.current){dragUndo.current.cancel();current.current=touchStart.current.project;setProject(touchStart.current.project);}}
        setDrawing(false);draftDrag.current=null;drag.current=null;panDrag.current=null;measuring.current=false;shapePress.current=null;draftPress.current=null;
        pinch.current={view:viewport.current,anchor:clientToWorld(viewport.current,center,e.currentTarget.getBoundingClientRect(),hoop),center,distance:Math.max(1,Math.hypot(points[0][0]-points[1][0],points[0][1]-points[1][1]))};return;
      }
      if(touchNavigation.current)return;
    }
    endDrag();pressedAnchor.current=null;pressedObject.current=(e.target as SVGElement).closest('[data-object]')?.getAttribute('data-object')??null;if(e.button>2)return;
    const handle=(e.target as SVGElement).closest('[data-transform]')?.getAttribute('data-transform') as ScaleHandle|'rotate'|undefined;
    if(handle&&e.button===0&&tool==='select'&&!editing&&!hasDraft&&!spacePan&&!panMode&&!selection.length&&selImage&&!selImage.locked){setSelectionDragging(true);transformDrag.current={before:current.current,ids:[],box:imageBounds(selImage),start:point(e),angle:selImage.rotation??0,handle,image:selImage.id};dragUndo.current.begin(current.current);capture(e);return;}
    if(handle&&e.button===0&&tool==='select'&&!editing&&!hasDraft&&!spacePan&&!panMode){setSelectionDragging(true);transformDrag.current={before:current.current,ids:[...movableIds],box:selectionBounds(current.current,movableIds),start:point(e),angle:selectionRotation,handle};dragUndo.current.begin(current.current);capture(e);return;}
    // Right-click adds a curve point while drawing a path; elsewhere it pans.
    const smooth=e.button===2&&(pathTool(tool)||editing)&&!panMode&&!spacePan;
    if(e.button===1||e.button===2&&!smooth||tool==='pan'||panMode||spacePan||(tool==='select'&&e.shiftKey)){setNavigating(true);panDrag.current={start:[e.clientX,e.clientY],source:viewport.current.pan,button:e.button,target:(e.target as SVGElement).closest('[data-object]')?.getAttribute('data-object')};capture(e);return;}
    if(e.button!==0&&!smooth)return;
    const p=point(e);
    if(tool==='measure'){setMeasure({a:p,b:p});measuring.current=true;capture(e);return;}
    if(tool==='stitch'){stopPlayback();if(e.button===0)void stitchAt(p,e.shiftKey);return;}
    if(tool==='knife'){
      stopPlayback();
      if(shapeDraft){finishKnife({...shapeDraft,end:p,square:e.ctrlKey||e.metaKey});return;}
      setShapeDraft({start:p,end:p,square:false});shapePress.current={client:[e.clientX,e.clientY],moved:false};capture(e);return;
    }
    if(p[0]<0||p[1]<0||p[0]>hoop.width||p[1]>hoop.height)return;
    if(tool==='shape'){
      stopPlayback();
      if(shapeDraft){finishShape({...shapeDraft,end:p,square:e.ctrlKey||e.metaKey});return;}
      setShapeDraft({start:p,end:p,square:false});shapePress.current={client:[e.clientX,e.clientY],moved:false};capture(e);return;
    }
    if(tool==='freehand'){setDraft([p]);setDrawing(true);capture(e);}
    else if(pathTool(tool)||tool==='points'){
      const anchor=(e.target as SVGElement).closest('[data-draft-point]')?.getAttribute('data-draft-point');
      draftPress.current={start:p,button:e.button,moved:false,detail:e.detail};
      if(e.button===0&&anchor!==undefined&&anchor!==null)draftDrag.current={index:Number(anchor),start:[e.clientX,e.clientY],before:draft,moved:false};
      capture(e);
    }
    else if(tool==='text'){
      const id=(e.target as SVGElement).closest('[data-object]')?.getAttribute('data-object'),hit=project.objects.find(o=>o.id===id&&o.text);
      if(hit){setSelected(hit.id);setTool('select');focusText();}else placeText(p);
    }
    else {
      const target=e.target as SVGElement;
      const id=target.closest('[data-object]')?.getAttribute('data-object');
      const source=current.current.objects.find(o=>o.id===id&&!o.hidden&&!o.locked);
      if(source&&!editing&&(e.ctrlKey||e.metaKey)){selectObject(source.id,e);return;}
      const node=target.closest('[data-point]'),insertion=target.closest('[data-insert]'),end=target.closest('[data-end]')?.getAttribute('data-end');
      if(ends&&item&&(end==='entry'||end==='exit')){startDrag({id:item.id,start:p,source:current.current.objects.find(o=>o.id===item.id)??item,end},e);return;}
      if(editing&&item){
        if(insertion){const handle=handles.find(h=>h.ring===Number(insertion.getAttribute('data-ring'))&&h.index===Number(insertion.getAttribute('data-insert')));if(handle)addPoint(handle.ring,handle.index,handle.point,e.button===0);return;}
        if(source?.id===item.id&&node){const location:[number,number]=[Number(node.getAttribute('data-ring')),Number(node.getAttribute('data-point'))];setActivePoint(location);pressedAnchor.current=location[1];if(pointMode==='remove'){removePoint(location);return;}startDrag({id:source.id,start:p,source,point:location},e);return;}
        if(pointMode!=='remove'&&!node){const nearest=closestInsertion(item,p);if(nearest&&nearest.distance*scaleForCanvas()<5){addPoint(nearest.ring,nearest.index,p,e.button===0);return;}}
        if(source?.id===item.id){setActivePoint(null);return;}
      }
      if(e.button!==0)return;
      // Reference images sit under every object; locked or hidden ones take no canvas clicks.
      const imageHit=!source&&!editing?current.current.images?.find(i=>i.id===target.closest('[data-image]')?.getAttribute('data-image')&&!i.locked&&!i.hidden):undefined;
      if(imageHit){selectImage(imageHit.id);setSelectionDragging(true);transformDrag.current={before:current.current,ids:[],box:imageBounds(imageHit),start:p,angle:imageHit.rotation??0,handle:'move',image:imageHit.id};dragUndo.current.begin(current.current);capture(e);return;}
      if(source){const ids=selection.includes(source.id)?unlockedIds(current.current,selection):[source.id];if(!selection.includes(source.id))setSelected(source.id);setActivePoint(null);startDrag({id:source.id,ids,start:p,source},e);}
      else if(!editing){setSelected(null);setImageSel(null);}
    }
  }
  function scaleForCanvas(){return viewportScale(viewport.current,svg.current!.getBoundingClientRect(),hoop);}
  function pointerMove(event:ReactPointerEvent<SVGSVGElement>){
    if(draftPress.current&&movedForDrawing(draftPress.current.start,point(event)))draftPress.current.moved=true;
    const e={pointerType:event.pointerType,pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey,altKey:event.altKey,currentTarget:event.currentTarget} as ReactPointerEvent<SVGSVGElement>;
    if(event.pointerType==='touch'||drawing||panDrag.current){applyPointerMove(e);return;}
    moveQueue.current!.push(()=>applyPointerMove(e));
  }
  function applyPointerMove(e:ReactPointerEvent<SVGSVGElement>){
    if(colourPickRef.current)return;
    if(e.pointerType==='touch'&&touches.current.has(e.pointerId)){
      touches.current.set(e.pointerId,[e.clientX,e.clientY]);
      if(touchNavigation.current){
        const points=Array.from(touches.current.values()).slice(0,2),start=pinch.current;
        if(points.length===2&&start){const center:Point=[(points[0][0]+points[1][0])/2,(points[0][1]+points[1][1])/2],distance=Math.hypot(points[0][0]-points[1][0],points[0][1]-points[1][1]);const next=zoomViewport(start.view,start.anchor,start.view.zoom*distance/start.distance,hoop);applyViewport(panViewport(next,[center[0]-start.center[0],center[1]-start.center[1]],viewportScale(next,e.currentTarget.getBoundingClientRect(),hoop)));}return;
      }
    }
    const p=point(e);setCursor(p);
    const transform=transformDrag.current;
    if(transform){
      let m:Matrix,rotation=0,guides:SnapGuide[]=[];
      if(transform.image){
        if(transform.handle==='move'&&current.current===transform.before&&Math.hypot(p[0]-transform.start[0],p[1]-transform.start[1])*canvasScale<3)return;
        if(transform.handle==='move')m=translate(p[0]-transform.start[0],p[1]-transform.start[1]);
        else if(transform.handle==='rotate')m=around(centre(transform.box),1,1,rotationGesture(transform.box,transform.start,p,e.shiftKey,transform.angle));
        else{const h=handlePoint(transform.box,transform.handle);m=scaleGesture(transform.box,transform.handle,[h[0]+p[0]-transform.start[0],h[1]+p[1]-transform.start[1]],e.shiftKey,e.altKey);}
        const next=transformImage(transform.before,transform.image,m);if(next&&next!==current.current)dragTo(next);return;
      }
      if(transform.handle==='move')return;
      if(transform.handle==='rotate'){rotation=rotationGesture(transform.box,transform.start,p,e.shiftKey,transform.angle);m=around(centre(transform.box),1,1,rotation);}
      else{const h=handlePoint(transform.box,transform.handle),q:Point=[h[0]+p[0]-transform.start[0],h[1]+p[1]-transform.start[1]],snap=snapBox({x:q[0],y:q[1],width:0,height:0},transform.before,transform.ids,true);guides=snap.guides;m=scaleGesture(transform.box,transform.handle,[q[0]+snap.delta[0],q[1]+snap.delta[1]],e.shiftKey,e.altKey);}
      const next=transformSelection(transform.before,transform.ids,m,rotation);if(next){if(next!==current.current)dragTo(next);const b=selectionBounds(next,transform.ids);setSnapGuides(guides.filter(g=>{const a=g.axis==='x'?[b.x,b.x+b.width/2,b.x+b.width]:[b.y,b.y+b.height/2,b.y+b.height];return a.some(v=>Math.abs(v-g.value)<1e-4);}));}return;
    }
    setAngleSnap(e.ctrlKey||e.metaKey);
    if(pathTool(tool)||tool==='points'||(editing&&pointMode==='add'))setHover(p[0]>=0&&p[1]>=0&&p[0]<=hoop.width&&p[1]<=hoop.height?p:null);
    if(measuring.current){setMeasure(m=>m&&{...m,b:measurePoint(m.a,p,e.shiftKey)});return;}
    if((tool==='shape'||tool==='knife')&&shapeDraft){const press=shapePress.current;if(press&&Math.hypot(e.clientX-press.client[0],e.clientY-press.client[1])>4)press.moved=true;setShapeDraft({...shapeDraft,end:p,square:e.ctrlKey||e.metaKey});return;}
    if(panDrag.current){const d=panDrag.current;applyViewport(panViewport({...viewport.current,pan:d.source},[e.clientX-d.start[0],e.clientY-d.start[1]],scaleForCanvas()));return;}
    if(tool==='stitch'){hoverStitch(p);return;}
    if(draftDrag.current){const d=draftDrag.current;if(Math.hypot(e.clientX-d.start[0],e.clientY-d.start[1])>3)d.moved=true;if(d.moved)setDraft(d.before.map((a,i)=>i===d.index?[Math.max(0,Math.min(hoop.width,p[0])),Math.max(0,Math.min(hoop.height,p[1]))]:a));return;}
    if(drawing){if(p[0]>=0&&p[1]>=0&&p[0]<=hoop.width&&p[1]<=hoop.height)setDraft(d=>!d.length||Math.hypot(p[0]-d[d.length-1][0],p[1]-d[d.length-1][1])>1e-6?[...d,p]:d);}
    const d=drag.current;
    if(d){
      const q=d.point&&(e.ctrlKey||e.metaKey)?lockAxis(d.start,p):p;let dx=q[0]-d.start[0],dy=q[1]-d.start[1];
      if(!d.moved&&Math.hypot(dx,dy)*canvasScale<(d.point?3:.5))return;
      d.moved=true;
      if(d.end){const next=withEnd(d.source,d.end,p);dragTo({...d.before,objects:d.before.objects.map(o=>o.id===d.id?next:o)});return;}
      const ids=d.point?[d.id]:d.ids??[d.id];
      if(!d.point){const b=selectionBounds(d.before,ids),snap=snapBox({...b,x:b.x+dx,y:b.y+dy},d.before,ids);dx+=snap.delta[0];dy+=snap.delta[1];setSnapGuides(snap.guides);}
      const objects=d.before.objects.map(o=>ids.includes(o.id)?moveGeometry(o,([x,y],ri,i)=>d.point&&(d.point[0]!==ri||d.point[1]!==i)?[x,y]:[x+dx,y+dy]):o);
      // Objects already outside the hoop (e.g. text that grew) can be dragged back in.
      if(objects.some((o,i)=>ids.includes(o.id)&&outsideHoop(extent(o),hoop)&&!outsideHoop(extent(d.before.objects[i]),hoop))){setSnapGuides([]);return;}
      dragTo({...d.before,objects});
    }
  }
  function pointerUp(e:ReactPointerEvent<SVGSVGElement>){
    moveQueue.current?.flush();
    if(e.pointerType==='touch'){touches.current.delete(e.pointerId);if(touchNavigation.current){pinch.current=null;if(!touches.current.size){touchNavigation.current=false;touchStart.current=null;setNavigating(false);}return;}if(!touches.current.size)touchStart.current=null;}
    setNavigating(false);
    const panned=panDrag.current;panDrag.current=null;measuring.current=false;
    // A right-click without drag in Select opens the canvas menu; right-drag stays a pan.
    if(panned){draftPress.current=null;if(panned.button===2&&tool==='select'&&!editing&&!hasDraft&&!spacePan&&!panMode&&!colourPickRef.current&&Math.hypot(e.clientX-panned.start[0],e.clientY-panned.start[1])<4){applyViewport({...viewport.current,pan:panned.source});openMenu(e.clientX,e.clientY,panned.target??null);}return;}
    if(shapePress.current){const press=shapePress.current;shapePress.current=null;if(press.moved&&shapeDraft)(tool==='knife'?finishKnife:finishShape)({...shapeDraft,end:point(e),square:e.ctrlKey||e.metaKey});return;}
    const dragged=draftDrag.current?.moved;draftDrag.current=null;
    const press=draftPress.current;draftPress.current=null;
    if(press){
      const p=point(e);if(dragged||press.moved||movedForDrawing(press.start,p)||panMode||spacePan)return;
      if(p[0]<0||p[1]<0||p[0]>hoop.width||p[1]>hoop.height)return;
      const points=draftRef.current,onFirst=(tool==='open'||tool==='closed'||tool==='holes')&&points.length>2&&Math.hypot(p[0]-points[0][0],p[1]-points[0][1])*canvasScale<12;
      const next=draftClick({points,corners:cornersRef.current,...clickHistory.current},{p,button:press.button,time:e.timeStamp,detail:press.detail,scale:canvasScale,ctrl:e.ctrlKey||e.metaKey,onFirst,tool:tool==='holes'?'closed':pathTool(tool)?tool as 'open'|'closed'|'blocks':'points'});
      if(next.action==='close'){finish(points,'first');return;}
      if(pathTool(tool)&&next.points.length>200){setError(t("Use at most 200 curve points. Finish this curve to start another."));return;}
      clickHistory.current={lastLeft:next.lastLeft,lastRight:next.lastRight};setDraft(next.points);setCorners(next.corners);return;
    }
    endDrag();
    if(drawing){setDrawing(false);const p=point(e);if(p[0]>=0&&p[1]>=0&&p[0]<=hoop.width&&p[1]<=hoop.height)setDraft(d=>[...d,p]);if(draftRef.current.length>=2)finish(draftRef.current);else cancelDrawing();}
  }
  function pointerCancel(e:ReactPointerEvent<SVGSVGElement>){moveQueue.current?.cancel();setSelectionDragging(false);draftPress.current=null;touches.current.delete(e.pointerId);pinch.current=null;measuring.current=false;shapePress.current=null;touchNavigation.current=touches.current.size>0;setNavigating(false);panDrag.current=null;if(transformDrag.current){cancelTransform();}if(drag.current){const before=dragUndo.current.cancel()??drag.current.before;drag.current=null;current.current=before;setProject(before);}if(draftDrag.current){setDraft(draftDrag.current.before);draftDrag.current=null;}if(drawing)cancelDrawing();}
  function openMenu(x:number,y:number,target:string|null,keyboard=false){
    const p=current.current,o=target?p.objects.find(o=>o.id===target&&!o.hidden&&!o.locked):undefined,canPaste=!!clipboard.current?.objects.length;
    let ids=selection;if(o&&!selection.includes(o.id)){ids=[o.id];setSelected(o.id);setEditPoints(false);}
    setMenu({x,y,entries:o||keyboard?objectMenu(p,ids,canPaste):canvasMenu(p,canPaste)});
  }
  const closeMenu=useStableCallback(()=>{if(document.activeElement?.closest('.context-menu'))svg.current?.focus({preventScroll:true});setMenu(null);});
  function menuAction(action:MenuAction){
    const order={front:'bottom',forward:'down',backward:'up',back:'top'} as const;
    if(action==='cut'||action==='copy')copySelected(action==='cut');else if(action==='paste'||action==='duplicate')pasteSelected(action==='duplicate');
    else if(action==='delete')deleteSelected();else if(action==='group')groupSelection();else if(action==='ungroup')ungroupSelection();
    else if(action==='lock'||action==='unlock')lockSelection();else if(action==='hide'||action==='show')hideObjects(selection);else if(action==='editPoints')editObject();else if(action==='editAngles'||action==='editFlow')toggleAngles();else if(action==='redwork'||action==='breakApart')redwork();
    else if(action==='front'||action==='forward'||action==='backward'||action==='back')reorderSelection(order[action]);
    else if(action==='flipH'||action==='flipV'||action==='rotate')selectionAction(action);else if(action==='selectAll')selectAll();else if(action==='unlockAll')unlockEverything();
    else if(action==='cutHoles')applyShape(()=>cutHoles(current.current,selection,cutKeep,t));
    else if(action==='flatten')applyShape(()=>flattenOverlaps(current.current,selection,undefined,t));
    else if(action==='union'||action==='subtract'||action==='intersect')applyShape(()=>combineShapes(current.current,selection,action,t));
    else if(action==='knife')chooseTool('knife');
    else if(action==='offset'){
      // Offset… opens the Shape tools distance field; Grow / Shrink there apply it.
      setSettingsCollapsed(false);setFocusOffset(n=>n+1);return;
    }
    else if(action==='fit')fit();else setViewSettings(v=>({...v,showGrid:!v.showGrid}));
    svg.current?.focus({preventScroll:true});
  }
  function stitchTarget(){return current.current.images?.find(i=>i.id===stitchImage&&!i.hidden);}
  function workingPixels(image:RefImage){
    const cached=stitchPixels.current;if(cached?.src===image.src)return cached.promise;
    const entry:{src:string;promise:Promise<Pixels>;px?:Pixels}={src:image.src,promise:artworkPixels(image.src,t).then(px=>{if(stitchPixels.current!==entry)throw new DOMException('Cancelled','AbortError');return pixelsTask.run({kind:'downsample',pixels:px});}).then(small=>{entry.px=small;return small;})};
    stitchPixels.current=entry;void entry.promise.catch(()=>{if(stitchPixels.current===entry)stitchPixels.current=null;});return entry.promise;
  }
  // Hover previews the region a click would take; a pixel and tolerance already shown is not recomputed.
  function hoverStitch(p:Point|null,tol=tolerance){
    const image=stitchTarget(),px=image&&stitchPixels.current?.src===image.src?stitchPixels.current.px:undefined;
    if(!p||!image||!px||!insideImage(image,p)){hoverTask.cancel();lastStitch.current=null;setStitchHover(null);return;}
    const q=toImageFrame(image,p),u=Math.floor((q[0]-image.x)/image.width*px.width),v=Math.floor((q[1]-image.y)/image.height*px.height),key=[image.id,image.x,image.y,image.width,image.height,image.rotation,u,v,tol].join();
    if(lastStitch.current?.key===key)return;
    lastStitch.current={key,rings:null};setStitchHover(null);
    void hoverTask.run({kind:'click',pixels:px,image:{x:image.x,y:image.y,width:image.width,height:image.height,rotation:image.rotation},point:q,tolerance:tol}).then(r=>{if(lastStitch.current?.key!==key)return;const rings=r?.rings??null;lastStitch.current={key,rings};setStitchHover(rings);}).catch(e=>{if(!taskCancelled(e))setError(errorText(e,t,'Could not read the reference image.'));});
  }
  function stitchAt(p:Point,outline:boolean){const session=stitchSession.current,tol=tolerance;clickQueue.current=clickQueue.current.then(async()=>{if(session===stitchSession.current)await stitchRegion(p,outline,tol);});}
  async function stitchRegion(p:Point,outline:boolean,tol:number){
    const image=stitchTarget();if(!image){setError(t("Show a reference image to use Click to stitch."));return;}
    if(!insideImage(image,p)){setError(t("Click inside the reference image."));return;}
    try{
      const version=revision.current,session=stitchSession.current,px=await workingPixels(image),before=current.current;if(!before.images?.includes(image)||version!==revision.current||session!==stitchSession.current)return;
      const r=await clickTask.run({kind:'click',pixels:px,image:{x:image.x,y:image.y,width:image.width,height:image.height,rotation:image.rotation},point:toImageFrame(image,p),tolerance:tol});
      if(version!==revision.current||session!==stitchSession.current)return;
      if(!r){setError(t("No colour area here. Try another point or a higher tolerance."));return;}
      if(before.objects.length>=80){setError(t("A design holds at most 80 objects. Delete some objects first."));return;}
      const n=before.objects.length+1,o:StitchObject=outline?object(t("Region outline {v0}",{v0:n}),reclose(r.rings,true),'running',r.color):{...object(t("Stitched region {v0}",{v0:n}),r.rings,'fill',r.color),fillPattern:'tatami'};
      const next={...before,objects:[...before.objects,o]};
      if(!validProject(next)){setError(t("This area is too complex. Lower the tolerance or choose a simpler area."));return;}
      commit(next,outline?t("Outline added"):t("Fill added"));setSelected(o.id);setError('');
    }catch(e){if(!taskCancelled(e))setError(errorText(e,t,'Could not read the reference image.'));}
  }
  function chooseTool(next:Tool){cancelColourPick();
    if(next==='stitch'&&next!==tool){const image=activeImage(current.current,imageSel);if(!image||image.hidden){setError(t("Show a reference image to use Click to stitch."));return;}setStitchImage(image.id);setShowImage(true);void workingPixels(image).catch(e=>{if(!taskCancelled(e))setError(errorText(e,t,'Could not read the reference image.'));});}if(next==='holes'&&next!==tool&&!(item&&!multi&&isFillKind(item.kind)&&!item.hidden&&!item.locked&&shapeRegion(item))){setError(t("Select a fill to cut holes in."));return;}if(next==='pan'&&draftRef.current.length){setPanMode(p=>!p);return;}if(next===tool){setPanMode(false);return;}if(draftRef.current.length){if(canFinish){if(!finish(draftRef.current,'switch'))return;}else cancelDrawing();}cancelDrawing();setTool(next);setMeasure(null);stopPlayback();if(next==='text')ensureFonts(lastFont.current,t("Your text"),t).catch(()=>{});}
  function fit(){fitMeasured();}
  function fitArtwork(width=art?.width||hoop.width,height=art?.height||hoop.height){applyViewport({...viewport.current,zoom:Math.max(1,Math.min(6,Math.min(hoop.width/width,hoop.height/height)*.82)),pan:[0,0]});}
  // Edit angles (A): a fill without guides starts with one across its bounds at the current angle.
  function toggleAngles(){if(!item||!guideMode(item)||item.locked)return;if(angles){setAngleMode(false);return;}setEditPoints(false);if(!item.angleGuides?.length&&guideMode(item)==='angles')updateObject(withGuides(item,[seedGuide(item)]));setAngleMode(true);}
  // Convert to redwork / Break apart (W): one undo step; the result is selected.
  function redwork(){const ids=selection;if(current.current.objects.some(o=>ids.includes(o.id)&&o.locked)){setMessage(t('Locked objects can’t be changed. Unlock them first.'));return;}if(canBreakApart(project,ids)){const r=breakApart(project,ids[0]);if(r){commit(r.project,t('Redwork broken apart'));setSelection(r.ids);}return;}const r=canConvertToRedwork(project,ids)?convertToRedwork(project,ids,t):null;if(r){commit(r.project,t('Converted to redwork'));setSelected(r.id);}else if(ids.length)setMessage(t('Redwork sews each line twice, so choose lines and outlines without text.'));}
  function editObject(){if(current.current.objects.find(o=>o.id===selected)?.kind==='redwork')return;setTool('select');setEditPoints(true);setActivePoint(null);setPointMode('move');}
  const draftSpline=continuation?project.objects.find(o=>o.id===continuation.id)?.curve?.spline:'levien';
  const displayDraft=useMemo(()=>pathTool(tool)?curvePoints(draft,false,corners,draftSpline):draft,[tool,draft,corners,draftSpline]);
  const closeHover=(tool==='open'||tool==='closed'||tool==='holes')&&draft.length>2&&!!hover&&Math.hypot(hover[0]-draft[0][0],hover[1]-draft[0][1])*canvasScale<12;
  const reference=draft[draft.length-(tool==='blocks'?2:1)],bandHover=closeHover?draft[0]:hover&&angleSnap&&reference?snapAngle(reference,hover):hover;
  const shapePreview=useMemo(()=>tool==='shape'&&shapeDraft?(()=>{const s=shapeOf(shapeDraft);return curvePoints(s.points,true,s.corners,'levien');})():null,[tool,shapeDraft,shapeKind,hoop]);
  function changeHoop(value:string){
    const nextHoop=hoops[value],dx=(nextHoop.width-hoop.width)/2,dy=(nextHoop.height-hoop.height)/2;
    commit({...project,hoop:value,objects:project.objects.map(o=>moveGeometry(o,([x,y])=>[x+dx,y+dy])),...(project.images&&{images:project.images.map(i=>({...i,x:i.x+dx,y:i.y+dy}))})});fit();
  }
  function resizeDesign(width:number){
    if(!size.width||!Number.isFinite(width)||width<=0)return;
    const scale=width/size.width,cx=size.x+size.width/2,cy=size.y+size.height/2;
    commit({...project,objects:project.objects.map(o=>moveGeometry(o,([x,y])=>[cx+(x-cx)*scale,cy+(y-cy)*scale]))});
  }
  async function importFile(f:File,asShapes?:boolean){
    if(hasDraft){setError(t("Finish or cancel the current path before importing."));return;}
    setError('');setMessage('');setDraft([]);chooseTool('select');
    try{
      if(f.size>8*1024*1024)throw new TranslationError(t,"Choose a file smaller than 8 MB.");
      if(/\.svg$/i.test(f.name)){
        if(asShapes===undefined){setPendingSVG(f);return;}
        if(asShapes){
          const request=++svgRequest.current;svgTask.cancel();setBusy(true);const before=current.current,version=revision.current;
          try{const [{readSVGSources},source]=await Promise.all([import('@/lib/svg-import'),f.text()]);if(version!==revision.current||request!==svgRequest.current)return;
            const p=await svgTask.run({kind:'svg',sources:readSVGSources(source,t),filename:f.name,project:before,lang});if(version!==revision.current||request!==svgRequest.current)return;
            commit(p);setSelected(p.objects[before.objects.length]?.id??null);fit();leavePanel();return;
          }finally{if(request===svgRequest.current)setBusy(false);}
        }
      }
      if(/\.json$/i.test(f.name)){
        const p:unknown=JSON.parse(await f.text());if(!validProject(p))throw new TranslationError(t,"This is not a supported Threadroom project.");
        const version=revision.current;if(p.objects.some(o=>o.text?.satin))await ensureSatinFonts();if(version!==revision.current)return;commit(p);setSelected(p.objects[0]?.id||null);fit();leavePanel();return;
      }
      if(/\.(pes|pec)$/i.test(f.name)){
        const data=await f.arrayBuffer(), parsed=parse(data,f.name), h=hoops[project.hoop];
        if(parsed.commands.length>100000)throw new TranslationError(t,"This prototype previews files with up to 100,000 stitch commands.");
        const dx=h.width/2-(parsed.bounds.minX+parsed.bounds.maxX)/2,dy=h.height/2-(parsed.bounds.minY+parsed.bounds.maxY)/2;
        commit({...project,name:parsed.name,objects:[],artwork:undefined});
        let binary='';for(const b of new Uint8Array(data))binary+=String.fromCharCode(b);
        setCompiled({pes:btoa(binary),filename:f.name,commands:parsed.commands.filter(c=>c.type==='stitch'||c.type==='jump').map(c=>({...c,x:c.x+dx,y:c.y+dy,fromX:c.fromX+dx,fromY:c.fromY+dy})),threads:parsed.blocks,stats:{stitches:parsed.stitches,jumps:parsed.jumps,jumpLength:Math.round(parsed.commands.filter((c,i)=>i&&c.type==='jump').reduce((s,c)=>s+Math.hypot(c.x-c.fromX,c.y-c.fromY),0)*10)/10,trims:parsed.trims,colorChanges:parsed.colorChanges,width:parsed.width,height:parsed.height,maxStitch:0,bytes:f.size,durationMs:0},engine:'Imported PES',pesVersion:'Imported'});
        setSelected(null);fit();leavePanel();return;
      }
      if(!/\.(png|jpe?g|webp|svg)$/i.test(f.name))throw new TranslationError(t,"Choose PNG, JPG, WebP, SVG, PES, PEC, or a Threadroom JSON project.");
      const src=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(f);});
      await loadImage(src,f.name);leavePanel();
    }catch(e){if(!taskCancelled(e))setError(errorText(e,t,'This file could not be opened.'));}
  }
  async function loadImage(src:string,name:string){
    const img=new Image();img.src=src;await img.decode();
    if(img.naturalWidth*img.naturalHeight>25_000_000)throw new TranslationError(t,"Use an image smaller than 25 megapixels.");
    const p=current.current,list=p.images??[];if(list.length>=imageLimits.count)throw new TranslationError(t,"Use at most {v0} reference images. Delete one first.",{v0:imageLimits.count});
    const ratio=img.naturalHeight/img.naturalWidth, width=Math.min(60,hoop.width*0.75,hoop.height*0.75/ratio),height=width*ratio;
    // Images are added on top of the list; an empty design takes the image's name.
    const image:RefImage={id:crypto.randomUUID(),src,name,width,height,x:(hoop.width-width)/2,y:(hoop.height-height)/2,opacity:.65};
    commit({...p,...(!p.objects.length&&!list.length&&{name:name.replace(/\.[^.]+$/,'').slice(0,40)}),images:[...list,image]});selectImage(image.id);setShowImage(true);fitArtwork(width,height);setTool('closed');
  }
  async function trace(){
    if(!art||hasDraft)return;const request=++traceRequest.current;traceTask.cancel();setBusy(true);setError('');
    const before=project, version=revision.current, source=art;
    // Traced regions are added after the existing objects; the traced image fades to show them.
    try{const pixels=await traceArtworkPixels(source.src);if(revision.current!==version||request!==traceRequest.current)return;const objects=await traceTask.run({kind:'trace',pixels,art:{...source,src:''},colours,ignoreBackground:ignoreBg,lang});if(revision.current!==version||request!==traceRequest.current)return;if(before.objects.length+objects.length>80)throw new TranslationError(t,"A design holds at most 80 objects. Delete some objects first.");commit(updateImage({...before,objects:[...before.objects,...objects]},source.id,{opacity:.25}),t('regions.other',{count:objects.length}));setSelected(objects[0]?.id||null);setShowImage(true);setEditPoints(false);setTool('select');leavePanel();}catch(e){if(request===traceRequest.current&&!taskCancelled(e))setError(errorText(e,t,'Tracing failed.'));}finally{if(request===traceRequest.current)setBusy(false);}
  }
  async function generate(exportFile=false):Promise<boolean>{
    if(hasDraft){setError(t("Finish or cancel the current path before previewing."));return false;}
    setBusy(true);setError('');
    try{
      const result=(compileFresh?compiled:null)??await compile(project,revision.current);if(!result)return false;
      setMessage('');if(exportFile){download(pesBlob(result.pes),result.filename);exported();}return true;
    }catch(e){setError(errorText(e,t,'The Python API is unavailable. Start with npm run dev, or check the Vercel Python Function logs.'));return false;}finally{setBusy(false);}
  }
  async function play(){
    if(timeline){setTimeline(false);stopPlayback();return;}
    const request=++playRequest.current;setTimeline(true);if(await generate()&&request===playRequest.current){setProgress(0);setPlaying(true);}
  }
  function toggleRealistic(){setLook(l=>l==='lines'?'thread':'lines');}
  function exported(){if(fails)setMessage(t('exportProblems.other',{count:fails}));}
  const focusTextReady=useStableCallback(()=>{if(textFocus.current&&textArea.current){textArea.current.focus();textArea.current.select();textFocus.current=false;}});
  const resetEnd=useStableCallback((key:'entry'|'exit')=>updateObject({[key]:undefined}));
  const stableAddPoint=useStableCallback(addPoint),stableSavePoint=useStableCallback(savePointChange),stableRemovePoint=useStableCallback(removePoint);
  const sewn=compiled?Math.floor(compiled.commands.length*progress):0;
  const staleKey=JSON.stringify([...staleIds].sort());
  const stableStaleIds=useMemo(()=>new Set<string>(JSON.parse(staleKey)),[staleKey]);
  const visible=useMemo(()=>compiled?visibleCommands(compiled.commands,project.objects,stableStaleIds):null,[compiled,project.objects,stableStaleIds]);
  // Realistic view retains the previous full scene during edits, preserving incremental playback.
  const densityField=useDensity(density&&compileFresh?compiled:null,densityRadius);
  const threadVisible=useMemo(()=>compiled?visibleCommands(compiled.commands,project.objects):null,[compiled,project.objects]);
  const preview=useMemo(()=>compiled&&threadVisible?{...compiled,commands:threadVisible.commands}:null,[compiled,threadVisible]);
  const visibleSewn=visible?(sewn===compiled!.commands.length?visible.indices.length:visible.indices.filter(i=>i<sewn).length):0;
  const threadSewn=threadVisible?(sewn===compiled!.commands.length?threadVisible.indices.length:threadVisible.indices.filter(i=>i<sewn).length):0;
  const threadView=useMemo<[number,number,number,number]>(()=>[viewX,viewY,viewWidth,viewHeight],[viewX,viewY,viewWidth,viewHeight]);
  const stitchPaths=useMemo(()=>commandPaths(visible?.commands??[],compiled?.threads.length??0,(look==='thread'&&!showTravel)?0:visibleSewn),[visible,compiled,visibleSewn,look,showTravel]);
  const outside=useMemo(()=>project.objects.some(o=>{const b=objectGeometry(o).bounds;return o.rings.some(r=>r.length)&&(b.x<0||b.y<0||b.x+b.width>hoop.width||b.y+b.height>hoop.height);}),[project.objects,hoop]);
  const imported=compiled?.engine==='Imported PES';
  const stitchIssues=useMemo(()=>imported?[]:compileFresh&&compiled?stitchWarnings(compiled.warnings,project):checkError?[engineWarning(checkError,project)]:[],[compiled,compileFresh,checkError,project,imported]);
  const issues=useMemo(()=>imported?[]:sortWarnings([...designIssues,...stitchIssues],project),[designIssues,stitchIssues,project,imported]);
  const fails=issues.filter(w=>w.severity==='fail').length,checks=issues.length-fails;
  const stitchState=imported||!project.objects.length?'none':compileFresh||checkError?'done':apiState==='offline'?'offline':'pending';
  const focus=issues.find(w=>w.key===focusKey)||null,focusIndex=focus?issues.indexOf(focus):-1;
  const focusCopy=focus&&explain(focus,project,checkError,t),focusFix=focus&&fixFor(focus,project,t);
  const selectedIssue=issues.find(w=>w.key===focusKey&&w.objectId!==null&&selection.includes(w.objectId))??issues.find(w=>w.objectId!==null&&selection.includes(w.objectId));
  const selectedIssueFix=selectedIssue&&fixFor(selectedIssue,project,t);
  useLayoutEffect(()=>{
    const panel=document.getElementById('check-panel');
    if(panel?.matches(':popover-open'))panel.querySelector('.issue-row[aria-current="true"]')?.parentElement?.scrollIntoView({block:'nearest'});
  },[focusKey]);
  function focusIssue(w:Warning,open=true){
    if(w.code==='dense'||w.code.includes('density'))setDensity(true);
    setFocusKey(w.key);
    if(w.objectId&&project.objects.some(o=>o.id===w.objectId))setSelected(w.objectId);
    reveal(w.bounds);
    if(open)document.getElementById('check-panel')?.showPopover();
  }
  // Pans (and zooms out if needed) so the problem is on screen; the marker keeps a minimum screen size.
  function reveal([x0,y0,x1,y1]:Box){
    const v=viewport.current,width=hoop.width*1.18/v.zoom,height=hoop.height*1.18/v.zoom,cx=hoop.width/2+v.pan[0],cy=hoop.height/2+v.pan[1];
    if(x0>=cx-width/2&&x1<=cx+width/2&&y0>=cy-height/2&&y1<=cy+height/2)return;
    const zoom=Math.min(v.zoom,Math.max(.5,Math.min(hoop.width*1.18/((x1-x0)*1.3+6),hoop.height*1.18/((y1-y0)*1.3+6))));
    applyViewport({...v,zoom,pan:[(x0+x1)/2-hoop.width/2,(y0+y1)/2-hoop.height/2]});
  }
  function applyFix(w:Warning){const fix=fixFor(w,project,t);if(!fix)return;commit(fix.apply(project),t("Fixed: {v0}.",{v0:explain(w,project,'',t).title.toLocaleLowerCase(lang)}));setFocusKey(null);}
  const objectName=(id:string|null)=>project.objects.find(o=>o.id===id)?.name||t("Whole design");
  const badge=issues.length?t('issues.other',{count:issues.length}):stitchState==='pending'?t("Checking…"):stitchState==='offline'?t("Shapes OK"):t("Ready to stitch");
  const needle=visible?.indices[visibleSewn-1]===sewn-1?compiled?.commands[sewn-1]:undefined;
  const count=compiled?sewnStitches(compiled,sewn):0,thread=look==='thread'&&!!compiled;
  const shownImages=useMemo(()=>showImage?(project.images??[]).filter(i=>!i.hidden):[],[showImage,project.images]);
  const imageBox=useMemo(()=>selImage&&!selImage.hidden&&!selImage.locked?imageBounds(selImage):null,[selImage]);

  const source=(key:Setting)=>!item?null:item[key]!==undefined?<button type="button" className="field-value reset" title={isLockSetting(key)?t("Reset to the Setup value"):fromFabric(item.kind,key)?t("Reset to the fabric default"):t("Reset to the default")} onClick={e=>{e.preventDefault();updateObject({[key]:undefined});}}>{t("Reset")}</button>:<span className="field-value inherited">{isLockSetting(key)?t("Setup"):fromFabric(item.kind,key)?t("Fabric"):t("Default")}</span>;
  const lockOptions=Object.entries(lockNames).map(([k,v])=><option key={k} value={k}>{t(v)}</option>);
  const setLocks=(patch:Partial<Locks>,merge?:string)=>commit({...project,locks:{...project.locks,...patch}},'',merge&&`setup:${merge}`);
  const inRange=(v:string,[a,b]:readonly [number,number])=>v!==''&&Number(v)>=a&&Number(v)<=b;
  const tabs:{id:PanelTab;icon:string;label:string}[]=[{id:'layers',icon:'layers',label:t("Layers")},{id:'artwork',icon:'image',label:t("Artwork")},{id:'setup',icon:'settings',label:t("Setup")},{id:'info',icon:'info',label:t("Info")}];
  const eyedropper=<button type="button" className="image-eyedropper" aria-label={t("Pick thread colour from reference image")} title={art?t("Pick original reference image colour"):t("Import reference artwork to pick a colour")} aria-pressed={!!colourPick} disabled={!art} onClick={toggleColourPick}><Icon name="eyedropper" size={17}/></button>;
  return <main className={`studio ${panelOpen?'panel-open':'panel-closed'}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)void importFile(f);}}>
    <input ref={file} type="file" tabIndex={-1} className="visually-hidden" aria-label={t("Import artwork or project")} accept=".png,.jpg,.jpeg,.webp,.svg,.pes,.pec,.json" onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);e.target.value='';}}/>
    <div id="project-menu" className="toolbar-popover project-popover" popover="auto" role="menu" aria-label={t("Project")}>
      <button role="menuitem" disabled={hasDraft} onClick={()=>{closePanel('project-menu');file.current?.click();}}><Icon name="upload" size={16}/>{t("Import file…")}</button>
      <button role="menuitem" disabled={hasDraft} onClick={()=>{const p=demo(t);commit(p);setSelected(p.objects[0].id);fit();closePanel('project-menu');}}><Icon name="needle" size={16}/>{t("Bear sample")}</button>
      <button role="menuitem" disabled={hasDraft} onClick={()=>{commit({...initial,name:t("Untitled embroidery"),objects:[]});setSelected(null);setDraft([]);fit();closePanel('project-menu');}}><Icon name="plus" size={16}/>{t("Blank canvas")}</button>
      <hr/>
      <button role="menuitem" disabled={imported||hasDraft} onClick={()=>{closePanel('project-menu');download(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),'threadroom-project.json');}}><Icon name="download" size={16}/>{t("Save project")}</button>
      <button role="menuitem" disabled={hasDraft||!project.objects.length} onClick={()=>{closePanel('project-menu');download(new Blob([exportSVG(project)],{type:'image/svg+xml'}),'threadroom-artwork.svg');}}><Icon name="download" size={16}/>{t("Export editable SVG")}</button>
      <ExportImageButton project={project} compiled={compileFresh?compiled:null} disabled={hasDraft}/>
      <WorksheetButton menu project={project} compiled={compileFresh?compiled:null} units={viewSettings.units} disabled={hasDraft}/>
      <hr/>
      <div role="group" aria-label={t('Language')}>{(['tr','en'] as const).map(value=><button key={value} role="menuitemradio" aria-checked={lang===value} onClick={()=>{setLang(value);closePanel('project-menu');}}>{t(value==='tr'?'Türkçe':'English')}{lang===value?' ✓':''}</button>)}</div>
    </div>
    <section ref={stage} className="stage" aria-label={t("Embroidery editor")}>
      <div className="canvas-wrap">
        {thread&&<ThreadView canvasSize={canvasSize} compiled={preview!} count={threadSewn} fabric={project.fabric} hoop={hoop} view={threadView} svg={svg} dimmed={showTravel} images={shownImages}/>}
        <svg ref={svg} className={`design-canvas ${colourPick?'colour-picking ':''}tool-${spacePan||panMode||navigating?'pan':editing?`edit-${pointMode}`:tool}`} tabIndex={0} viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`} role={editing?'group':'img'} aria-label={t("Embroidery canvas")} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel} onLostPointerCapture={()=>{if(drag.current||transformDrag.current)endDrag();}} onPointerLeave={()=>{setHover(null);setCursor(null);if(tool==='stitch')hoverStitch(null);}} onContextMenu={e=>e.preventDefault()} onDoubleClick={e=>{
            if(colourPickRef.current)return;
            if(editing&&(item?.curve||item?.rails)&&pressedAnchor.current!==null){toggleCorner(pressedAnchor.current);return;}
            const id=(e.target as SVGElement).closest('[data-object]')?.getAttribute('data-object')??pressedObject.current;if(tool!=='select'||!id)return;if(project.objects.find(o=>o.id===id)?.text)focusText();else editObject();}}>
              <defs><pattern id="fine-grid" width={viewSettings.gridSize/viewSettings.subdivisions} height={viewSettings.gridSize/viewSettings.subdivisions} patternUnits="userSpaceOnUse"><path d={`M ${viewSettings.gridSize/viewSettings.subdivisions} 0 L 0 0 0 ${viewSettings.gridSize/viewSettings.subdivisions}`} fill="none" stroke="var(--grid)" strokeWidth={.5/canvasScale}/></pattern><pattern id="grid" width={viewSettings.gridSize} height={viewSettings.gridSize} patternUnits="userSpaceOnUse"><path d={`M ${viewSettings.gridSize} 0 L 0 0 0 ${viewSettings.gridSize}`} fill="none" stroke="var(--grid)" strokeWidth="0.1"/></pattern><pattern id="cloth" width="0.55" height="0.55" patternUnits="userSpaceOnUse"><path d="M0 0H.55M0 0V.55" stroke="var(--fabric-weave)" opacity=".15" strokeWidth=".06"/></pattern><filter id="hoop-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="var(--hoop-shadow)" floodOpacity="1"/></filter></defs>
              {!thread&&<><rect x="-1000" y="-1000" width="3000" height="3000" fill="var(--bg-workspace)"/>
              <rect x="-2" y="-2" width={hoop.width+4} height={hoop.height+4} rx="5" fill="var(--hoop-rim)" filter="url(#hoop-shadow)"/>
              <rect x="0" y="0" width={hoop.width} height={hoop.height} rx="3" fill="var(--fabric)" stroke="var(--hoop-border)" strokeWidth=".35"/>
              <rect width={hoop.width} height={hoop.height} rx="3" fill="url(#cloth)" pointerEvents="none"/>
              <path d={`M${hoop.width/2-2} ${hoop.height/2}h4M${hoop.width/2} ${hoop.height/2-2}v4`} stroke="var(--centre-cross)" strokeWidth={1.1/canvasScale} pointerEvents="none"/></>}
              {viewSettings.showGrid&&viewSettings.subdivisions>1&&viewSettings.gridSize/viewSettings.subdivisions*canvasScale>=6&&<rect width={hoop.width} height={hoop.height} rx="3" fill="url(#fine-grid)" opacity=".5" pointerEvents="none"/>}
              {viewSettings.showGrid&&<path d={`M0 ${hoop.height/2}H${hoop.width}M${hoop.width/2} 0V${hoop.height}`} stroke="var(--centre-cross)" strokeWidth={.65/canvasScale} opacity=".55" pointerEvents="none"/>}
              {viewSettings.showGrid&&<rect width={hoop.width} height={hoop.height} rx="3" fill="url(#grid)" opacity=".65" pointerEvents="none"/>}
              {shownImages.map(i=><g key={i.id} data-image={i.id} transform={i.rotation?`rotate(${i.rotation} ${i.x+i.width/2} ${i.y+i.height/2})`:undefined} pointerEvents={tool==='select'&&!editing&&!i.locked&&!colourPick?'all':'none'}>{thread?<rect x={i.x} y={i.y} width={i.width} height={i.height} fill="transparent"/>:<image href={i.src} x={i.x} y={i.y} width={i.width} height={i.height} preserveAspectRatio="none" opacity={i.opacity}/>}</g>)}
              <>{!thread&&stitchPaths.blocks.map((p,i)=><path key={i} d={p.stitch} fill="none" stroke={compiled!.threads[i].color} strokeWidth=".22" strokeLinecap="round" pointerEvents="none" opacity={showTravel?.35:1}/>)}
                {densityField&&<DensityHeat field={densityField}/>}
                {visible&&<StitchOverlays commands={visible.commands} count={visibleSewn} selection={selection} scale={canvasScale} view={viewSettings}/>}
                {showTravel&&<g pointerEvents="none"><path d={stitchPaths.blocks.map(p=>p.jump).join('')} fill="none" stroke="var(--travel-jump)" strokeWidth={1.4/canvasScale} strokeDasharray={`${4/canvasScale} ${3/canvasScale}`}/><path d={stitchPaths.travel} fill="none" stroke="var(--travel-line)" strokeWidth={2/canvasScale} strokeLinecap="round"/></g>}</>
              {project.objects.map(o=><Fragment key={o.id}><CanvasObject o={o} selected={selection.includes(o.id)} primary={selected===o.id} hidden={!!o.hidden||!!o.layoutOnly&&!selection.includes(o.id)||o.id===continuation?.id} editing={editing&&selected===o.id} stale={!compiled||staleIds.has(o.id)} offline={apiState==='offline'} movable={tool==='select'&&!editing} locked={!!o.locked} canvasScale={canvasScale}/>{editing&&selected===o.id&&!o.hidden&&o.id!==continuation?.id&&<PointHandles o={o} pointMode={pointMode} handles={handles} activePoint={activePoint} canvasScale={canvasScale} onAdd={stableAddPoint} onSave={stableSavePoint} onRemove={stableRemovePoint} onActive={setActivePoint}/>}</Fragment>)}
              {focus&&<g className="issue-marker-trigger" role="button" tabIndex={0} aria-label={t("Show issue details")} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();focusIssue(focus);}} onDoubleClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();focusIssue(focus);}}}><IssueMarker focus={focus} canvasScale={canvasScale}/></g>}
              {angles&&item&&<AngleGuideEditor guides={item.angleGuides??[]} canvasScale={canvasScale} onChange={guides=>updateObject(withGuides(item,guides))} onExit={()=>{setAngleMode(false);svg.current?.focus({preventScroll:true});}}/>}
              {tool==='select'&&!editing&&!angles&&!hasDraft&&items.some(o=>!o.hidden&&!o.locked)&&<TransformBox box={selectionBox} canvasScale={canvasScale}/>}
              {tool==='select'&&!angles&&!hasDraft&&!selection.length&&imageBox&&<TransformBox box={imageBox} canvasScale={canvasScale}/>}
              {snapGuides.length>0&&<g pointerEvents="none" stroke="var(--accent)" strokeWidth={1/canvasScale}>{snapGuides.map(g=><path key={g.axis} d={g.axis==='x'?`M${g.value} 0V${hoop.height}`:`M0 ${g.value}H${hoop.width}`}/>)}</g>}
              {ends&&!angles&&<EndHandles ends={ends} canvasScale={canvasScale} onReset={resetEnd}/>}
              {addPreview&&addPreview.distance*canvasScale<16&&<circle cx={addPreview.point[0]} cy={addPreview.point[1]} r={5/canvasScale} fill="var(--selected)" stroke="var(--accent)" strokeWidth={1.5/canvasScale} pointerEvents="none"/>}
              {draft.length>0&&<DraftOverlay draft={draft} displayDraft={displayDraft} closeable={tool==='open'||tool==='closed'||tool==='holes'} closeHover={closeHover} color={item?.color||palette[3]} hover={bandHover} drawing={drawing} freehand={tool==='freehand'} curved={pathTool(tool)} blocks={tool==='blocks'} corners={corners} canvasScale={canvasScale}/>}
              {tool==='knife'&&shapeDraft&&<KnifeOverlay a={shapeDraft.start} b={shapeDraft.square?snapAngle(shapeDraft.start,shapeDraft.end):shapeDraft.end} canvasScale={canvasScale}/>}
              {shapePreview&&shapeDraft&&<ShapeOverlay shapePreview={shapePreview} shapeDraft={shapeDraft} canvasScale={canvasScale}/>}
              {tool==='stitch'&&stitchHover&&<path d={pathData(stitchHover,true)} fill="var(--accent)" fillOpacity=".18" fillRule="evenodd" stroke="var(--accent)" strokeWidth={1.5/canvasScale} strokeDasharray={`${4/canvasScale} ${3/canvasScale}`} pointerEvents="none"/>}
              {measure&&<MeasureOverlay measure={measure} canvasScale={canvasScale} units={viewSettings.units}/>}
              {timeline&&progress<1&&needle&&<NeedleMarker needle={needle} canvasScale={canvasScale}/>}
        </svg>
        {densityField&&<DensityLegend field={densityField} radius={densityRadius} travel={showTravel} onRadius={setDensityRadius} onClose={()=>setDensity(false)}/>}
        {viewSettings.rulers&&<CanvasRulers width={canvasSize.width} height={canvasSize.height} scale={canvasScale} units={viewSettings.units} hoop={hoop} selection={selection.length?selectionBounds(project,selection):selImage&&!selImage.hidden?imageBounds(selImage):null} origin={[hoop.width/2+pan[0]-canvasSize.width/2/canvasScale,hoop.height/2+pan[1]-canvasSize.height/2/canvasScale]}/>}
        {cursor&&<output className="cursor-position" aria-label={t('Cursor position')}>X {displayLength(cursor[0])} · Y {displayLength(cursor[1])}</output>}
        {!project.objects.length&&!images.length&&!compiled&&<div className="empty-canvas"><Icon name="needle" size={32}/><p>{t("Import artwork or draw a path.")}</p></div>}
      </div>
      {tool==='select'&&items.length>0&&!hasDraft&&!shapeDraft&&!drawing&&!editing&&!angles&&!colourPick&&!selectionDragging&&!navigating&&!spacePan&&!panMode&&<SelectionBar
        box={selectionBox} view={view} hoop={hoop} canvas={svg} container={stage} rail={rail}
        allLocked={allLocked} multi={multi} grouped={items.some(o=>o.group!==undefined)}
        edit={!multi&&item&&!item.hidden&&!item.locked?(item.text?'text':item.kind!=='redwork'?'points':null):null}
        orderDisabled={{top:hasDraft||!items.length||selection.includes(project.objects[0]?.id),up:hasDraft||!items.length||selection.includes(project.objects[0]?.id),down:hasDraft||!items.length||selection.includes(project.objects.at(-1)?.id??''),bottom:hasDraft||!items.length||selection.includes(project.objects.at(-1)?.id??'')}}
        onEdit={item?.text?focusText:editObject} onAction={menuAction} onOrder={reorderSelection} onMore={(x,y)=>openMenu(x,y,null,true)}
      />}
      <div className="canvas-top-row">
      <header className="project-chip">
        <a className="brand" href="/" aria-label={t("Threadroom home")}>t<span className="brand-dot">.</span></a>
        <input aria-label={t("Project name")} value={project.name} maxLength={40} onChange={e=>commit({...project,name:e.target.value})}/><span className={`save-indicator ${saved?'':'unsaved'}`} role="status" aria-label={saved?t("Saved locally"):t("Unsaved")} title={saved?t("Saved locally"):t("Unsaved")}/>
        <button className="icon-button" aria-label={t("Project menu")} title={t("Import, samples, save and SVG export")} popoverTarget="project-menu"><Icon name="chevron" size={16}/></button>
      </header>
      <div className="top-actions"><div className="view-modes" role="group" aria-label={t("View modes")}>
          <button className={`view-mode ${timeline?'active':''}`} aria-label={timeline?t("Hide stitch playback"):t("Play stitches")} aria-pressed={timeline} aria-busy={busy} title={timeline?t("Hide stitch playback"):t("Play the stitch-out from the start")} disabled={hasDraft||busy||outside||(!project.objects.length&&!compiled)} onClick={()=>void play()}><Icon name="play" size={16}/><span>{t("Play")}</span></button>
          <button className={`view-mode ${look==='thread'?'active':''}`} aria-label={t("Realistic view")} aria-pressed={look==='thread'} aria-busy={busy} title={t("Toggle realistic view: how the stitches will look on your fabric")} disabled={!project.objects.length&&!compiled} onClick={toggleRealistic}><Icon name="eye" size={16}/><span>{busy?t("Working…"):t("Realistic")}</span></button>
      </div>{(stitchState!=='none'||issues.length>0)&&<button style={{anchorName:'--check-status'}} onClick={()=>{if(!document.getElementById('check-panel')?.matches(':popover-open')&&!focus&&issues[0])focusIssue(issues[0],false);}} className={`check-badge ${fails?'fail':issues.length?'check':stitchState==='done'?'ok':''}`} popoverTarget="check-panel" title={t("Design check: problems that could spoil the stitch-out")} aria-label={t("Design check: {v0}{v1}",{v0:badge,v1:fails?t(', {v0} likely to fail',{v0:fails}):''})}><Icon name={issues.length?'alert':'check'} size={15}/><span>{badge}</span>{fails>0&&<small title={t('exportWarning.other',{count:fails})}>{t('failsSummary',{count:fails})}</small>}</button>}
      <div id="check-panel" className="toolbar-popover check-popover" style={{positionAnchor:"--check-status"}} popover="auto" role="dialog" aria-labelledby="check-title">
        <div className="popover-heading"><h2 id="check-title">{t("Design check")}</h2><button className="icon-button" aria-label={t("Close design check")} popoverTarget="check-panel" popoverTargetAction="hide"><Icon name="close" size={16}/></button></div>
        {issues.length?<p className="check-summary">{fails>0&&<span><i className="severity-dot fail"/>{t('failsSummary',{count:fails})}</span>}{checks>0&&<span><i className="severity-dot check"/>{t('checksSummary',{count:checks})}</span>}</p>
          :<p className="check-ok"><Icon name="check" size={16}/>{stitchState==='done'?t("Ready to stitch: no problems found."):stitchState==='none'?t("Add a shape to check it."):t("No shape problems so far.")}</p>}
        {issues.length>0&&<ul className="issue-list">{issues.map(w=><li key={w.key}><button className="issue-row" aria-current={focusKey===w.key} aria-expanded={focusKey===w.key} onClick={()=>focusIssue(w)} title={t("Show on the canvas")}><i className={`severity-dot ${w.severity}`} aria-label={t(severityNames[w.severity])}/><span><strong>{explain(w,project,checkError,t).title}</strong><small>{objectName(w.objectId)} · {t(severityNames[w.severity])}</small></span><span className="row-chevron">›</span></button>{focus?.key===w.key&&focusCopy&&<div className="issue-detail" aria-live="polite">
          <p>{focusCopy.why}</p><p><b>{t("Fix:")}</b> {focusCopy.fix}</p>
          <div className="issue-actions">{focusFix&&<button className="issue-fix-button" title={focusFix.title} onClick={()=>applyFix(focus)}>{focusFix.label}</button>}{issues.length>1&&<span className="issue-nav"><button aria-label={t("Previous issue")} title={t("Previous issue")} onClick={()=>focusIssue(issues[(focusIndex-1+issues.length)%issues.length])}>‹</button><span>{formatNumber(focusIndex+1)} / {formatNumber(issues.length)}</span><button aria-label={t("Next issue")} title={t("Next issue")} onClick={()=>focusIssue(issues[(focusIndex+1)%issues.length])}>›</button></span>}</div>
        </div>}</li>)}</ul>}
        <p className="check-note">{stitchState==='pending'?t("Stitch checks run a moment after you stop editing."):stitchState==='offline'?t("Stitch checks need the stitch engine, which is offline."):t("Checks shapes and the generated stitches.")} <span title={t("Will likely fail: fix before stitching. Worth checking: may sew poorly on soft baby fabric.")}>{t("What do these mean?")}</span></p>
      </div>
      </div>
      {showToolHint&&<div className="tool-banner">
        <ToolHint title={colourPick?t("Pick thread colour"):angles?t(flowGuides?"Editing flow field":"Editing angles"):editing?t("Editing points"):continuation?t("Continuing curve"):pathTarget?t("Drawing text path"):tool==='shape'?t("Drawing {v0}",{v0:t(shapeNames[shapeKind])}):tools.find(t=>t.id===tool)!.title} text={colourPick?[t("Click the reference image to pick its colour · Esc to cancel"),pickHint].filter(Boolean).join(' · '):panMode?t("Drag to pan · Click the drawing tool to resume"):angles?t(flowGuides?"Click twice to add a flow guide; stitches follow its arrow. Drag either end to move it. Delete with an end selected removes that guide.":"Click twice to add an angle guideline. Drag either end to move it. Delete with an end selected removes that guide. Crossing or touching guides turn red."):editing?t("Drag a point · Ctrl / ⌘: axis lock · Click path: corner · Right-click path: smooth · Delete: remove{v0}",{v0:item?.curve||item?.rails?t(' · Double-click a point to switch corner / curve'):''}):pathTarget?t("Click points along the path for your text. {v0}",{v0:pathHint}):tool==='shape'?shapeKind==='rect'?t("Click to set one corner, click again to set the opposite corner. Hold Ctrl / ⌘ for a square."):t("Click to set the center, click again to set the size."):tool==='select'&&item?.text?t("Drag to move · Double-click or Edit text to change the words."):tools.find(t=>t.id===tool)!.hint}/>
      </div>}
      </div>
      {editing&&pointBox&&!colourPick&&!selectionDragging&&!navigating&&!spacePan&&!panMode&&<SelectionAnchor
        box={pointBox} view={view} hoop={hoop} canvas={svg} container={stage} rail={rail}
        className="point-actions" label={t("Point editing tools")}
      >
        <button aria-label={t("Move points")} title={t("Drag a point to move it")} aria-pressed={pointMode==='move'} onClick={()=>setPointMode('move')}><Icon name="select" size={15}/><span>{t("Move")}</span></button>
        <button aria-label={t("Add point")} title={t("Click the curve to insert a point")} aria-pressed={pointMode==='add'} disabled={!!item?.curve&&item.curve.points.length>=200||!!item?.rails&&item.rails.points[0].length>=100} onClick={()=>setPointMode('add')}><Icon name="plus" size={15}/><span>{t("Add point")}</span></button>
        <button aria-label={t("Remove point")} title={t("Click a point to remove it, or select one and press Delete")} aria-pressed={pointMode==='remove'} onClick={()=>setPointMode('remove')}><Icon name="minus" size={15}/><span>{t("Remove")}</span></button>
        {(item?.curve||item?.rails)&&(()=>{const corner=!!activePoint&&isCorner(item,...activePoint);return <button aria-label={corner?t("Make curve point"):t("Make corner point")} title={t("Switch the selected point between a sharp corner and a smooth curve (or double-click the point)")} disabled={!activePoint} onClick={()=>activePoint&&toggleCorner(activePoint[1],activePoint[0])}><Icon name={corner?'curve':'closed'} size={15}/><span>{corner?t("Curve"):t("Corner")}</span></button>;})()}
        {item?.curve&&!item.curve.closed&&<button aria-label={t("Continue curve")} title={activePoint?.[1]===0?t("Continue from the first point"):t("Continue from the last point")} disabled={item.curve.points.length>=200} onClick={continueCurve}><Icon name="curve" size={15}/><span>{t("Continue")}</span></button>}
        <Button label={t("Done")} tooltip={`${t('Done editing')} (Enter)`} variant="primary" size="sm" onClick={finishEditing}/>
      </SelectionAnchor>}
      {showTravel&&compiled&&<div className="travel-legend" role="note" aria-label={t("Travel view legend")}><span title={t("The needle lifts and the hoop moves without sewing")}><i className="legend-jump"/>{t("Jump ·")} {formatNumber(stitchPaths.jumpCount)}</span><span title={t("A sewn stitch joining two pieces without cutting the thread")}><i className="legend-travel"/>{t("Travel stitch ·")} {formatNumber(stitchPaths.travelCount)}</span><span title={t("The machine cuts the thread here before a jump")}><i className="legend-trim">✕</i>{t("Trim (thread cut) ·")} {formatNumber(stitchPaths.trims.length)}</span></div>}
      {item&&<aside className={`settings-overlay ${settingsCollapsed?'collapsed':''}`} aria-label={multi?t("Selection settings"):item.text?t("Text settings"):t("Object settings")}>
        <div className="overlay-heading"><span className="swatch" style={{background:item.color}}/><h2 title={multi?t('objects.other',{count:items.length}):item.name}>{multi?t('objects.other',{count:items.length}):item.name}</h2><button className={`icon-button collapse-button ${settingsCollapsed?'':'open'}`} aria-label={settingsCollapsed?t("Expand settings"):t("Collapse settings")} aria-expanded={!settingsCollapsed} title={settingsCollapsed?t("Expand settings"):t("Collapse settings")} onClick={()=>setSettingsCollapsed(c=>!c)}><Icon name="chevron" size={16}/></button></div>
        {!settingsCollapsed&&<div className="overlay-body">
        {selectedIssue&&<div className={`selection-issue ${selectedIssue.severity}`}><Icon name="alert" size={14}/><button className="selection-issue-title" title={explain(selectedIssue,project,checkError,t).title} onClick={()=>focusIssue(selectedIssue)}>{explain(selectedIssue,project,checkError,t).title}</button>{selectedIssueFix&&<button className="selection-issue-fix" title={selectedIssueFix.title} onClick={()=>applyFix(selectedIssue)}>{t("Fix")}</button>}</div>}
        {items.some(o=>o.locked)&&<div className="lock-notice" role="status"><Icon name="lock" size={15}/><span>{allLocked?t(multi?'Locked objects: settings are read-only.':'Locked object: settings are read-only.'):t('Locked objects in the selection are not changed.')}</span><button type="button" disabled={hasDraft} onClick={()=>lockSelection(items.filter(o=>o.locked).map(o=>o.id))}>{t('Unlock')}</button></div>}
        <SelectionTools box={selectionBox} rotation={selectionRotation} multi={multi} disabled={hasDraft||allLocked} size={`${displayLength(selectionBox.width)} × ${displayLength(selectionBox.height)}`} onField={selectionField} onAction={selectionAction} onAlign={alignSelected}/>
        <MapToPath project={project} selection={selection} disabled={hasDraft||allLocked} onChange={commit} onSelect={setSelected}/>
        <ShapeTools focusOffset={focusOffset} project={project} selection={selection} disabled={hasDraft||allLocked} keep={cutKeep} onKeep={setCutKeep} onResult={run=>applyShape(run)} onMode={shapeMode}/>
        {multi?<fieldset disabled={hasDraft||allLocked} className="panel-section settings"><ThreadPicker project={project} selection={movableIds} onChange={commit} eyedropper={eyedropper}/><div className="selection-actions"><RedworkAction project={project} selection={selection} onRun={redwork}/></div></fieldset>:<>
        {item?.text&&<fieldset disabled={hasDraft||allLocked} className="text-fieldset"><TextPanel onReady={focusTextReady} spec={item.text} fill={isFillKind(item.kind)} loading={fontLoading>0} missing={missingGlyphs} textArea={textArea}
          guides={project.objects.filter(o=>o.id!==item.id&&!o.text&&o.rings.length).map(o=>({id:o.id,name:o.name}))} guide={guide?.text===item.id&&project.objects.some(o=>o.id===guide.id)?guide:null}
          onChange={updateText} onUseGuide={useGuide} onRemoveGuide={removeGuide} onDrawPath={drawTextPath} onConvert={convertText}/></fieldset>}
        <fieldset disabled={hasDraft||allLocked} className="panel-section settings object-settings">
          <Section id="object" title={item.text?t("Stitches"):t("Object & stitch type")} defaultOpen summaryExtra={t(kindNames[item.kind])}>
          <label><span className="field-heading">{t("Object name")}</span><input value={item.name} maxLength={40} onChange={e=>updateObject({name:e.target.value})}/></label>
          <StitchSelector value={item.kind} groups={stitchGroups(item,t)} onChange={kind=>updateObject({kind,spacing:undefined,underlay:undefined})}/>
          <RedworkAction project={project} selection={selection} onRun={redwork}/>
          </Section>
          <Section id="thread" title={t("Thread")} summaryExtra={<span className="thread-summary"><i style={{background:item.color}}/>{item.color.toUpperCase()}</span>}>
          <ThreadPicker hint project={project} selection={selection} onChange={commit} eyedropper={eyedropper}/>
          </Section>
          {item.kind==='fill'&&<FillSettings item={item} resolved={resolved!} onChange={updateObject} source={source} hoop={hoop} angles={{active:angles,onToggle:toggleAngles}}/>}
          {item.kind!=='fill'&&<Section id="stitch-settings" title={t("Stitch settings")} defaultOpen>
          {!(item.kind==='cross'&&hasCrossStyle(item))&&<div className="setting-grid"><label><span className="field-heading">{t("Length · mm")}<Hint text={t("hint.stitchLength")}/></span><input type="number" min=".5" max="3" step=".1" value={item.length} onChange={e=>{const n=Number(e.target.value);if(n>=.5&&n<=3)updateObject({length:n});}}/></label>{usesSpacing(item.kind)&&<label htmlFor="spacing-input"><span className="field-heading">{item.kind==='cross'?t("Cross size"):t("Spacing")} · mm<Hint text={t("hint.spacing")}/>{source('spacing')}</span><input id="spacing-input" type="number" min=".3" max="2" step=".05" value={resolved!.spacing} onChange={e=>{const n=Number(e.target.value);if(n>=.3&&n<=2)updateObject({spacing:n});}}/></label>}</div>}
          {item.kind==='cross'&&<><CrossSettings item={item} onChange={updateObject}/><StitchAngle value={item.angle} onChange={angle=>updateObject({angle})}/></>}
          {isRopeKind(item.kind)&&<label htmlFor="rope-width-input"><span className="field-heading">{t("Rope width · mm")}<Hint text={t("hint.ropeWidth")}/>{item.ropeWidth!==undefined?<button type="button" className="field-value reset" onClick={()=>updateObject({ropeWidth:undefined})}>{t("Reset")}</button>:<span className="field-value inherited">{t("Default · {v0}",{v0:ropeDefaults.width})}</span>}</span><input id="rope-width-input" type="number" min={ropeLimits.width[0]} max={ropeLimits.width[1]} step=".1" value={item.ropeWidth??ropeDefaults.width} onChange={e=>{const n=Number(e.target.value);if(e.target.value!==''&&n>=ropeLimits.width[0]&&n<=ropeLimits.width[1])updateObject({ropeWidth:n});}}/></label>}
          {item.kind==='e-stitch'&&<label className="check-label"><input type="checkbox" checked={!!item.eFlipped} onChange={e=>updateObject({eFlipped:e.target.checked||undefined})}/>{t("Flip teeth to the other side")}</label>}
          {usesSplit(item.kind)&&isWideKind(item.kind)&&<label><span className="field-heading">{t("Width · mm")}<Hint text={t("hint.satinWidth")}/></span><input type="number" min={satinLimits.width[0]} max={satinLimits.width[1]} step=".5" value={item.satinWidth} onChange={e=>{const n=Number(e.target.value);if(n>=satinLimits.width[0]&&n<=satinLimits.width[1])updateObject({satinWidth:n});}}/></label>}
          </Section>}
          {item.kind!=='fill'&&(['running','bean','backstitch'].includes(item.kind)||usesSplit(item.kind)||usesShortStitches(item.kind)||(!(item.kind==='cross'&&hasCrossStyle(item))&&(usesPull(item.kind)||underlayOptions(item.kind).length>1)))&&<Section id="advanced" title={t("Advanced")}>
          {['running','bean','backstitch'].includes(item.kind)&&<label><span className="field-heading">{t("Stitch tolerance · mm")}<Hint text={t("hint.stitchTolerance")}/>{item.tolerance!==undefined?<button type="button" className="field-value reset" onClick={()=>updateObject({tolerance:undefined})}>{t("Reset")}</button>:<span className="field-value inherited">{t("Default · {v0}",{v0:.2})}</span>}</span><input type="number" min=".1" max="1" step=".1" value={item.tolerance??.2} onChange={e=>{const n=Number(e.target.value);if(n>=.1&&n<=1)updateObject({tolerance:n});}}/></label>}
          {usesSplit(item.kind)&&<div className="setting-grid"><label htmlFor="split-input"><span className="field-heading">{t("Split above · mm")}<Hint text={t("hint.splitAbove")}/>{source('splitLength')}</span><input id="split-input" type="number" min={satinLimits.split[0]} max={satinLimits.split[1]} step=".5" value={resolved!.splitLength} onChange={e=>{const n=Number(e.target.value);if(e.target.value!==''&&n>=satinLimits.split[0]&&n<=satinLimits.split[1])updateObject({splitLength:n});}}/></label></div>}
          {usesShortStitches(item.kind)&&<label className="check-label"><input type="checkbox" checked={resolved!.shortStitches} onChange={e=>updateObject({shortStitches:e.target.checked})}/><span className="field-heading">{t("Short stitches on curves")}<Hint text={t("hint.shortStitches")}/></span>{source('shortStitches')}</label>}
          {!(item.kind==='cross'&&hasCrossStyle(item))&&usesPull(item.kind)&&<label htmlFor="pull-input"><span className="field-heading">{t("Pull compensation · mm")}<Hint text={t("hint.pullCompensation")}/>{source('pullCompensation')}</span><input id="pull-input" type="number" min="0" max="1" step=".05" value={resolved!.pullCompensation} onChange={e=>{const n=Number(e.target.value);if(e.target.value!==''&&n>=0&&n<=1)updateObject({pullCompensation:n});}}/></label>}
          {!(item.kind==='cross'&&hasCrossStyle(item))&&underlayOptions(item.kind).length>1&&<label htmlFor="underlay-input"><span className="field-heading">{t("Underlay")}<Hint text={t("hint.underlay")}/>{source('underlay')}</span><select id="underlay-input" value={resolved!.underlay} onChange={e=>updateObject({underlay:e.target.value as Underlay})}>{underlayOptions(item.kind).map(u=><option key={u} value={u}>{t(underlayNames[u])}</option>)}</select></label>}
          </Section>}
          <Section id="start-finish" title={t("Start & finish")}>
          <div className="setting-grid"><label htmlFor="tie-in-input"><span className="field-heading">{t("Tie-in")}<Hint text={t("hint.tieIn")}/>{source('tieIn')}</span><select id="tie-in-input" value={resolved!.tieIn} onChange={e=>updateObject({tieIn:e.target.value as Lock})}>{lockOptions}</select></label><label htmlFor="tie-off-input"><span className="field-heading">{t("Tie-off")}<Hint text={t("hint.tieOff")}/>{source('tieOff')}</span><select id="tie-off-input" value={resolved!.tieOff} onChange={e=>updateObject({tieOff:e.target.value as Lock})}>{lockOptions}</select></label></div>
          {(resolved!.tieIn!=='none'||resolved!.tieOff!=='none')&&<label htmlFor="lock-size-input"><span className="field-heading">{t("Lock size · mm")}<Hint text={t("hint.lockSize")}/>{source('lockSize')}</span><input id="lock-size-input" type="number" min={lockLimits.size[0]} max={lockLimits.size[1]} step=".1" value={resolved!.lockSize} onChange={e=>{if(inRange(e.target.value,lockLimits.size))updateObject({lockSize:Number(e.target.value)});}}/></label>}
          <div className="ends-row"><span className="field-heading"><span><i className="end-dot entry"/>{t("Entry ·")} <i className="end-dot exit"/>{t("exit")}</span><Hint text={t("hint.entryExit")}/></span>{item.entry||item.exit?<button type="button" className="field-value reset" title={t("Return to automatic entry and exit")} onClick={()=>updateObject({entry:undefined,exit:undefined})}>{t("Reset")}</button>:<span className="field-value inherited">{t("Auto")}</span>}</div>
          </Section>
        </fieldset></>}
        </div>}
      </aside>}
      <div className="dock-area">
        {(error||message)&&<div className={`feedback ${error?'error':''}`} role={error?'alert':'status'}>{error||message}<button aria-label={t("Dismiss message")} onClick={()=>{setError('');setMessage('');}}>×</button></div>}
        {timeline&&compiled&&<div className="stitch-playback" role="group" aria-label={t("Stitch playback controls")}>
          <button className="play-button" aria-label={playing?t("Pause playback"):t("Play stitches")} title={playing?t("Pause"):t("Play the stitch-out from the start")} onClick={()=>{if(!playing&&progress>=1)setProgress(0);setPlaying(p=>!p);}}><Icon name={playing?'pause':'play'} size={16}/></button>
          <input className="playback" type="range" aria-label={t("Stitch playback")} min="0" max="1" step=".001" value={progress} onChange={e=>{setProgress(Number(e.target.value));setPlaying(false);}}/>
          <span className="stitch-counter">{formatNumber(count)} / {formatNumber(compiled.stats.stitches)}</span>
          <label className="playback-speed" title={t('Playback speed')}><span className="visually-hidden">{t('Playback speed')}</span><select value={speed} onChange={e=>setViewSettings(v=>({...v,playbackSpeed:Number(e.target.value)}))}>{playbackSpeeds.map(n=><option key={n} value={n}>{formatNumber(n)}×</option>)}</select></label>
          <button className="travel-toggle" aria-pressed={density} disabled={!compileFresh} onClick={()=>setDensity(v=>!v)}>{t("Density")}</button>
          <OverlayControls value={viewSettings} onChange={patch=>setViewSettings(v=>({...v,...patch}))}/>
        </div>}
        {apiState==='offline'&&!compiled&&<span className="sim-hint" role="status">{t("Engine offline · showing shapes")}</span>}
        {!colourPick&&(pathTool(tool)||tool==='points'||tool==='stitch')&&<div className="canvas-action-bar" role="toolbar" aria-label={t(tool==='stitch'?"Click to stitch":"Drawing tools")}>
          {tool==='stitch'&&<div className="draw-actions"><label className="stitch-tolerance" title={t("How far a colour may differ from the clicked one and still join the area")}>{t("Colour tolerance")}<input type="range" min={toleranceLimits[0]} max={toleranceLimits[1]} step="1" value={tolerance} onChange={e=>{const n=Number(e.target.value);setTolerance(n);hoverStitch(cursor,n);}}/><output>{formatNumber(tolerance)}</output></label><Button label={t("Done")} variant="primary" size="sm" onClick={()=>chooseTool('select')}/></div>}
          {(pathTool(tool)||tool==='points')&&<div className="draw-actions"><button title={t("Remove last point (Backspace)")} disabled={!canUndoDraft} onClick={popDraft}>{t("Undo point")}</button><button title={t("Cancel (Esc)")} onClick={()=>{cancelDrawing();setTool('select');}}>{t("Cancel")}</button><Button label={closedDraft?t("Close shape"):t("Done")} variant="primary" size="sm" isDisabled={!canFinish} onClick={()=>finish()}/></div>}
        </div>}
        <div className="dock" role="toolbar" aria-label={t("Editor tools")}>
          {tools.filter(x=>dockTool(x.id)&&(!drawTool(x.id)||x.id==='open')).map(toolInfo=>{
            if(toolInfo.id==='open'){
              const last=tools.find(x=>x.id===lastDraw)!;
              return <ToolGroupButton key="draw" id="draw-tools" label={t('Draw')} groupLabel={t('Drawing tools')} title={`${last.label} (${last.key}) — ${last.hint}`} icon={last.icon} active={drawTool(tool)&&!panMode} selected={lastDraw} divider
                options={tools.filter(x=>drawTool(x.id)).map(x=>({id:x.id,icon:x.icon,label:x.label,shortcut:x.key,title:`${x.label} (${x.key}) — ${x.hint}`}))} onActivate={()=>chooseTool(lastDraw)} onSelect={chooseTool}/>;
            }
            const active=toolInfo.id==='pan'?(tool==='pan'||panMode):tool===toolInfo.id&&!panMode;
            if(toolInfo.id==='shape')return <ToolGroupButton key="shape" id="shape-tools" label={t('Shapes')} groupLabel={t('Shapes')} title={`${t('Shapes: {v0}',{v0:t(shapeNames[shapeKind])})} (${toolInfo.key}) — ${toolInfo.hint}`} icon={shapeKind} active={active} selected={shapeKind}
              options={shapeKinds.map(k=>({id:k,icon:k,label:t(shapeNames[k])}))} onActivate={()=>chooseTool('shape')} onSelect={k=>{chooseTool('shape');setShapeKind(k);setShapeDraft(null);shapePress.current=null;}}/>;
            return <span key={toolInfo.id} className="tool-slot">{toolInfo.id==='text'&&<span className="toolbar-divider"/>}<button className={active?'tool active':'tool'} title={`${toolInfo.label} (${toolInfo.alt?`${toolInfo.key} / ${toolInfo.alt}`:toolInfo.key}) — ${toolInfo.hint}`} aria-label={toolInfo.label} aria-pressed={active} onClick={()=>chooseTool(toolInfo.id)}><Icon name={toolInfo.icon}/><span>{toolInfo.label}</span></button></span>;
          })}
        </div>
      </div>
      <div className="corner-controls">
        <div className="canvas-controls"><button title={t("Undo (Ctrl / ⌘ Z)")} aria-label={t("Undo")} disabled={!hasDraft&&!history.length} onClick={undo}><Icon name="undo"/></button><button title={t("Redo (Ctrl / ⌘ Shift Z)")} aria-label={t("Redo")} disabled={hasDraft||!future.length} onClick={redo}><Icon name="redo"/></button><span className="toolbar-divider"/><button aria-label={t("Zoom out")} title={t("Zoom out (−)")} onClick={()=>zoomBy(1/1.2)}><Icon name="minus" size={16}/></button><span>{formatNumber(Math.round(zoom*100))}%</span><button aria-label={t("Zoom in")} title={t("Zoom in (+)")} onClick={()=>zoomBy(1.2)}><Icon name="plus" size={16}/></button><button aria-label={t("Fit hoop")} title={t("Fit hoop")+" (0)"} onClick={fit}><Icon name="fit" size={16}/></button></div>
      </div>
      {!focus&&<div className="canvas-navigation-hint">{t(hoop.label)} {t("hoop · Scroll to zoom · Space / right-drag to pan")}</div>}
    </section>
    <nav ref={rail} className="panel-rail" role="tablist" aria-label={t("Panels")} aria-orientation="vertical">
      {tabs.map(t=><button key={t.id} role="tab" aria-expanded={panelOpen&&panelTab===t.id} id={`tab-${t.id}`} aria-controls="side-panel" aria-selected={panelOpen&&panelTab===t.id} aria-label={t.label} title={t.label} onClick={()=>openTab(t.id)}><Icon name={t.icon}/></button>)}
      <span className="rail-divider"/>
      <button aria-label={t('Keyboard shortcuts')} title={t('Keyboard shortcuts')+' (?)'} onClick={()=>setShortcutHelp(true)}>?</button>
      <span className="rail-divider"/>
      <button className="rail-export" aria-label={t("Export PES")} title={t("Export PES")} aria-busy={busy} disabled={busy||hasDraft||!ready||(!project.objects.length&&!compiled)||outside} onClick={()=>void generate(true)}><Icon name="download"/></button>
    </nav>
    <aside id="side-panel" className="side-panel" role="tabpanel" aria-labelledby={`tab-${panelTab}`} hidden={!panelOpen}>
      <div className="panel-heading"><h2>{tabs.find(t=>t.id===panelTab)!.label}</h2>{panelTab==='layers'&&<><span className="count-badge">{formatNumber(project.objects.length)}</span>{project.objects.some(o=>o.locked)&&<button className="icon-button" type="button" disabled={hasDraft} title={t('Unlock all objects')} aria-label={t('Unlock all objects')} onClick={unlockEverything}><Icon name="lock" size={15}/></button>}</>}</div>
      {panelTab==='layers'&&<>
        <LayersPanel project={project} compiled={compileFresh?compiled:null} selection={selection} disabled={hasDraft} imported={imported} onSelect={selectObject} onSelection={ids=>{setSelection(ids);anchor.current=ids[0]??null;setEditPoints(false);}} onRename={renameObject} onHide={hideObjects} onLock={lockSelection} onPlace={(ids,index)=>commit(placeObjects(project,ids,index))} onPosition={(id,n)=>commit(placeObjects(project,[id],positionIndex(project,id,n)))} onMove={(ids,index,group,whole)=>commit(whole!==undefined?moveGroup(project,whole,index):moveObjects(project,ids,index,group))} children={null}/>

      </>}
      {panelTab==='artwork'&&<section className="panel-section">
        <button className="upload-box" disabled={hasDraft} onClick={()=>file.current?.click()}><Icon name="upload"/><strong>{t("Import file")}</strong></button>
        <div className="manual-trace"><PixelCrossButton project={project} image={art} disabled={hasDraft} onChange={commit}/></div>
        {!images.length&&<p className="section-copy">{t("PNG, JPG, WebP or SVG to trace; PES or PEC to preview; a Threadroom JSON project to edit. You can also drop a file on the canvas.")}</p>}
        {images.length>0&&<ImagesPanel images={images} active={art?.id??null} selected={imageSel} disabled={hasDraft} onSelect={selectImage} onChange={changeImage} onMove={(id,delta)=>commit(moveImage(current.current,id,delta))} onDelete={deleteImage}/>}
        {art&&<div className="artwork-settings">
          <Button label={t("Auto trace")} variant="primary" icon={<Icon name="region"/>} isLoading={busy} isDisabled={hasDraft} width="100%" onClick={()=>void trace()}/>
          <div className="manual-trace"><button disabled={hasDraft||art.hidden} title={t("Click to stitch (7): click a colour area to fill it")} onClick={()=>{chooseTool('stitch');leavePanel();}}>{t("Click to stitch")}</button></div>
          <div className="manual-trace"><button disabled={hasDraft} title={t("Closed shape (2)")} onClick={()=>{chooseTool('closed');setShowImage(true);leavePanel();}}>{t("Trace outline")}</button><button disabled={hasDraft} title={t("Open shape (1)")} onClick={()=>{chooseTool('open');setShowImage(true);leavePanel();}}>{t("Trace line")}</button></div>
          <label className="check-label"><input type="checkbox" checked={showImage} onChange={e=>setShowImage(e.target.checked)}/>{t("Show reference")}</label>
          <button className="text-button" onClick={()=>fitArtwork()}>{t("Fit image")}</button>
          <details className="trace-options"><summary>{t("Trace settings")}</summary><label>{t("Colours")}<select value={colours} onChange={e=>setColours(Number(e.target.value))}>{[2,3,4,5,6,8].map(n=><option key={formatNumber(n)} value={formatNumber(n)}>{formatNumber(n)}</option>)}</select></label><label className="check-label"><input type="checkbox" checked={ignoreBg} onChange={e=>setIgnoreBg(e.target.checked)}/>{t("Remove background")}</label></details>
        </div>}
      </section>}
      {panelTab==='setup'&&<section className="panel-section">
        <ViewControls value={viewSettings} onChange={patch=>setViewSettings(v=>({...v,...patch}))}/>
        <button className="text-button setup-shortcuts" onClick={()=>setShortcutHelp(true)}>{t('Keyboard shortcuts')} (?)</button>
        <label>{t("Machine")}<select value={project.machine} onChange={()=>{}}><option value="brother-pr1x">{t("Brother PR1X")}</option></select></label>
        <label>{t("Hoop")}<select disabled={hasDraft} value={project.hoop} onChange={e=>changeHoop(e.target.value)}>{Object.entries(hoops).map(([key,h])=><option key={key} value={key}>{t(h.label)}</option>)}</select></label>
        <label>{t("Fabric")}<select disabled={hasDraft} value={project.fabric} onChange={e=>commit(withFabric(project,e.target.value as Fabric))}>{Object.entries(fabrics).map(([key,f])=><option key={key} value={key}>{t(f.label)}</option>)}</select></label>
        <SewingSpeed project={project} onChange={commit}/>
        <p className="fabric-advice">{t("Stabilizer:")} {t(fabric.stabilizer)} {t("· Topping:")} {t(fabric.topping)}</p>
        <div className="setting-grid setup-locks"><label>{t("Tie-in")}<select disabled={hasDraft} value={project.locks.tieIn} onChange={e=>setLocks({tieIn:e.target.value as Lock})}>{lockOptions}</select></label><label>{t("Tie-off")}<select disabled={hasDraft} value={project.locks.tieOff} onChange={e=>setLocks({tieOff:e.target.value as Lock})}>{lockOptions}</select></label>
          <label>{t("Lock size · mm")}<input type="number" disabled={hasDraft} min={lockLimits.size[0]} max={lockLimits.size[1]} step=".1" value={project.locks.lockSize} onChange={e=>{if(inRange(e.target.value,lockLimits.size))setLocks({lockSize:Number(e.target.value)},'lockSize');}}/></label><label>{t("Trim jumps longer than · mm")}<input type="number" disabled={hasDraft} min={lockLimits.trim[0]} max={lockLimits.trim[1]} step=".5" value={project.trimJump} title={t("Shorter jumps sew as one stitch without a trim")} onChange={e=>{if(inRange(e.target.value,lockLimits.trim))commit({...project,trimJump:Number(e.target.value)},'','setup:trimJump');}}/></label></div>
      </section>}
      {panelTab==='info'&&<section className="panel-section design-summary">
        <div className="summary-grid"><div><span>{t("Hoop")}</span><strong>{displayLength(hoop.width)} × {displayLength(hoop.height)}</strong></div><div><span>{t("Design size")}</span><strong>{displayLength(compiled?.stats.width||size.width)} × {displayLength(compiled?.stats.height||size.height)}</strong></div><div><span>{t("Stitches")}</span><strong>{compiled?formatNumber(compiled.stats.stitches):'—'}</strong></div><div><span>{t("Thread changes")}</span><strong>{compiled?formatNumber(compiled.stats.colorChanges):'—'}</strong></div></div>
        {compiled&&<p className="section-copy" title={t("Jumps: moves without sewing. Trims: thread cuts. Use the overlay controls in Setup or playback to see them.")}>{t('travelStatsUnits',{jumps:compiled.stats.jumps,length:displayLength(compiled.stats.jumpLength),trims:compiled.stats.trims})}</p>}
        <StitchDiagnostics compiled={compileFresh?compiled:null}/>
        <SewingTime project={project} compiled={compileFresh?compiled:null}/><WorksheetButton project={project} compiled={compileFresh?compiled:null} units={viewSettings.units} disabled={hasDraft}/>
        {!!size.width&&<label>{t("Design width · mm")}<input key={`${size.width.toFixed(2)}-${project.hoop}`} type="number" disabled={hasDraft} min="5" max={hoop.width} step="1" defaultValue={Number(size.width.toFixed(1))} onBlur={e=>{const n=Number(e.target.value);if(Math.abs(n-size.width)>.15)resizeDesign(n);}}/></label>}
        {outside&&<button className="hoop-check warning" onClick={()=>{const issue=issues.find(w=>w.code==='outside-hoop');if(issue)focusIssue(issue);else document.getElementById('check-panel')?.showPopover();}}><Icon name="region" size={15}/>{t("Design exceeds hoop")}</button>}
        <div className="engine-state"><span className={`status-dot ${apiState==='ready'?'':'muted'}`}/>{apiState==='ready'?t("Engine connected"):apiState==='checking'?t("Connecting…"):t("Engine offline")}</div>
      </section>}
    </aside>
    {menu&&<ContextMenu {...menu} grid={viewSettings.showGrid} onAction={menuAction} onClose={closeMenu}/>}
    {pendingSVG&&<SVGImportChoice file={pendingSVG} onClose={()=>setPendingSVG(null)} onChoose={shapes=>{const f=pendingSVG;setPendingSVG(null);void importFile(f,shapes);}}/>}
    {shortcutHelp&&<ShortcutHelp tools={tools} onClose={()=>{setShortcutHelp(false);requestAnimationFrame(()=>svg.current?.focus());}}/>}
  </main>;
}
