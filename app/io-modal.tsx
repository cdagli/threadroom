'use client';
import {useEffect,useId,useRef} from 'react';
import {createPortal} from 'react-dom';

export function Modal({title,children,onClose}:{title:string;children:React.ReactNode;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),id=useId();useEffect(()=>{dialog.current?.showModal();},[]);
  return createPortal(<dialog ref={dialog} className="io-dialog" aria-labelledby={id} onCancel={onClose} onClose={onClose} onKeyDown={e=>e.stopPropagation()} onKeyUp={e=>e.stopPropagation()}><h2 id={id}>{title}</h2>{children}</dialog>,document.body);
}
