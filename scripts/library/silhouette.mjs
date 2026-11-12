// Colour-blind silhouettes for spotting near-duplicate motifs.
// Each asset is drawn into a square grid (aspect kept, centred): fills by even-odd rings, lines as
// strokes of their sewn width. Similarity is the IoU of the two grids after a one-cell dilation,
// taking the better of the plain and mirrored comparison.
import {load} from '../../tests/load-lib.mjs';
const {blockOutline}=load('curves');
const {isFillKind}=load('project');

const N=40;
const segDist=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
function inside(rings,p){let n=0;for(const r of rings)for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<a[0]+(p[1]-a[1])*(b[0]-a[0])/(b[1]-a[1]))n++;}return n%2===1;}

export function silhouette(asset){
  const shapes=asset.design.objects.filter(o=>!o.hidden&&!o.layoutOnly).map(o=>o.rails?{fill:[blockOutline(o.rails)]}:isFillKind(o.kind)?{fill:o.rings}:{line:o.rings,half:o.kind==='satin'||o.kind==='zigzag'?o.satinWidth/2:.35});
  const pts=shapes.flatMap(s=>(s.fill??s.line).flat());
  const x0=Math.min(...pts.map(p=>p[0])),y0=Math.min(...pts.map(p=>p[1])),x1=Math.max(...pts.map(p=>p[0])),y1=Math.max(...pts.map(p=>p[1]));
  const size=Math.max(x1-x0,y1-y0)||1,cell=size/N,ox=x0-(size-(x1-x0))/2,oy=y0-(size-(y1-y0))/2;
  const grid=new Uint8Array(N*N);
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const p=[ox+(i+.5)*cell,oy+(j+.5)*cell];
    grid[j*N+i]=shapes.some(s=>s.fill?inside(s.fill,p):s.line.some(r=>r.some((q,k)=>k>0&&segDist(p,r[k-1],q)<=Math.max(s.half,cell*.75))))?1:0;
  }
  return grid;
}
const dilate=g=>{const out=new Uint8Array(N*N);for(let j=0;j<N;j++)for(let i=0;i<N;i++)if(g[j*N+i])for(let v=-1;v<=1;v++)for(let u=-1;u<=1;u++){const x=i+u,y=j+v;if(x>=0&&y>=0&&x<N&&y<N)out[y*N+x]=1;}return out;};
const mirrored=g=>{const out=new Uint8Array(N*N);for(let j=0;j<N;j++)for(let i=0;i<N;i++)out[j*N+i]=g[j*N+N-1-i];return out;};
const iou=(a,b)=>{let both=0,any=0;for(let k=0;k<a.length;k++){both+=a[k]&b[k];any+=a[k]|b[k];}return any?both/any:0;};

const cache=new WeakMap();
const prepared=asset=>{let v=cache.get(asset);if(!v){const g=silhouette(asset);v={plain:dilate(g),flip:dilate(mirrored(g))};cache.set(asset,v);}return v;};
export const similarity=(a,b)=>{const p=prepared(a),q=prepared(b);return Math.max(iou(p.plain,q.plain),iou(p.plain,q.flip));};
// Scores at or above this deserve a side-by-side look before keeping the new motif.
export const duplicateThreshold=.8;
export function nearest(asset,assets,count=5){
  return assets.filter(a=>a.id!==asset.id).map(a=>({asset:a,score:similarity(asset,a)})).sort((a,b)=>b.score-a.score).slice(0,count);
}
