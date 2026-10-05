import type {Point} from './project';
export type Viewport={zoom:number;pan:Point};
export function viewportScale(view:Viewport,rect:{width:number;height:number},hoop:{width:number;height:number}) {
  return Math.min(rect.width/(hoop.width*1.18/view.zoom),rect.height/(hoop.height*1.18/view.zoom));
}
export function clientToWorld(view:Viewport,client:Point,rect:{left:number;top:number;width:number;height:number},hoop:{width:number;height:number}):Point {
  const width=hoop.width*1.18/view.zoom,height=hoop.height*1.18/view.zoom,scale=viewportScale(view,rect,hoop);
  return [(client[0]-rect.left-(rect.width-width*scale)/2)/scale+hoop.width/2+view.pan[0]-width/2,(client[1]-rect.top-(rect.height-height*scale)/2)/scale+hoop.height/2+view.pan[1]-height/2];
}
export function zoomViewport(view:Viewport,anchor:Point,requestedZoom:number,hoop:{width:number;height:number}):Viewport {
  const zoom=Math.max(.5,Math.min(8,requestedZoom)),ratio=view.zoom/zoom;
  const center:Point=[hoop.width/2+view.pan[0],hoop.height/2+view.pan[1]];
  return {zoom,pan:[anchor[0]+(center[0]-anchor[0])*ratio-hoop.width/2,anchor[1]+(center[1]-anchor[1])*ratio-hoop.height/2]};
}
export function panViewport(view:Viewport,delta:Point,scale:number):Viewport {
  return {...view,pan:[view.pan[0]-delta[0]/scale,view.pan[1]-delta[1]/scale]};
}
