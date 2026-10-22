import {createT,TranslationError,type Translator} from './i18n';
import {curveRing} from './curves';
import {hoops,object,validProject,type Point,type Project,type StitchObject} from './project';
import {migrateImages} from './images';
import {identity,map,multiply,numbers,pathData,transform,type Matrix,type Subpath} from './svg-path';
type Style=Record<string,string>;
const properties=['fill','stroke','stroke-width','fill-rule','color','fill-opacity','stroke-opacity','visibility','display','opacity','clip-path','mask','filter','vector-effect'];
const declarations=(s:string):Style=>Object.fromEntries(s.split(';').flatMap(part=>{const at=part.indexOf(':');return at<0?[]:[[part.slice(0,at).trim().toLowerCase(),part.slice(at+1).trim()]];}));
const tag=(el:Element)=>el.localName.toLowerCase();
function matches(el:Element,s:string):boolean{
  // Basic type, class and id selectors (including compounds and descendant groups).
  const parts=s.trim().split(/\s+/),simple=(e:Element,s:string)=>{
    if(!/^(?:[\w-]+|\*)?(?:[.#][\w-]+)*$/.test(s))return false;
    const type=s.match(/^[\w-]+/);if(type&&tag(e)!==type[0])return false;
    return [...s.matchAll(/([.#])([\w-]+)/g)].every(([,kind,value])=>kind==='#'?e.getAttribute('id')===value:(e.getAttribute('class')??'').split(/\s+/).includes(value));
  };
  if(!simple(el,parts.pop()!))return false;let parent=el.parentElement;
  while(parts.length){const part=parts.pop()!;while(parent&&!simple(parent,part))parent=parent.parentElement;if(!parent)return false;parent=parent.parentElement;}
  return true;
}
export function svgLength(s:string):number|null{
  const m=s.trim().match(/^([+-]?(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?)\s*(mm|cm|in|px)?$/i);if(!m)return null;
  const n=Number(m[1])*({mm:1,cm:10,in:25.4,px:25.4/96}[m[2]?.toLowerCase()??'px']!);return Number.isFinite(n)?n:null;
}
const names:Record<string,string>={black:'#000000',white:'#ffffff',red:'#ff0000',green:'#008000',blue:'#0000ff',yellow:'#ffff00',orange:'#ffa500',purple:'#800080',pink:'#ffc0cb',brown:'#a52a2a',gray:'#808080',grey:'#808080',silver:'#c0c0c0',navy:'#000080',teal:'#008080',aqua:'#00ffff',cyan:'#00ffff',magenta:'#ff00ff',fuchsia:'#ff00ff',lime:'#00ff00',maroon:'#800000',olive:'#808000',rebeccapurple:'#663399'};
function colour(s:string):string|null{
  s=s.trim().toLowerCase();if(s==='none'||s==='transparent')return null;
  if(names[s])return names[s];
  if(/^#[\da-f]{3}$/.test(s))return '#'+[...s.slice(1)].map(c=>c+c).join('');
  if(/^#[\da-f]{6}$/.test(s))return s;
  const rgb=s.match(/^rgb\(\s*([\d.]+)(%?)\s*[, ]\s*([\d.]+)(%?)\s*[, ]\s*([\d.]+)(%?)\s*\)$/);
  if(rgb)return '#'+[1,3,5].map(i=>Math.round(Math.min(255,Math.max(0,Number(rgb[i])*(rgb[i+1]?2.55:1)))).toString(16).padStart(2,'0')).join('');
  // Let the browser resolve other solid CSS colours, without attaching imported markup.
  if(typeof document!=='undefined'&&typeof CSS!=='undefined'&&CSS.supports('color',s)&&!s.includes('var(')&&s!=='currentcolor'){
    const c=document.createElement('canvas').getContext('2d')!;c.fillStyle=s;const resolved=c.fillStyle;if(/^#[\da-f]{6}$/i.test(resolved))return resolved;
  }
  throw Error('SVG');
}
function shape(el:Element):string|null{
  const get=(key:string,fallback=0)=>{const s=el.getAttribute(key);if(s===null)return fallback;const n=svgLength(s);if(n===null)throw Error('SVG');return n*96/25.4;};
  switch(tag(el)){
    case 'path':return el.getAttribute('d')??'';
    case 'line':return `M${get('x1')} ${get('y1')}L${get('x2')} ${get('y2')}`;
    case 'polygon':case 'polyline':{const n=numbers(el.getAttribute('points')??'');if(n.length%2)throw Error('SVG');return n.length?'M'+n.join(' ')+(tag(el)==='polygon'?'Z':''):'';}
    case 'rect':{
      const x=get('x'),y=get('y'),w=get('width'),h=get('height');if(w<0||h<0)throw Error('SVG');if(!w||!h)return '';
      const rx=Math.min(w/2,get('rx',get('ry'))),ry=Math.min(h/2,get('ry',get('rx')));if(rx<0||ry<0)throw Error('SVG');
      return rx&&ry?`M${x+rx} ${y}H${x+w-rx}A${rx} ${ry} 0 0 1 ${x+w} ${y+ry}V${y+h-ry}A${rx} ${ry} 0 0 1 ${x+w-rx} ${y+h}H${x+rx}A${rx} ${ry} 0 0 1 ${x} ${y+h-ry}V${y+ry}A${rx} ${ry} 0 0 1 ${x+rx} ${y}Z`:`M${x} ${y}h${w}v${h}h${-w}Z`;
    }
    case 'circle':case 'ellipse':{const x=get('cx'),y=get('cy'),rx=get(tag(el)==='circle'?'r':'rx'),ry=tag(el)==='circle'?rx:get('ry');if(rx<0||ry<0)throw Error('SVG');return rx&&ry?`M${x-rx} ${y}A${rx} ${ry} 0 1 0 ${x+rx} ${y}A${rx} ${ry} 0 1 0 ${x-rx} ${y}Z`:'';}
    default:return null;
  }
}
type Source={d:string;m:Matrix;style:Style;name:string};
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
// Join only compatible consecutive open outlines, considering either end and either direction.
export function joinStrokes(objects:StitchObject[]):StitchObject[]{
  const out:StitchObject[]=[],open=(o:StitchObject)=>o.kind!=='fill'&&o.rings.length===1&&distance(o.rings[0][0],o.rings[0].at(-1)!)>1e-8;
  for(const o of objects){
    let current=o,at=out.length;
    if(open(current))for(let i=out.length-1;i>=0;i--){
      const prior=out[i];if(!open(prior)||prior.kind!==o.kind||prior.color!==o.color||prior.satinWidth!==o.satinWidth)break;
      const a=prior.rings[0],b=current.rings[0],pairs=[[a,b],[a,[...b].reverse()],[[...a].reverse(),b],[[...a].reverse(),[...b].reverse()]],pair=pairs.find(([a,b])=>distance(a.at(-1)!,b[0])<1);
      if(pair){const {curve:_,...plain}=prior;current={...plain,rings:[[...pair[0],...pair[1]]]};out.splice(i,1);at=i;i=out.length;}
    }
    out.splice(at,0,current);
  }
  return out;
}
export type SVGSources={sources:Source[];viewBox:number[]|null;width:number|null;height:number|null;aspect:string};
// DOM/XML and CSS colour resolution stay on the browser; all path parsing, curve
// flattening, physical transforms, joining and validation run on these plain values.
export function readSVGSources(source:string,t:Translator=createT('en'),parser:Pick<DOMParser,'parseFromString'>=new DOMParser()):SVGSources{
  try{
    if(source.length>8*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('SVG');
    const doc=parser.parseFromString(source,'image/svg+xml'),root=doc.documentElement;
    if(!root||tag(root)!=='svg'||doc.querySelector('parsererror'))throw Error('SVG');
    const rules=[...doc.querySelectorAll('style')].flatMap(el=>[...(el.textContent??'').replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([,selectors,body])=>selectors.split(',').map(selector=>({selector:selector.trim(),style:declarations(body),weight:(selector.match(/#/g)?.length??0)*100+(selector.match(/\./g)?.length??0)*10+(selector.match(/(?:^|\s)[a-z]/gi)?.length??0)}))));
    if(rules.length>1000)throw Error('SVG');
    const sources:Source[]=[];let nodes=0;
    function walk(el:Element,parent:Style,m:Matrix,alpha:number,depth:number){
      if(++nodes>20000||depth>100)throw Error('SVG');
      if(el.namespaceURI&&el.namespaceURI!=='http://www.w3.org/2000/svg')return;
      const type=tag(el);if(['defs','style','title','desc','metadata','script'].includes(type))return;
      const local:Style={};for(const key of properties){const v=el.getAttribute(key);if(v!==null)local[key]=v;}
      rules.filter(r=>matches(el,r.selector)).sort((a,b)=>a.weight-b.weight).forEach(r=>Object.assign(local,r.style));Object.assign(local,declarations(el.getAttribute('style')??''));
      if(local.display==='none')return;
      if(['clip-path','mask','filter','vector-effect'].some(key=>local[key]&&local[key]!=='none'))throw Error('SVG');
      for(const key of Object.keys(local))if(local[key]==='inherit')delete local[key];
      const style={...parent,...local},opacity=alpha*Number(local.opacity??1);if(!Number.isFinite(opacity))throw Error('SVG');
      const next=multiply(m,transform(el.getAttribute('transform')??'')),d=shape(el);
      if(d!==null&&opacity>0&&style.visibility!=='hidden')sources.push({d,m:next,style,name:el.getAttribute('aria-label')??el.getAttribute('id')??t('SVG shape')});
      else if(d===null&&!['svg','g','a'].includes(type))throw Error('SVG');
      if(type==='svg'&&el!==root)throw Error('SVG'); // Nested viewports need clipping; fail instead of misplacing geometry.
      for(const child of el.children)walk(child,style,next,opacity,depth+1);
    }
    walk(root,{fill:'#000000',stroke:'none','stroke-width':'1','fill-rule':'nonzero',color:'#000000'},identity,1,0);
    const vb=root.getAttribute('viewBox'),v=vb?numbers(vb):null;if(v&&(v.length!==4||v[2]<=0||v[3]<=0))throw Error('SVG');
    const w=svgLength(root.getAttribute('width')??''),h=svgLength(root.getAttribute('height')??'');
    if(w!==null&&w<=0||h!==null&&h<=0)throw Error('SVG');
    for(const s of sources)for(const key of ['fill','stroke'])s.style[key]=colour(s.style[key].trim().toLowerCase()==='currentcolor'?s.style.color:s.style[key])??'none';
    return {sources,viewBox:v,width:w,height:h,aspect:root.getAttribute('preserveAspectRatio')??'xMidYMid meet'};
  }catch(e){if(e instanceof TranslationError)throw e;throw new TranslationError(t,'This SVG could not be imported. Use paths, basic shapes, solid colours and transforms.');}
}
export function importSVG(source:string,filename:string,project:Project,t:Translator=createT('en'),parser:Pick<DOMParser,'parseFromString'>=new DOMParser()):Project{
  return importSVGSources(readSVGSources(source,t,parser),filename,project,t);
}
export function importSVGSources(input:SVGSources,filename:string,project:Project,t:Translator=createT('en')):Project{
  try{
    const {sources,viewBox:v}=input;let {width:w,height:h}=input;
    let box=v;
    if(!box){
      if(w&&h)box=[0,0,w*96/25.4,h*96/25.4];
      else{let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity,points=0;for(const s of sources)for(const path of pathData(s.d,s.m))for(const p of path.points){if(++points>12000)throw Error('SVG');x=Math.min(x,p[0]);y=Math.min(y,p[1]);right=Math.max(right,p[0]);bottom=Math.max(bottom,p[1]);}box=[x,y,Math.max(1,right-x),Math.max(1,bottom-y)];}
    }
    const hoop=hoops[project.hoop];if(w&&!h)h=w*box[3]/box[2];if(h&&!w)w=h*box[2]/box[3];
    if(!w||!h){const s=.75*Math.min(hoop.width/box[2],hoop.height/box[3]);w=box[2]*s;h=box[3]*s;}
    let sx=w/box[2],sy=h/box[3],ax=0,ay=0;
    const aspect=input.aspect.trim();
    if(aspect.includes('slice'))throw Error('SVG');
    if(aspect!=='none'){const scale=aspect.includes('slice')?Math.max(sx,sy):Math.min(sx,sy);ax=(w-box[2]*scale)*(aspect.includes('xMin')?0:aspect.includes('xMax')?1:.5);ay=(h-box[3]*scale)*(aspect.includes('YMin')?0:aspect.includes('YMax')?1:.5);sx=sy=scale;}
    let pointCount=0;
    const physical:Matrix=[sx,0,0,sy,(hoop.width-w)/2+ax-box[0]*sx,(hoop.height-h)/2+ay-box[1]*sy],group={id:crypto.randomUUID(),name:filename.replace(/\.[^.]+$/,'').slice(0,40)},objects:StitchObject[]=[];
    for(const s of sources){
      if(objects.length>1000)throw new TranslationError(t,'This SVG exceeds the editor limits (80 shapes, 12,000 points, 10 mm satin width).');
      if(!['evenodd','nonzero'].includes(s.style['fill-rule']))throw Error('SVG');
      const matrix=multiply(physical,s.m),paths=pathData(s.d,matrix);pointCount+=paths.reduce((n,p)=>n+p.points.length,0);if(pointCount>12000)throw new TranslationError(t,'This SVG exceeds the editor limits (80 shapes, 12,000 points, 10 mm satin width).');
      const paint=(value:string)=>colour(value.trim().toLowerCase()==='currentcolor'?s.style.color:value),fill=paint(s.style.fill),stroke=paint(s.style.stroke);
      const add=(paths:Subpath[],kind:'fill'|'running'|'satin',color:string,width=2)=>{
        if(!paths.length)return;const rings=paths.map(p=>kind!=='fill'&&p.closed?[...p.points,p.points[0]]:p.points),o:StitchObject={...object(s.name,rings,kind,color),group:group.id,satinWidth:width};
        if(kind==='fill'&&s.style['fill-rule']!=='evenodd')o.fillRule='nonzero';
        if(paths.length===1&&paths[0].linear&&paths[0].points.length<=200){const p=paths[0];o.curve={points:p.points,closed:kind==='fill'||p.closed,corners:p.points.map(()=>true)};o.rings=[curveRing(o.curve,kind!=='fill')];}
        objects.push(o);
      };
      if(fill&&Number(s.style['fill-opacity']??1)>0)add(paths.filter(p=>p.points.length>=3),'fill',fill);
      if(stroke&&Number(s.style['stroke-opacity']??1)>0){const raw=svgLength(s.style['stroke-width']);if(raw===null)throw Error('SVG');const width=raw*96/25.4*Math.sqrt(Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2]));if(width>10)throw new TranslationError(t,'SVG strokes wider than 10 mm cannot be imported.');if(width>0)for(const p of paths.filter(p=>p.points.length>=2))add([p],width>=1.5?'satin':'running',stroke,width>=1.5?width:2);}
    }
    // The SVG is added after the existing objects as one unlocked group; an empty design takes the file's name.
    const added=joinStrokes(objects);if(!added.length)throw new TranslationError(t,'This SVG has no supported visible shapes.');
    if(added.length<=80&&project.objects.length+added.length>80)throw new TranslationError(t,'A design holds at most 80 objects. Delete some objects first.');
    const result:Project={...migrateImages(project),...(!project.objects.length&&{name:filename.replace(/\.[^.]+$/,'')}),groups:[...(project.groups??[]),group],objects:[...project.objects,...added]};
    if(!validProject(result))throw new TranslationError(t,'This SVG exceeds the editor limits (80 shapes, 12,000 points, 10 mm satin width).');
    return result;
  }catch(e){if(e instanceof TranslationError)throw e;throw new TranslationError(t,'This SVG could not be imported. Use paths, basic shapes, solid colours and transforms.');}
}
