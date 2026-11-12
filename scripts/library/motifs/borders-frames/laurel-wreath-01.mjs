import {motif,polar,mirror,deg} from '../../kit.mjs';

export default motif('borders-frames.laurel-wreath-01','borders-frames',{tr:'Defne çelengi',en:'Laurel wreath'},['defne','çelenk','yaprak','çerçeve','laurel','wreath','frame','leaf'],'Defne çelengi',b=>{
  const c=[50,47],R=21,stemAngles=[95,112,135,158,181,204,227,248];
  const leftStem=[[55.5,72.8],...stemAngles.map(a=>polar(c,R,a))];
  const objects=[
    b.line('Sol dal','446',leftStem,{kind:'satin',width:1.3}),
    b.line('Sağ dal','446',leftStem.map(p=>mirror(p)).reverse(),{kind:'satin',width:1.3}),
  ];
  // Leaves sit in pairs along each stem, leaning toward its tip; the last one caps it.
  const leaf=(base,dir,length,width)=>{
    const u=[Math.cos(dir*deg),Math.sin(dir*deg)],n=[-u[1],u[0]],at=(s,o)=>[base[0]+u[0]*s+n[0]*o,base[1]+u[1]*s+n[1]*o];
    return [at(0,0),at(length*.42,width/2),at(length,0),at(length*.42,-width/2)];
  };
  const leaves=[];
  for(const [i,a] of [121,146,171,196,221].entries()){
    const tangent=a+90; // direction of travel toward the top of the left branch (counter-clockwise on screen)
    const outer=polar(c,R+.1,a),inner=polar(c,R-.1,a+5);
    const size=9.2-i*.4;
    leaves.push({side:'outer',points:leaf(outer,tangent+180-38+180,size,3.5),a},{side:'inner',points:leaf(inner,tangent+38,size-.8,3.3),a});
  }
  const tipBase=polar(c,R,246),tipDir=246+90;
  leaves.push({side:'tip',points:leaf(tipBase,tipDir,7.4,3.3),a:250});
  // Left branch top→bottom, then the right branch bottom→top, keeping neighbours together.
  const leftLeaves=[...leaves].sort((p,q)=>q.a-p.a);
  const names={outer:'dış',inner:'iç',tip:'uç'};
  leftLeaves.forEach((l,i)=>objects.push(b.fill(`Sol ${names[l.side]} yaprak ${i+1}`,'463',l.points,{corners:[0,2],angle:Math.round(l.a+90+45)%180})));
  [...leftLeaves].reverse().forEach((l,i)=>objects.push(b.fill(`Sağ ${names[l.side]} yaprak ${i+1}`,'463',l.points.map(p=>mirror(p)),{corners:[0,2],angle:Math.round(180-(l.a+90+45)%180)%180})));
  return objects;
});
