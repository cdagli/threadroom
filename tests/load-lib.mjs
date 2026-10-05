import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
// Transpiles lib/*.ts on the fly; sibling imports resolve through this loader.
const cache=new Map(),nodeRequire=createRequire(import.meta.url);
export function load(name){
  if(cache.has(name))return cache.get(name);
  const source=readFileSync(new URL(`../lib/${name}.ts`,import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
  const module={exports:{}};cache.set(name,module.exports);
  const require=id=>id.startsWith('./')?load(id.slice(2)):nodeRequire(id);
  new Function('module','exports','require',code)(module,module.exports,require);
  cache.set(name,module.exports);return module.exports;
}
