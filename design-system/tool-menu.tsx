'use client';
import {MenuItem,ToolButton} from './button';
import {Popover,ToolbarDivider} from './surfaces';
import {Icon} from './icon';
import {useRef} from 'react';

export function ToolGroupButton<T extends string>({id,label,groupLabel,title,icon,active,selected,options,divider=false,onActivate,onSelect}:{
  id:string;label:string;groupLabel:string;title:string;icon:string;active:boolean;selected:T;
  options:{id:T;icon:string;label:string;shortcut?:string;title?:string}[];divider?:boolean;
  onActivate:()=>void;onSelect:(id:T)=>void;
}) {
  const popover=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null);
  function close(){if(popover.current?.matches(':popover-open'))popover.current.hidePopover();}
  return <span className="tool-slot">
    {divider&&<ToolbarDivider/>}
    <ToolButton variant="ghost" size="xl" ref={button} type="button" className={`tool ${active?'active':''}`} style={{anchorName:`--${id}`}} aria-label={groupLabel} aria-pressed={active} title={title} popoverTarget={id} popoverTargetAction="show" onClick={onActivate}>
      <Icon name={icon}/><span>{label}</span><i className="tool-group-caret" aria-hidden="true"/>
    </ToolButton>
    <Popover ref={popover} id={id} className="tool-group-flyout" style={{positionAnchor:`--${id}`}} popover="auto" role="group" aria-label={groupLabel} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();button.current?.focus({preventScroll:true});}}}>
      {options.map(option=><MenuItem variant="ghost" key={option.id} type="button" aria-pressed={selected===option.id} title={option.title??option.label} onClick={()=>{onSelect(option.id);close();button.current?.focus({preventScroll:true});}}>
        <Icon name={option.icon}/><span>{option.label}</span>{option.shortcut&&<kbd>{option.shortcut}</kbd>}
      </MenuItem>)}
    </Popover>
  </span>;
}
