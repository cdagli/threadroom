// Look through the library catalog before designing a new motif.
//   node scripts/library/search.mjs list [category]     counts per category, or every item in one
//   node scripts/library/search.mjs find bee arı insect  items matching any word (Turkish/English, accents optional)
//   node scripts/library/search.mjs similar <id>         nearest silhouettes to an existing item
import {load} from '../../tests/load-lib.mjs';
import {nearest,duplicateThreshold} from './silhouette.mjs';
const {libraryAssets}=load('library-assets');
const {libraryCategories,filterLibraryAssets}=load('library');

const [command,...args]=process.argv.slice(2);
const line=a=>`${a.id}  —  ${a.name.tr} / ${a.name.en}  [${(a.tags??[]).join(', ')}]  (${a.design.objects.length} objects)`;

if(command==='list'){
  const [category]=args;
  if(!category){
    for(const c of libraryCategories)console.log(`${c.id.padEnd(20)} ${String(libraryAssets.filter(a=>a.categoryId===c.id).length).padStart(5)}  ${c.name}`);
    console.log(`${'total'.padEnd(20)} ${String(libraryAssets.length).padStart(5)}`);
  }else for(const a of filterLibraryAssets(libraryAssets,{categoryId:category}))console.log(line(a));
}else if(command==='find'&&args.length){
  // Any-word match, ranked by how many words hit, so synonyms can be checked in one call.
  const score=new Map();
  for(const word of args)for(const a of filterLibraryAssets(libraryAssets,{query:word}))score.set(a,(score.get(a)??0)+1);
  const hits=[...score].sort((a,b)=>b[1]-a[1]);
  if(!hits.length)console.log('No matches.');
  for(const [a,n] of hits)console.log(`${n}/${args.length}  ${line(a)}`);
}else if(command==='similar'&&args[0]){
  const asset=libraryAssets.find(a=>a.id===args[0]);
  if(!asset){console.error(`No item ${args[0]}`);process.exit(1);}
  for(const {asset:a,score} of nearest(asset,libraryAssets,8))console.log(`${score.toFixed(2)}${score>=duplicateThreshold?' DUPLICATE?':''}  ${line(a)}`);
}else{
  console.log('Usage: search.mjs list [category] | find <words…> | similar <id>');
  process.exit(command?1:0);
}
