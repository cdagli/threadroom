'use client';
import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {createT,formatNumber,formatMm,type Lang} from '@/lib/i18n';
const Context=createContext({lang:'tr' as Lang,setLang:(_lang:Lang)=>{},t:createT('tr'),formatNumber:(n:number,digits?:number)=>formatNumber(n,'tr',digits),formatMm:(n:number,digits?:number)=>formatMm(n,'tr',digits)});
export function I18nProvider({children}:{children:ReactNode}){
  const [lang,saveLang]=useState<Lang>('tr');
  useEffect(()=>{try{const value=localStorage.getItem('threadroom-lang');if(value==='tr'||value==='en')saveLang(value);}catch{/* Storage may be disabled. */}},[]);
  useEffect(()=>{document.documentElement.lang=lang;},[lang]);
  const value=useMemo(()=>({lang,setLang:(next:Lang)=>{saveLang(next);try{localStorage.setItem('threadroom-lang',next);}catch{/* The switch still works for this session. */}},t:createT(lang),formatNumber:(n:number,digits?:number)=>formatNumber(n,lang,digits),formatMm:(n:number,digits?:number)=>formatMm(n,lang,digits)}),[lang]);
  return <Context value={value}><title>{value.t('Threadroom — embroidery, made approachable')}</title>{children}</Context>;
}
export const useT=()=>useContext(Context);
