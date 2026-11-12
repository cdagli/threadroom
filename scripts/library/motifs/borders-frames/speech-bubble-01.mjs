import {motif} from '../../kit.mjs';

export default motif('borders-frames.speech-bubble-01','borders-frames',{tr:'Konuşma balonu',en:'Speech bubble'},['konuşma','balon','yazı','mesaj','speech','bubble','talk','text'],'Konuşma balonu',b=>{
  const bubble=[[50,30],[67,31.8],[73,44],[67,55.4],[50,57.4],[43.5,57.3],[34.5,67],[37.2,55.4],[29.5,51.5],[27,44],[33,31.8]],corners=[5,6,7];
  return [
    b.fill('Balon zemini','000',bubble,{corners,angle:30,underlay:'tatami'}),
    b.line('Balon kenarı','747',bubble,{kind:'satin',closed:true,corners,width:1.4}),
  ];
});
