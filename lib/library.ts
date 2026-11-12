import type {Key,Lang} from './i18n';
import {blankProject,hoops,validProject,type Point,type Project,type StitchObject} from './project';
import {pasteSelection,selectionBounds,transformSelection} from './editing';
import {stitchReach} from './check';

// IDs are durable catalog keys; labels can change without moving assets between categories.
export const libraryCategories=[
  {id:'basic-shapes',name:'Basic shapes',icon:'shapes'},
  {id:'botanical',name:'Flowers & plants',icon:'flower'},
  {id:'animals',name:'Animals',icon:'animal'},
  {id:'geometric-patterns',name:'Geometric patterns',icon:'hexagon'},
  {id:'ornaments',name:'Ornaments',icon:'ornament'},
  {id:'borders-frames',name:'Borders & frames',icon:'frame'},
  {id:'symbols',name:'Symbols',icon:'heart'},
  {id:'seasonal',name:'Seasons & occasions',icon:'star'},
] as const satisfies readonly {id:string;name:Key;icon:string}[];
export type LibraryCategoryId=typeof libraryCategories[number]['id'];
export type LibraryAsset={
  version:1;
  id:string;
  categoryId:LibraryCategoryId;
  name:Record<Lang,string>;
  tags?:string[];
  // Editable geometry in millimetres. Machine, fabric, hoop and reference images belong to the destination.
  design:{objects:StitchObject[];groups?:{id:string;name:string}[]};
};
export type LibraryFilter={categoryId?:LibraryCategoryId;query?:string};
export const libraryDragType='application/x-threadroom-library-asset';
const fitMargin=.05;
const searchable=(text:string)=>text.toLocaleLowerCase('tr').normalize('NFD').replace(/\p{M}/gu,'').replaceAll('ı','i');
export function filterLibraryAssets(assets:readonly LibraryAsset[],{categoryId,query=''}:LibraryFilter):LibraryAsset[]{
  const words=searchable(query).trim().split(/\s+/).filter(Boolean);
  return assets.filter(asset=>(!categoryId||asset.categoryId===categoryId)&&words.every(word=>searchable([...Object.values(asset.name),...(asset.tags??[])].join(' ')).includes(word)));
}

export function validLibraryAsset(value:unknown):value is LibraryAsset{
  if(!value||typeof value!=='object')return false;
  const a=value as LibraryAsset;
  if(a.version!==1||typeof a.id!=='string'||!a.id.trim()||!libraryCategories.some(c=>c.id===a.categoryId)||!a.name||['tr','en'].some(lang=>typeof a.name[lang as Lang]!=='string'||!a.name[lang as Lang].trim()))return false;
  if(a.tags!==undefined&&(!Array.isArray(a.tags)||a.tags.some(tag=>typeof tag!=='string')))return false;
  if(!a.design||!validProject({...blankProject('Library asset'),...a.design})||!a.design.objects.length)return false;
  // Bindings need their own ID remapping; catalog v1 supports ordinary geometry and groups.
  if(a.design.groups?.some(g=>'pathBinding' in g)||a.design.objects.some(o=>o.layoutOnly))return false;
  return new Set(a.design.objects.map(o=>o.id)).size===a.design.objects.length;
}

// Shared by click, keyboard activation and canvas drop. Returns a new project for one editor commit.
export function insertLibraryAsset(project:Project,asset:LibraryAsset,at:Point,id:()=>string):{project:Project;ids:string[]}|null{
  if(!validLibraryAsset(asset)||!at.every(Number.isFinite))return null;
  const clip={...blankProject('Library asset'),...structuredClone(asset.design)};
  const pasted=pasteSelection(project,clip,0,id);if(!pasted)return null;
  const box=selectionBounds(pasted.project,pasted.ids),hoop=hoops[project.hoop];
  if(!hoop||(!box.width&&!box.height))return null;
  // Satin columns and borders sew beyond their stored centre lines. Reserve their full reach
  // before fitting so a valid source cannot become an outside-hoop design on insertion.
  // A small extra margin absorbs float rounding and curve resampling after scaling, which could
  // otherwise leave a point a hair outside the hoop when a motif fits it exactly.
  const padding=Math.max(0,...clip.objects.map(o=>stitchReach(o,project)))+fitMargin;
  const availableWidth=hoop.width-2*padding,availableHeight=hoop.height-2*padding;
  if(availableWidth<=0||availableHeight<=0)return null;
  const scale=Math.min(1,availableWidth/Math.max(box.width,1e-6),availableHeight/Math.max(box.height,1e-6));
  const width=box.width*scale,height=box.height*scale;
  const x=Math.max(padding,Math.min(hoop.width-padding-width,at[0]-width/2)),y=Math.max(padding,Math.min(hoop.height-padding-height,at[1]-height/2));
  const next=transformSelection(pasted.project,pasted.ids,[scale,0,0,scale,x-box.x*scale,y-box.y*scale]);
  if(!next||!validProject(next))return null;
  const placed=selectionBounds(next,pasted.ids);
  if(placed.x< -1e-7||placed.y< -1e-7||placed.x+placed.width>hoop.width+1e-7||placed.y+placed.height>hoop.height+1e-7)return null;
  return {project:next,ids:pasted.ids};
}
