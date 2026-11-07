'use client';
import {Dialog} from './surfaces';
import {useEffect,useId,useRef} from 'react';
import {createPortal} from 'react-dom';

// size="wide" fits side-by-side content such as a list with a preview.
export function Modal({title,children,onClose,size}:{title:string;children:React.ReactNode;onClose:()=>void;size?:'wide'}){
  const dialog=useRef<HTMLDialogElement>(null),id=useId();useEffect(()=>{dialog.current?.showModal();},[]);
  return createPortal(<Dialog ref={dialog} className={`io-dialog${size?` io-dialog--${size}`:''}`} aria-labelledby={id} onCancel={onClose} onClose={onClose} onKeyDown={e=>e.stopPropagation()} onKeyUp={e=>e.stopPropagation()}><h2 id={id}>{title}</h2>{children}</Dialog>,document.body);
}
