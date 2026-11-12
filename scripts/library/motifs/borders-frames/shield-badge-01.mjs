import {motif,region,simplify,offsetRegion} from '../../kit.mjs';

export default motif('borders-frames.shield-badge-01','borders-frames',{tr:'Kalkan arma',en:'Shield badge'},['kalkan','arma','yama','shield','badge','patch','crest'],'Kalkan arma',b=>{
  const shield=[[32,30.5],[50,28.8],[68,30.5],[68.2,46],[62,61],[50,71],[38,61],[31.8,46]],corners=[0,2,5];
  const inset=simplify(offsetRegion(region(shield,{corners}),-4.2),.04)[0][0];
  return [
    b.fill('Kalkan zemini','150',shield,{corners,angle:60,underlay:'tatami'}),
    b.path('İç süs dikişi','575',[...inset,inset[0]],{length:2.4}),
    b.line('Kalkan kenarı','575',shield,{kind:'satin',closed:true,corners,width:3}),
  ];
});
