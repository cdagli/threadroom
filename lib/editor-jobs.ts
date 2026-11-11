import type {Lang} from './i18n';
import type {Artwork,Command,Point,Project,RefImage,StitchObject} from './project';
import type {ImagePixels} from './artwork-color';
import type {Pixels,ClickResult} from './click-to-stitch';
import type {Density} from './density';
import type {SVGSources} from './svg-import';

export type EditorJob=
  |{kind:'trace';pixels:ImagePixels;art:Artwork;colours:number;ignoreBackground:boolean;lang:Lang}
  |{kind:'downsample';pixels:Pixels}
  |{kind:'click';pixels:Pixels;image:Pick<RefImage,'x'|'y'|'width'|'height'|'rotation'>;point:Point;tolerance:number}
  |{kind:'density';commands:Command[];radius:number}
  |{kind:'svg';sources:SVGSources;filename:string;project:Project;lang:Lang};
export type EditorResult<J extends EditorJob>=J extends {kind:'trace'}?StitchObject[]:J extends {kind:'downsample'}?Pixels:J extends {kind:'click'}?ClickResult|null:J extends {kind:'density'}?Density:Project;

// Only wrappers live here. Tests and non-worker consumers call the same pure functions.
export async function runEditorJob(job:EditorJob):Promise<StitchObject[]|Pixels|ClickResult|null|Density|Project>{
  switch(job.kind){
    case 'trace':{
      const [{tracePixels},{createT}]=await Promise.all([import('./trace'),import('./i18n')]);
      return tracePixels(job.pixels,job.art,job.colours,job.ignoreBackground,createT(job.lang));
    }
    case 'downsample':return (await import('./click-to-stitch')).downsample(job.pixels);
    case 'click':return (await import('./click-to-stitch')).clickToStitch(job.pixels,job.image,job.point,job.tolerance);
    case 'density':return (await import('./density')).needleDensity(job.commands,job.radius);
    case 'svg':{
      const [{importSVGSources},{createT}]=await Promise.all([import('./svg-import'),import('./i18n')]);
      return importSVGSources(job.sources,job.filename,job.project,createT(job.lang));
    }
  }
}
