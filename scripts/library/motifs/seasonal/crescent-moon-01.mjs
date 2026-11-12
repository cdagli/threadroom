import {motif,polyRegion,disc,opened,polar,difference} from '../../kit.mjs';

export default motif('seasonal.crescent-moon-01','seasonal',{tr:'Hilal ve yıldızlar',en:'Crescent and stars'},['hilal','ay','yıldız','gece','ramazan','bayram','moon','crescent','star','night','ramadan'],'Hilal ve yıldızlar',b=>{
  const moon=opened(difference(disc([46,51],18),disc([54.4,46.4],15.2)),.8);
  const star=(c,R)=>opened(polyRegion(Array.from({length:10},(_,i)=>polar(c,i%2?R*.42:R,-90+36*i))),.45);
  return [
    b.fill('Hilal','354',moon,{pattern:'circular'}),
    b.fill('Büyük yıldız','354',star([62.4,47.6],6.4),{angle:75}),
    b.fill('Küçük yıldız','354',star([55.4,33.6],4.6),{angle:75}),
    b.fill('Minik yıldız','354',star([70.4,34.8],3.8),{angle:75}),
  ];
});
