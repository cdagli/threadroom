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

// --- traced shapes ----------------------------------------------------------------------------
// For motifs traced from reference plates: point lists in mm, one closed outline per part.
export const centroid=pts=>{let x=0,y=0;for(const p of pts){x+=p[0];y+=p[1];}return [x/pts.length,y/pts.length];};
// Direction of a part's long axis in degrees (0–180), so leaf and petal fills run along their length.
export function axisAngle(pts){
  const [cx,cy]=centroid(pts);let xx=0,yy=0,xy=0;
  for(const [x,y] of pts){xx+=(x-cx)**2;yy+=(y-cy)**2;xy+=(x-cx)*(y-cy);}
  return Math.round(((Math.atan2(2*xy,xx-yy)/2/deg)%180+180)%180);
}
// Widest point of a closed outline, in mm (twice the largest inscribed radius, sampled on a grid).
export function maxWidth(pts){
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),step=.15;let best=0;
  const inside=(x,y)=>{let c=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [xi,yi]=pts[i],[xj,yj]=pts[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;}return c;};
  const seg=(x,y)=>{let m=Infinity;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [ax,ay]=pts[j],[bx,by]=pts[i],dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));m=Math.min(m,Math.hypot(ax+t*dx-x,ay+t*dy-y));}return m;};
  for(let x=Math.min(...xs);x<=Math.max(...xs);x+=step)for(let y=Math.min(...ys);y<=Math.max(...ys);y+=step)if(inside(x,y))best=Math.max(best,seg(x,y));
  return 2*best;
}
// The two sides of a closed outline between its tips, resampled to n points each and running the same way.
export function outlineRails(pts,n=14){
  let a=0,b=0,d=0;for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){const e=Math.hypot(pts[i][0]-pts[j][0],pts[i][1]-pts[j][1]);if(e>d){d=e;a=i;b=j;}}
  const sideA=[...pts.slice(a,b+1)],sideB=[...pts.slice(b),...pts.slice(0,a+1)].reverse();
  const resample=(side,m)=>{const L=[0];for(let i=1;i<side.length;i++)L.push(L[i-1]+Math.hypot(side[i][0]-side[i-1][0],side[i][1]-side[i-1][1]));
    return Array.from({length:m},(_,k)=>{const s=L.at(-1)*k/(m-1);let j=1;while(j<side.length-1&&L[j]<s)j++;const t=(s-L[j-1])/Math.max(L[j]-L[j-1],1e-9);return lerp(side[j-1],side[j],Math.min(1,t));});};
  // Pair each point on the longer side with the nearest point on the other (kept in order), so columns
  // stay square across bends where one side runs much longer than the other.
  const len=s=>s.reduce((a,p,i)=>i?a+Math.hypot(p[0]-s[i-1][0],p[1]-s[i-1][1]):0,0);
  const [long,short]=len(sideA)>=len(sideB)?[sideA,sideB]:[sideB,sideA];
  const A=resample(long,n),dense=resample(short,n*12);
  const B=[dense[0]];let from=0;
  for(let k=1;k<n-1;k++){let best=from,bd=Infinity;for(let j=from;j<dense.length;j++){const d=Math.hypot(dense[j][0]-A[k][0],dense[j][1]-A[k][1]);if(d<bd){bd=d;best=j;}}from=best;B.push(dense[best]);}
  B.push(dense.at(-1));
  return long===sideA?[A,B]:[B,A];
}
// A leaf split along its midrib (tip to tip): two halves that leave a `gap` mm vein between them.
export function leafHalves(pts,gap=.35){
  const [A,B]=outlineRails(pts,24),mid=A.map((p,i)=>lerp(p,B[i],.5));
  const half=side=>offsetRegion(polyRegion([...side,...[...mid].reverse()]),-gap/2);
  // ends: [base, tip] along the midrib, base being the end nearer the outline's first point.
  const d0=q=>Math.hypot(q[0]-pts[0][0],q[1]-pts[0][1]),e=[lerp(mid[0],mid[1],.6),lerp(mid.at(-1),mid.at(-2),.6)];
  return {halves:[half(A),half(B)],axis:axisAngle(pts),ends:d0(e[0])<=d0(e[1])?e:[e[1],e[0]]};
}
// Cut a flower mass into petals at the notches of its outline (local minima of distance from `centre`).
// Returns petal regions with their mid-angle (degrees), so each can take a radial fill direction.
export function petalCuts(pts,centre,count,{gap=.4,at,angles,minArea=7}={}){
  const ang=p=>(Math.atan2(p[1]-centre[1],p[0]-centre[0])/deg+360)%360,rad=p=>Math.hypot(p[0]-centre[0],p[1]-centre[1]);
  const dense=outlineDense(pts,.3),r=dense.map(rad),n=dense.length,win=Math.max(3,Math.round(n/count/4));
  const minima=dense.map((p,i)=>({a:ang(p),r:r[i],i})).filter(o=>{for(let k=1;k<=win;k++)if(r[(o.i+k)%n]<o.r||r[(o.i-k+n)%n]<o.r)return false;return true;}).sort((p,q)=>p.r-q.r);
  // Evenly spaced cuts from the deepest notch, each snapped to the nearest notch within a third of the spacing.
  const diff=(p,q)=>Math.min(Math.abs(p-q),360-Math.abs(p-q)),step=360/count;
  const snap=(t,w)=>{const near=minima.filter(m=>diff(m.a,t)<=w/3).sort((p,q)=>diff(p.a,t)-diff(q.a,t))[0];return near?near.a:t;};
  // A fan (centre on the outline, e.g. a flower seen from the side) spreads its cuts across its own angle.
  const sorted=dense.map(ang).sort((p,q)=>p-q),gaps=sorted.map((a,i)=>({a,g:((sorted[(i+1)%sorted.length]-a)+360)%360})),wide=gaps.reduce((p,q)=>q.g>p.g?q:p);
  const fan=wide.g>60?{from:(wide.a+wide.g)%360,span:360-wide.g}:null;
  let cuts=angles?[...angles]:at?at.map(ang):fan?Array.from({length:count-1},(_,k)=>snap((fan.from+(k+1)*fan.span/count)%360,fan.span/count)).concat([wide.a+wide.g/2]):minima.length?Array.from({length:count},(_,k)=>snap((minima[0].a+k*step)%360,step)):[];
  cuts.sort((p,q)=>p-q);
  const shape=polyRegion(pts);
  const petals=cuts.map((a0,i)=>{let a1=cuts[(i+1)%cuts.length];if(a1<=a0)a1+=360;
    const wedge=[centre,...Array.from({length:9},(_,k)=>polar(centre,80,a0+(a1-a0)*k/8))];
    return {region:offsetRegion(intersection(shape,polyRegion(wedge)),-gap/2),angle:(a0+a1)/2%360,a0,a1};}).filter(p=>regionRings(p.region).length);
  petals.cuts=fan?cuts.filter(a=>diff(a,wide.a+wide.g/2)>1):cuts;
  // Merge slivers: drop the cut beside the smallest petal under minArea and cut again.
  const area=g=>regionRings(g).reduce((t,r)=>{let a=0;for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length];a+=p[0]*q[1]-q[0]*p[1];}return t+Math.abs(a/2);},0);
  const small=petals.map(p=>({p,a:area(opened(p.region,.5))})).filter(o=>o.a<minArea).sort((x,y)=>x.a-y.a)[0];
  if(small&&cuts.length>1){const keep=fan?wide.a+wide.g/2:null,drop=[small.p.a0%360,small.p.a1%360].find(a=>keep===null||diff(a,keep)>1);
    if(drop!==undefined)return petalCuts(pts,centre,count,{gap,minArea,angles:cuts.filter(a=>diff(a,drop)>.01)});}
  return petals;
}
// One continuous rim for a cut flower: around its outline, dipping in along every petal division to
// radius `to` and back out, so the petals read as separate shapes without a trim between them.
export function petalRim(pts,centre,cuts,{to=0,step=1.8,veins=0,depth=.45}={}){
  const ang=p=>(Math.atan2(p[1]-centre[1],p[0]-centre[0])/deg+360)%360,diff=(p,q)=>Math.min(Math.abs(p-q),360-Math.abs(p-q));
  const dense=outlineDense(pts,.25),n=dense.length;
  const idx=a=>{let k=0,best=Infinity;dense.forEach((p,i)=>{const d=diff(ang(p),a)-Math.hypot(p[0]-centre[0],p[1]-centre[1])*1e-3;if(d<best){best=d;k=i;}});return k;};
  // Divisions dip in to radius `to`; `veins` per petal dip in by `depth` of the petal's length.
  const sc=[...cuts].sort((p,q)=>p-q),dips=sc.map(a=>({a,v:false}));
  if(veins)sc.forEach((a0,i)=>{let a1=sc[(i+1)%sc.length];if(a1<=a0)a1+=360;for(let k=1;k<=veins;k++)dips.push({a:(a0+(a1-a0)*k/(veins+1))%360,v:true});});
  const at=dips.map(d=>({...d,k:idx(d.a)})).sort((p,q)=>p.k-q.k);
  if(!at.length)return evenly(dense,step,true);
  const path=[];
  at.forEach(({k,v},j)=>{const o=dense[k],r=Math.hypot(o[0]-centre[0],o[1]-centre[1]),inner=v?lerp(o,centre,depth*(1-to/r)):lerp(centre,o,Math.min(.95,to/r));
    path.push(...evenly([o,inner,o],step));
    const next=j+1<at.length?at[j+1].k:at[0].k+n;for(let i=k+1;i<=next;i++)path.push(dense[i%n]);});
  return evenly(path,step);
}
const inside=(q,pts)=>{let c=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [xi,yi]=pts[i],[xj,yj]=pts[j];if((yi>q[1])!==(yj>q[1])&&q[0]<(xj-xi)*(q[1]-yi)/(yj-yi)+xi)c=!c;}return c;};
const edgeDist=(q,pts)=>{let m=Infinity;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [ax,ay]=pts[j],[bx,by]=pts[i],dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((q[0]-ax)*dx+(q[1]-ay)*dy)/(dx*dx+dy*dy||1)));m=Math.min(m,Math.hypot(ax+t*dx-q[0],ay+t*dy-q[1]));}return m;};
// Leaf veins as one path: a midrib from base to near the tip with paired side veins branching toward the tip.
export function leafVeins(pts,{at=[.28,.48,.68],reach=.7,angle=48,tip=.9,base=pts[0],sides=true}={}){
  const [A,B]=outlineRails(pts,24);let mid=A.map((p,i)=>lerp(p,B[i],.5)),hw=A.map((p,i)=>Math.hypot(p[0]-B[i][0],p[1]-B[i][1])/2);
  const d0=q=>Math.hypot(q[0]-base[0],q[1]-base[1]);if(d0(mid.at(-1))<d0(mid[0])){mid=mid.reverse();hw=hw.reverse();}
  const n=mid.length-1,on=t=>{const f=t*n,i=Math.min(n-1,Math.floor(f)),u=f-i;return {p:lerp(mid[i],mid[i+1],u),d:[mid[i+1][0]-mid[i][0],mid[i+1][1]-mid[i][1]],w:hw[i]*(1-u)+hw[i+1]*u};};
  const path=[mid[0]];let last=0;
  for(const t of at){for(let k=1;k<=n;k++)if(k/n>last&&k/n<t)path.push(mid[k]);
    const {p,d,w}=on(t),l=Math.hypot(...d),u=[d[0]/l,d[1]/l];path.push(p);
    if(sides)for(const side of [1,-1]){const a=angle*deg,v=[u[0]*Math.cos(a)-side*u[1]*Math.sin(a),u[1]*Math.cos(a)+side*u[0]*Math.sin(a)];
      // Shorten until the vein ends 0.5 mm inside the leaf.
      let len=w*reach/Math.sin(a);const ok=q=>inside(q,pts)&&edgeDist(q,pts)>=.5;while(len>.6&&!ok([p[0]+v[0]*len,p[1]+v[1]*len]))len*=.9;
      if(len>.6)path.push([p[0]+v[0]*len,p[1]+v[1]*len],p);}
    last=t;}
  for(let k=1;k<=n;k++)if(k/n>last&&k/n<=tip)path.push(mid[k]);
  path.midrib=mid.filter((_,k)=>k/n<=tip);
  return path;
}
// Closed outline resampled every `step` mm.
export function outlineDense(pts,step=.3){
  const out=[];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]),k=Math.max(1,Math.ceil(l/step));for(let j=0;j<k;j++)out.push(lerp(a,b,j/k));}
  return out;
}
// Points every `step` mm along a polyline (closed: back to the start), for running paths.
export function evenly(pts,step,closed=false){
  const src=closed?[...pts,pts[0]]:pts,out=[src[0]];let acc=0;
  for(let i=1;i<src.length;i++){let a=src[i-1];const b=src[i];let l=Math.hypot(b[0]-a[0],b[1]-a[1]);
    while(acc+l>=step){const t=(step-acc)/l;a=lerp(a,b,t);out.push(a);l=Math.hypot(b[0]-a[0],b[1]-a[1]);acc=0;}acc+=l;}
  const end=src.at(-1);if(Math.hypot(end[0]-out.at(-1)[0],end[1]-out.at(-1)[1])>step*.35)out.push(end);else out[out.length-1]=end;
  return out;
}
// Greedy nearest-neighbour order by centroid, starting from the item nearest `from`, so travel stays short.
export function nearestOrder(items,from,at=i=>centroid(i.points)){
  const left=[...items],out=[];let p=from;
  while(left.length){let k=0,best=Infinity;left.forEach((it,i)=>{const c=at(it),d=Math.hypot(c[0]-p[0],c[1]-p[1]);if(d<best){best=d;k=i;}});const [it]=left.splice(k,1);out.push(it);p=at(it);}
  return out;
}

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
    // Satin column from a traced outline: split at its two tips (the farthest-apart points) and pair the
    // two sides as rails. For thin tapering parts (stems, curls, slim leaves) that are too narrow to fill.
    ribbon(name,code,outline,{anchors=14,minWidth=1.1,...rest}={}){
      const [left,right]=outlineRails(outline,anchors);
      // Widen pinches between the tips so the column never drops under the satin minimum.
      for(let k=1;k<anchors-1;k++){const l=left[k],r=right[k],w=Math.hypot(r[0]-l[0],r[1]-l[1]);if(w>=minWidth)continue;
        const m=lerp(l,r,.5),u=w>1e-6?[(r[0]-l[0])/w,(r[1]-l[1])/w]:(()=>{const d=[left[k+1][0]-left[k-1][0],left[k+1][1]-left[k-1][1]],n=Math.hypot(...d);return [-d[1]/n,d[0]/n];})();
        left[k]=[m[0]-u[0]*minWidth/2,m[1]-u[1]*minWidth/2];right[k]=[m[0]+u[0]*minWidth/2,m[1]+u[1]*minWidth/2];}
      const o=base(name,code,'satin-block',{length:1.5,underlay:'center',...rest});
      return withRails({...o,rings:[]},{points:[left.map(pt),right.map(pt)]});
    },
    // A short satin bar: a dot or dash at p, along angle a.
    dot(name,code,p,{size=1.8,along=.6,angle=0,...rest}={}){
      const a=polar(p,-along/2,angle),b=polar(p,along/2,angle);
      return base(name,code,'satin',{rings:[[pt(a),pt(b)]],satinWidth:size,length:1.5,underlay:'none',...rest});
    },
  };
}

