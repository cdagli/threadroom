import {layoutText,type FontLike,type GlyphLike,type TextSpec} from './text';
import type {Point,Project,Rails,StitchObject} from './project';

// Single-line fonts offset into satin columns: public-domain Hershey and OFL EMS
// faces (see THIRD-PARTY-NOTICES.md). Each table is its own chunk, loaded only for satin text.
const satinSources={
  simplex:{name:'Hershey Simplex',load:()=>import('./fonts-satin/simplex.json')},
  readability:{name:'EMS Readability',load:()=>import('./fonts-satin/readability.json')},
  delight:{name:'EMS Delight',load:()=>import('./fonts-satin/delight.json')},
  pancakes:{name:'EMS Pancakes',load:()=>import('./fonts-satin/pancakes.json')},
  tech:{name:'EMS Tech',load:()=>import('./fonts-satin/tech.json')},
  herculean:{name:'EMS Herculean',load:()=>import('./fonts-satin/herculean.json')},
  osmotron:{name:'EMS Osmotron',load:()=>import('./fonts-satin/osmotron.json')},
  script:{name:'Hershey Script',load:()=>import('./fonts-satin/script.json')},
  allure:{name:'EMS Allure',load:()=>import('./fonts-satin/allure.json')},
};
export type SatinFontId=keyof typeof satinSources;
export const satinFontIds=Object.keys(satinSources) as SatinFontId[];
export type SatinFont={name:string;glyphs:Record<string,{advance:number;strokes:number[][][]}>};
// Names are small metadata; stroke tables load only for satin text.
export const satinFonts=Object.fromEntries(satinFontIds.map(id=>[id,{name:satinSources[id].name,glyphs:{}}])) as Record<SatinFontId,SatinFont>;
let fontData:Promise<void>|null=null;
export function ensureSatinFonts():Promise<void>{
  return fontData??=Promise.all(satinFontIds.map(id=>satinSources[id].load().then(m=>{satinFonts[id]=m.default as SatinFont;}))).then(()=>{}).catch(e=>{fontData=null;throw e;});
}
export const satinFontsLoaded=()=>satinFontIds.every(id=>Object.keys(satinFonts[id].glyphs).length>0);
export const satinLetteringDefaults={font:'simplex' as SatinFontId,columnWidth:14};
export const columnLimits=[5,40] as const;
// One millimetre is the design check's reliable minimum; cap at the satin width limit.
export const columnWidth=(spec:TextSpec)=>Math.max(1,Math.min(10,spec.size*(spec.satin?.columnWidth??14)/100));
export type SatinColumn={rails:Rails;character:number};
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const round=(v:number)=>Math.round(v*1000)/1000;
const midpoint=(a:Point,b:Point):Point=>[(a[0]+b[0])/2,(a[1]+b[1])/2];

// Split turns above 65 degrees: short bevelled columns meet at their centres rather than
// making long mitres or crossed rails. Dense curves are reduced before offsetting.
export function strokeRails(source:Point[],width:number):Rails[] {
  let points=source.filter((p,i)=>!i||distance(p,source[i-1])>1e-7);
  if(!points.length)return [];
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),dx=Math.max(...xs)-Math.min(...xs),dy=Math.max(...ys)-Math.min(...ys);
  if(Math.hypot(dx,dy)<width*.8){
    const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
    // A tiny dot/loop becomes one short column on its principal axis.
    const d=Math.max(width*.55,dx,dy)/2;points=dx>dy?[[cx-d,cy],[cx+d,cy]]:[[cx,cy-d],[cx,cy+d]];
  }
  if(points.length<2)return [];
  // Remove source vertices closer than a quarter column, retaining stroke ends.
  points=points.filter((p,i)=>!i||i===points.length-1||distance(p,points[i-1])>=width*.25);
  const pieces:Point[][]=[];let piece=[points[0]];
  for(let i=1;i<points.length;i++){
    piece.push(points[i]);
    if(i<points.length-1){
      const a=points[i-1],b=points[i],c=points[i+1],cos=((b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1]))/(distance(a,b)*distance(b,c));
      if(cos<Math.cos(65*Math.PI/180)||piece.length>=90){pieces.push(piece);piece=[b];}
    }
  }
  if(piece.length>1)pieces.push(piece);
  return pieces.map(path=>{
    const normals=path.slice(1).map((p,i)=>{const a=path[i],d=distance(a,p);return [-(p[1]-a[1])/d,(p[0]-a[0])/d] as Point;});
    const offsets=path.map((_,i)=>{
      const a=normals[Math.max(0,i-1)],b=normals[Math.min(normals.length-1,i)],d=Math.hypot(a[0]+b[0],a[1]+b[1]);
      const nx=(a[0]+b[0])/d,ny=(a[1]+b[1])/d,m=width/2/Math.max(.8,nx*b[0]+ny*b[1]);
      return [nx*m,ny*m] as Point;
    });
    const rails=[-1,1].map(sign=>path.map((p,i)=>[p[0]+sign*offsets[i][0],p[1]+sign*offsets[i][1]] as Point)) as [Point[],Point[]];
    return {points:rails,corners:rails.map(r=>r.map(()=>true)) as [boolean[],boolean[]]};
  });
}

