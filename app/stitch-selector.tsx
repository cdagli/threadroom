'use client';
import {useId, useRef, useState, type KeyboardEvent} from 'react';
import {kindHints, kindNames, type Kind} from '@/lib/project';
import {type StitchGroup} from '@/lib/curves';

const samples: Record<Kind,string> = {
  running:'M3 14h7m3 0h7m3 0h7m3 0h8',
  bean:'M3 12h9m2 0h10m2 0h10m-33 4h9m2 0h10m2 0h10',
  backstitch:'M3 13h36M5 10h8m-2 6h8m-2-6h8m-2 6h8m-2-6h8',
  satin:'M3 22 5 6 7 22 9 6 11 22 13 6 15 22 17 6 19 22 21 6 23 22 25 6 27 22 29 6 31 22 33 6 35 22 37 6 39 22',
  zigzag:'M3 21 9 7 15 21 21 7 27 21 33 7 39 21',
  'e-stitch':'M3 21H39M5 21V7m8 14V7m8 14V7m8 14V7m8 14V7',
  fill:'M3 5h10m2 0h12m2 0h10M3 9h6m2 0h12m2 0h14M3 13h10m2 0h12m2 0h10M3 17h6m2 0h12m2 0h14M3 21h10m2 0h12m2 0h10',
  cross:'m4 5 8 8m0-8-8 8m12-8 8 8m0-8-8 8m12-8 8 8m0-8-8 8m-32 3 8 8m0-8-8 8m12-8 8 8m0-8-8 8m12-8 8 8m0-8-8 8',
  underlay:'M3 14h8m4 0h8m4 0h12',
  manual:'M4 21 13 5 23 18 38 8M4 21h0M13 5h0M23 18h0M38 8h0',
};
export function StitchIcon({kind}: {kind:Kind}) {
  return <svg className={`stitch-icon stitch-icon-${kind}`} width="42" height="28" viewBox="0 0 42 28" fill="none" stroke="currentColor" strokeWidth={kind==='bean'?1.8:1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={samples[kind]}/>{kind==='manual'&&[[4,21],[13,5],[23,18],[38,8]].map(([x,y])=><circle key={x} cx={x} cy={y} r="2" fill="currentColor" stroke="none"/>)}</svg>;
}

export default function StitchSelector({value, groups, onChange}: {value:Kind;groups:StitchGroup[];onChange:(value:Kind)=>void}) {
  const id=useId(), button=useRef<HTMLButtonElement>(null), menu=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false),[position,setPosition]=useState({left:0,top:0,width:260,maxHeight:400});
  const currentOnly=!groups.some(g=>g.kinds.includes(value));
  const shown=currentOnly?[{label:'Current',kinds:[value]},...groups]:groups;
  function place(){
    const rect=button.current!.getBoundingClientRect(),width=Math.min(310,window.innerWidth-24);
    const below=window.innerHeight-rect.bottom-12,above=rect.top-12;
    const height=Math.min(430,Math.max(below,above));
    setPosition({left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),top:below>=Math.min(430,above)?rect.bottom+5:Math.max(12,rect.top-height-5),width,maxHeight:height});
  }
  function close(){menu.current?.hidePopover();button.current?.focus();}
  function select(kind:Kind){close();onChange(kind);}
  function navigate(e:KeyboardEvent<HTMLDivElement>){
    const options=Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const index=options.indexOf(document.activeElement as HTMLButtonElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
      e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?options.length-1:(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;
      options[next]?.focus();
    } else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
    else if(e.key==='Tab'){menu.current?.hidePopover();}
    else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&e.key!==' '){
      const ordered=[...options.slice(index+1),...options.slice(0,index+1)];
      ordered.find(option=>option.dataset.name?.toLowerCase().startsWith(e.key.toLowerCase()))?.focus();
    }
  }
  return <div className="stitch-selector">
    <span id={`${id}-label`} className="stitch-label">Stitch style</span>
    <button ref={button} type="button" className="stitch-selector-button" aria-label={`Stitch style: ${kindNames[value]}`} aria-haspopup="menu" aria-expanded={open} aria-controls={id} popoverTarget={id} onClick={place} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();place();menu.current?.showPopover();}}}><StitchIcon kind={value}/><span>{kindNames[value]}</span><span className="stitch-chevron" aria-hidden="true">⌄</span></button>
    <div ref={menu} id={id} className="stitch-menu" popover="auto" role="menu" aria-labelledby={`${id}-label`} style={position} onKeyDown={navigate} onToggle={e=>{const shown=e.currentTarget.matches(':popover-open');setOpen(shown);if(shown)requestAnimationFrame(()=>menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());}}>
      {shown.map(group=><div key={group.label} role="group" aria-label={group.label}><h3 className="stitch-group-heading">{group.label}</h3>{group.kinds.map(kind=><button key={kind} type="button" role="menuitemradio" data-name={kindNames[kind]} aria-checked={kind===value} title={kindHints[kind]} onClick={()=>{if(kind===value)close();else select(kind);}}><StitchIcon kind={kind}/><span><strong>{kindNames[kind]}{currentOnly&&kind===value?' · Current':''}</strong><small>{currentOnly&&kind===value?'Saved style · choose a line style to change it':kindHints[kind]}</small></span><span className="stitch-check" aria-hidden="true">{kind===value?'✓':''}</span></button>)}</div>)}
    </div>
  </div>;
}
