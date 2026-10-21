import {createT,TranslationError,type Translator} from './i18n';
import {object, type Artwork, type Point, type StitchObject} from './project';

/** Small flat-art tracer: quantise colour, find connected components and trace
 * pixel boundaries, preserving holes. No image is uploaded to the server. */
export async function traceArtwork(art: Artwork, colours: number, ignoreBackground: boolean,t:Translator=createT('en')): Promise<StitchObject[]> {
  const image = new Image(); image.src = art.src; await image.decode();
  const factor=80/Math.max(image.naturalWidth, image.naturalHeight);
  const w=Math.max(2, Math.round(image.naturalWidth*factor)), h=Math.max(2,Math.round(image.naturalHeight*factor));
  const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
  const ctx=canvas.getContext('2d', {willReadFrequently:true})!;
  ctx.drawImage(image,0,0,w,h); const rgba=ctx.getImageData(0,0,w,h).data;
  const pixels=Array.from({length:w*h}, (_,i)=>[rgba[i*4],rgba[i*4+1],rgba[i*4+2]]);
  const distance=(a:number[],b:number[])=>a.reduce((d,v,i)=>d+(v-b[i])**2,0);
  const usable=pixels.filter((_,i)=>rgba[i*4+3]>100);
  if (!usable.length) throw new TranslationError(t,"This image is entirely transparent.");
  const centres=[usable[0]];
  for(let k=1;k<colours;k++) centres.push(usable.reduce((best,p)=>Math.min(...centres.map(c=>distance(p,c)))>Math.min(...centres.map(c=>distance(best,c)))?p:best,usable[0]));
  const nearest=(p:number[])=>centres.reduce((best,c,i)=>distance(p,c)<distance(p,centres[best])?i:best,0);
  for(let step=0;step<7;step++) {
    const sums=centres.map(()=>[0,0,0,0]);
    for(const p of usable){const sum=sums[nearest(p)];for(let i=0;i<3;i++)sum[i]+=p[i];sum[3]++;}
    sums.forEach((s,i)=>{if(s[3])centres[i]=s.slice(0,3).map(n=>n/s[3]);});
  }
  const labels=pixels.map((p,i)=>rgba[i*4+3]>100?nearest(p):-1);
  const border=centres.map(()=>0);
  labels.forEach((l,i)=>{if(l>=0 && (i<w||i>=w*(h-1)||i%w===0||i%w===w-1))border[l]++;});
  const bg=border.indexOf(Math.max(...border));
  const seen=new Uint8Array(w*h), result:StitchObject[]=[];
  for(let start=0;start<labels.length;start++) {
    const label=labels[start];if(seen[start]||label<0||(ignoreBackground&&label===bg))continue;
    const queue=[start], component=new Set<number>(); seen[start]=1;
    for(let head=0;head<queue.length;head++) {
      const i=queue[head]; component.add(i);
      for(const n of [i%w>0?i-1:-1,i%w<w-1?i+1:-1,i>=w?i-w:-1,i<w*(h-1)?i+w:-1]) {
        if(n>=0&&!seen[n]&&labels[n]===label){seen[n]=1;queue.push(n);}
      }
    }
    if(component.size<5)continue;
    const edges=new Map<string,Point[]>();
    const edge=(a:Point,b:Point)=>{const key=a.join(',');edges.set(key,[...(edges.get(key)||[]),b]);};
    for(const i of component) {
      const x=i%w,y=Math.floor(i/w);
      if(y===0||!component.has(i-w))edge([x,y],[x+1,y]);
      if(x===w-1||!component.has(i+1))edge([x+1,y],[x+1,y+1]);
      if(y===h-1||!component.has(i+w))edge([x+1,y+1],[x,y+1]);
      if(x===0||!component.has(i-1))edge([x,y+1],[x,y]);
    }
    const rings:Point[][]=[];
    while(edges.size) {
      const first=edges.keys().next().value!; let key=first; const ring:Point[]=[];
      let budget=w*h*4;
      do {
        const p=key.split(',').map(Number) as Point;ring.push(p);
        const options=edges.get(key);if(!options?.length)break;
        const next=options.shift()!;if(!options.length)edges.delete(key);key=next.join(',');
      } while(key!==first&&--budget>0);
      if(key!==first||ring.length<3)continue;
      const simplified=ring.filter((p,i)=>{const a=ring[(i+ring.length-1)%ring.length],b=ring[(i+1)%ring.length];return (p[0]-a[0])*(b[1]-p[1])!==(p[1]-a[1])*(b[0]-p[0]);});
      if(simplified.length>=3)rings.push(simplified.map(([x,y])=>[art.x+x/w*art.width,art.y+y/h*art.height]));
    }
    if(rings.length){const hex='#'+centres[label].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');result.push(object(t("Traced region {v0}",{v0:result.length+1}),rings,'fill',hex));}
    if(result.length>80)throw new TranslationError(t,"This artwork has too many small regions. Try fewer colours or simpler artwork.");
  }
  if(!result.length)throw new TranslationError(t,"No regions found. Try keeping the background or using simpler artwork.");
  if(result.reduce((n,o)=>n+o.rings.reduce((m,r)=>m+r.length,0),0)>12000)throw new TranslationError(t,"This trace is too complex. Try fewer colours.");
  return result.sort((a,b)=>a.color.localeCompare(b.color));
}