// Traced motifs: layers of outlines sewn in order. Each layer: {name, code, kind, parts:[outline…], …}
//   auto    slim parts (< ribbonMax mm) as satin columns, the rest as fills along their long axis
//   leaf    broad leaves split at the midrib into two herringbone halves (second half in `dark` if given)
//   petals  one flower mass cut into `count` petals around `centre`, radial stitch direction
//   fill    plain fills (`pattern`, `angle` optional)
//   stamens filaments with knot tips from `centres:[[x,y,r0,r1,count,from°,spread°]]`, one path
// petals take `rim:{code,to,stitch}` (outline plus divisions as one path); leaves take `veins:{code,stitch,at}`.
// Petals and leaf halves interlock by 0.2 mm (gap -0.2) so no fabric shows between them.
//   stem    open centrelines sewn as tapered satin, `width:[start,end]` mm (the compiler picks the sewing direction)
// `covers` lists later layers whose shapes are cut out of this one (so fills don't stack).
export function drawLayers(b,layers,{start=[50,90],ribbonMax=5.5}={}){
  const objects=[],deferred=[];let at=start;
  // smooth: hand-drawn anchors become Levien curves (sampled) before any cutting.
  layers=layers.map(l=>l.smooth&&l.kind!=='stem'&&l.kind!=='spray'?{...l,parts:l.parts.map(p=>ring(p,{closed:l.kind!=='outline'||l.closed!==false}))}:l);
  // A stem's shape is its centreline widened to its satin width, so `covers` can cut fills away under it.
  const band=(line,[w0,w1])=>{const r=ring(line,{closed:false}),n=r.length-1,side=s=>r.map((p,i)=>{const a=r[Math.max(0,i-1)],c=r[Math.min(n,i+1)],dx=c[0]-a[0],dy=c[1]-a[1],m=Math.hypot(dx,dy)||1,w=(w0+(w1-w0)*i/n)/2*s;return [p[0]-dy/m*w,p[1]+dx/m*w];});return polyRegion([...side(1),...side(-1).reverse()]);};
  const shapeOf=l=>l.parts.map(p=>l.kind==='stem'?band(p,l.width??[1.4,1]):polyRegion(p)).reduce((a,g)=>union(a,g));
  const cover=layers.map(l=>l.covers?offsetRegion(l.covers.map(j=>shapeOf(layers[j])).reduce((a,g)=>union(a,g)),-.4):null);
  layers.forEach((l,li)=>{
    const items=[];
    if(l.kind==='outline'){
      // One running line per part (closed unless closed:false): edges for pale fills, veins, ribs.
      l.parts.forEach((pts,i)=>items.push({c:centroid(pts),make:()=>b.path(`${l.name} ${i+1}`,l.code,evenly(pts,l.length??2,l.closed!==false),{length:l.length??2,kind:l.stitch??'running'})}));
      for(const it of nearestOrder(items,at,it=>it.c)){objects.push(it.make());at=it.c;}
      return;
    }
    if(l.kind==='spray'){
      // Stalks from one root sewn as a single running path out and back, so no trims between them.
      const path=[];for(const line of l.parts){const r=evenly(ring(line,{closed:false}),l.length??2.2);path.push(...r,...[...r].reverse().slice(1));}
      // Links between stalk roots become even travel stitches too (no long stitch for the machine to trim).
      objects.push(b.path(l.name,l.code,evenly(path,l.length??2.2),{length:l.length??2.2}));at=l.parts.at(-1)[0];return;
    }
    if(l.kind==='dot'){
      // Specks merged within `merge` mm into one satin dot each.
      const groups=[];for(const pts of l.parts){const c=centroid(pts),g=groups.find(g=>Math.hypot(g.c[0]-c[0],g.c[1]-c[1])<(l.merge??2.5));if(g){g.pts.push(...pts);g.c=centroid(g.pts);}else groups.push({c,pts:[...pts]});}
      const made=nearestOrder(groups,at,g=>g.c).map((g,i)=>b.dot(`${l.name} ${i+1}`,l.code,g.c,{size:l.size??1.6,along:l.along??.8,angle:l.angle??axisAngle(g.pts)}));
      objects.push(...made);if(groups.length)at=nearestOrder(groups,at,g=>g.c).at(-1).c;return;
    }
    if(l.kind==='petioles'){
      // Short leaf stalks from the nearest stem to each leaf of layer `leaves`, sewn as one path (sew it before
      // the stems so their satin covers the travel between roots); `leafLayer` is the leaves' layer index.
      const stems=l.stems,near=(q,line)=>{let best={d:Infinity};for(let i=0;i<line.length-1;i++){const a=line[i],c=line[i+1],dx=c[0]-a[0],dy=c[1]-a[1],t=Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/(dx*dx+dy*dy||1))),p=[a[0]+t*dx,a[1]+t*dy],d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d<best.d)best={d,p,s:i+t};}return best;};
      const lines=[];
      for(const pts of layers[l.leafLayer].parts){let best={d:Infinity};for(const q of outlineDense(pts,.4))for(const [si,line] of stems.entries()){const n=near(q,line);if(n.d<best.d)best={...n,q,si};}
        if(best.d<(l.min??.5)||best.d>(l.max??9))continue;const c=centroid(pts),u=[c[0]-best.q[0],c[1]-best.q[1]],m=Math.hypot(...u);
        lines.push({si:best.si,s:best.s,pts:[best.p,[best.q[0]+u[0]/m*1.2,best.q[1]+u[1]/m*1.2]]});}
      lines.sort((a,c)=>a.si-c.si||a.s-c.s);if(!lines.length)return;
      const path=[];for(const ln of lines)path.push(...evenly(ln.pts,l.length??1.6),...evenly([...ln.pts].reverse(),l.length??1.6).slice(1));
      objects.push(b.path(l.name,l.code,evenly(path,l.length??1.6),{length:l.length??1.6,kind:l.stitch??'running'}));at=path.at(-1);return;
    }
    if(l.kind==='rims'){
      // Rims deferred by earlier petal layers (rim.defer), so overlapping flowers keep one block per thread.
      for(const it of nearestOrder(deferred,at,it=>it.c)){objects.push(it.make());at=it.c;}return;
    }
    if(l.kind==='veinnet'){
      // Leaf stalks and veins of every leaf in `leafLayer` as ONE path: it runs along the stem centrelines
      // between leaves, out each stalk, through the leaf's veins, back down the midrib and stalk. Sew it just
      // before the stems so their satin covers the travel. Slim leaves (< 3 mm) get a midrib only.
      const stems=l.stems,step=l.length??1.5,near=(q,line)=>{let best={d:Infinity};for(let i=0;i<line.length-1;i++){const a=line[i],c=line[i+1],dx=c[0]-a[0],dy=c[1]-a[1],t=Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/(dx*dx+dy*dy||1))),p=[a[0]+t*dx,a[1]+t*dy],d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d<best.d)best={d,p,s:i+t};}return best;};
      const along=(line,s0,s1)=>{const out=[];const pt=s=>{const i=Math.min(line.length-2,Math.floor(s)),u=s-i;return lerp(line[i],line[i+1],u);};const dir=s1>=s0?1:-1;out.push(pt(s0));for(let k=dir>0?Math.ceil(s0):Math.floor(s0);dir>0?k<s1:k>s1;k+=dir)if(k!==s0)out.push(line[k]);out.push(pt(s1));return out;};
      const leaves=[];
      for(const pts of layers[l.leafLayer].parts){let best={d:Infinity};for(const q of outlineDense(pts,.4))for(const [si,line] of stems.entries()){const n=near(q,line);if(n.d<best.d)best={...n,q,si};}
        if(best.d>(l.max??9))continue;leaves.push({pts,...best});}
      // spurs: extra stalks (flower stalks) starting on a stem, sewn out and back in the same path.
      for(const line of l.spurs??[]){const r=ring(line,{closed:false});let best={d:Infinity};for(const [si,st] of stems.entries()){const n=near(r[0],st);if(n.d<best.d)best={...n,si};}leaves.push({spur:r,...best,q:r[0]});}
      // Leaves too slim for veins and touching their stem need nothing: leave them out of the path.
      for(const lf of leaves)lf.skip=!lf.spur&&maxWidth(lf.pts)<(l.veinMin??3.5)&&lf.d<=(l.stalkMin??1.2);
      leaves.splice(0,leaves.length,...leaves.filter(lf=>!lf.skip));
      leaves.sort((a,c)=>a.si-c.si||a.s-c.s);if(!leaves.length)return;
      const path=[];let cur=null;
      for(const lf of leaves){
        if(cur&&cur.si===lf.si)path.push(...along(stems[lf.si],cur.s,lf.s));
        else if(cur){
          // Change stems where they meet: along the old stem to its point nearest the new one, across, then along.
          const from=stems[cur.si],to=stems[lf.si],dense=[];for(let i=0;i<from.length-1;i++)for(let k=0;k<=10;k++)dense.push({p:lerp(from[i],from[i+1],k/10),s:i+k/10});
          const j=dense.map(d=>({...d,n:near(d.p,to)})).reduce((a,c)=>c.n.d<a.n.d?c:a);
          path.push(...along(from,cur.s,j.s),...along(to,j.n.s,lf.s));
        }else path.push(lf.p);
        if(lf.spur){path.push(lf.p,...lf.spur,...[...lf.spur].reverse(),lf.p);cur=lf;continue;}
        const w=maxWidth(lf.pts);if(w<(l.veinMin??3.5)){if(lf.d>(l.stalkMin??1.2))path.push(lf.p,lf.q,lf.p);cur=lf;continue;}
        const v=leafVeins(lf.pts,{...l.veins,base:lf.q,sides:w>=(l.sideMin??4.6)});
        // Back down the midrib 0.35 mm to one side, so the return pass doesn't stack on the way out.
        const back=[...v.midrib].reverse().map((q,i,a)=>{const o=a[Math.min(a.length-1,i+1)],m=a[Math.max(0,i-1)],dx=o[0]-m[0],dy=o[1]-m[1],h=Math.hypot(dx,dy)||1;return [q[0]-dy/h*.35,q[1]+dx/h*.35];});
        const stalk=lf.d>(l.stalkMin??1.2);
        path.push(...(stalk?[lf.p]:[]),...v,...back,...(stalk?[lf.q,lf.p]:[]));cur=lf;}
      objects.push(b.path(l.name,l.code,evenly(path,step),{length:step,kind:l.stitch??'running'}));at=path.at(-1);return;
    }
    if(l.kind==='stamens'){
      // Filaments radiating from flower centres, each ending in a small knot: one running path per layer.
      // One path per centre, so no travel line crosses the petals between flowers.
      l.centres.forEach(([cx,cy,r0,r1,count,from=0,spread=360],ci)=>{const path=[];{
        for(let k=0;k<count;k++){const a=from+spread*(spread>=360?k/count:k/Math.max(1,count-1)),p0=polar([cx,cy],r0,a),p1=polar([cx,cy],r1,a);
          // Out, a small knot, then back over the same needle holes.
          // Filaments that start close together share a needle hole instead of sewing a stub between them.
          const out=evenly([p0,p1],l.length??1.4),near=path.length&&Math.hypot(path.at(-1)[0]-p0[0],path.at(-1)[1]-p0[1])<.6;
          path.push(...(near?out.slice(1):out),polar(p1,.8,a+60),polar(p1,.8,a-60),...[...out].reverse().slice(0,-1),near?path.at(-1):p0);}
      }
      objects.push(b.path(l.centres.length>1?`${l.name} ${ci+1}`:l.name,l.code,path,{length:l.length??1.4,kind:l.stitch??'running'}));at=path.at(-1);});return;
    }
    const clip=g=>cover[li]?difference(g,cover[li]):g,rims=[];
    l.parts.forEach((pts,i)=>{
      const w=maxWidth(pts),c=centroid(pts),tag=`${l.name} ${i+1}`;
      if(l.kind==='stem'){
        const [w0,w1]=l.width??[1.4,1];
        items.push({c,make:()=>b.taper(tag,l.code,pts,t=>w0+(w1-w0)*t)});
      }else if(l.kind==='petals'){
        // centre/count may be given per part (several flowers in one layer) via `centres`.
        const centre=l.centres?.[i]??l.centre,count=l.counts?.[i]??l.count;
        const cut=petalCuts(pts,centre,count,{gap:l.gap??-.2,at:l.notches});
        if(l.rim)(l.rim.defer?deferred:rims).push({c,make:()=>b.path(`${l.rim.name??'Kenar'} ${i+1}`,l.rim.code,petalRim(pts,centre,cut.cuts,{to:l.rim.to??0,step:l.rim.length??1.8,veins:l.rim.veins??0,depth:l.rim.depth??.45}),{length:l.rim.length??1.8,kind:l.rim.stitch??'running'})});
        // Petals sew in order around the flower, each entering on one division and leaving on the next, where the
        // following petal starts, so the whole flower chains without trims.
        const mid=(a)=>{const ring=outlineDense(pts,.5),r=ring.reduce((m,q)=>{const d=Math.abs(((Math.atan2(q[1]-centre[1],q[0]-centre[0])/deg-a)%360+540)%360-180);return d<m.d?{d,r:Math.hypot(q[0]-centre[0],q[1]-centre[1])}:m;},{d:Infinity,r:3}).r;return polar(centre,Math.max(l.rim?.to??0,r*.45)+r*.2,a);};
        items.push({c,make:()=>cut.map((p,k)=>{
          const g=opened(clip(p.region),l.round??.5);if(!regionRings(g).length)return [];
          const fill=b.fill(`${l.name} ${k+1}`,l.code,g,{angle:Math.round(((p.angle%180)+180)%180),entry:pt(mid(p.a0)),exit:pt(mid(p.a1)),...l.opts});
          if(!l.edge)return fill;
          // A running edge per petal in a darker thread, so pale petals read on pale fabric.
          const rim=regionRings(simplify(offsetRegion(opened(p.region,.5),-(l.edge.inset??.25)),.05))[0];
          return [fill,b.path(`${l.edge.name??'Kenar'} ${k+1}`,l.edge.code,evenly(rim,l.edge.length??2,true),{length:l.edge.length??2})];}).flat()});
      }else if(l.kind==='leaf'&&w>=(l.splitMin??4.6)){
        const {halves,axis,ends}=leafHalves(pts,l.gap??-.2);
        // Half a runs base → tip, half b tip → base: the two chain at the tip without a trim.
        const [base,tipP]=ends;
        items.push({c,make:()=>[b.fill(`${tag} a`,l.code,opened(clip(halves[0]),.5),{angle:(axis+40)%180,entry:pt(base),exit:pt(tipP),...l.opts}),b.fill(`${tag} b`,l.dark??l.code,opened(clip(halves[1]),.5),{angle:(axis+140)%180,entry:pt(tipP),exit:pt(base),...l.opts})]});
        if(l.veins)rims.push({c,make:()=>b.path(`${l.veins.name??'Damar'} ${i+1}`,l.veins.code,evenly(leafVeins(pts,l.veins),l.veins.length??1.6),{length:l.veins.length??1.6,kind:l.veins.stitch??'running'})});
      }else if((l.kind==='auto'||l.kind==='leaf')&&w<(l.ribbonMax??ribbonMax)){
        items.push({c,make:()=>b.ribbon(tag,l.code,pts,l.opts)});
      }else{
        items.push({c,make:()=>b.fill(tag,l.code,opened(clip(polyRegion(pts)),l.round??.4),{angle:l.angle??axisAngle(pts),pattern:l.pattern??'tatami',...l.opts})});
      }
    });
    const made=[];for(const it of nearestOrder(items,at,it=>it.c)){made.push(...[it.make()].flat());at=it.c;}
    // One block per thread inside a layer (two-tone leaves): first thread's parts, then the second's.
    const codes=[...new Set(made.map(o=>o.thread.code))],prev=objects.at(-1)?.thread.code;
    if(codes.includes(prev))codes.sort((a,b2)=>(b2===prev)-(a===prev));
    for(const code of codes)objects.push(...made.filter(o=>o.thread.code===code));
    // Detail lines (petal rims, leaf veins) go on top, after the fills of this layer.
    for(const it of nearestOrder(rims,at,it=>it.c)){objects.push(it.make());at=it.c;}
  });
  return objects;
}

// A motif definition: metadata plus draw(b), which returns its objects in sew order.
// Names are Turkish and English; tags list synonyms in both languages for search.
export const motif=(id,categoryId,name,tags,groupName,draw)=>({id,categoryId,name,tags,groupName,draw});
