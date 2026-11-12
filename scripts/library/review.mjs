// Review library motifs the way a customer gets them: insert → design checks → real compiler → pictures.
//   node scripts/library/review.mjs bee fish        review items whose id contains any word
//   node scripts/library/review.mjs --all           review the whole catalog (slow for big catalogs)
// Writes agent-out/library-review/sheet.png (stitch render, travel dashed) and thumbs.png (panel previews),
// prints stats, warnings and the nearest existing silhouettes. Exit code 1 when a motif fails the bar:
// insertion fails, any warning in the 100×100 hoop, or any failure in the 60×40 hoop.
import {writeFileSync,mkdirSync,existsSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {load} from '../../tests/load-lib.mjs';
import {nearest,duplicateThreshold} from './silhouette.mjs';
const {libraryAssets}=load('library-assets');
const {insertLibraryAsset}=load('library');
const {blankProject,hoops,isFillKind}=load('project');
const {geometryPayload}=load('curves');
const {checkProject}=load('check');
const {designBounds,objectGeometry}=load('editor-render');

const root=fileURLToPath(new URL('../..',import.meta.url)),out=path.join(root,'agent-out/library-review');
const words=process.argv.slice(2).filter(w=>!w.startsWith('--')),all=process.argv.includes('--all');
const chosen=libraryAssets.filter(a=>all||words.some(w=>a.id.includes(w)));
if(!chosen.length){console.error('Usage: review.mjs <id words…> | --all');process.exit(1);}
mkdirSync(out,{recursive:true});

const entries=[],design={},names={};
for(const a of chosen)for(const hoop of ['100x100','60x40']){
  const h=hoops[hoop];let n=0;
  const r=insertLibraryAsset(blankProject(a.name.en,hoop),a,[h.width/2,h.height/2],()=>`copy-${++n}`);
  if(!r){design[a.id+hoop]=['fail insert: does not fit or invalid'];continue;}
  for(const o of r.project.objects)names[o.id]=o.name;
  design[a.id+hoop]=checkProject(r.project).map(w=>`${w.severity} ${w.code} ${names[w.objectId]??''} ${JSON.stringify(w.values)}`);
  entries.push({id:a.id,hoop,render:hoop==='100x100',project:geometryPayload(r.project)});
}
writeFileSync(path.join(out,'entries.json'),JSON.stringify(entries));
const python=existsSync(path.join(root,'.venv/bin/python'))?path.join(root,'.venv/bin/python'):'python3';
const py=spawnSync(python,[path.join(root,'scripts/library/compile.py'),path.join(out,'entries.json'),path.join(out,'compiled.json')],{encoding:'utf8',cwd:root});
if(py.status){console.error(py.stderr);process.exit(1);}
const compiled=JSON.parse(readFileSync(path.join(out,'compiled.json'),'utf8'));

let failed=0;const stitchTiles=[],thumbTiles=[];
for(const a of chosen){
  const problems=[];console.log(`\n${a.id} — ${a.name.tr} / ${a.name.en}`);
  for(const hoop of ['100x100','60x40']){
    const c=compiled.find(c=>c.id===a.id&&c.hoop===hoop);
    const stitch=(c?.warnings??[]).map(w=>`${w.severity} ${w.code} ${names[w.objectId]??''} ${JSON.stringify(w.values)}`);
    const list=[...design[a.id+hoop],...stitch];
    if(c)console.log(`  ${hoop}: ${c.stats.stitches} stitches, ${c.stats.colorChanges} colour changes, ${c.stats.trims} trims, ${c.stats.width}×${c.stats.height} mm`);
    for(const w of list){
      const blocking=hoop==='100x100'||w.startsWith('fail');
      if(hoop==='60x40'&&w.includes('near-edge'))continue; // expected when a motif is shrunk to fit
      console.log(`    ${blocking?'✗':'·'} ${w}`);if(blocking)problems.push(w);
    }
  }
  for(const {asset,score} of nearest(a,libraryAssets,3))console.log(`  similar ${score.toFixed(2)}${score>=duplicateThreshold?' DUPLICATE?':''}  ${asset.id} (${asset.name.en})`);
  if(problems.length){failed++;console.log('  → not ready');}
  const c=compiled.find(c=>c.id===a.id&&c.hoop==='100x100');
  if(c?.cmds.length){
    const xs=c.cmds.flatMap(m=>[m[0],m[2]]),ys=c.cmds.flatMap(m=>[m[1],m[3]]),x0=Math.min(...xs)-2,y0=Math.min(...ys)-2;
    const lines=c.cmds.map(m=>`<line x1="${m[0]}" y1="${m[1]}" x2="${m[2]}" y2="${m[3]}" stroke="${c.threads[m[4]]??'#f0f'}"${m[5]?' stroke-dasharray=".3 .3" opacity=".5"':''}/>`).join('');
    stitchTiles.push(`<figure><svg viewBox="${x0} ${y0} ${Math.max(...xs)+2-x0} ${Math.max(...ys)+2-y0}"><g stroke-width=".32" stroke-linecap="round">${lines}</g></svg><figcaption>${a.id}</figcaption></figure>`);
  }
  const box=designBounds(a.design.objects),pad=Math.max(box.width,box.height)*.1||1;
  thumbTiles.push(`<figure><svg viewBox="${box.x-pad} ${box.y-pad} ${box.width+2*pad} ${box.height+2*pad}">${a.design.objects.filter(o=>!o.hidden).map(o=>`<path d="${objectGeometry(o).path}" fill="${isFillKind(o.kind)?o.color:'none'}" fill-rule="evenodd" stroke="${isFillKind(o.kind)?'none':o.color}" stroke-width="${Math.max(pad*.15,.2)}"/>`).join('')}</svg><figcaption>${a.name.tr}</figcaption></figure>`);
}

// Pictures: a stitch sheet (two 440 px tiles per row) and the panel's thumbnail style.
const chrome=process.env.CHROME??['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
const page=(file,css,tiles,width,height)=>{
  writeFileSync(path.join(out,`${file}.html`),`<!doctype html><style>body{margin:6px;display:flex;flex-wrap:wrap;gap:6px;font:12px sans-serif;background:#ddd}${css}</style>${tiles.join('')}`);
  if(chrome)spawnSync(chrome,['--headless','--disable-gpu','--hide-scrollbars',`--window-size=${width},${height}`,`--screenshot=${path.join(out,`${file}.png`)}`,'file://'+path.join(out,`${file}.html`)]);
};
page('sheet','figure{margin:0;width:440px;background:#f3eee4}svg{width:440px;height:440px}',stitchTiles,906,Math.ceil(stitchTiles.length/2)*470+12);
page('thumbs','figure{margin:0;width:126px;padding:6px;background:#fff;border-radius:8px;text-align:center}svg{width:126px;height:100px}',thumbTiles,906,Math.ceil(thumbTiles.length/6)*150+12);
console.log(`\n${chosen.length-failed}/${chosen.length} ready. Pictures: ${chrome?path.join(out,'sheet.png')+' and thumbs.png':path.join(out,'sheet.html')+' (no Chrome found for PNGs)'}`);
process.exit(failed?1:0);
