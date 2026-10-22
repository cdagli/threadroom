import type {Point, Project, RefImage} from './project';
import type {Matrix, Rect} from './editing';

// Reference images (Ember's image panel): drawn bottom-up under the stitches, never sewn.
// x/y/width/height is the unrotated box in mm; rotation (degrees, clockwise) turns it about its centre.
export const imageLimits={count:10,size:[.5,2000] as const};
const imageSrc=/^data:image\/(png|jpeg|webp|svg\+xml);/i;
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
export function validImage(i:unknown):i is RefImage{
  if(!i||typeof i!=='object')return false;
  const m=i as RefImage;
  return typeof m.id==='string'&&!!m.id&&typeof m.src==='string'&&imageSrc.test(m.src)&&typeof m.name==='string'&&[m.x,m.y].every(n=>finite(n)&&Math.abs(n)<=1000)
    &&[m.width,m.height].every(n=>finite(n)&&n>0&&n<=imageLimits.size[1])&&finite(m.opacity)&&m.opacity>=0&&m.opacity<=1
    &&(m.rotation===undefined||finite(m.rotation)&&Math.abs(m.rotation)<=360)&&[m.hidden,m.locked].every(v=>v===undefined||typeof v==='boolean');
}
export function validImages(v:unknown):boolean{
  return Array.isArray(v)&&v.length<=imageLimits.count&&Array.from(v).every(validImage)&&new Set(v.map(i=>(i as RefImage).id)).size===v.length;
}
// Old projects kept one `artwork` (opacity was a view setting): it becomes images[0].
export function migrateImages(p:Project):Project{
  if(!p.artwork)return p;
  const {artwork,...rest}=p,{src,name,x,y,width,height}=artwork;
  return p.images?.length?rest:{...rest,images:[{id:'image-1',src,name,x,y,width,height,opacity:.5}]};
}
export const imageCentre=(i:RefImage):Point=>[i.x+i.width/2,i.y+i.height/2];
// (u, v) in 0..1 across the unrotated image to millimetres, and back.
export function imageToWorld(i:Pick<RefImage,'x'|'y'|'width'|'height'|'rotation'>,[u,v]:Point):Point{
  const cx=i.x+i.width/2,cy=i.y+i.height/2,dx=(u-.5)*i.width,dy=(v-.5)*i.height,r=(i.rotation??0)*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
  return [cx+dx*c-dy*s,cy+dx*s+dy*c];
}
// A canvas point in the image's unrotated frame (mm), for pixel sampling and hit tests.
export function toImageFrame(i:Pick<RefImage,'x'|'y'|'width'|'height'|'rotation'>,[x,y]:Point):Point{
  const cx=i.x+i.width/2,cy=i.y+i.height/2,r=-(i.rotation??0)*Math.PI/180,c=Math.cos(r),s=Math.sin(r),dx=x-cx,dy=y-cy;
  return [cx+dx*c-dy*s,cy+dx*s+dy*c];
}
export function insideImage(i:RefImage,p:Point){const [x,y]=toImageFrame(i,p);return x>=i.x&&y>=i.y&&x<=i.x+i.width&&y<=i.y+i.height;}
export function imageBounds(i:RefImage):Rect{
  const pts=([[0,0],[1,0],[1,1],[0,1]] as Point[]).map(p=>imageToWorld(i,p)),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);
  return {x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};
}
// Applies an editor matrix: the centre follows it, the image's own axes give the new size and angle
// (images can't skew or mirror). Returns null for a rejected gesture.
export function transformImage(p:Project,id:string,m:Matrix):Project|null{
  const images=p.images??[],i=images.find(x=>x.id===id);if(!i||!m.every(Number.isFinite))return null;
  if(m.every((n,k)=>Math.abs(n-[1,0,0,1,0,0][k])<1e-10))return p;
  const r=(i.rotation??0)*Math.PI/180,ax:Point=[Math.cos(r)*i.width,Math.sin(r)*i.width],ay:Point=[-Math.sin(r)*i.height,Math.cos(r)*i.height];
  const lin=(v:Point):Point=>[m[0]*v[0]+m[2]*v[1],m[1]*v[0]+m[3]*v[1]],X=lin(ax),Y=lin(ay),o=imageCentre(i),c:Point=[m[0]*o[0]+m[2]*o[1]+m[4],m[1]*o[0]+m[3]*o[1]+m[5]];
  const width=Math.hypot(...X),height=Math.hypot(...Y),rotation=Math.round(((Math.atan2(X[1],X[0])*180/Math.PI)%360+540)%360*1e6)/1e6-180;
  if(!(width>=imageLimits.size[0]&&height>=imageLimits.size[0]&&width<=imageLimits.size[1]&&height<=imageLimits.size[1])||!c.every(Number.isFinite))return null;
  const next:RefImage={...i,x:c[0]-width/2,y:c[1]-height/2,width,height};delete next.rotation;if(Math.abs(rotation)>1e-6)next.rotation=rotation;
  if(Math.abs(next.x)>1000||Math.abs(next.y)>1000)return null;
  return {...p,images:images.map(x=>x.id===id?next:x)};
}
export function updateImage(p:Project,id:string,patch:Partial<RefImage>):Project{
  return {...p,images:(p.images??[]).map(i=>{if(i.id!==id)return i;const next={...i,...patch};for(const k of Object.keys(patch) as (keyof RefImage)[])if(patch[k]===undefined)delete next[k];return next;})};
}
// Images are stored bottom-up; delta +1 draws the image one step later (further up).
export function moveImage(p:Project,id:string,delta:number):Project{
  const images=[...(p.images??[])],from=images.findIndex(i=>i.id===id),to=Math.max(0,Math.min(images.length-1,from+delta));
  if(from<0||from===to)return p;images.splice(to,0,images.splice(from,1)[0]);return {...p,images};
}
export const removeImage=(p:Project,id:string):Project=>({...p,images:(p.images??[]).filter(i=>i.id!==id)});
// Tracing, the eyedropper and click-to-stitch use the selected image, otherwise the top visible one.
export const activeImage=(p:Project,selected:string|null)=>p.images?.find(i=>i.id===selected)??[...(p.images??[])].reverse().find(i=>!i.hidden);
