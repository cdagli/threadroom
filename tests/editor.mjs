// Bridge for Python tests: runs editor code on a JSON project from stdin.
import {load} from './load-lib.mjs';
const {fabrics}=load('project'),{geometryPayload}=load('curves');
let input='';for await(const chunk of process.stdin)input+=chunk;
const value=JSON.parse(input||'null');
process.stdout.write(JSON.stringify(process.argv[2]==='profiles'?fabrics:geometryPayload(value)));
