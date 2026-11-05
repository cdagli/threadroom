import {createT,TranslationError,type Translator,type Key} from './i18n';
import type {Font} from 'opentype.js';
const parser=()=>import('opentype.js');
import type {FontRef} from './text';

// Open-license Google Fonts served by Fontsource. Each weight/style/subset is a
// separate static file, so characters outside Latin load further subsets.
const CDN='https://cdn.jsdelivr.net/fontsource/fonts';
export type Category='s'|'r'|'d'|'h'|'m';
export const categoryNames:Record<Category, Key>={s:'Sans serif',r:'Serif',d:'Display',h:'Script',m:'Monospace'};
export type CatalogFont={id:string;family:string;category:Category;weights:number[];italic:boolean;subsets:string[]};
export type UploadedFont={id:string;family:string;weight:number;italic:boolean};
// "Best for stitching": faces whose strokes stay at least 1 mm wide as fill stitches at
// the default 12 mm letter height, with every Turkish letter. Each entry is the lightest
// weight that qualifies (under ~2% of the letters thinner than 1 mm by the design check's
// raster); choosing the font raises a lighter weight to it. Hairline scripts and
// high-contrast serifs (Dancing Script, Great Vibes, Playfair Display) are not listed.
export const recommended:Record<string,number>={
  nunito:700,'baloo-2':400,quicksand:700,comfortaa:700,'varela-round':400,'m-plus-rounded-1c':700,grandstander:400,dynapuff:400,gluten:400,
  poppins:700,montserrat:700,rubik:400,kanit:400,signika:400,'open-sans':700,roboto:700,inter:700,raleway:700,'josefin-sans':700,barlow:700,dosis:700,oswald:700,'bebas-neue':400,anton:400,'archivo-black':400,'fjalla-one':400,'russo-one':400,'paytone-one':400,
  'luckiest-guy':400,righteous:400,bungee:400,coiny:400,modak:400,'rammetto-one':400,'sigmar-one':400,rowdies:400,margarine:400,agbalumo:400,'alfa-slab-one':400,
  pacifico:400,borel:400,sriracha:400,kalam:700,caveat:700,'patrick-hand':400,
  'roboto-slab':700,'bree-serif':400,
};
export const defaultFont:FontRef={source:'catalog',id:'nunito',family:'Nunito',weight:800,italic:false,subsets:['cyrillic','cyrillic-ext','latin','latin-ext','vietnamese']};
// Scripts that read left to right without shaping. Arabic, Hebrew and Indic text need a shaper.
const subsetsLoaded=['latin','latin-ext','vietnamese','cyrillic','cyrillic-ext','greek','greek-ext'];
export const weightNames:Record<number, Key>={100:'Thin',200:'Extra light',300:'Light',400:'Regular',500:'Medium',600:'Semibold',700:'Bold',800:'Extra bold',900:'Black'};

let catalog:Promise<CatalogFont[]>|null=null;
export function loadCatalog(t:Translator=createT('en')):Promise<CatalogFont[]> {
  catalog??=fetch('/fonts/catalog.json').then(r=>{if(!r.ok)throw new Error();return r.json();}).then((data:{fonts:[string,string,Category,number[],number,string[]][]})=>
    data.fonts.map(([id,family,category,weights,italic,subsets])=>({id,family,category,weights,italic:!!italic,subsets})))
    .catch(()=>{catalog=null;throw new TranslationError(t,"The font list could not be loaded. Check your connection and try again.");});
  return catalog;
}
export function refFor(font:CatalogFont,weight:number,italic:boolean):FontRef {
  weight=Math.max(weight,recommended[font.id]??0);
  const nearest=font.weights.reduce((best,w)=>Math.abs(w-weight)<Math.abs(best-weight)?w:best,font.weights[0]);
  return {source:'catalog',id:font.id,family:font.family,weight:nearest,italic:italic&&font.italic,subsets:font.subsets};
}

function subsetOrder(ref:FontRef) {
  const usable=ref.subsets.filter(s=>subsetsLoaded.includes(s)).sort((a,b)=>subsetsLoaded.indexOf(a)-subsetsLoaded.indexOf(b));
  return usable.length?usable:ref.subsets.slice(0,1);
}
const fileURL=(ref:FontRef,subset:string,ext='ttf')=>`${CDN}/${ref.id}@latest/${subset}-${ref.weight}-${ref.italic?'italic':'normal'}.${ext}`;
const keys=(ref:FontRef)=>ref.source==='upload'?[`upload:${ref.id}`]:subsetOrder(ref).map(s=>fileURL(ref,s));
const loaded=new Map<string,Font>(), pending=new Map<string,Promise<Font>>();

/** Fonts already in memory, in fallback order. Synchronous for live typing. */
export function loadedFonts(ref:FontRef):Font[] {
  return keys(ref).map(k=>loaded.get(k)).filter((f):f is Font=>!!f);
}
function fetchFont(key:string,load:()=>Promise<ArrayBuffer>):Promise<Font> {
  const done=loaded.get(key);if(done)return Promise.resolve(done);
  let request=pending.get(key);
  if(!request){
    request=load().then(async buffer=>{const {parse}=await parser();const font=parse(buffer);loaded.set(key,font);return font;}).finally(()=>pending.delete(key));
    pending.set(key,request);
  }
  return request;
}
/** Loads the first subset, then further subsets until every character is covered.
 * Resolves true when new font data was loaded. */