const cache=new WeakMap<TextSpec,ReturnType<typeof buildLettering>>();
function buildLettering(spec:TextSpec){
  if(!satinFontsLoaded())throw new Error('Load satin fonts before laying out satin text.');
  const data=satinFonts[spec.satin?.font??'simplex'],chars=Object.keys(data.glyphs);
  const glyph=(c:string):GlyphLike=>({index:chars.indexOf(c)+1,advanceWidth:data.glyphs[c]?.advance??0,getPath:()=>({commands:[]})});
  const font:FontLike={unitsPerEm:1,tables:{os2:{sCapHeight:1}},charToGlyph:glyph,charToGlyphIndex:c=>chars.indexOf(c)+1,getKerningValue:()=>0};
  const counts:number[]=[];let character=0;
  const result=layoutText(spec,[font],false,g=>{
    const strokes=data.glyphs[chars[g.index-1]].strokes as Point[][];
    const rails=strokes.flatMap(s=>strokeRails(s,columnWidth(spec)/spec.size));
    counts.push(...rails.map(()=>character));character++;
    // Densify before curving both rails onto arc/wave/path, never interpolate across a bend.
    return rails.flatMap(r=>{
      const [a,b]=r.points,left:Point[]=[],right:Point[]=[];
      for(let i=1;i<a.length;i++){
        const n=Math.max(1,Math.ceil(Math.max(distance(a[i-1],a[i]),distance(b[i-1],b[i]))*spec.size/.4));
        for(let k=0;k<n;k++)for(const [from,to,out] of [[a[i-1],a[i],left],[b[i-1],b[i],right]] as [Point,Point,Point[]][]){const t=k/n;out.push([from[0]+t*(to[0]-from[0]),from[1]+t*(to[1]-from[1])]);}
      }
      left.push(a[a.length-1]);right.push(b[b.length-1]);return [left,right];
    });
  });
  const columns:SatinColumn[]=counts.flatMap((character,i)=>{
    const left=result.rings[i*2],right=result.rings[i*2+1];
    // Ordinary editable blocks have at most 100 rungs. Split oversized rails at shared rungs.
    const parts:SatinColumn[]=[];
    for(let k=0;k<left.length-1;k+=99){const points=[left.slice(k,k+100),right.slice(k,k+100)] as [Point[],Point[]];parts.push({character,rails:{points,corners:points.map(r=>r.map(()=>true)) as [boolean[],boolean[]]}});}
    return parts;
  });
  const rings=columns.map(({rails:{points:[l,r]}})=>{
    const ring=[...l,...[...r].reverse()],area=ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
    return area<0?ring.reverse():ring;
  });
  return {...result,rings,columns};
}
export function layoutSatinText(spec:TextSpec){let value=cache.get(spec);if(!value){value=buildLettering(spec);cache.set(spec,value);}return value;}

