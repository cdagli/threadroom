import {motif,polar} from '../../kit.mjs';

export default motif('seasonal.snowflake-01','seasonal',{tr:'Kar tanesi',en:'Snowflake'},['kar','kış','yılbaşı','tane','snow','snowflake','winter','christmas'],'Kar tanesi',b=>{
  const c=[50,50],objects=[b.fill('Kar tanesi göbeği','512',Array.from({length:6},(_,i)=>polar(c,3.6,-90+60*i)),{corners:true,angle:0})];
  for(let i=0;i<6;i++){
    const a=-90+60*i,branch=(r,len,spread)=>[polar(polar(c,r,a),len,a-spread),polar(c,r,a),polar(polar(c,r,a),len,a+spread)];
    objects.push(b.line(`Kol ${i+1}`,'512',[polar(c,2.4,a),polar(c,20,a)],{kind:'satin',width:1.4}));
    objects.push(b.line(`Kol ${i+1} dış dal`,'512',branch(14.2,4.2,48),{kind:'satin',width:1.2,corners:[1]}));
    objects.push(b.line(`Kol ${i+1} iç dal`,'512',branch(8.4,5.4,48),{kind:'satin',width:1.2,corners:[1]}));
  }
  return objects;
});
