import type {ImagePixels} from './artwork-color';
import {createT,type Translator} from './i18n';
import {hoops,object,validProject,type Point,type Project,type StitchObject} from './project';
import {nearestBrother,threadReference,type Thread} from './threads';
export type PixelGrid={columns:number;rows:number;cells:number[];palette:{color:string;thread?:Thread}[]};
const distance=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+(v-b[i])**2,0);
const hex=(p:number[])=>'#'+p.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
/** Nearest-neighbour sampling and deterministic nearest-colour quantisation, no
 * dithering: one solid colour per cell, transparent pixels remain empty. */
export function pixelGrid(image:ImagePixels,columns:number,rows:number,colours:number,brother=false):PixelGrid{
  if(![columns,rows,colours].every(Number.isInteger)||columns<1||rows<1||columns>96||rows>96||colours<1||colours>32||image.width<1||image.height<1||image.data.length!==image.width*image.height*4)throw new Error('Invalid pixel grid settings.');
  const pixels=Array.from({length:columns*rows},(_,i)=>{
    const x=Math.min(image.width-1,Math.floor((i%columns+.5)*image.width/columns)),y=Math.min(image.height-1,Math.floor((Math.floor(i/columns)+.5)*image.height/rows)),n=(y*image.width+x)*4;
    return image.data[n+3]<128?null:[image.data[n],image.data[n+1],image.data[n+2]];
  }),usable=pixels.filter((p):p is number[]=>!!p);
  if(!usable.length)throw new Error('This image is entirely transparent.');
  const counts=new Map<string,{p:number[];n:number}>();for(const p of usable){const key=p.join(','),v=counts.get(key);if(v)v.n++;else counts.set(key,{p,n:1});}
  const samples=[...counts.values()].sort((a,b)=>b.n-a.n),centres=[samples[0].p];
  while(centres.length<Math.min(colours,samples.length)){
    let best=samples[0],score=-1;for(const v of samples){const d=Math.min(...centres.map(c=>distance(v.p,c)))*Math.sqrt(v.n);if(d>score){score=d;best=v;}}centres.push(best.p);
  }
  const nearest=(p:number[])=>centres.reduce((best,c,i)=>distance(p,c)<distance(p,centres[best])?i:best,0);
  for(let step=0;step<8;step++){const sums=centres.map(()=>[0,0,0,0]);for(const v of samples){const sum=sums[nearest(v.p)];for(let k=0;k<3;k++)sum[k]+=v.p[k]*v.n;sum[3]+=v.n;}sums.forEach((s,i)=>{if(s[3])centres[i]=s.slice(0,3).map(n=>n/s[3]);});}
  const palette:PixelGrid['palette']=[],remap=centres.map(c=>{const color=hex(c),thread=brother?nearestBrother(color):undefined,entry=thread?{color:thread.color,thread:threadReference(thread)}:{color},at=palette.findIndex(p=>p.color===entry.color);if(at>=0)return at;palette.push(entry);return palette.length-1;});
  return {columns,rows,palette,cells:pixels.map(p=>p?remap[nearest(p)]:-1)};
}
/** Cancel shared cell edges, then walk clockwise boundaries. Right turns keep
 * diagonal-only neighbours in separate rings; holes keep opposite winding. */
export function cellRings(grid:PixelGrid,colour:number,size:number,origin:Point):Point[][]{
  const {columns:w,rows:h,cells}=grid,edges=new Map<string,Point[]>(),at=(x:number,y:number)=>x>=0&&y>=0&&x<w&&y<h&&cells[y*w+x]===colour;
  const edge=(a:Point,b:Point)=>{const key=a.join(',');edges.set(key,[...(edges.get(key)??[]),b]);};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(at(x,y)){
    if(!at(x,y-1))edge([x,y],[x+1,y]);if(!at(x+1,y))edge([x+1,y],[x+1,y+1]);if(!at(x,y+1))edge([x+1,y+1],[x,y+1]);if(!at(x-1,y))edge([x,y+1],[x,y]);
  }
  const rings:Point[][]=[];
  while(edges.size){const first=edges.keys().next().value!,ring:Point[]=[];let key=first,previous:Point|null=null;
    do{const p=key.split(',').map(Number) as Point,options=edges.get(key)!;ring.push(p);let index=0;
      if(previous&&options.length>1){const dx=p[0]-previous[0],dy=p[1]-previous[1];index=options.findIndex(q=>dx*(q[1]-p[1])-dy*(q[0]-p[0])>0);if(index<0)index=0;}
      const next=options.splice(index,1)[0];if(!options.length)edges.delete(key);previous=p;key=next.join(',');
    }while(key!==first);
    const simple=ring.filter((p,i)=>{const a=ring[(i+ring.length-1)%ring.length],b=ring[(i+1)%ring.length];return (p[0]-a[0])*(b[1]-p[1])!==(p[1]-a[1])*(b[0]-p[0]);});
    if(simple.length>=3)rings.push(simple.map(([x,y])=>[origin[0]+x*size,origin[1]+y*size]));
  }
  return rings;
}
export function crossObjects(grid:PixelGrid,size:number,origin:Point,t:Translator=createT('en')):StitchObject[]{
  if(!Number.isFinite(size)||size<1||size>20||Math.abs(size*2-Math.round(size*2))>1e-7||grid.cells.length!==grid.columns*grid.rows||grid.cells.some(c=>!Number.isInteger(c)||c< -1||c>=grid.palette.length))throw new Error('Invalid pixel grid settings.');
  return grid.palette.flatMap((p,i)=>{const rings=cellRings(grid,i,size,origin);return rings.length?[{...object(t('Cross stitch colour {v0}',{v0:i+1}),rings,'cross',p.color),thread:p.thread,crossStyle:'cross' as const,crossSize:size,threadCount:2,coverage:100,angle:0,underlay:'none' as const,pullCompensation:0}]:[];});
}
export function addPixelCross(p:Project,grid:PixelGrid,size:number,t:Translator=createT('en')):Project{
  const h=hoops[p.hoop],width=grid.columns*size,height=grid.rows*size;
  if(width>h.width||height>h.height)throw new Error('The pixel grid exceeds the hoop. Reduce the grid or cell size.');
  const objects=crossObjects(grid,size,[(h.width-width)/2,(h.height-height)/2],t),next={...p,objects:[...p.objects,...objects]};
  if(!objects.length)throw new Error('Paint at least one cell.');
  if(!validProject(next))throw new Error('The result has too many points or objects for one design.');return next;
}
