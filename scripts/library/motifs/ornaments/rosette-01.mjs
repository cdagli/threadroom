import {motif,circle,polar,rotate} from '../../kit.mjs';

export default motif('ornaments.rosette-01','ornaments',{tr:'Rozet',en:'Rosette'},['rozet','göbek','çini','iznik','süs','rosette','tile','mandala','ornament'],'Rozet',b=>{
  const c=[50,50],petal=a=>{const at=(r,o)=>rotate([c[0]+r,c[1]+o],c,a);return [at(6.4,0),at(10.5,3.6),at(15.5,3.4),at(20,0),at(15.5,-3.4),at(10.5,-3.6)];};
  const objects=[];
  for(let i=0;i<8;i+=2)objects.push(b.fill(`Lacivert yaprak ${i/2+1}`,'575',petal(i*45-90),{corners:[0,3],angle:Math.round(((i*45-90)%180+180)%180)}));
  for(let i=1;i<8;i+=2)objects.push(b.fill(`Turkuaz yaprak ${(i+1)/2}`,'483',petal(i*45-90),{corners:[0,3],angle:Math.round(((i*45-90)%180+180)%180)}));
  for(let i=0;i<8;i++)objects.push(b.fill(`Kırmızı benek ${i+1}`,'149',circle(polar(c,18,i*45-90+22.5),1.7,6),{angle:0}));
  objects.push(b.fill('Göbek','149',circle(c,4.6),{pattern:'circular',angle:0}));
  return objects;
});
