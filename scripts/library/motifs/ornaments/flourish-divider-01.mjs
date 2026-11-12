import {motif,mirror} from '../../kit.mjs';

export default motif('ornaments.flourish-divider-01','ornaments',{tr:'Kıvrım bordür',en:'Flourish divider'},['kıvrım','süs','ayraç','bordür','flourish','divider','scroll','ornament'],'Kıvrım bordür',b=>{
  // The right half: an S stroke from the centre that ends in a curl, mirrored to the left.
  const curl=[[53.2,50.4],[59,47.4],[66,47.2],[72.5,50.2],[77.8,53.4],[81.6,51],[81.2,46.4],[77.4,45.2],[75.6,48.2]];
  const swell=t=>.9+1.6*Math.sin(Math.PI*Math.min(1,t*1.15))**1.4;
  const minor=[[62.8,48.1],[64.8,52.6],[69.2,55.6],[72.6,54.6]];
  const thin=t=>.9+1.1*Math.sin(Math.PI*t);
  return [
    b.taper('Sol kıvrım','588',curl.map(p=>mirror(p)),swell,{anchors:16}),
    b.taper('Sol küçük kıvrım','588',minor.map(p=>mirror(p)),thin,{anchors:8}),
    b.taper('Sağ küçük kıvrım','588',minor,thin,{anchors:8}),
    b.taper('Sağ kıvrım','588',curl,swell,{anchors:16}),
    b.fill('Orta baklava','354',[[50,45.6],[54.4,50],[50,54.4],[45.6,50]],{corners:true,angle:90}),
  ];
});
