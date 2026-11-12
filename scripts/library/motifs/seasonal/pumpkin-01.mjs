import {motif,ellipse,region,difference,offsetRegion} from '../../kit.mjs';

export default motif('seasonal.pumpkin-01','seasonal',{tr:'Bal kabağı',en:'Pumpkin'},['bal kabağı','kabak','sonbahar','cadılar bayramı','pumpkin','autumn','fall','halloween'],'Bal kabağı',b=>{
  const lobe=(cx,rx,ry,cy=53)=>region(ellipse([cx,cy],rx,ry,8));
  const L={c:lobe(50,8.6,15.4,52.6),il:lobe(41.4,8.4,14.4),ir:lobe(58.6,8.4,14.4),ol:lobe(32.4,7.8,12.6,53.6),or:lobe(67.6,7.8,12.6,53.6)};
  const stem=region([[47.6,40.6],[46.8,35],[48.4,30.4],[52.4,27.8],[53.4,29.6],[51.6,33.6],[52.2,40.2]],{corners:[3,4]});
  const inset=g=>offsetRegion(g,-.4);
  const centre=difference(L.c,inset(stem));
  return [
    b.fill('Sol dış dilim','336',difference(L.ol,inset(L.il)),{angle:65}),
    b.fill('Sağ dış dilim','336',difference(L.or,inset(L.ir)),{angle:115}),
    b.fill('Orta dilim','336',centre,{angle:90}),
    b.fill('Sol iç dilim','224',difference(L.il,inset(L.c),inset(stem)),{angle:78}),
    b.fill('Sağ iç dilim','224',difference(L.ir,inset(L.c),inset(stem)),{angle:102}),
    b.fill('Sap','414',stem,{angle:80}),
    b.fill('Yaprak','463',[[47.2,38.8],[42.4,34.8],[36.4,34.6],[38.6,30.4],[44,30.2]],{corners:[0,2],angle:20}),
    b.line('Kıvrık filiz','446',[[52.6,37.6],[57.6,36.2],[61.4,32.4],[60.4,29],[57.2,29.8],[58.2,33]],{length:1.4}),
  ];
});
