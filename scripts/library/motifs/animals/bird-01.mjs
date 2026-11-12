import {motif,region,polyRegion,union,intersection,difference,offsetRegion} from '../../kit.mjs';

export default motif('animals.bird-01','animals',{tr:'Kuş',en:'Little bird'},['kuş','serçe','bahar','bird','robin','spring'],'Kuş',b=>{
  const body=region([[63.4,32.6],[69.6,37],[70.4,43],[66.4,53],[57,58.6],[46,57.4],[37.4,51],[27.6,40.4],[37.6,42.2],[47,40.6],[54.4,34.6]],{corners:[7]});
  const breastRaw=polyRegion([[76,41.6],[64,45.6],[53,47.4],[47,60],[47,72],[82,72],[82,41.6]]);
  const wingRaw=region([[56.6,41.6],[54,51.6],[46,59],[35.6,52.6],[44,45.4]],{corners:[3]});
  const wing=intersection(body,wingRaw),breast=difference(intersection(body,breastRaw),offsetRegion(wing,-.4));
  return [
    b.fill('Kuş gövdesi','015',difference(body,offsetRegion(union(breastRaw,wingRaw),-.4)),{angle:150}),
    b.fill('Göğüs','122',breast,{angle:60}),
    b.fill('Kanat','588',wing,{angle:30}),
    b.dot('Göz','588',[64.6,38.6],{size:1.9,along:.7,angle:90}),
    b.line('Kanat tüyü 1','150',[[54,45.6],[50.4,49.8],[44.6,52]],{length:1.6}),
    b.line('Kanat tüyü 2','150',[[52.2,51.2],[48,54.6],[42,54.4]],{length:1.6}),
    b.fill('Gaga','322',[[69.4,37.4],[76,40],[69.8,42.6]],{corners:true,angle:90}),
    b.line('Sol bacak','322',[[52.4,57.4],[51.8,64],[55.2,64.6]],{kind:'bean',corners:[1],length:1.2}),
    b.line('Sağ bacak','322',[[57.8,57.4],[57.8,64],[61.2,64.6]],{kind:'bean',corners:[1],length:1.2}),
  ];
});
