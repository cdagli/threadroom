import {motif,circle} from '../../kit.mjs';

export default motif('borders-frames.round-badge-01','borders-frames',{tr:'Yuvarlak arma',en:'Round badge'},['arma','rozet','daire','yama','badge','patch','circle','emblem'],'Yuvarlak arma',b=>[
  b.fill('Arma zemini','012',circle([50,50],19.2),{angle:45,underlay:'tatami'}),
  b.line('İç süs dikişi','588',circle([50,50],15.6),{closed:true,length:2.4}),
  b.line('Arma kenarı','588',circle([50,50],19.6),{kind:'satin',closed:true,width:3}),
]);
