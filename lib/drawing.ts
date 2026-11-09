import type {Kind,Point} from './project';
export type DrawingTool='open'|'closed'|'points';
type Click={p:Point;time:number};
export type DraftState={points:Point[];corners:boolean[];lastLeft?:Click;lastRight?:Click};
export const movedForDrawing=(start:Point,p:Point)=>Math.hypot(p[0]-start[0],p[1]-start[1])>=.5;
export function snapAngle(start:Point,p:Point):Point {
  const dx=p[0]-start[0],dy=p[1]-start[1],r=Math.hypot(dx,dy),a=Math.round(Math.atan2(dy,dx)/(Math.PI/12))*Math.PI/12;
  return [start[0]+r*Math.cos(a),start[1]+r*Math.sin(a)];
}
export function lockAxis(start:Point,p:Point):Point {return Math.abs(p[0]-start[0])>=Math.abs(p[1]-start[1])?[p[0],start[1]]:[start[0],p[1]];}
export function draftClick(state:DraftState,event:{p:Point;button:number;time:number;detail:number;scale:number;ctrl:boolean;onFirst:boolean;tool?:DrawingTool;smoothDefault?:boolean}):DraftState&{action:'none'|'close'} {
  const {p,button,time,scale}=event,near=(click?:Click)=>!!click&&time-click.time<400&&Math.hypot(p[0]-click.p[0],p[1]-click.p[1])*scale<=16;
  const unchanged={...state,action:'none' as const};
  if(button!==0&&button!==2)return unchanged;
  if(button===2&&near(state.lastRight))return unchanged;
  if(event.onFirst)return state.points.length>2?{...state,action:'close'}:unchanged;
  const double=event.tool!=='points'&&button===0&&(event.detail>=2||near(state.lastLeft)),points=double?state.points.slice(0,-1):[...state.points],corners=double?state.corners.slice(0,-1):[...state.corners];
  if(double&&!state.points.length)return unchanged;
  const reference=points.at(-1);
  points.push(event.ctrl&&reference?snapAngle(reference,p):[...p]);corners.push(event.smoothDefault?button!==0||double:button===0&&!double);
  return {...state,points,corners,...(button===0?{lastLeft:{p:[...p] as Point,time}}:{lastRight:{p:[...p] as Point,time}}),action:'none'};
}
export function completeDraft(tool:DrawingTool,points:Point[],corners:boolean[],how:'enter'|'first'|'switch'):{closed:boolean;kind:Kind}|null {
  void corners;const closed=tool==='closed'||how==='first'&&tool==='open';
  return points.length<(closed?3:2)?null:{closed,kind:closed?'fill':tool==='points'?'manual':'running'};
}
