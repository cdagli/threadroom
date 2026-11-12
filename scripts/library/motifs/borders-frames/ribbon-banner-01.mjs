import {motif,mirror} from '../../kit.mjs';

export default motif('borders-frames.ribbon-banner-01','borders-frames',{tr:'Kurdele afiş',en:'Ribbon banner'},['kurdele','afiş','şerit','yazı','ribbon','banner','label','text'],'Kurdele afiş',b=>{
  const band=[[22,40],[50,35.5],[78,40],[78,52],[50,47.5],[22,52]];
  const tail=[[23,45],[23,61],[7,62.6],[12,54.4],[7,46.2]];
  const fold=[[22,51.4],[29.6,61],[22.6,61]];
  // One thread, sewn left to right: the folds read through their crossing stitch direction.
  return [
    b.fill('Sol kuyruk','483',tail,{corners:true,angle:-5}),
    b.fill('Sol kıvrım','483',fold,{corners:true,angle:60}),
    b.fill('Kurdele şeridi','483',band,{corners:[0,2,3,5],angle:0,underlay:'tatami'}),
    b.fill('Sağ kıvrım','483',fold.map(p=>mirror(p)),{corners:true,angle:-60}),
    b.fill('Sağ kuyruk','483',tail.map(p=>mirror(p)),{corners:true,angle:5}),
    b.line('Üst süs dikişi','505',[[24.5,41.4],[50,37.3],[75.5,41.4]],{length:2.2}),
    b.line('Alt süs dikişi','505',[[75.5,50.6],[50,46],[24.5,50.6]],{length:2.2}),
  ];
});
