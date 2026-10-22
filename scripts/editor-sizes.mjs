// Dependency-free production JS inventory. Run after npm run build.
import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {join,relative} from 'node:path';
import {gzipSync} from 'node:zlib';
const dir=process.argv[2]||'.next';
const walk=p=>readdirSync(p).flatMap(n=>{const f=join(p,n);return statSync(f).isDirectory()?walk(f):[f];});
const size=f=>{const b=readFileSync(f);return {bytes:b.length,gzipBytes:gzipSync(b).length};};
const manifestPath=join(dir,'react-loadable-manifest.json'),asyncImports=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):{};
const chunks=walk(join(dir,'static/chunks')).filter(f=>f.endsWith('.js')).map(f=>{const file=relative(dir,f);return {file,...size(f),imports:Object.entries(asyncImports).filter(([,v])=>v.files.includes(file)).map(([key])=>key)};}).sort((a,b)=>b.bytes-a.bytes);
const routes=walk(join(dir,'server/app')).filter(f=>f.endsWith('.html')).map(f=>{
  const html=readFileSync(f,'utf8'),scripts=[...new Set([...html.matchAll(/<script\b([^>]*?)src="\/_next\/([^"?]+)[^"]*"[^>]*>/g)].filter(m=>!/\bnomodule\b/i.test(m[0])).map(m=>m[2]))];
  return {route:'/'+relative(join(dir,'server/app'),f).replace(/(?:index)?\.html$/,''),initial:scripts.map(file=>({file,...size(join(dir,file))})),bytes:scripts.reduce((s,p)=>s+size(join(dir,p)).bytes,0),gzipBytes:scripts.reduce((s,p)=>s+size(join(dir,p)).gzipBytes,0)};
});
const log=process.argv[3];
console.log(JSON.stringify({directory:dir,units:'bytes (kB = bytes / 1000); gzip per file; modern script tags in prerendered HTML, excludes nomodule polyfill; excludes on-demand chunks',...(log&&existsSync(log)?{buildOutput:readFileSync(log,'utf8')}:{}),routes,chunks},null,2));
