// Refreshes the bundled font list from Fontsource (open-license Google Fonts).
// Font files themselves are fetched on demand from the jsDelivr Fontsource CDN.
// Usage: node scripts/update-font-catalog.mjs [catalog.json]
// This drops the stitchability data: re-run scripts/audit-fonts.mjs (shards, then --apply) afterwards.
import {readFileSync, writeFileSync} from 'node:fs';
const source=process.argv[2]?JSON.parse(readFileSync(process.argv[2],'utf8')):await (await fetch('https://api.fontsource.org/v1/fonts?type=google')).json();
const categories={'sans-serif':'s',serif:'r',display:'d',handwriting:'h',monospace:'m'};
const fonts=source.filter(f=>categories[f.category]&&f.weights?.length&&f.subsets?.length)
  .sort((a,b)=>a.family.localeCompare(b.family))
  .map(f=>[f.id,f.family,categories[f.category],f.weights,f.styles.includes('italic')?1:0,f.subsets]);
writeFileSync(new URL('../public/fonts/catalog.json',import.meta.url),JSON.stringify({source:'fontsource',updated:new Date().toISOString().slice(0,10),fonts}));
console.log(`${fonts.length} fonts`);
