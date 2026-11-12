import {motif,ellipse,deg} from '../../kit.mjs';

export default motif('borders-frames.scalloped-frame-01','borders-frames',{tr:'Dantel çerçeve',en:'Scalloped frame'},['dantel','fisto','çerçeve','oval','scallop','lace','frame','oval'],'Dantel çerçeve',b=>{
  const c=[50,50],rx=28,ry=20,n=18,points=[],corners=[];
  for(let i=0;i<n;i++){
    const a=-90+360*i/n,m=a+180/n;
    corners.push(points.length);points.push([c[0]+rx*Math.cos(a*deg),c[1]+ry*Math.sin(a*deg)]);
    points.push([c[0]+(rx+2.8)*Math.cos(m*deg),c[1]+(ry+2.8)*Math.sin(m*deg)]);
  }
  return [
    b.line('Dantel kenar','024',points,{kind:'bean',closed:true,corners,length:1.6}),
    b.line('İç süs dikişi','024',ellipse(c,rx-3.4,ry-3.4,8),{closed:true,length:2.2}),
  ];
});
