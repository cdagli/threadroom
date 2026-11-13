import {drawFabricTexture} from './thread';
import {drawRealisticThreads} from './thread-renderer';
import {visibleCommands} from './layers';
import type {Command,Compiled,Project,RefImage} from './project';
export function imageSize(compiled:{commands:readonly Command[]},pxPerMm=300/25.4){
  let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
  for(const c of compiled.commands)if(c.type==='stitch')for(const [a,b] of [[c.fromX,c.fromY],[c.x,c.y]]){if(!Number.isFinite(a)||!Number.isFinite(b))continue;x=Math.min(x,a);y=Math.min(y,b);right=Math.max(right,a);bottom=Math.max(bottom,b);}
  if(!Number.isFinite(x))throw Error('No stitches');
  const width=right-x+10,height=bottom-y+10,scale=Math.min(Number.isFinite(pxPerMm)&&pxPerMm>0?pxPerMm:300/25.4,8000/width,8000/height);
  return {x:x-5,y:y-5,width,height,scale,pixelWidth:Math.min(8000,Math.max(1,Math.ceil(width*scale))),pixelHeight:Math.min(8000,Math.max(1,Math.ceil(height*scale)))};
}
// Hidden objects are left out, as in the thread view; jumps never extend the crop.
export const exportCommands=(compiled:Compiled,project:Project)=>visibleCommands(compiled.commands,project.objects).commands;
// Visible reference images paint between fabric and threads with their opacity and rotation, like the thread view.
export async function exportImage(compiled:Compiled,project:Project,pxPerMm:number,transparent:boolean,includeImages=false):Promise<Blob>{
  const commands=exportCommands(compiled,project),b=imageSize({commands},pxPerMm),images:[RefImage,HTMLImageElement][]=[];
  if(includeImages)for(const i of project.images??[])if(!i.hidden){const img=new Image();img.src=i.src;await img.decode();images.push([i,img]);}
  const canvas=document.createElement('canvas');canvas.width=b.pixelWidth;canvas.height=b.pixelHeight;
  const c=canvas.getContext('2d');if(!c)throw Error('Canvas');
  try{
    c.setTransform(b.scale,0,0,b.scale,-b.x*b.scale,-b.y*b.scale);
    const view:[number,number,number,number]=[b.x,b.y,b.x+b.width,b.y+b.height];
    if(!transparent)drawFabricTexture(c,project.fabric,b.scale,view);
    for(const [i,img] of images){c.save();c.globalAlpha=i.opacity;c.translate(i.x+i.width/2,i.y+i.height/2);if(i.rotation)c.rotate(i.rotation*Math.PI/180);c.drawImage(img,-i.width/2,-i.height/2,i.width,i.height);c.restore();}
    drawRealisticThreads(c,commands,compiled.threads.map(t=>t.color),0,commands.length,b.scale,view);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG')),'image/png'));
  }finally{canvas.width=canvas.height=0;}
}
export const imageFilename=(name:string)=>(name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').trim()||'threadroom')+'.png';
