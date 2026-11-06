'use client';
import {useId, type ComponentPropsWithRef, type ReactNode} from 'react';
import {Popover} from './surfaces';

const menuItems='button[role^="menuitem"]:not(:disabled)';

export function MenuPopover({className='',onKeyDown,onToggle,...props}:ComponentPropsWithRef<'div'>){
  return <Popover {...props} role="menu" className={`ds-menu-popover ${className}`} onToggle={event=>{
    if(event.newState==='open')event.currentTarget.querySelector<HTMLButtonElement>(menuItems)?.focus({preventScroll:true});
    onToggle?.(event);
  }} onKeyDown={event=>{
    onKeyDown?.(event);
    event.stopPropagation();
    if(event.defaultPrevented)return;
    const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(menuItems));
    const index=items.indexOf(document.activeElement as HTMLButtonElement);
    let next:number;
    switch(event.key){
      case 'ArrowDown':case 'ArrowRight':next=(index+1)%items.length;break;
      case 'ArrowUp':case 'ArrowLeft':next=(index-1+items.length)%items.length;break;
      case 'Home':next=0;break;
      case 'End':next=items.length-1;break;
      case 'Tab':event.currentTarget.hidePopover();return;
      default:return;
    }
    event.preventDefault();
    items[next]?.focus({preventScroll:true});
  }}/>;
}

export function MenuGroup({label,inline=false,children}:{label:string;inline?:boolean;children:ReactNode}){
  const id=useId();
  return <div role="group" aria-labelledby={id} className="ds-menu-group">
    <div id={id} className="ds-menu-label">{label}</div>
    <div className={inline?'ds-menu-options ds-menu-options--inline':'ds-menu-options'}>{children}</div>
  </div>;
}
