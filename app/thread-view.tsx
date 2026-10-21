'use client';
import {memo, useEffect, useRef, useState, type RefObject} from 'react';
import {drawFabric, drawThreads, threadShades, threadStyle} from '@/lib/thread';
import type {Artwork, Compiled, Fabric} from '@/lib/project';

type Props={canvasSize:{width:number;height:number};compiled:Compiled;count:number;fabric:Fabric;hoop:{width:number;height:number};view:[number,number,number,number];svg:RefObject<SVGSVGElement|null>;dimmed:boolean;artwork?:Artwork;imageOpacity:number};
type Drawn={key:string;scene:string;compiled:Compiled|null;count:number;s:number;ox:number;oy:number;ms:number};
// Canvas under the transparent SVG overlay (Studio passes canvasSize on resize). Playback only appends stitches,
// so frames draw just the new ones. While panning or zooming a slow design, the last full render is
// scaled into place and redrawn sharp 120 ms after the view settles.
// The reference image is painted between the fabric and the threads, so stitches always cover it.
// data-render-ms: last full redraw; data-frame-ms: last frame of any kind.
export default memo(function ThreadView(props:Props){
  const canvas=useRef<HTMLCanvasElement>(null),backup=useRef<HTMLCanvasElement|null>(null),latest=useRef(props),frame=useRef(0),settle=useRef(0);
  const image=useRef<{src:string;img:HTMLImageElement;ready:boolean}|null>(null),[,setLoaded]=useState(0);
  const drawn=useRef<Drawn>({key:'',scene:'',compiled:null,count:0,s:1,ox:0,oy:0,ms:0});
  latest.current=props;
  useEffect(()=>{
    const paint=(full=false)=>{
      frame.current=0;const el=canvas.current,svg=latest.current.svg.current;if(!el||!svg)return;
      const {compiled,count,fabric,hoop,artwork,imageOpacity,view:[vx,vy,vw,vh]}=latest.current,box=svg.getBoundingClientRect(),wrap=el.parentElement!.getBoundingClientRect(),dpr=Math.min(3,window.devicePixelRatio||1);
      const w=Math.round(box.width*dpr),h=Math.round(box.height*dpr);if(!w||!h)return;
      Object.assign(el.style,{left:`${box.left-wrap.left}px`,top:`${box.top-wrap.top}px`,width:`${box.width}px`,height:`${box.height}px`});
      const scale=Math.min(box.width/vw,box.height/vh),ox=(box.width-vw*scale)/2-vx*scale,oy=(box.height-vh*scale)/2-vy*scale,px=scale*dpr;
      const cull:[number,number,number,number]=[-ox/scale,-oy/scale,(box.width-ox)/scale,(box.height-oy)/scale];
      const art=artwork&&image.current?.src===artwork.src&&image.current.ready?artwork:undefined;
      const scene=[w,h,dpr,fabric,hoop.width,hoop.height,art?[art.src.length,art.x,art.y,art.width,art.height,imageOpacity].join(' '):''].join(),key=[scene,vx,vy,vw,vh].join(),d=drawn.current,start=performance.now(),c=el.getContext('2d')!;
      const shades=compiled.threads.map(t=>threadShades(t.color)),style=threadStyle(px),done=()=>{el.dataset.frameMs=(performance.now()-start).toFixed(1);};
      if(d.key===key&&d.compiled===compiled&&count>=d.count){if(count===d.count)return;c.setTransform(px,0,0,px,ox*dpr,oy*dpr);drawThreads(c,compiled.commands,shades,d.count,count,style,cull);d.count=count;d.ms=Infinity;done();return;}
      if(!full&&d.scene===scene&&d.compiled===compiled&&d.count===count&&d.ms>12&&d.ms!==Infinity&&backup.current){
        const r=px/d.s;c.setTransform(1,0,0,1,0,0);c.fillStyle=getComputedStyle(el).getPropertyValue('--bg-workspace').trim();c.fillRect(0,0,w,h);c.setTransform(r,0,0,r,ox*dpr-d.ox*r,oy*dpr-d.oy*r);c.drawImage(backup.current,0,0);
        clearTimeout(settle.current);settle.current=window.setTimeout(()=>paint(true),120);done();return;
      }
      clearTimeout(settle.current);
      if(el.width!==w||el.height!==h){el.width=w;el.height=h;}
      c.setTransform(px,0,0,px,ox*dpr,oy*dpr);drawFabric(c,fabric,hoop,px,cull);if(art){c.globalAlpha=imageOpacity;c.drawImage(image.current!.img,art.x,art.y,art.width,art.height);c.globalAlpha=1;}drawThreads(c,compiled.commands,shades,0,count,style,cull);
      const b=backup.current||(backup.current=document.createElement('canvas'));if(b.width!==w||b.height!==h){b.width=w;b.height=h;}
      const ms=performance.now()-start;
      if(ms>12){const bc=b.getContext('2d')!;bc.clearRect(0,0,w,h);bc.drawImage(el,0,0);}
      el.dataset.renderMs=ms.toFixed(1);done();drawn.current={key,scene,compiled,count,s:px,ox:ox*dpr,oy:oy*dpr,ms};
    };
    if(!frame.current)frame.current=requestAnimationFrame(()=>paint());
  });
  useEffect(()=>{
    const src=props.artwork?.src;if(!src||image.current?.src===src)return;
    const img=new Image(),entry={src,img,ready:false};image.current=entry;img.onload=()=>{entry.ready=true;setLoaded(n=>n+1);};img.src=src;
  },[props.artwork?.src]);
  useEffect(()=>()=>{cancelAnimationFrame(frame.current);clearTimeout(settle.current);frame.current=0;},[]);
  return <canvas ref={canvas} className="thread-canvas" style={{opacity:props.dimmed?.4:1}} aria-hidden="true"/>;
});
