// Bridge for Python tests: runs editor code on a JSON project from stdin.
import {load} from './load-lib.mjs';
const {fabrics,demo}=load('project'),{geometryPayload}=load('curves'),{cutHoles,flattenOverlaps}=load('shape-ops');
// cut-holes / flatten: {project, ids} run through the editor's shape operation first.
const shaped=(r)=>{if(r.error)throw new Error(r.error);return geometryPayload(r.project);};
let input='';for await(const chunk of process.stdin)input+=chunk;
const value=JSON.parse(input||'null'),mode=process.argv[2];
process.stdout.write(JSON.stringify(mode==='profiles'?fabrics:mode==='demo'?geometryPayload(demo()):mode==='cut-holes'?shaped(cutHoles(value.project,value.ids)):mode==='flatten'?shaped(flattenOverlaps(value.project,value.ids)):geometryPayload(value)));
