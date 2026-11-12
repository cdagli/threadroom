import {motif,polyRegion,opened,pt} from '../../kit.mjs';

export default motif('geometric-patterns.chevron-band-01','geometric-patterns',{tr:'Zikzak şerit',en:'Chevron band'},['zikzak','şerit','bordür','geometrik','chevron','zigzag','band','border'],'Zikzak şerit',b=>{
  const period=12,amp=4,count=5,x0=50-period*count/2,t=3.2,half=t/2/Math.cos(Math.atan(amp/(period/2)));
  const zig=y=>Array.from({length:2*count+1},(_,i)=>[x0+i*period/2,y+(i%2?-amp:amp)]);
  // Mitred inner corners; square ends perpendicular to the end segments avoid thin wedges.
  const band=y=>{
    const z=zig(y),top=z.map(p=>[p[0],p[1]-half]),bottom=z.map(p=>[p[0],p[1]+half]);
    const end=(p,q)=>{const dx=q[0]-p[0],dy=q[1]-p[1],l=Math.hypot(dx,dy),n=[dy/l*t/2,-dx/l*t/2];return [[p[0]+n[0],p[1]+n[1]],[p[0]-n[0],p[1]-n[1]]];};
    const [a0,a1]=end(z[0],z[1]),[b0,b1]=end(z.at(-1),z.at(-2));
    return [a0,...top.slice(1,-1),b1,b0,...bottom.slice(1,-1).reverse(),a1];
  };
  // Slightly rounded tips sew cleanly; the navy bands run left→right then back, so they share one short move.
  const ends=y=>[[x0+.4,y+amp],[x0+period*count-.4,y+amp]];
  return [['Üst zikzak','588',43.6,false],['Alt zikzak','588',56.4,true],['Orta zikzak','354',50,false]].map(([name,code,y,back])=>{
    const [l,r]=ends(y);return b.fill(name,code,opened(polyRegion(band(y)),.45),{angle:90,entry:pt(back?r:l),exit:pt(back?l:r)});
  });
});
