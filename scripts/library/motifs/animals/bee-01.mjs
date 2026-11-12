import {motif,region,polyRegion,disc,simplify,union,intersection,difference,offsetRegion,regionRings} from '../../kit.mjs';

export default motif('animals.bee-01','animals',{tr:'Arı',en:'Bee'},['arı','böcek','bal','bee','bug','honey'],'Arı',b=>{
  const body=region([[35.5,55.5],[41,47.6],[50,45],[58.5,46.4],[63,53.5],[58.5,61.6],[50,63.6],[41,61.4]],{corners:[0]});
  const head=disc([66.2,51.2],6.2);
  const wingL=region([[51,46.6],[44.6,41.2],[42,33.6],[46.6,30.8],[51.6,35.6],[53.2,42]],{corners:[0]});
  const wingR=region([[54.4,46.4],[55.4,40],[59.6,33],[64.6,33.4],[64,39.6],[58,45.6]],{corners:[0]});
  const torso=difference(body,offsetRegion(head,-.4),offsetRegion(union(wingL,wingR),-.4));
  const stripe=(x0,x1,bow=1.6)=>{const edge=x=>Array.from({length:13},(_,i)=>{const y=40+i*2.2,t=(y-54.4)/9.4;return [x+bow*(1-t*t),y];});return polyRegion([...edge(x0),...edge(x1).reverse()]);};
  const cuts=[30,41.6,46.8,52,57.4,80],part=i=>offsetRegion(intersection(torso,stripe(cuts[i],cuts[i+1])),.3);
  return [
    b.fill('Gövde sarı 1','334',intersection(part(1),torso),{angle:80}),
    b.fill('Gövde sarı 2','334',intersection(part(3),torso),{angle:95}),
    b.line('Uçuş izi','717',[[34,57],[28.5,59.6],[22.6,58],[21,53.4],[24.6,51],[27.4,54],[24.8,58.6],[18.6,61.6],[12.6,60.6]].reverse(),{length:2.6}),
    b.fill('Kuyruk','717',intersection(part(0),torso),{angle:60}),
    b.fill('Gövde çizgisi','717',intersection(part(2),torso),{angle:85}),
    b.fill('Baş','717',head,{angle:120}),
    b.line('Sol anten','717',[[63.8,45.6],[63.4,41.4],[61,38.8],[59.4,40.2]],{kind:'bean',length:1.2}),
    b.line('Sağ anten','717',[[67.8,45.3],[69.8,41],[72.8,39.8],[73.2,42]],{kind:'bean',length:1.2}),
    b.fill('Sol kanat','000',wingL,{angle:120}),
    b.fill('Sağ kanat','000',wingR,{angle:60}),
    b.dot('Göz','000',[68.4,50.2],{size:1.7,along:.6,angle:90}),
    b.path('Sol kanat kenarı','512',[...regionRings(simplify(wingL,.05))[0],regionRings(simplify(wingL,.05))[0][0]],{length:1.8}),
    b.path('Sağ kanat kenarı','512',[...regionRings(simplify(wingR,.05))[0],regionRings(simplify(wingR,.05))[0][0]],{length:1.8}),
  ];
});
