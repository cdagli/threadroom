import type {Key} from './i18n';
import type {Point} from './project';
import {splineBeziers,sampleCubic,cubicPoint} from './spline';

export type ShapeKind='circle'|'oval'|'rect'|'rounded'|'star'|'triangle'|'diamond'|'pentagon'|'hexagon'|'octagon'|'heart'|'teardrop'|'arrow';
export const shapeNames:Record<ShapeKind, Key>={circle:'Circle',oval:'Oval',rect:'Rectangle',rounded:'Rounded rectangle',star:'Star',triangle:'Triangle',diamond:'Diamond',pentagon:'Pentagon',hexagon:'Hexagon',octagon:'Octagon',heart:'Heart',teardrop:'Teardrop',arrow:'Arrow'};
// Box shapes are dragged corner to corner; the others grow from their centre.
export type BoxShapeKind='rect'|'oval'|'rounded';
export type RadialShapeKind=Exclude<ShapeKind,BoxShapeKind>;
export const isBoxShape=(kind:ShapeKind):kind is BoxShapeKind=>kind==='rect'||kind==='oval'||kind==='rounded';
type Shape={points:Point[];corners:boolean[]};
type Hoop={width:number;height:number};
const radial=(c:Point,r:number,n:number,start:number,corner:boolean,inner=1):Shape=>({
  points:Array.from({length:n},(_,i)=>{const a=start+2*Math.PI*i/n,d=r*(i%2?inner:1);return [c[0]+d*Math.cos(a),c[1]+d*Math.sin(a)] as Point;}),corners:Array(n).fill(corner),
});
// Twelve smooth anchors stay editable and closely follow a circle.
const circle=(c:Point,r:number):Shape=>radial(c,r,12,Math.PI,false);
function rect(a:Point,b:Point,square=false):Shape {
  let dx=b[0]-a[0],dy=b[1]-a[1];
  if(square){const s=Math.max(Math.abs(dx),Math.abs(dy));dx=(Math.sign(dx)||1)*s;dy=(Math.sign(dy)||1)*s;}
  return {points:[[...a],[a[0]+dx,a[1]],[a[0]+dx,a[1]+dy],[a[0],a[1]+dy]],corners:[true,true,true,true]};
}
// Box corner-to-corner drag; square (Ctrl) keeps width and height equal, as for rect.
function box(a:Point,b:Point,square:boolean):[number,number]{
  let dx=b[0]-a[0],dy=b[1]-a[1];
  if(square){const s=Math.max(Math.abs(dx),Math.abs(dy));dx=(Math.sign(dx)||1)*s;dy=(Math.sign(dy)||1)*s;}
  return [dx,dy];
}
function oval(a:Point,b:Point,square=false):Shape {
  const [dx,dy]=box(a,b,square),c:Point=[a[0]+dx/2,a[1]+dy/2],s=circle([0,0],1);
  return {points:s.points.map(([x,y])=>[c[0]+x*Math.abs(dx)/2,c[1]+y*Math.abs(dy)/2]),corners:s.corners};
}
// Each corner is a short smooth run (tangent point, arc midpoint, tangent point) between straight sides.
function rounded(a:Point,b:Point,square=false):Shape {
  const [dx,dy]=box(a,b,square),x0=Math.min(a[0],a[0]+dx),y0=Math.min(a[1],a[1]+dy),w=Math.abs(dx),h=Math.abs(dy),r=Math.min(w,h)*.22,k=r*(1-Math.SQRT1_2);
  const points:Point[]=[[x0+r,y0],[x0+w-r,y0],[x0+w-k,y0+k],[x0+w,y0+r],[x0+w,y0+h-r],[x0+w-k,y0+h-k],[x0+w-r,y0+h],[x0+r,y0+h],[x0+k,y0+h-k],[x0,y0+h-r],[x0,y0+r],[x0+k,y0+k]];
  return {points,corners:points.map((_,i)=>i%3!==2)};
}
export function boxShape(kind:BoxShapeKind,a:Point,b:Point,square=false):Shape {return ({rect,oval,rounded})[kind](a,b,square);}
const star=(c:Point,r:number):Shape=>radial(c,r,10,-Math.PI/2,true,.382);
const triangle=(c:Point,r:number):Shape=>radial(c,r,3,-Math.PI/2,true);
const diamond=(c:Point,r:number):Shape=>({points:[[c[0],c[1]-r],[c[0]+r,c[1]],[c[0],c[1]+r],[c[0]-r,c[1]]],corners:[true,true,true,true]});
const hexagon=(c:Point,r:number):Shape=>radial(c,r,6,-Math.PI/2,true);
const pentagon=(c:Point,r:number):Shape=>radial(c,r,5,-Math.PI/2,true);
const octagon=(c:Point,r:number):Shape=>radial(c,r,8,-Math.PI/2+Math.PI/8,true);
// A pointed top over a round bottom.
const teardrop=(c:Point,r:number):Shape=>({
  points:([[0,-1],[.52,.1],[.6,.4],[.3,.92],[-.3,.92],[-.6,.4],[-.52,.1]] as Point[]).map(([x,y])=>[c[0]+x*r,c[1]+y*r]),
  corners:[true,false,false,false,false,false,false],
});
const arrow=(c:Point,r:number):Shape=>({
  points:([[-1,-.3],[.2,-.3],[.2,-.7],[1,0],[.2,.7],[.2,.3],[-1,.3]] as Point[]).map(([x,y])=>[c[0]+x*r,c[1]+y*r]),
  corners:Array(7).fill(true),
});
const heart=(c:Point,r:number):Shape=>({
  points:([[0,1],[-.82,.25],[-.88,-.35],[-.3,-.55],[0,-.22],[.3,-.55],[.88,-.35],[.82,.25]] as Point[]).map(([x,y])=>[c[0]+x*r,c[1]+y*r]),
  corners:[true,false,false,false,true,false,false,false],
});

export const radialShapes:Record<RadialShapeKind,(c:Point,r:number)=>Shape>={circle,star,triangle,diamond,pentagon,hexagon,octagon,heart,teardrop,arrow};

export function fitRadius(kind:ShapeKind,c:Point,r:number,hoop:Hoop):number {
  if(c[0]<0||c[1]<0||c[0]>hoop.width||c[1]>hoop.height)return 0;
  const shape=isBoxShape(kind)?boxShape(kind,[-1,-1],[1,1]):radialShapes[kind]([0,0],1);
  const cubics=splineBeziers(shape.points,true,shape.corners),outline=cubics.flatMap(c=>sampleCubic(c));
  // Include exact cubic extrema so the new spline stays inside the hoop at every size.
  for(const c of cubics)for(const k of [0,1]){
    const [a,b,d,e]=c.map(p=>p[k]),A=-a+3*b-3*d+e,B=2*(a-2*b+d),C=b-a,D=B*B-4*A*C;
    const roots=Math.abs(A)<1e-12?(B?[-C/B]:[]):D>=0?[(-B-Math.sqrt(D))/(2*A),(-B+Math.sqrt(D))/(2*A)]:[];
    for(const t of roots)if(t>0&&t<1)outline.push(cubicPoint(c,t));
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
