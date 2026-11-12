import {motif,polar,deg} from '../../kit.mjs';

export default motif('geometric-patterns.honeycomb-01','geometric-patterns',{tr:'Petek',en:'Honeycomb'},['petek','altıgen','bal','geometrik','honeycomb','hexagon','geometric'],'Petek',b=>{
  const R=8.4,gap=1.5,a=R*Math.cos(30*deg),d=2*a+gap;
  const hex=c=>Array.from({length:6},(_,i)=>polar(c,R,60*i));
  const ringCells=Array.from({length:6},(_,i)=>polar([50,50],d,30+60*i));
  const tones=['334','354'];
  return [
    ...ringCells.filter((_,i)=>i%2===0).map((c,i)=>b.fill(`Petek ${i*2+1}`,tones[0],hex(c),{corners:true,angle:[0,60,120][i]})),
    ...ringCells.filter((_,i)=>i%2===1).map((c,i)=>b.fill(`Petek ${i*2+2}`,tones[1],hex(c),{corners:true,angle:[30,90,150][i]})),
    b.fill('Orta petek','322',hex([50,50]),{corners:true,angle:90}),
  ];
});
