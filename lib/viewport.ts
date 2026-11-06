import type {Point} from './project';
type Size={width:number;height:number};
// baseScale is CSS pixels per mm at zoom 1, retained until the next explicit fit.
export type Viewport={zoom:number;pan:Point;baseScale?:number};
export function viewportScale(view:Viewport,rect:{width:number;height:number},hoop:{width:number;height:number}) {
  return (view.baseScale??Math.min(rect.width/(hoop.width*1.18),rect.height/(hoop.height*1.18)))*view.zoom;
}
// Freeze pixels per mm as well as zoom: the canvas size must not determine scale after fitting.
// Pan is relative to the canvas centre, so compensate for its movement (the client origin is fixed).
export function keepViewportOnResize(view:Viewport,oldSize:Size,newSize:Size,hoop:Size):Viewport {
  if(oldSize.width<=0||oldSize.height<=0||newSize.width<=0||newSize.height<=0)return view;
  const scale=viewportScale(view,oldSize,hoop);
  return {...view,baseScale:scale/view.zoom,pan:[view.pan[0]+(newSize.width-oldSize.width)/2/scale,view.pan[1]+(newSize.height-oldSize.height)/2/scale]};
}
export function clientToWorld(view:Viewport,client:Point,rect:{left:number;top:number;width:number;height:number},hoop:{width:number;height:number}):Point {
  const width=hoop.width*1.18/view.zoom,height=hoop.height*1.18/view.zoom,scale=viewportScale(view,rect,hoop);
  return [(client[0]-rect.left-(rect.width-width*scale)/2)/scale+hoop.width/2+view.pan[0]-width/2,(client[1]-rect.top-(rect.height-height*scale)/2)/scale+hoop.height/2+view.pan[1]-height/2];
}
export function zoomViewport(view:Viewport,anchor:Point,requestedZoom:number,hoop:{width:number;height:number}):Viewport {
  const zoom=Math.max(.5,Math.min(8,requestedZoom)),ratio=view.zoom/zoom;
  const center:Point=[hoop.width/2+view.pan[0],hoop.height/2+view.pan[1]];
  return {...view,zoom,pan:[anchor[0]+(center[0]-anchor[0])*ratio-hoop.width/2,anchor[1]+(center[1]-anchor[1])*ratio-hoop.height/2]};
}
export function panViewport(view:Viewport,delta:Point,scale:number):Viewport {
  return {...view,pan:[view.pan[0]-delta[0]/scale,view.pan[1]-delta[1]/scale]};
}
export function worldToClient(view:Viewport,world:Point,rect:{left:number;top:number;width:number;height:number},hoop:{width:number;height:number}):Point {
  const width=hoop.width*1.18/view.zoom,height=hoop.height*1.18/view.zoom,scale=viewportScale(view,rect,hoop);
  return [(world[0]-hoop.width/2-view.pan[0]+width/2)*scale+rect.left+(rect.width-width*scale)/2,(world[1]-hoop.height/2-view.pan[1]+height/2)*scale+rect.top+(rect.height-height*scale)/2];
}

export type ViewportInsets={top:number;right:number;bottom:number;left:number};
// The UI supplies fixed chrome reservations; viewport geometry stays independent of the DOM.
export function fitViewport(rect:{width:number;height:number},hoop:{width:number;height:number},insets:ViewportInsets):Viewport {
  const width=Math.max(1,rect.width-insets.left-insets.right),height=Math.max(1,rect.height-insets.top-insets.bottom);
  // Include the 2 mm rim and its shadow, as well as the fabric area.
  const scale=Math.min(width/(hoop.width+6),height/(hoop.height+6));
  const base=viewportScale({zoom:1,pan:[0,0]},rect,hoop);
  return {zoom:scale/base,baseScale:base,pan:[(insets.right-insets.left)/2/scale,(insets.bottom-insets.top)/2/scale]};
}
