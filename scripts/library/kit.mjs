// Shared drawing kit for library motifs (see .agents/skills/generate-library-pattern).
// Geometry is in millimetres, y down, drawn around (50, 50). Curves are Levien splines through anchors.
import {readFileSync} from 'node:fs';
import {load} from '../../tests/load-lib.mjs';
const {curveRing,withRails}=load('curves');
const {regionFromRings,regionRings,union,intersection,difference,offsetRegion,cleanRing}=load('polygon');
export {regionRings,union,intersection,difference,offsetRegion};

const brother=JSON.parse(readFileSync(new URL('../../embroidery/threads.json',import.meta.url),'utf8')).brother;
export const thread=code=>{const t=brother.find(t=>t[0]===code);if(!t)throw new Error(`Unknown Brother thread ${code}`);return {color:t[2],thread:{brand:'brother',code:t[0],name:t[1]}};};
export const r3=n=>Math.round(n*1000)/1000;
export const pt=p=>[r3(p[0]),r3(p[1])];
export const deg=Math.PI/180;
export const polar=(c,r,a)=>[c[0]+r*Math.cos(a*deg),c[1]+r*Math.sin(a*deg)];
export const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
export const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
export const rotate=(p,c,a)=>{const s=Math.sin(a*deg),k=Math.cos(a*deg),x=p[0]-c[0],y=p[1]-c[1];return [c[0]+x*k-y*s,c[1]+x*s+y*k];};
export const mirror=(p,cx=50)=>[2*cx-p[0],p[1]];

// --- geometry -------------------------------------------------------------------------------
// corners: true (all), false (none), or a list of anchor indices.
export function curve(points,{closed=true,corners=false}={}){
  const set=corners===true?points.map((_,i)=>i):corners===false?[]:corners;
  return {points:points.map(pt),closed,corners:points.map((_,i)=>set.includes(i)),spline:'levien'};
}
export const ellipse=(c,rx,ry,n=8,start=-90,rot=0)=>Array.from({length:n},(_,i)=>rotate([c[0]+rx*Math.cos((start+360*i/n)*deg),c[1]+ry*Math.sin((start+360*i/n)*deg)],c,rot));
export const circle=(c,r,n=8,start=-90)=>ellipse(c,r,r,n,start);
// A dense polygon for boolean work.
export const ring=(points,opts)=>curveRing(curve(points,opts));
export const region=(points,opts)=>regionFromRings([ring(points,opts)]);
export const polyRegion=points=>regionFromRings([points]);
export const disc=(c,r)=>regionFromRings([Array.from({length:96},(_,i)=>polar(c,r,i*3.75))]);
// Morphological opening: rounds tips thinner than 2r so fills keep a sewable width.
export const opened=(g,r)=>offsetRegion(offsetRegion(g,-r),r);
export const simplify=(g,tol=.03)=>g.map(poly=>poly.map(r=>cleanRing(r,tol)));

// --- objects --------------------------------------------------------------------------------
export function builder(slug){
  let n=0;const group=`${slug}-group`;
  const base=(name,code,kind,extra)=>({id:`${slug}-${++n}`,name,kind,...thread(code),length:2.5,angle:35,satinWidth:2,underlay:'none',group,...extra});
  return {
    group,
    // A closed fill from anchors (stays editable as a curve) or from a boolean-cut region.
    fill(name,code,shape,{angle=35,underlay='none',pattern='tatami',fillLength=3,corners=false,...rest}={}){
      const geometry=Array.isArray(shape[0]?.[0]?.[0])?{rings:regionRings(simplify(shape))}:(()=>{const c=curve(shape,{corners});return {curve:c,rings:[curveRing(c)]};})();
      return base(name,code,'fill',{...geometry,angle,underlay,fillPattern:pattern,fillLength,...rest});
    },
    // Running/bean/satin lines. Closed lines repeat their first point.
    line(name,code,points,{kind='running',closed=false,corners=false,length=kind==='satin'?1.5:kind==='bean'?1.5:2.5,width=2,underlay,...rest}={}){
      const c=curve(points,{closed,corners});
      return base(name,code,kind,{curve:c,rings:[curveRing(c,closed)],length,satinWidth:width,underlay:underlay??(kind==='satin'?'center':'none'),...rest});
    },
    // A polyline (e.g. an offset outline) without anchors.
    path(name,code,points,{kind='running',length=2.5,...rest}={}){
      return base(name,code,kind,{rings:[points.map(pt)],length,...rest});
    },
    // Tapered satin: rails either side of a centre curve, width(t) in mm along it (t 0..1).
    taper(name,code,points,width,{anchors=12,...rest}={}){
      const centre=curveRing(curve(points,{closed:false}));
      const d=[0];for(let i=1;i<centre.length;i++)d.push(d[i-1]+Math.hypot(centre[i][0]-centre[i-1][0],centre[i][1]-centre[i-1][1]));
      const at=s=>{let j=1;while(j<centre.length-1&&d[j]<s)j++;const t=(s-d[j-1])/Math.max(d[j]-d[j-1],1e-9);return {p:lerp(centre[j-1],centre[j],t),dir:[centre[j][0]-centre[j-1][0],centre[j][1]-centre[j-1][1]]};};
      const left=[],right=[];
      for(let k=0;k<anchors;k++){
        const t=k/(anchors-1),{p,dir}=at(t*d.at(-1)),l=Math.hypot(...dir),nx=-dir[1]/l,ny=dir[0]/l,w=width(t)/2;
        left.push(pt([p[0]+nx*w,p[1]+ny*w]));right.push(pt([p[0]-nx*w,p[1]-ny*w]));
      }
      const o=base(name,code,'satin-block',{length:1.5,underlay:'center',...rest});
      return withRails({...o,rings:[]},{points:[left,right]});
    },
    // A short satin bar: a dot or dash at p, along angle a.
    dot(name,code,p,{size=1.8,along=.6,angle=0,...rest}={}){
      const a=polar(p,-along/2,angle),b=polar(p,along/2,angle);
      return base(name,code,'satin',{rings:[[pt(a),pt(b)]],satinWidth:size,length:1.5,underlay:'none',...rest});
    },
  };
}

// A motif definition: metadata plus draw(b), which returns its objects in sew order.
// Names are Turkish and English; tags list synonyms in both languages for search.
export const motif=(id,categoryId,name,tags,groupName,draw)=>({id,categoryId,name,tags,groupName,draw});
