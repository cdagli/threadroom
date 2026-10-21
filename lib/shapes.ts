import type {Key} from './i18n';
import type {Point} from './project';
import {curvePoints} from './curves';

export type ShapeKind='circle'|'rect'|'star'|'triangle'|'diamond'|'hexagon'|'heart';
export const shapeNames:Record<ShapeKind, Key>={circle:'Circle',rect:'Rectangle',star:'Star',triangle:'Triangle',diamond:'Diamond',hexagon:'Hexagon',heart:'Heart'};
type Shape={points:Point[];corners:boolean[]};
type Hoop={width:number;height:number};
const radial=(c:Point,r:number,n:number,start:number,corner:boolean,inner=1):Shape=>({
  points:Array.from({length:n},(_,i)=>{const a=start+2*Math.PI*i/n,d=r*(i%2?inner:1);return [c[0]+d*Math.cos(a),c[1]+d*Math.sin(a)] as Point;}),corners:Array(n).fill(corner),
});
// 12 nodes: Catmull–Rom through 8 leaves visible flats (0.8 % out of round; 12: 0.17 %).
export const circle=(c:Point,r:number):Shape=>radial(c,r,12,Math.PI,false);
export function rect(a:Point,b:Point,square=false):Shape {
  let dx=b[0]-a[0],dy=b[1]-a[1];
  if(square){const s=Math.max(Math.abs(dx),Math.abs(dy));dx=(Math.sign(dx)||1)*s;dy=(Math.sign(dy)||1)*s;}
  return {points:[[...a],[a[0]+dx,a[1]],[a[0]+dx,a[1]+dy],[a[0],a[1]+dy]],corners:[true,true,true,true]};
}
export const star=(c:Point,r:number):Shape=>radial(c,r,10,-Math.PI/2,true,.382);
export const triangle=(c:Point,r:number):Shape=>radial(c,r,3,-Math.PI/2,true);
export const diamond=(c:Point,r:number):Shape=>({points:[[c[0],c[1]-r],[c[0]+r,c[1]],[c[0],c[1]+r],[c[0]-r,c[1]]],corners:[true,true,true,true]});
export const hexagon=(c:Point,r:number):Shape=>radial(c,r,6,-Math.PI/2,true);
export const heart=(c:Point,r:number):Shape=>({
  points:([[0,1],[-.82,.25],[-.88,-.35],[-.3,-.55],[0,-.22],[.3,-.55],[.88,-.35],[.82,.25]] as Point[]).map(([x,y])=>[c[0]+x*r,c[1]+y*r]),
  corners:[true,false,false,false,true,false,false,false],
});

export function fitRadius(kind:ShapeKind,c:Point,r:number,hoop:Hoop):number {
  if(c[0]<0||c[1]<0||c[0]>hoop.width||c[1]>hoop.height)return 0;
  const shape=kind==='rect'?rect([-1,-1],[1,1]):({circle,star,triangle,diamond,hexagon,heart})[kind]([0,0],1);
  const outline=curvePoints(shape.points,true,shape.corners),n=shape.points.length;
  // Include cubic extrema: tessellation takes different samples when the radius grows.
  for(let i=0;i<n;i++)for(const k of [0,1]){
    const b=shape.points[i][k],c=shape.points[(i+1)%n][k],a=shape.corners[i]?b:shape.points[(i+n-1)%n][k],d=shape.corners[(i+1)%n]?c:shape.points[(i+2)%n][k];
    const A=(-a+3*b-3*c+d)/2,B=(2*a-5*b+4*c-d)/2,C=(-a+c)/2,D=4*B*B-12*A*C;
    const roots=Math.abs(A)<1e-12?(B?[-C/(2*B)]:[]):D>=0?[(-2*B-Math.sqrt(D))/(6*A),(-2*B+Math.sqrt(D))/(6*A)]:[];
    for(const t of roots)if(t>0&&t<1){const p:Point=[0,0];p[k]=((A*t+B)*t+C)*t+b;outline.push(p);}
  }
  let size=Math.max(0,r);
  for(const p of outline)for(const k of [0,1]){
    if(p[k]>0)size=Math.min(size,((k?hoop.height:hoop.width)-c[k])/p[k]);
    else if(p[k]<0)size=Math.min(size,-c[k]/p[k]);
  }
  return size;
}
export function fitRect(a:Point,b:Point,hoop:Hoop,square=false):Point {
  const point:Point=[Math.max(0,Math.min(hoop.width,b[0])),Math.max(0,Math.min(hoop.height,b[1]))];
  if(!square)return point;
  const dx=b[0]-a[0],dy=b[1]-a[1],sx=Math.sign(dx)||1,sy=Math.sign(dy)||1;
  const s=Math.min(Math.max(Math.abs(dx),Math.abs(dy)),sx>0?hoop.width-a[0]:a[0],sy>0?hoop.height-a[1]:a[1]);
  return [a[0]+sx*s,a[1]+sy*s];
}
