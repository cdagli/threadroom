import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';

const requireNode=createRequire(import.meta.url),cache=new Map();
// Render the real shared primitives in panel tests, including their native semantics.
export function loadDesignSystem(name='index'){
  if(cache.has(name))return cache.get(name);
  let file=new URL(`../design-system/${name}.tsx`,import.meta.url);
  if(!existsSync(file))file=new URL(`../design-system/${name}.ts`,import.meta.url);
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  const require=id=>id.startsWith('./')?loadDesignSystem(id.slice(2)):requireNode(id);
  new Function('module','exports','require',code)(module,module.exports,require);
  cache.set(name,module.exports);
  return module.exports;
}
