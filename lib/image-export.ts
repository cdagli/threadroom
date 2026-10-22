import {drawFabricTexture,drawThreads,threadShades,threadStyle} from './thread';
import type {Compiled,Fabric} from './project';
export function imageSize(compiled:Compiled,pxPerMm=300/25.4){
  let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
  for(const c of compiled.commands)if(c.type==='stitch')for(const [a,b] of [[c.fromX,c.fromY],[c.x,c.y]]){if(!Number.isFinite(a)||!Number.isFinite(b))continue;x=Math.min(x,a);y=Math.min(y,b);right=Math.max(right,a);bottom=Math.max(bottom,b);}
  if(!Number.isFinite(x))throw Error('No stitches');
  const width=right-x+10,height=bottom-y+10,scale=Math.min(Number.isFinite(pxPerMm)&&pxPerMm>0?pxPerMm:300/25.4,8000/width,8000/height);
  return {x:x-5,y:y-5,width,height,scale,pixelWidth:Math.min(8000,Math.max(1,Math.ceil(width*scale))),pixelHeight:Math.min(8000,Math.max(1,Math.ceil(height*scale)))};
}
export async function exportImage(compiled:Compiled,fabric:Fabric,pxPerMm:number,transparent:boolean):Promise<Blob>{
  const b=imageSize(compiled,pxPerMm),canvas=document.createElement('canvas');canvas.width=b.pixelWidth;canvas.height=b.pixelHeight;
  const c=canvas.getContext('2d');if(!c)throw Error('Canvas');
  try{
    c.setTransform(b.scale,0,0,b.scale,-b.x*b.scale,-b.y*b.scale);
    const view:[number,number,number,number]=[b.x,b.y,b.x+b.width,b.y+b.height];
    if(!transparent)drawFabricTexture(c,fabric,b.scale,view);
    drawThreads(c,compiled.commands,compiled.threads.map(t=>threadShades(t.color)),0,compiled.commands.length,threadStyle(b.scale),view);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG')),'image/png'));
  }finally{canvas.width=canvas.height=0;}
}
export const imageFilename=(name:string)=>(name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').trim()||'threadroom')+'.png';
