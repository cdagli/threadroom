import {motif,polyRegion,difference} from '../../kit.mjs';

export default motif('geometric-patterns.kilim-diamond-01','geometric-patterns',{tr:'Kilim göbeği',en:'Kilim diamond'},['kilim','göbek','baklava','motif','geometrik','kilim','diamond','rug','geometric'],'Kilim göbeği',b=>{
  const diamond=(c,hw,hh)=>[[c[0],c[1]-hh],[c[0]+hw,c[1]],[c[0],c[1]+hh],[c[0]-hw,c[1]]];
  const ringShape=difference(polyRegion(diamond([50,50],16,21)),polyRegion(diamond([50,50],10.6,14)));
  return [
    b.fill('Kilim çerçevesi','149',ringShape,{angle:90,underlay:'tatami'}),
    b.fill('Sol baklava','575',diamond([30,50],3,4.4),{corners:true,angle:0}),
    b.fill('Üst iç baklava','575',diamond([50,40.4],2.2,2.9),{corners:true,angle:0}),
    b.fill('Sağ iç baklava','575',diamond([59.4,50],2.2,2.9),{corners:true,angle:0}),
    b.fill('Alt iç baklava','575',diamond([50,59.6],2.2,2.9),{corners:true,angle:0}),
    b.fill('Sol iç baklava','575',diamond([40.6,50],2.2,2.9),{corners:true,angle:0}),
    b.fill('Sağ baklava','575',diamond([70,50],3,4.4),{corners:true,angle:0}),
    b.fill('Orta baklava','354',diamond([50,50],5,6.6),{corners:true,angle:90}),
  ];
});
