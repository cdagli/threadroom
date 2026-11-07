import {exportSVG} from './svg-export';
import {bounds,hoops,type Project} from './project';

export const maxThumbnailLength=400_000;

// A compact preview: the editable SVG without metadata, rounded to 0.1 mm and cropped to the design.
export function projectThumbnail(project:Project):string|null{
  const visible=project.objects.filter(o=>!o.layoutOnly&&!o.hidden);
  if(!visible.length)return null;
  const hoop=hoops[project.hoop]??{width:100,height:100};
  const box=bounds(visible),pad=Math.max(2,Math.max(box.width,box.height)*.06);
  const x=Math.max(0,box.x-pad),y=Math.max(0,box.y-pad);
  const width=Math.max(10,Math.min(hoop.width,box.x+box.width+pad)-x),height=Math.max(10,Math.min(hoop.height,box.y+box.height+pad)-y);
  const svg=exportSVG({...project,objects:visible})
    .replace(/^<\?xml[^>]*>\s*/,'')
    .replace(/\s(?:id|inkscape:[\w-]+|data-threadroom-[\w-]+|xmlns:inkscape)="[^"]*"/g,'')
    .replace(/<title>[\s\S]*?<\/title>\s*/g,'')
    .replace(/-?\d+\.\d{2,}/g,n=>String(Math.round(Number(n)*10)/10))
    .replace(/\swidth="[^"]*mm"\sheight="[^"]*mm"\sviewBox="[^"]*"/,` viewBox="${round(x)} ${round(y)} ${round(width)} ${round(height)}" preserveAspectRatio="xMidYMid meet"`)
    .replace(/>\s+</g,'><');
  return svg.length>maxThumbnailLength?null:svg;
}
const round=(n:number)=>Math.round(n*10)/10;
