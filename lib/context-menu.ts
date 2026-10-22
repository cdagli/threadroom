import type {Project} from './project';
import {unlockedIds} from './layers';
import {shapeOptions} from './shape-ops';
import {guideMode} from './angle-guides';
import {canBreakApart,canConvertToRedwork} from './redwork';

// Canvas right-click menu: pure item lists, keyboard movement and viewport placement.
export type MenuAction='cut'|'copy'|'paste'|'duplicate'|'delete'|'group'|'ungroup'|'lock'|'unlock'|'hide'|'show'|'editPoints'|'editAngles'|'editFlow'|'redwork'|'breakApart'|'front'|'forward'|'backward'|'back'|'flipH'|'flipV'|'rotate'|'cutHoles'|'flatten'|'union'|'subtract'|'intersect'|'offset'|'knife'|'selectAll'|'unlockAll'|'fit'|'grid';
export type MenuEntry={action:MenuAction;disabled?:boolean}|'separator';
export function objectMenu(p:Project,ids:readonly string[],canPaste:boolean):MenuEntry[]{
  const chosen=p.objects.filter(o=>ids.includes(o.id)),editable=unlockedIds(p,ids).length>0,first=p.objects[0]?.id,last=p.objects.at(-1)?.id;
  const single=chosen.length===1?chosen[0]:null,locked=chosen.length>0&&chosen.every(o=>o.locked),hidden=chosen.length>0&&chosen.every(o=>o.hidden);
  const entries:MenuEntry[]=[{action:'cut',disabled:!editable},{action:'copy'},{action:'paste',disabled:!canPaste},{action:'duplicate'},'separator',
    {action:'delete',disabled:!editable},'separator',{action:'group',disabled:chosen.length<2},{action:'ungroup',disabled:!chosen.some(o=>o.group!==undefined)},
    {action:locked?'unlock':'lock'},{action:hidden?'show':'hide'}];
  if(single&&!single.text&&!single.locked&&!single.hidden&&single.kind!=='redwork')entries.push({action:'editPoints'});
  // Edit angles (Edit flow field for Streamlines) for one visible, unlocked fill; Convert to redwork or Break apart (W).
  const mode=single&&guideMode(single);if(single&&mode)entries.push({action:mode==='flow'?'editFlow':'editAngles',disabled:single.locked||single.hidden});
  entries.push(canBreakApart(p,ids)?{action:'breakApart'}:{action:'redwork',disabled:!canConvertToRedwork(p,ids)});
  entries.push('separator',{action:'front',disabled:ids.includes(last??'')},{action:'forward',disabled:ids.includes(last??'')},{action:'backward',disabled:ids.includes(first??'')},{action:'back',disabled:ids.includes(first??'')},
    'separator',{action:'flipH',disabled:!editable},{action:'flipV',disabled:!editable},{action:'rotate',disabled:!editable});
  // Shape operations, enabled as in the Shape tools section (locked objects and satin Blocks don't count).
  const can=shapeOptions(p,ids);
  entries.push('separator',{action:'cutHoles',disabled:!can.cut},{action:'flatten',disabled:!can.flatten},
    {action:'union',disabled:!can.combine},{action:'subtract',disabled:!can.combine},{action:'intersect',disabled:!can.combine},
    {action:'offset',disabled:!can.offset},{action:'knife',disabled:!can.knife});
  return chosen.length?entries:canvasMenu(p,canPaste);
}
export function canvasMenu(p:Project,canPaste:boolean):MenuEntry[]{
  const entries:MenuEntry[]=[{action:'paste',disabled:!canPaste},{action:'selectAll',disabled:!p.objects.some(o=>!o.locked&&!o.hidden)}];
  if(p.objects.some(o=>o.locked))entries.push({action:'unlockAll'});
  return [...entries,'separator',{action:'fit'},{action:'grid'}];
}
// Arrow keys skip separators and disabled rows and wrap; Home/End jump to the ends.
export function menuStep(entries:readonly MenuEntry[],index:number,key:string):number{
  const usable=entries.flatMap((e,i)=>e!=='separator'&&!e.disabled?[i]:[]);if(!usable.length)return -1;
  if(key==='Home')return usable[0];if(key==='End')return usable.at(-1)!;
  const at=usable.indexOf(index);
  if(key==='ArrowDown')return at<0?usable.find(i=>i>index)??usable[0]:usable[(at+1)%usable.length];
  if(key==='ArrowUp')return at<0?[...usable].reverse().find(i=>i<index)??usable.at(-1)!:usable[(at-1+usable.length)%usable.length];
  return index;
}
// Opens down-right of the pointer, flipping or clamping so the menu stays inside the viewport.
export function menuPosition(x:number,y:number,width:number,height:number,viewWidth:number,viewHeight:number,margin=8):{left:number;top:number}{
  const place=(p:number,size:number,view:number)=>{if(p+size+margin<=view)return Math.max(margin,p);if(p-size>=margin)return p-size;return Math.max(margin,Math.min(view-size-margin,p));};
  return {left:place(x,width,viewWidth),top:place(y,height,viewHeight)};
}
