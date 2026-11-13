import type {AngleGuide, Point, StitchObject} from './project';
// Ember's Edit angles: straight guides across a fill. One guide sets the stitch angle; two or more
// sweep row fills and satin fill between them (embroidery/sweep.py); Streamlines use the guides as
// its flow field (Ember's Edit flow field). Circular and cross stitch fills have no direction field.
export const guideLimits={count:8,minLength:.5,trigger:[.1,1] as const,defaultTrigger:.5};
export type GuideMode='angles'|'flow';
export function guideMode(o:StitchObject):GuideMode|null {
  if(o.kind!=='fill'||o.fillPattern==='circular'||o.fillPattern==='crossStitchFill'||o.fillPattern==='longShort')return null;
  return o.fillPattern==='streamlines'?'flow':'angles';
}
/** @test */ export const guideAngle=(g:AngleGuide)=>Math.atan2(g.b[1]-g.a[1],g.b[0]-g.a[0])*180/Math.PI;
const distance=(p:Point,a:Point,b:Point)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
// Crossing or touching guides (T-junctions too) are invalid, as in Ember; the compiler then follows the first.
function crosses(g:AngleGuide,h:AngleGuide):boolean {
  if(Math.min(distance(g.a,h.a,h.b),distance(g.b,h.a,h.b),distance(h.a,g.a,g.b),distance(h.b,g.a,g.b))<1e-6)return true;
  const side=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  return (side(h.a,h.b,g.a)>0)!==(side(h.a,h.b,g.b)>0)&&(side(g.a,g.b,h.a)>0)!==(side(g.a,g.b,h.b)>0);
}
export const crossingGuides=(guides:readonly AngleGuide[])=>guides.map((g,i)=>guides.some((h,j)=>j!==i&&crosses(g,h)));
// The guides the stitches follow: two or more sweep the rows, unless two cross.
export const sweeping=(o:StitchObject)=>guideMode(o)==='angles'&&(o.angleGuides?.length??0)>1&&!crossingGuides(o.angleGuides!).some(Boolean);
const round=(n:number)=>Math.round(n*10)/10;
// The patch for new guides: one guide also sets the stitch angle (Streamlines keep theirs).
export function withGuides(o:StitchObject,guides:AngleGuide[]):Partial<StitchObject> {
  const one=guides.length===1&&guideMode(o)==='angles';
  return {angleGuides:guides.length?guides:undefined,...(one?{angle:round(guideAngle(guides[0]))}:{})};
}
// With one guide the angle input turns the guide about its midpoint.
export function setGuidedAngle(o:StitchObject,angle:number):Partial<StitchObject> {
  const g=o.angleGuides;if(g?.length!==1||guideMode(o)!=='angles')return {angle};
  const m:Point=[(g[0].a[0]+g[0].b[0])/2,(g[0].a[1]+g[0].b[1])/2],h=Math.hypot(g[0].b[0]-g[0].a[0],g[0].b[1]-g[0].a[1])/2,r=angle*Math.PI/180;
  return {angle,angleGuides:[{a:[m[0]-Math.cos(r)*h,m[1]-Math.sin(r)*h],b:[m[0]+Math.cos(r)*h,m[1]+Math.sin(r)*h]}]};
}
// Entering Edit angles on a fill without guides seeds one across its bounds at the current angle.
export function seedGuide(o:StitchObject):AngleGuide {
  const pts=o.rings.flat(),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const c:Point=[(x0+x1)/2,(y0+y1)/2],r=o.angle*Math.PI/180,d:Point=[Math.cos(r),Math.sin(r)];
  // Half-length to the bounding box along the angle, at least half the minimum guide.
  const reach=Math.max(guideLimits.minLength,Math.min(Math.abs(d[0])>1e-9?(x1-x0)/2/Math.abs(d[0]):Infinity,Math.abs(d[1])>1e-9?(y1-y0)/2/Math.abs(d[1]):Infinity));
  return {a:[c[0]-d[0]*reach,c[1]-d[1]*reach],b:[c[0]+d[0]*reach,c[1]+d[1]*reach]};
}
// Moving one end; a guide shorter than the minimum keeps its previous end.
export function moveGuideEnd(guides:readonly AngleGuide[],index:number,end:'a'|'b',p:Point):AngleGuide[] {
  return guides.map((g,i)=>{if(i!==index)return g;const next={...g,[end]:p};return Math.hypot(next.b[0]-next.a[0],next.b[1]-next.a[1])<guideLimits.minLength?g:next;});
}
export const addGuide=(guides:readonly AngleGuide[],a:Point,b:Point):AngleGuide[]|null=>guides.length>=guideLimits.count||Math.hypot(b[0]-a[0],b[1]-a[1])<guideLimits.minLength?null:[...guides,{a,b}];
export const removeGuide=(guides:readonly AngleGuide[],index:number)=>guides.filter((_,i)=>i!==index);
// Transforms move guides with the shape; one guide keeps the stitch angle in step.
export function transformGuides(o:StitchObject,move:(p:Point)=>Point):Partial<StitchObject> {
  if(!o.angleGuides)return {};
  const angleGuides=o.angleGuides.map(g=>({a:move(g.a),b:move(g.b)}));
  return {angleGuides,...(angleGuides.length===1&&guideMode(o)==='angles'?{angle:round(guideAngle(angleGuides[0]))}:{})};
}
