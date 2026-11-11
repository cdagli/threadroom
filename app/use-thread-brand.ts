'use client';
import {useSyncExternalStore} from 'react';
import {defaultBrand,isThreadBrand} from '@/lib/threads';
// The chosen thread brand is a per-browser preference shared by every palette on the page.
const key='threadroom-thread-brand',listeners=new Set<()=>void>();
let current:string|null=null;
export function readThreadBrand():string {
  if(current===null){current=defaultBrand;try{const v=localStorage.getItem(key);if(isThreadBrand(v))current=v;}catch{/* Storage is optional. */}}
  return current;
}
export function setThreadBrand(brand:string){
  if(!isThreadBrand(brand))return;current=brand;try{localStorage.setItem(key,brand);}catch{/* Kept for this session. */}listeners.forEach(l=>l());
}
const subscribe=(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};};
export const useThreadBrand=()=>useSyncExternalStore(subscribe,readThreadBrand,()=>defaultBrand);
