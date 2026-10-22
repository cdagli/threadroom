import type {Point} from './project';
export function measurePoint(a:Point,b:Point,snap:boolean):Point{
  if(!snap)return b;const d=Math.hypot(b[0]-a[0],b[1]-a[1]),r=Math.round(Math.atan2(b[1]-a[1],b[0]-a[0])/(Math.PI/12))*Math.PI/12;return [a[0]+d*Math.cos(r),a[1]+d*Math.sin(r)];
}
// Canvas y grows down: positive angles are clockwise, matching stitch angles.
export const measureAngle=(a:Point,b:Point)=>((Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI)%360+360)%360;
