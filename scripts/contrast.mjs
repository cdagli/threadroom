import {readFileSync} from 'node:fs';

// Read the actual theme, so changing a token cannot leave a stale passing palette here.
const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
const root=css.match(/:root\s*\{([^}]+)\}/)?.[1];
if(!root)throw new Error('Missing :root theme');
const tokens=Object.fromEntries([...root.matchAll(/(--[\w-]+)\s*:\s*(#[\da-f]{6}(?:[\da-f]{2})?)\s*;/gi)].map(([,name,value])=>[name,value]));
const rgb=name=>{
  const hex=tokens[name];
  if(!hex)throw new Error(`Missing colour token: ${name}`);
  return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
};
function luminance(channels){
  const linear=channels.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
  return linear.reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
}
function contrast(foreground,background){
  const bg=rgb(background),fg=rgb(foreground),hex=tokens[foreground];
  if(tokens[background].length!==7)throw new Error(`Background must be opaque: ${background}`);
  const alpha=hex.length===9?parseInt(hex.slice(7),16)/255:1;
  const a=luminance(fg.map((v,i)=>v*alpha+bg[i]*(1-alpha))),b=luminance(bg);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
const pairs=(foregrounds,backgrounds)=>foregrounds.flatMap(f=>backgrounds.map(b=>[f,b]));
const surfaces=['--surface','--surface-raised','--surface-sunken','--surface-hover','--surface-pressed','--accent-soft','--selected','--danger-soft','--warning-soft','--success-soft'];
const canvasSurfaces=['--fabric','--bg-workspace'];
const checks=[
  ['Body text',7,pairs(['--text'],[...surfaces,...canvasSurfaces])],
  ['Secondary text',4.5,pairs(['--text-muted'],[...surfaces,'--bg-workspace'])],
  ['Icons',3,pairs(['--icon'],[...surfaces,'--bg-workspace'])],
  // Control borders touch white panels, sunken inputs, hover fills and soft playback/check fills.
  // Pressed and selected controls use the accent inset outline instead.
  ['Control borders',3,pairs(['--border-control'],['--surface-raised','--surface-sunken','--surface-hover','--accent-soft'])],
  ['Accent controls',3,pairs(['--accent','--accent-hover','--accent-strong'],[...surfaces,'--bg-workspace'])],
  ['Accent labels',4.5,pairs(['--accent','--accent-strong'],surfaces)],
  ['Primary button text',4.5,pairs(['--accent-contrast'],['--accent','--accent-hover','--accent-strong'])],
  ['Selected outlines / row bar',3,pairs(['--accent'],['--selected','--surface-hover','--surface-raised'])],
  ['Focus rings',3,pairs(['--focus'],[...surfaces,...canvasSurfaces])],
  ['Danger text',4.5,pairs(['--danger'],['--danger-soft','--surface-raised'])],
  ['Warning text',4.5,pairs(['--warning'],['--warning-soft','--surface-raised'])],
  ['Success text',4.5,pairs(['--success'],['--success-soft','--surface-raised'])],
  ['Warning dots / icons',3,pairs(['--warning-icon'],['--surface-raised','--surface-hover','--selected','--warning-soft'])],
  ['Canvas handles / selection',3,pairs(['--accent','--success','--danger'],[...canvasSurfaces,'--surface-raised'])],
  ['Canvas issue halo',3,pairs(['--warning','--danger'],canvasSurfaces)],
  ['Draft nodes / cursor',3,pairs(['--draft-node','--draft-cursor'],canvasSurfaces)],
  ['Measure line',3,pairs(['--measure-line'],canvasSurfaces)],
  ['Measure label',4.5,pairs(['--measure-line'],['--surface-raised'])],
  ['Travel overlay',3,pairs(['--travel-jump','--travel-line','--danger'],[...canvasSurfaces,'--surface-raised'])],
];
let failed=false,total=0;
for(const [label,target,list] of checks){
  const results=list.map(([fg,bg])=>({fg,bg,ratio:contrast(fg,bg)}));
  const worst=results.reduce((a,b)=>a.ratio<b.ratio?a:b);
  const pass=results.every(r=>r.ratio>=target);failed||=!pass;total+=results.length;
  console.log(`${pass?'PASS':'FAIL'} ${label}: min ${worst.ratio.toFixed(2)}:1 >= ${target}:1 (${worst.fg} on ${worst.bg}; ${list.length} pairs)`);
  for(const r of results.filter(r=>r.ratio<target))console.log(`  FAIL ${r.fg} ${tokens[r.fg]} on ${r.bg} ${tokens[r.bg]}: ${r.ratio.toFixed(2)}:1 < ${target}:1`);
}
// Dividers, shadow-separated overlay outlines, hoop edge, grid/weave and centre cross are decorative.
// Thread dyes, fabric textures, placeholders and disabled controls are excluded.
console.log(`${failed?'FAIL':'PASS'} ${total} token pairs checked.`);
if(failed)process.exitCode=1;
