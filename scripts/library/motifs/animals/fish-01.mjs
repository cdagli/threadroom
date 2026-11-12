import {motif,region,polyRegion,disc,intersection,difference,offsetRegion} from '../../kit.mjs';

export default motif('animals.fish-01','animals',{tr:'Balık',en:'Fish'},['balık','deniz','su','fish','sea','ocean'],'Balık',b=>{
  const body=region([[78.5,50.4],[71,40.8],[60,38],[49,41.6],[42.6,48.6],[42.6,52.2],[49,58.6],[60,62.4],[71,59.8]],{corners:[0,4,5]});
  const headCut=polyRegion([[66.4,30],[64,40],[63,50],[64,60],[66.4,70],[90,70],[90,30]]);
  const head=intersection(body,headCut),rest=difference(body,offsetRegion(headCut,-.4));
  const eye=disc([71.4,47.4],2.2);
  return [
    b.fill('Kuyruk','336',[[46.4,47.6],[34.4,39.6],[31.4,41],[36,50.4],[31.4,59.8],[34.4,61.2],[46.4,53.2]],{corners:[1,2,3,4,5],angle:0}),
    b.fill('Sırt yüzgeci','336',[[52,41.6],[54.4,35.4],[58.6,32.8],[64.2,34.6],[65,39]],{corners:[0,4],angle:120}),
    b.fill('Karın yüzgeci','336',[[57,61.6],[54.2,66],[58.4,67.6],[62.6,62.4]],{corners:[0,3],angle:60}),
    b.fill('Balık gövdesi','483',rest,{angle:0}),
    b.fill('Balık başı','505',difference(head,offsetRegion(eye,-.4)),{angle:90}),
    b.line('Pul 1','505',[[50.4,44.6],[53.6,47.6],[50.4,50.6]],{length:1.4}),
    b.line('Pul 2','505',[[50.4,50.2],[53.6,53.2],[50.4,56.2]],{length:1.4}),
    b.line('Pul 3','505',[[56.4,41.6],[59.6,44.8],[56.4,48]],{length:1.4}),
    b.line('Pul 4','505',[[56.4,47.4],[59.6,50.6],[56.4,53.8]],{length:1.4}),
    b.line('Pul 5','505',[[56.4,53.2],[59.6,56.4],[56.4,59.6]],{length:1.4}),
    b.fill('Göz','000',eye,{angle:45}),
    b.dot('Göz bebeği','057',[72,47.2],{size:1.6,along:.5,angle:90}),
  ];
});
