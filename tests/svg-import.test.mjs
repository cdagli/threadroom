import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {importSVG,svgLength}=load('svg-import'),{pathData,transform,map}=load('svg-path'),{demo,validProject}=load('project'),{createT,TranslationError}=load('i18n'),{geometryPayload}=load('curves'),{exportSVG}=load('svg-export'),{raster}=load('check');
// Minimal XML DOM adapter for sample strings: production always uses the browser's DOMParser.
class Element{
  constructor(name,attrs,parent=null){this.localName=name;this.attrs=attrs;this.parentElement=parent;this.children=[];this.textContent='';}
  getAttribute(name){return this.attrs[name]??null;}
}
const parser={parseFromString(xml){
  const stack=[],all=[];let root=null,bad=false;
  for(const token of xml.match(/<!--[^]*?-->|<[^>]*>|[^<]+/g)??[]){
    if(token.startsWith('<?')||token.startsWith('<!--'))continue;
    if(token.startsWith('</')){if(stack.pop()?.localName!==token.slice(2,-1).trim())bad=true;}
    else if(token.startsWith('<')){const name=token.match(/^<([\w:-]+)/)?.[1];if(!name){bad=true;continue;}const attrs={};for(const [,key,,value] of token.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g))attrs[key]=value;const el=new Element(name,attrs,stack.at(-1));all.push(el);if(stack.length)stack.at(-1).children.push(el);else if(root)bad=true;else root=el;if(!token.endsWith('/>'))stack.push(el);}
    else if(stack.length)stack.at(-1).textContent+=token;
  }
  bad||=stack.length>0;return {documentElement:root,querySelector:s=>s==='parsererror'&&bad?{}:null,querySelectorAll:s=>all.filter(el=>el.localName===s)};
}};
const read=(svg,lang='en',name='flowers.svg')=>importSVG(svg,name,{...demo(),objects:[],groups:[]},createT(lang),parser);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≠ ${b}`);
test('physical units and viewBox: SVG imports in millimetres, centred in the hoop',()=>{
  for(const [width,mm] of [['25.4mm',25.4],['2.54cm',25.4],['1in',25.4],['96px',25.4],['96',25.4]]){
    const p=read(`<svg width="${width}" height="${width}" viewBox="10 20 100 100"><rect x="10" y="20" width="100" height="100" fill="#abc"/></svg>`),o=p.objects[0];
    assert.equal(o.color,'#aabbcc');near(o.curve.points[0][0],(100-mm)/2);near(o.curve.points[1][0],(100+mm)/2);assert.ok(validProject(p));assert.equal(p.groups[0].name,'flowers');assert.equal(o.group,p.groups[0].id);
  }
  near(svgLength('1in'),25.4);assert.equal(svgLength('20%'),null);
});
test('fallback fits viewBox or transformed geometry to 75% of the hoop',()=>{
  const p=read('<svg viewBox="0 0 200 100"><rect width="200" height="100"/></svg>');near(p.objects[0].curve.points[0][0],12.5);near(p.objects[0].curve.points[0][1],31.25);
  const q=read('<svg><g transform="translate(30 70)"><rect width="20" height="10"/></g></svg>');near(q.objects[0].curve.points[0][0],12.5);near(q.objects[0].curve.points[0][1],31.25);
});
test('nested transforms and SVG transform order include all supported operations',()=>{
  assert.deepEqual(map(transform('translate(10,20) scale(2,3)'),[1,2]),[12,26]);
  const r=map(transform('rotate(90 10 20)'),[11,20]);near(r[0],10);near(r[1],21);
  const skew=map(transform('matrix(1 0 0 1 5 6) skewX(45) skewY(45)'),[1,1]);near(skew[0],8);near(skew[1],8);
  const p=read('<svg width="100mm" height="100mm" viewBox="0 0 100 100"><g transform="translate(10 20)"><g transform="scale(2)"><polygon points="1,2 3,2 3,4"/></g></g></svg>');assert.deepEqual(p.objects[0].curve.points,[[12,24],[16,24],[16,28]]);
});
test('basic CSS cascade, inherited paints, currentColor and inline style become thread colours',()=>{
  const p=read('<svg width="100mm" height="100mm" viewBox="0 0 100 100"><style>rect {fill:red} .petal {fill:blue} #leaf {fill:green} g .petal {stroke:#123456;stroke-width:2}</style><g color="purple"><rect class="petal" width="10" height="10" fill="pink"/><rect id="leaf" class="petal" x="20" width="10" height="10" style="fill:currentColor;stroke:none"/></g></svg>');
  assert.deepEqual(p.objects.map(o=>o.color),['#0000ff','#123456','#800080']);assert.equal(p.objects[1].kind,'satin');near(p.objects[1].satinWidth,2);
});
test('even-odd and nonzero holes remain compound rings through compilation and SVG re-export',()=>{
  const d='M0 0H20V20H0Z M5 5V15H15V5Z';
  for(const rule of ['evenodd','nonzero']){const p=read(`<svg width="100mm" height="100mm" viewBox="0 0 100 100"><path fill-rule="${rule}" d="${d}"/></svg>`),o=p.objects[0];assert.equal(o.rings.length,2);assert.equal(o.curve,undefined);assert.equal(o.fillRule,rule==='nonzero'?'nonzero':undefined);assert.equal(geometryPayload(p).objects[0].rings.length,2);assert.match(exportSVG(p),new RegExp(`fill-rule="${rule}"`));assert.ok(Math.abs(raster(o.rings,rule).area-300)<2);}
});
test('nonzero preserves same-winding nested rings as filled rather than holes',()=>{
  const p=read('<svg width="100mm" height="100mm" viewBox="0 0 100 100"><path d="M0 0H20V20H0Z M5 5H15V15H5Z"/></svg>');assert.ok(Math.abs(raster(p.objects[0].rings,'nonzero').area-400)<2);assert.ok(Math.abs(raster(p.objects[0].rings,'evenodd').area-300)<2);
});
test('all primitives, rounded rectangles and open stroke curves import without rasterisation',()=>{
  const p=read('<svg width="100mm" height="100mm" viewBox="0 0 100 100"><circle cx="20" cy="20" r="5"/><ellipse cx="40" cy="20" rx="8" ry="3"/><rect x="50" y="10" width="10" height="20" rx="2"/><polyline points="10,40 20,45 30,40" fill="none" stroke="rgb(100%, 0%, 0%)"/><line x1="40" y1="40" x2="50" y2="45" stroke="black"/></svg>');
  assert.equal(p.objects.length,5);assert.equal(p.objects[0].curve,undefined);assert.ok(p.objects[0].rings[0].length>20);assert.equal(p.objects[3].curve.closed,false);assert.equal(p.objects[3].color,'#ff0000');assert.ok(validProject(p));
});
test('stroke width includes physical scale; compatible open gaps below 1 mm join',()=>{
  const p=read('<svg width="100mm" height="100mm" viewBox="0 0 100 100"><g fill="none" stroke="blue"><path d="M1 1L5 1 M5.8 1L10 1"/><line x1="30" y1="1" x2="40" y2="1" stroke-width="1.5mm"/><line x1="60" y1="1" x2="70" y2="1" stroke-width="1"/></g></svg>');
  assert.equal(p.objects.length,3);assert.equal(p.objects[0].rings.length,1);near(p.objects[0].rings[0].at(-1)[0],10);assert.equal(p.objects[1].kind,'satin');near(p.objects[1].satinWidth,1.5*96/25.4); // SVG physical units resolve to user-space CSS px before viewBox scaling.
  const q=read('<svg width="100mm" height="100mm" viewBox="0 0 100 100"><path fill="none" stroke="black" d="M0 0L5 0 M6 0L10 0"/></svg>');assert.equal(q.objects.length,2);
});
test('out-of-order compatible stroke pieces join in either direction without crossing paint changes',()=>{
  const p=read('<svg width="100mm" height="100mm" viewBox="0 0 100 100"><path fill="none" stroke="blue" d="M0 0L5 0 M15 0L10 0 M5.5 0L9.5 0"/></svg>');assert.equal(p.objects.length,1);const r=p.objects[0].rings[0];assert.deepEqual([r[0],r.at(-1)],[[0,0],[15,0]]);
});
test('path grammar supports relative/repeated commands, scientific notation, smooth curves and compact arc flags',()=>{
  const m=[1,0,0,1,0,0];
  const p=pathData('m1e1 10 5 0 h5 v5 l-10 0z M30 20 C30 0 40 0 40 20 S50 40 50 20 Q55 10 60 20 T70 20 A5 5 0 0110 10',m);
  assert.equal(p.length,2);assert.equal(p[0].linear,true);assert.equal(p[0].closed,true);assert.equal(p[1].linear,false);assert.deepEqual(p[1].points.at(-1),[10,10]);assert.ok(p[1].points.length>30);
  const closed=pathData('M0 0 L10 0 L10 10 L0 0 Z L20 0',m);assert.equal(closed[0].points.length,3);assert.equal(closed[1].closed,false);assert.deepEqual(closed[1].points,[[0,0],[20,0]]);
  const loop=pathData('M0 0 C20 0 -20 0 0 0',m)[0];assert.ok(loop.points.length>3,'collinear double-back curve is not lost');
});
test('hidden and non-rendered SVG content produces no stitches',()=>{
  const p=read('<svg><defs><rect width="100" height="100"/></defs><g display="none"><rect width="80" height="80"/></g><rect width="10" height="10" opacity="0"/><rect width="20" height="20"/></svg>');assert.equal(p.objects.length,1);
});
test('malformed, unsupported and oversized input produce translated errors',()=>{
  for(const s of ['<svg><path></svg>','<!DOCTYPE svg><svg/>','<html/>','<svg><path d="M0 0 C1"/></svg>','<svg><rect width="-1" height="2"/></svg>','<svg><text>hello</text></svg>','<svg><rect width="10" height="10" fill="url(#gradient)"/></svg>','<svg><path d="M0 0 L20 0" fill="none" stroke="red" stroke-width="100"/></svg>','<svg/>'])assert.throws(()=>read(s,'tr'),e=>e instanceof TranslationError&&!/could not|cannot|no supported/.test(e.message));
  assert.throws(()=>read('<svg>'+Array(81).fill('<rect width="1" height="1"/>').join('')+'</svg>'),/limits/);
  for(const d of ['M0 0L','M0 x','M0 0 A1 2 0 2 0 5 5','M0 0 B2 3'])assert.throws(()=>pathData(d,[1,0,0,1,0,0]));
});
test('shape import adds one unlocked group after the design, keeps reference images and migrates legacy artwork',()=>{
  const image={id:'a',src:'data:image/png;base64,AA',name:'ref.png',x:1,y:2,width:10,height:10,opacity:.5},base={...demo(),images:[image]};
  const p=importSVG('<svg width="10mm" height="10mm" viewBox="0 0 10 10"><rect width="5" height="5"/><rect x="6" width="4" height="4" fill="red"/></svg>','logo.svg',base,createT('en'),parser);
  const added=p.objects.slice(base.objects.length),group=p.groups.at(-1);assert.deepEqual(p.objects.slice(0,base.objects.length),base.objects);assert.deepEqual(p.groups.slice(0,-1),base.groups??[]);assert.equal(p.name,base.name);
  assert.deepEqual(p.images,[image]);assert.equal(added.length,2);assert.ok(added.every(o=>o.group===group.id&&!o.locked&&!o.hidden));assert.ok(validProject(p));
  assert.equal(read('<svg width="10mm" height="10mm"><rect width="5" height="5"/></svg>','en','logo.svg').name,'logo');
  assert.throws(()=>importSVG('<svg width="10mm" height="10mm"><rect width="5" height="5"/></svg>','x.svg',{...base,objects:Array.from({length:80},(_,i)=>({...base.objects[0],id:`o${i}`,group:undefined}))},createT('en'),parser),/at most 80 objects/);
  const {images:_,...plain}=demo(),q=importSVG('<svg width="10mm" height="10mm" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>','x.svg',{...plain,artwork:{src:image.src,name:'old.png',x:0,y:0,width:5,height:5}},createT('en'),parser);
  assert.equal(q.artwork,undefined);assert.equal(q.images.length,1);assert.equal(q.images[0].name,'old.png');
});