// Joint RDP retains the same rung indices on both rails. Straight text needs only source
// corners; dense bending samples remain only where either rail actually curves.
function compactRails(points:[Point[],Point[]]):[Point[],Point[]]{
  const keep=new Set([0,points[0].length-1]);
  const reduce=(a:number,b:number)=>{
    let best=.005,index=-1;
    for(let i=a+1;i<b;i++)for(const rail of points){
      const p=rail[a],q=rail[b],r=rail[i],dx=q[0]-p[0],dy=q[1]-p[1],d=dx*dx+dy*dy;
      const t=d?Math.max(0,Math.min(1,((r[0]-p[0])*dx+(r[1]-p[1])*dy)/d)):0;
      const error=Math.hypot(r[0]-p[0]-dx*t,r[1]-p[1]-dy*t);
      if(error>best){best=error;index=i;}
    }
    if(index>=0){keep.add(index);reduce(a,index);reduce(index,b);}
  };
  reduce(0,points[0].length-1);const indices=[...keep].sort((a,b)=>a-b);
  return points.map(r=>indices.map(i=>r[i])) as [Point[],Point[]];
}

// Same ordered columns for live export and Convert to shapes. Nearest endpoint within each
// character; character order always follows the typed line, including curved baselines.
export function satinTextShapes(o:StitchObject):{objects:StitchObject[];characters:number[]} {
  if(!o.text?.satin)return {objects:[],characters:[]};
  const {text,curve,rails,entry,exit,fillPattern,fillUnderlays,fillLength,gradient,patternParams,...base}=o;void curve;void rails;void entry;void exit;void fillPattern;void fillUnderlays;void fillLength;void gradient;void patternParams;
  const pending=[...layoutSatinText(text).columns],ordered:SatinColumn[]=[];let at:Point|undefined;
  while(pending.length){
    const character=pending[0].character;let best=0,reverse=false,score=Infinity;
    pending.forEach((c,i)=>{if(c.character!==character)return;const [l,r]=c.rails.points;
      for(const end of [0,1]){const k=end?l.length-1:0,p=midpoint(l[k],r[k]),d=at?distance(at,p):p[0];if(d<score-1e-8){score=d;best=i;reverse=!!end;}}
    });
    const c=pending.splice(best,1)[0];
    const points=compactRails(c.rails.points.map(r=>reverse?[...r].reverse():r) as [Point[],Point[]]);
    ordered.push({...c,rails:{points,corners:points.map(r=>r.map(()=>true)) as [boolean[],boolean[]]}});
    // Centre underlay returns the cover to its start; other passes follow compiler parity.
    const count=({none:0,center:1,edge:2,zigzag:1,'edge-zigzag':3} as Record<string,number>)[o.underlay??'center']??1;
    const k=(columnWidth(text)<1.5&&o.underlay!=='none'||count%2)?0:points[0].length-1;at=midpoint(points[0][k],points[1][k]);
  }
  return {characters:ordered.map(c=>c.character),objects:ordered.map(({rails},i)=>({...base,id:`${o.id}-satin-${i}`,kind:'satin-block',satinWidth:columnWidth(text),rails,
    rings:[rails.points[0].map((p,k)=>midpoint(p,rails.points[1][k]).map(round) as Point)],entry:midpoint(rails.points[0][0],rails.points[1][0])}))};
}

export function convertSatinText(project:Project,id:string):Project|null {
  const source=project.objects.find(o=>o.id===id);if(!source?.text?.satin||source.locked)return null;
  const {objects,characters}=satinTextShapes(source);
  if(!objects.length||project.objects.length-1+objects.length>80)return null;
  // Existing groups remain intact; otherwise one group per character.
  const groups=source.group?[]:[...new Set(characters)].map(c=>({id:`${id}-letter-${c}`,name:`${source.name} ${c+1}`.slice(0,40)}));
  const shapes=objects.map((o,i)=>({...o,group:source.group??`${id}-letter-${characters[i]}`}));
  const used=new Set(project.objects.filter(o=>o.id!==id).map(o=>o.group));if(source.group)used.add(source.group);
  return {...project,groups:[...(project.groups??[]).filter(g=>used.has(g.id)),...groups],objects:project.objects.flatMap(o=>o.id===id?shapes:[o])};
}