export async function ensureFonts(ref:FontRef,text:string,t:Translator=createT('en')):Promise<boolean> {
  const before=loadedFonts(ref).length;
  if(ref.source==='upload'){
    await fetchFont(`upload:${ref.id}`,async()=>{const data=await readUpload(ref.id);if(!data)throw new TranslationError(t,"Upload “{v0}” again to edit this text.",{v0:ref.family});return data;});
    return loadedFonts(ref).length>before;
  }
  const chars=[...new Set(text.replace(/\s/g,''))],fonts:Font[]=[];
  for(const [i,key] of keys(ref).entries()){
    if(i>0&&chars.every(c=>fonts.some(f=>f.charToGlyphIndex(c)>0)))break;
    try{fonts.push(await fetchFont(key,async()=>{const r=await fetch(key);if(!r.ok)throw new Error();return r.arrayBuffer();}));}
    catch{if(i===0)throw new TranslationError(t,"{v0} could not be downloaded. Check your connection, or choose another style.",{v0:ref.family});}
  }
  return loadedFonts(ref).length>before;
}

// Lightweight browser previews (WOFF2) for the font list and text box.
const previews=new Map<string,Promise<string>>();
export function previewFamily(id:string,subsets:string[],weight=400,italic=false):Promise<string> {
  const subset=subsets.includes('latin')?'latin':subsets[0],key=`${id}-${weight}-${italic?'i':'n'}`;
  let request=previews.get(key);
  if(!request){
    const name=`tr-${key}`,face=new FontFace(name,`url(${CDN}/${id}@latest/${subset}-${weight}-${italic?'italic':'normal'}.woff2) format('woff2')`,{weight:String(weight),style:italic?'italic':'normal'});
    request=face.load().then(f=>{document.fonts.add(f);return name;});
    request.catch(()=>previews.delete(key));previews.set(key,request);
  }
  return request;
}
export function previewRef(ref:FontRef):Promise<string> {
  if(ref.source==='catalog')return previewFamily(ref.id,ref.subsets,ref.weight,ref.italic);
  const key=`upload-${ref.id}`;
  let request=previews.get(key);
  if(!request){
    request=readUpload(ref.id).then(async data=>{if(!data)throw new Error();const f=await new FontFace(`tr-${key}`,data).load();document.fonts.add(f);return `tr-${key}`;});
    request.catch(()=>previews.delete(key));previews.set(key,request);
  }
  return request;
}

// Uploaded fonts stay in this browser (IndexedDB). Projects store a reference.
function database():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{const r=indexedDB.open('threadroom-fonts',1);r.onupgradeneeded=()=>r.result.createObjectStore('fonts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
}
async function store<T>(mode:IDBTransactionMode,run:(s:IDBObjectStore)=>IDBRequest):Promise<T> {
  const db=await database();
  return new Promise((resolve,reject)=>{const r=run(db.transaction('fonts',mode).objectStore('fonts'));r.onsuccess=()=>resolve(r.result as T);r.onerror=()=>reject(r.error);});
}
async function readUpload(id:string):Promise<ArrayBuffer|null> {
  try{return (await store<{data:ArrayBuffer}|undefined>('readonly',s=>s.get(id)))?.data||null;}catch{return null;}
}
export async function listUploads():Promise<UploadedFont[]> {
  try{return ((await store<{meta:UploadedFont}[]>('readonly',s=>s.getAll()))||[]).map(v=>v.meta);}catch{return [];}
}
export async function uploadFont(file:File,t:Translator=createT('en')):Promise<FontRef> {
  if(file.size>15*1024*1024)throw new TranslationError(t,"Choose a font file smaller than 15 MB.");
  if(/\.woff2$/i.test(file.name))throw new TranslationError(t,"WOFF2 is not supported here. Upload the TTF, OTF or WOFF version.");
  const data=await file.arrayBuffer();let font:Font;
  try{const {parse}=await parser();font=parse(data);}catch{throw new TranslationError(t,"This file is not a readable TTF, OTF or WOFF font.");}
  if(!font.charToGlyphIndex('A')&&!font.charToGlyphIndex('a')&&font.numGlyphs<3)throw new TranslationError(t,"This font has no usable letters.");
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',data));
  const id=`u${Array.from(digest.slice(0,10),b=>b.toString(16).padStart(2,'0')).join('')}`;
  const family=font.names.fontFamily?.en||Object.values(font.names.fontFamily||{})[0]||file.name.replace(/\.[^.]+$/,'');
  const meta:UploadedFont={id,family:family.slice(0,60),weight:Math.max(100,Math.min(1000,font.tables.os2?.usWeightClass||400)),italic:!!((font.tables.os2?.fsSelection||0)&1)};
  loaded.set(`upload:${id}`,font);
  try{await store('readwrite',s=>s.put({meta,data},id));}catch{/* The font still works for this session. */}
  return {source:'upload',id,family:meta.family,weight:meta.weight,italic:meta.italic,subsets:[]};
}
