'use client';
import {memo, useEffect, useRef, useState, type RefObject} from 'react';
import {drawFabric} from '@/lib/thread';
import {drawRealisticThreads} from '@/lib/thread-renderer';
import type {Compiled, Fabric, RefImage} from '@/lib/project';

type Props={canvasSize:{width:number;height:number};compiled:Compiled;count:number;fabric:Fabric;hoop:{width:number;height:number};view:[number,number,number,number];svg:RefObject<SVGSVGElement|null>;dimmed:boolean;images:RefImage[];grid:{size:number;subdivisions:number}|null};
type Drawn={key:string;scene:string;compiled:Compiled|null;count:number;s:number;ox:number;oy:number;ms:number};
// Canvas under the transparent SVG overlay (Studio passes canvasSize on resize).
// GPU playback resolves the sewn prefix together before downsampling; appending
// already-filtered batches would change coverage at crossings. Canvas can append.
// Only the Canvas fallback scales a previous
// frame during expensive navigation. GPU frames render at the current zoom so
// the thread shading never switches from an enlarged screenshot to live material.
// Reference images are painted bottom-up between the fabric and the threads, so stitches always cover them.
// The grid and hoop centre lines are painted here too, under the threads: over them they read as flaws in the stitching.
// data-render-ms: last full redraw; data-frame-ms: last frame of any kind.
export default memo(function ThreadView(props:Props){
  const canvas=useRef<HTMLCanvasElement>(null),backup=useRef<HTMLCanvasElement|null>(null),latest=useRef(props),frame=useRef(0),settle=useRef(0);
  const decoded=useRef(new Map<string,{img:HTMLImageElement;ready:boolean}>()),[,setLoaded]=useState(0);
  const drawn=useRef<Drawn>({key:'',scene:'',compiled:null,count:0,s:1,ox:0,oy:0,ms:0});
  latest.current=props;
  useEffect(()=>{
    const paint=(full=false)=>{
      frame.current=0;const el=canvas.current,svg=latest.current.svg.current;if(!el||!svg)return;
      const {compiled,count,fabric,hoop,images,grid,view:[vx,vy,vw,vh]}=latest.current,box=svg.getBoundingClientRect(),wrap=el.parentElement!.getBoundingClientRect(),dpr=Math.min(3,window.devicePixelRatio||1);
      const w=Math.round(box.width*dpr),h=Math.round(box.height*dpr);if(!w||!h)return;
      Object.assign(el.style,{left:`${box.left-wrap.left}px`,top:`${box.top-wrap.top}px`,width:`${box.width}px`,height:`${box.height}px`});
      const scale=Math.min(box.width/vw,box.height/vh),ox=(box.width-vw*scale)/2-vx*scale,oy=(box.height-vh*scale)/2-vy*scale,px=scale*dpr;
      const cull:[number,number,number,number]=[-ox/scale,-oy/scale,(box.width-ox)/scale,(box.height-oy)/scale];
      const arts=images.filter(i=>decoded.current.get(i.src)?.ready);
      const scene=[w,h,dpr,fabric,hoop.width,hoop.height,grid?.size,grid?.subdivisions,arts.map(i=>[i.src.length,i.x,i.y,i.width,i.height,i.rotation??0,i.opacity].join(' ')).join('|')].join(),key=[scene,vx,vy,vw,vh].join(),d=drawn.current,start=performance.now(),c=el.getContext('2d')!;
      const colours=compiled.threads.map(t=>t.color),threads=(from:number)=>{el.dataset.renderer=drawRealisticThreads(c,compiled.commands,colours,from,count,px,cull);},done=()=>{el.dataset.frameMs=(performance.now()-start).toFixed(1);};
      if(d.key===key&&d.compiled===compiled&&count===d.count)return;
      if(el.dataset.renderer==='canvas2d'&&d.key===key&&d.compiled===compiled&&count>d.count){c.setTransform(px,0,0,px,ox*dpr,oy*dpr);threads(d.count);d.count=count;d.ms=Infinity;done();return;}
      if(!full&&el.dataset.renderer==='canvas2d'&&d.scene===scene&&d.compiled===compiled&&d.count===count&&d.ms>12&&d.ms!==Infinity&&backup.current){
        const r=px/d.s;c.setTransform(1,0,0,1,0,0);c.fillStyle=getComputedStyle(el).getPropertyValue('--bg-workspace').trim();c.fillRect(0,0,w,h);c.setTransform(r,0,0,r,ox*dpr-d.ox*r,oy*dpr-d.oy*r);c.drawImage(backup.current,0,0);
        clearTimeout(settle.current);settle.current=window.setTimeout(()=>paint(true),120);done();return;
      }
      clearTimeout(settle.current);
      if(el.width!==w||el.height!==h){el.width=w;el.height=h;}
      c.setTransform(px,0,0,px,ox*dpr,oy*dpr);drawFabric(c,fabric,hoop,px,cull);for(const i of arts){c.save();c.globalAlpha=i.opacity;c.translate(i.x+i.width/2,i.y+i.height/2);if(i.rotation)c.rotate(i.rotation*Math.PI/180);c.drawImage(decoded.current.get(i.src)!.img,-i.width/2,-i.height/2,i.width,i.height);c.restore();}
      if(grid){
        const theme=getComputedStyle(el),lines=(step:number,width:number,alpha:number)=>{c.globalAlpha=alpha;c.lineWidth=width;c.beginPath();for(let x=Math.max(0,Math.ceil(cull[0]/step)*step);x<=Math.min(hoop.width,cull[2]);x+=step){c.moveTo(x,0);c.lineTo(x,hoop.height);}for(let y=Math.max(0,Math.ceil(cull[1]/step)*step);y<=Math.min(hoop.height,cull[3]);y+=step){c.moveTo(0,y);c.lineTo(hoop.width,y);}c.stroke();};
        c.save();c.strokeStyle=theme.getPropertyValue('--grid').trim();
        if(grid.subdivisions>1&&grid.size/grid.subdivisions*scale>=6)lines(grid.size/grid.subdivisions,.5/scale,.5);
        lines(grid.size,.1,.65);
        c.strokeStyle=theme.getPropertyValue('--centre-cross').trim();c.globalAlpha=.55;c.lineWidth=.65/scale;c.beginPath();c.moveTo(0,hoop.height/2);c.lineTo(hoop.width,hoop.height/2);c.moveTo(hoop.width/2,0);c.lineTo(hoop.width/2,hoop.height);c.stroke();c.restore();
      }
      threads(0);
      const ms=performance.now()-start;
      if(el.dataset.renderer==='canvas2d'&&ms>12){const b=backup.current||(backup.current=document.createElement('canvas'));if(b.width!==w||b.height!==h){b.width=w;b.height=h;}const bc=b.getContext('2d')!;bc.clearRect(0,0,w,h);bc.drawImage(el,0,0);}
      el.dataset.renderMs=ms.toFixed(1);done();drawn.current={key,scene,compiled,count,s:px,ox:ox*dpr,oy:oy*dpr,ms};
    };
    if(!frame.current)frame.current=requestAnimationFrame(()=>paint());
  });
  // Decoded images are kept per source while shown; removed images release theirs.
  useEffect(()=>{
    const map=decoded.current,keep=new Set(props.images.map(i=>i.src));
    for(const src of map.keys())if(!keep.has(src))map.delete(src);
    for(const src of keep)if(!map.has(src)){const img=new Image(),entry={img,ready:false};map.set(src,entry);img.onload=()=>{entry.ready=true;setLoaded(n=>n+1);};img.src=src;}
  },[props.images]);
  useEffect(()=>()=>{cancelAnimationFrame(frame.current);clearTimeout(settle.current);frame.current=0;},[]);
  return <canvas ref={canvas} className="thread-canvas" style={{opacity:props.dimmed?.4:1}} aria-hidden="true"/>;
});
