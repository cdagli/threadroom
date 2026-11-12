import {motif,disc,difference} from '../../kit.mjs';

export default motif('symbols.evil-eye-01','symbols',{tr:'Nazar boncuğu',en:'Evil eye'},['nazar','boncuk','göz','şans','evil eye','nazar','bead','luck'],'Nazar boncuğu',b=>{
  const c=[50,50],annulus=(r0,r1)=>difference(disc(c,r1),disc(c,r0));
  return [
    b.fill('Lacivert halka','586',annulus(11.6,18),{pattern:'circular'}),
    b.fill('Beyaz halka','000',annulus(7.5,12),{pattern:'circular'}),
    b.fill('Göz bebeği','100',disc(c,4.9),{pattern:'circular'}),
    b.fill('Açık mavi halka','150',annulus(4.5,7.9),{pattern:'circular'}),
    b.dot('Işıltı','150',[48.2,48.2],{size:1.3,along:.5,angle:-45}),
  ];
});
