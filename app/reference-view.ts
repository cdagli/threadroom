import type {Pixels} from '@/lib/click-to-stitch';
import type {Project,RefImage} from '@/lib/project';
import {blockOutline,curveRing,isClosedShape} from '@/lib/curves';
import {referenceMapping} from '@/lib/reference-tools';

// The shared artwork decoder supplies the original pixels, without another image decode or fetch.
export async function referencePNG(pixels:Pixels,image:RefImage,project:Project,region:[number,number,number,number]|undefined,size:number,grid:number|undefined,objects:boolean){
  const mapping=referenceMapping(image,region,size,grid),{scale,margin,width,height,grid:step,major,region:[x0,y0,x1,y1]}=mapping;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const c=canvas.getContext('2d')!,source=document.createElement('canvas');source.width=pixels.width;source.height=pixels.height;
  source.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels.data),pixels.width,pixels.height),0,0);
  c.fillStyle='#ffffff';c.fillRect(0,0,width,height);
  c.save();c.beginPath();c.rect(margin,margin,(x1-x0)*scale,(y1-y0)*scale);c.clip();
  c.translate(margin-x0*scale,margin-y0*scale);c.scale(scale,scale);
  c.save();c.translate(image.x+image.width/2,image.y+image.height/2);c.rotate((image.rotation??0)*Math.PI/180);
  // Reference opacity is only an editor aid; show original artwork at full opacity for reading it.
  c.drawImage(source,-image.width/2,-image.height/2,image.width,image.height);c.restore();
  if(objects)for(const o of project.objects){
    if(o.hidden)continue;const rings=o.rails?[blockOutline(o.rails)]:o.curve?[curveRing(o.curve)]:o.rings;
    c.beginPath();for(const r of rings){r.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));if(o.rails||isClosedShape(o))c.closePath();}
    c.strokeStyle=o.color;c.lineWidth=1.5/scale;c.stroke();
  }
  c.restore();
  const isMajor=(v:number)=>Math.abs(v/major-Math.round(v/major))<1e-6;
  c.font='11px sans-serif';
  const line=(v:number,vertical:boolean)=>{
    const pos=margin+(v-(vertical?x0:y0))*scale;
    c.beginPath();if(vertical){c.moveTo(pos,margin);c.lineTo(pos,height-margin);}else{c.moveTo(margin,pos);c.lineTo(width-margin,pos);}
    c.strokeStyle=isMajor(v)?'#172b4d88':'#172b4d33';c.lineWidth=isMajor(v)?1:.5;c.stroke();
    if(isMajor(v)){
      c.fillStyle='#172b4d';c.textAlign=vertical?'center':'right';c.textBaseline=vertical?'top':'middle';
      c.fillText(`${Math.round(v*100)/100}`,vertical?pos:margin-5,vertical?height-margin+5:pos);
    }
  };
  for(let k=Math.ceil(x0/step);k<=Math.floor(x1/step);k++)line(k*step,true);
  for(let k=Math.ceil(y0/step);k<=Math.floor(y1/step);k++)line(k*step,false);
  c.strokeStyle='#172b4d';c.lineWidth=1;c.strokeRect(margin,margin,(x1-x0)*scale,(y1-y0)*scale);
  c.fillStyle='#172b4d';c.textAlign='left';c.textBaseline='top';c.fillText('y mm',2,4);c.textAlign='right';c.fillText('x mm',width-2,height-14);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not render reference PNG.')),'image/png'));
  return {blob,mapping};
}
