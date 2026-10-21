import {createT,TranslationError,type Translator} from './i18n';
import {type Artwork, type Point} from './project';

export type ImagePixels={width:number;height:number;data:Uint8ClampedArray};
// Coordinates are millimetres; average a clipped 3 × 3 neighbourhood in the
// original image. Alpha never blends RGB with the canvas or reference opacity.
export function sampleArtwork(pixels:ImagePixels,art:Pick<Artwork,'x'|'y'|'width'|'height'>,p:Point):string|null {
  const {width,height,data}=pixels;
  if(![...p,art.x,art.y,art.width,art.height].every(Number.isFinite)||art.width<=0||art.height<=0||width<1||height<1||data.length<width*height*4)return null;
  const u=(p[0]-art.x)/art.width,v=(p[1]-art.y)/art.height;
  if(u<0||v<0||u>1||v>1)return null;
  const x=Math.min(width-1,Math.floor(u*width)),y=Math.min(height-1,Math.floor(v*height)),sum=[0,0,0];let count=0;
  for(let py=Math.max(0,y-1);py<=Math.min(height-1,y+1);py++)for(let px=Math.max(0,x-1);px<=Math.min(width-1,x+1);px++){
    const i=(py*width+px)*4;if(!data[i+3])continue;
    for(let c=0;c<3;c++)sum[c]+=data[i+c];count++;
  }
  return count?'#'+sum.map(c=>Math.round(c/count).toString(16).padStart(2,'0')).join(''):null;
}

// Retain only the current source, including its in-flight decode; changing
// artwork releases the previous natural-resolution buffer.
let cached:{src:string;promise:Promise<ImagePixels>}|undefined;
export function artworkPixels(src:string,t:Translator=createT('en')):Promise<ImagePixels> {
  if(cached?.src===src)return cached.promise;
  const promise=(async()=>{
    const image=new Image();image.src=src;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new TranslationError(t,"Image colours are unavailable in this browser.");
    ctx.drawImage(image,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height);
  })();
  cached={src,promise};void promise.catch(()=>{if(cached?.promise===promise)cached=undefined;});return promise;
}
