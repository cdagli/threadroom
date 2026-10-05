// Bridge for Python tests: runs editor code on a JSON project from stdin.
import {load} from './load-lib.mjs';
const {fabrics,demo}=load('project'),{geometryPayload}=load('curves');
let input='';for await(const chunk of process.stdin)input+=chunk;
const value=JSON.parse(input||'null'),mode=process.argv[2];
process.stdout.write(JSON.stringify(mode==='profiles'?fabrics:mode==='demo'?geometryPayload(demo()):geometryPayload(value)));
