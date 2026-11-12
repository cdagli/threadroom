import {motif,polyRegion,opened,simplify,polar,offsetRegion} from '../../kit.mjs';

export default motif('symbols.star-01','symbols',{tr:'Yıldız',en:'Star'},['yıldız','parıltı','star','sparkle'],'Yıldız',b=>{
  const c=[50,51.2],star=Array.from({length:10},(_,i)=>polar(c,i%2?8.4:20,-90+36*i));
  const shape=opened(polyRegion(star),.7);
  const inset=simplify(offsetRegion(shape,-2.6),.04)[0][0];
  return [
    b.fill('Yıldız dolgusu','334',shape,{angle:75,underlay:'tatami'}),
    b.path('Yıldız iç dikişi','354',[...inset,inset[0]],{length:2.2}),
  ];
});
