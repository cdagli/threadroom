import type {Command} from './project';
import {drawThreads, rgb, threadShades, threadStyle} from './thread';

// A top-down thread impostor: six vertices per stitch, with the rounded surface,
// twisted fibres and contact shading evaluated per pixel. Instances stay in
// sewing order; no direction/colour sorting and no height ramp by stitch index.
// The offscreen context is shared by preview and export, then composited onto
// their 2D canvas. This preserves SVG alignment, artwork, clips and incremental
// playback without allocating a WebGL context for every thumbnail or export.
type ThreadBackend='webgl2'|'canvas2d';
const stride=9;
// 40 wt embroidery thread (120D/2, Tex 27) is about 0.25 mm thick under sewing
// tension, which is why standard density lays one thread every 0.2 mm (0.4 mm
// between forward fill rows or between satin holes on one rail). Sewn, it flattens
// a little against the fabric and its fibres bloom, so the displayed strand is
// slightly wider than that: rows 0.2 mm apart
// overlap as they do when sewn, and rows snapped 0.3 mm apart by the machine's
// 0.1 mm grid still close. Machine coordinates do not depend on this calibration.
const threadWidth=.25,flattenedThreadWidth=threadWidth*1.2;
// Contact shadow around each strand (mm): reach and strength. It is the same on both sides:
// in a fill every thread half covers the one before, and a shadow or a lit flank that favoured
// one side would make areas sewn in opposite row order differ in tone.
const shadowReach=.10,shadowStrength=.26;
// Length of one full turn of the two plies (mm): embroidery thread has about 1.2 turns per mm.
const plyTwist=.8;
type Geometry={data:Float32Array;prefix:Uint32Array;bounds:[number,number,number,number]};
const geometries=new WeakMap<Command[],{palette:string;geometry:Geometry}>();
const linear=(v:number)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;

// Two stitches meeting at a needle hole cannot lie in the same place: where the
// thread doubles back (satin, row turns, bean passes) the two legs sit side by
// side, each pushed half a thread off the hole, away from the other. This is why
// sewn satin reads as parallel threads and not as the zigzag of its needle points.
// Returns the displaced end of the leg that runs from the hole at (x,y) towards
// (tx,ty), given the other leg runs towards (ox,oy). incoming: this leg ends here.
function relaxedEnd(x:number,y:number,tx:number,ty:number,ox:number,oy:number,incoming:boolean,r:number):[number,number]{
  const tl=Math.hypot(tx-x,ty-y),ol=Math.hypot(ox-x,oy-y);if(tl<1e-6||ol<1e-6)return [x,y];
  const ax=(tx-x)/tl,ay=(ty-y)/tl,bx=(ox-x)/ol,by=(oy-y)/ol,cos=ax*bx+ay*by;if(cos<=0)return [x,y];
  let dx=ax-bx,dy=ay-by;const d=Math.hypot(dx,dy);
  // Exactly retraced (bean stitch): the returning pass lies beside the first.
  if(d<1e-3){dx=incoming?-ay:ay;dy=incoming?ax:-ax;}else{dx/=d;dy/=d;}
  // The two legs share the room between this hole and the next on the same rail: the far
  // ends are one such pitch apart, and each leg takes a quarter of it.
  const pitch=Math.hypot(tx-ox,ty-oy),shift=Math.min(r*cos,tl*.4,d<1e-3?Infinity:pitch/4);return [x+dx*shift,y+dy*shift];
}
// Builds only sewn instances. Prefixes map command/playback positions to GPU instances.
/** @test */
export function threadInstances(commands:Command[],colours:string[]):Geometry{
  const palette=colours.join(','),cached=geometries.get(commands);
  if(cached?.palette===palette)return cached.geometry;
  const data=new Float32Array(commands.length*stride),prefix=new Uint32Array(commands.length+1);
  const dye=colours.map(c=>rgb(c).map(v=>linear(v/255))),r=flattenedThreadWidth/2;
  const sewn=(k:Command|undefined):k is Command=>!!k&&k.type==='stitch'&&!k.tie&&[k.fromX,k.fromY,k.x,k.y].every(Number.isFinite);
  const joined=(a:Command,b:Command)=>a.block===b.block&&Math.abs(a.x-b.fromX)<.011&&Math.abs(a.y-b.fromY)<.011;
  let n=0,x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;const locked=new Set<string>();
  for(let i=0;i<commands.length;i++){
    const k=commands[i];prefix[i+1]=n;
    if(k.type!=='stitch'||![k.fromX,k.fromY,k.x,k.y].every(Number.isFinite)||!dye[k.block]||Math.hypot(k.x-k.fromX,k.y-k.fromY)<.001)continue;
    // Lock stitches are pulled tight on top of each other: they do not spread, and the
    // passes over one segment show as a single thread.
    if(k.tie){const a=`${Math.round(k.fromX*20)},${Math.round(k.fromY*20)}`,b=`${Math.round(k.x*20)},${Math.round(k.y*20)}`,key=a<b?`${a}:${b}`:`${b}:${a}`;if(locked.has(key))continue;locked.add(key);}else locked.clear();
    const before=k.tie?undefined:commands[i-1],after=k.tie?undefined:commands[i+1];
    const [ax,ay]=sewn(before)&&joined(before,k)?relaxedEnd(k.fromX,k.fromY,k.x,k.y,before.fromX,before.fromY,false,r):[k.fromX,k.fromY];
    const [bx,by]=sewn(after)&&joined(k,after)?relaxedEnd(k.x,k.y,k.fromX,k.fromY,after.x,after.y,true,r):[k.x,k.y];
    // Stable variation in material only: needle positions and stitch count are untouched.
    const seed=((Math.imul(i+1,1597334677)>>>0)%65536)/65536;
    data.set([ax,ay,bx,by,...dye[k.block],1,seed],n*stride);
    x0=Math.min(x0,ax,bx);y0=Math.min(y0,ay,by);x1=Math.max(x1,ax,bx);y1=Math.max(y1,ay,by);
    prefix[i+1]=++n;
  }
  // Room for the strand's width and its contact shadow.
  const geometry:Geometry={data:data.subarray(0,n*stride),prefix,bounds:[x0-1,y0-1,x1+1,y1+1]};
  geometries.set(commands,{palette,geometry});return geometry;
}

const vertex=`#version 300 es
precision highp float;
layout(location=0) in vec4 endpoints;
layout(location=1) in vec3 colour;
layout(location=2) in vec2 material;
uniform vec2 resolution;
uniform vec3 transform;
uniform float width;
out vec2 local;
flat out vec2 tangent;
flat out vec3 dye;
flat out float lengthMm;
flat out float radius;
flat out float seed;
const vec2 corners[6]=vec2[6](vec2(0,-1),vec2(1,-1),vec2(0,1),vec2(0,1),vec2(1,-1),vec2(1,1));
void main(){
  vec2 delta=endpoints.zw-endpoints.xy;
  lengthMm=length(delta);tangent=delta/lengthMm;dye=colour;seed=material.y;
  radius=width*.5*material.x;
  // Room for the rounded end, the contact shadow and the antialiasing fringe.
  float pad=radius+${shadowReach.toFixed(3)}+1.5/transform.x;
  vec2 corner=corners[gl_VertexID];
  local=vec2(mix(-pad,lengthMm+pad,corner.x),corner.y*pad);
  vec2 world=endpoints.xy+tangent*local.x+vec2(-tangent.y,tangent.x)*local.y;
  vec2 pixel=world*transform.x+transform.yz;
  gl_Position=vec4(pixel/resolution*vec2(2,-2)+vec2(-1,1),0,1);
}`;

// One sewn stitch: a strand lying on the surface between two needle points. It
// rises out of one hole, lies slightly bowed and dives into the next, so both
// ends are darker and a little narrower. The strand is two plies twisted
// together, each a bundle of fine filaments: the plies give the diagonal ridges
// and scalloped outline of real thread, the filaments its streaked sheen. Width,
// lighting and twist are fixed in millimetres; detail too small for the current
// zoom fades into the smooth strand, so the average colour does not change.
const fragment=`#version 300 es
precision highp float;
in vec2 local;
flat in vec2 tangent;
flat in vec3 dye;
flat in float lengthMm;
flat in float radius;
flat in float seed;
out vec4 outColour;
const float PI=3.14159265359;
const float TWIST=${plyTwist.toFixed(3)};
// Mostly frontal light: tone comes from the direction a thread runs, not from which of its flanks shows.
const vec3 light=normalize(vec3(-.30,-.40,.87));
const vec3 halfway=normalize(light+vec3(0,0,1));
vec3 srgb(vec3 c){return mix(12.92*c,1.055*pow(max(c,vec3(0)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
// Distance to a strand of half-width r whose rounded ends reach cap past the needle points.
float strand(vec2 p,float r,float cap){
  float beyond=max(max(-p.x,p.x-lengthMm),0.);
  return length(vec2(beyond*r/cap,p.y))-r;
}
void main(){
  float aa=max(fwidth(local.y),1e-4);
  float endDistance=min(local.x,lengthMm-local.x);
  // The thread climbs out of the fabric over about one thread width.
  float climb=min(lengthMm*.5,radius*1.7);
  float rise=smoothstep(-radius*.5,climb,endDistance);
  // Plies resolve once the strand is a few pixels wide, filaments later still.
  float plies=smoothstep(1.5,4.5,radius/aa),filaments=smoothstep(3.,9.,radius/aa);
  float turns=local.x/TWIST+seed;
  // Outline: each ply bulges where it passes the edge, leaving a shallow notch between.
  float crest=abs(sin(PI*(2.*turns+.5*sign(local.y))));
  float r=radius*mix(.93,1.,rise)*(1.-.06*plies*(1.-crest));
  float coverage=clamp(.5-strand(local,r,radius*.55)/aa,0.,1.);
  // Contact shadow: the strand darkens whatever lies beside and beneath it.
  vec2 across=vec2(-tangent.y,tangent.x);
  float gap=max(strand(local,radius,radius*.55),0.);
  float shadow=${shadowStrength.toFixed(3)}*exp(-gap*gap/(${(shadowReach*.42).toFixed(4)}*${(shadowReach*.42).toFixed(4)}+aa*aa));
  if(coverage+shadow<.002)discard;
  float v=clamp(local.y/r,-.98,.98),round_=sqrt(1.-v*v),theta=asin(v);
  // Position across the ply that is on top here: 0 at its crest, +-.5 in the grooves.
  float ply=fract(2.*turns+theta/PI)-.5;
  float height=sqrt(max(0.,1.-4.*ply*ply));
  float slope=clamp(-4.*ply/max(height,.3),-2.5,2.5)*plies;
  float depth=r*.15;
  // Surface normal in the stitch frame: the flattened strand, its slope along
  // the stitch, and the ply riding over it.
  // A long float (satin) sags a little between its holes and catches the light across the
  // column; the short stitches of a fill lie flat, so a fill keeps one even tone.
  float bow=clamp((local.x-lengthMm*.5)/max(lengthMm*.5,1e-3),-1.,1.),sag=.26*smoothstep(1.5,5.,lengthMm);
  float along=sign(local.x-lengthMm*.5)*(1.-rise)*.32+bow*sag-slope*depth*2./TWIST;
  float aside=v*.30-slope*depth/(PI*r*max(round_,.35));
  vec3 normal=normalize(vec3(tangent*along+across*aside,round_+.12));
  // Filaments run nearly along the thread, each catching the light a little differently.
  float streak=noise(vec2(theta*10.+floor(2.*turns+theta/PI)*7.31+local.x*1.1,local.x*2.2+seed*31.))-.5;
  float fine=noise(vec2(theta*26.+local.x*2.,local.x*5.+seed*17.))-.5;
  float fibre=(streak*.7+fine*.3)*filaments;
  // Light the cross-section from straight above the strand's own axis: the part of the
  // light that falls across a thread brightens the whole thread, not one flank of it.
  vec3 side=vec3(across,0.),toLight=normalize(light-side*dot(light,side)),toHalf=normalize(halfway-side*dot(halfway,side));
  float tl=dot(vec3(tangent,0.),light);
  float diffuse=clamp((dot(normal,toLight)+.30)/1.30,0.,1.)*mix(.84,1.,sqrt(1.-tl*tl));
  // Sheen follows the fibre direction: strands lying across the light shine most.
  float th=dot(vec3(tangent,0.),halfway);
  float sheen=pow(max(0.,1.-th*th),6.);
  float nh=max(dot(normal,toHalf),0.);
  float spec=(pow(nh,14.)*.30+pow(nh,60.)*.22*filaments*(1.+2.*fibre))*sheen*(1.+1.4*fibre);
  // Grooves between the plies sit in shade.
  float groove=mix(1.,smoothstep(-.15,.8,height),plies*.34);
  // Roundness is shaded evenly towards both edges.
  vec3 body=dye*(.36+.74*diffuse)*(.70+.30*round_)*(1.+.22*fibre)*groove*mix(.9,1.,rise);
  body+=mix(dye,vec3(1),.55)*max(spec,0.)*rise*groove;
  body*=.985+.03*seed;
  vec3 rgb=srgb(clamp(body,0.,1.));
  float under=shadow*(1.-coverage);
  outColour=vec4(rgb*coverage+vec3(.035,.025,.02)*under,coverage+under);
}`;

// Supersampled strands are averaged down by exact area: each output pixel takes the
// fine pixels under it, weighted by overlap. A general image filter aliases against the
// regular 0.2 mm thread pitch and a fill's colour would pulse while zooming.
const resolveVertex=`#version 300 es
void main(){gl_Position=vec4(gl_VertexID==1?3.:-1.,gl_VertexID==2?3.:-1.,0,1);}`;
const resolveFragment=`#version 300 es
precision highp float;
uniform sampler2D fine;
uniform vec4 footprint; // fine pixels per output pixel, fine offset x and y, output height
out vec4 outColour;
void main(){
  float s=footprint.x;
  vec2 from=vec2(gl_FragCoord.x-.5,footprint.w-gl_FragCoord.y-.5)*s+footprint.yz,first=floor(from);
  int rows=textureSize(fine,0).y;
  vec4 sum=vec4(0);
  for(int j=0;j<10;j++){
    float y=first.y+float(j),wy=clamp(min(y+1.,from.y+s)-max(y,from.y),0.,1.);
    if(wy<=0.)continue;
    for(int i=0;i<10;i++){
      float x=first.x+float(i),wx=clamp(min(x+1.,from.x+s)-max(x,from.x),0.,1.);
      if(wx>0.)sum+=texelFetch(fine,ivec2(int(x),rows-1-int(y)),0)*(wx*wy);
    }
  }
  outColour=sum/(s*s);
}`;

class ThreadGPU{
  readonly canvas=document.createElement('canvas');
  private readonly composite=document.createElement('canvas');
  readonly gl:WebGL2RenderingContext;
  private readonly resources:(()=>void)[]=[];
  private readonly program:WebGLProgram;
  private readonly resolve:WebGLProgram;
  private readonly buffer:WebGLBuffer;
  private readonly vao:WebGLVertexArrayObject;
  private readonly plain:WebGLVertexArrayObject;
  private readonly target:WebGLFramebuffer;
  private readonly fine:WebGLTexture;
  private readonly uniforms:Record<'resolution'|'transform'|'width'|'footprint',WebGLUniformLocation>;
  readonly tileSize:number;
  private uploaded:Geometry|null=null;
  private fineSize=[0,0];
  constructor(){
    const gl=this.canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false});
    if(!gl)throw Error('WebGL2 unavailable');this.gl=gl;
    const made=<T,>(value:T|null,free:(value:T)=>void,what:string)=>{if(!value)throw Error(`Thread ${what} allocation`);this.resources.push(()=>free(value));return value;};
    const link=(vertexSource:string,fragmentSource:string)=>{
      const program=made(gl.createProgram(),v=>gl.deleteProgram(v),'program');
      for(const [type,source] of [[gl.VERTEX_SHADER,vertexSource],[gl.FRAGMENT_SHADER,fragmentSource]] as const){
        const shader=gl.createShader(type);if(!shader)throw Error('Thread shader allocation');
        try{
          gl.shaderSource(shader,source);gl.compileShader(shader);
          if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)??'Thread shader compilation');
          gl.attachShader(program,shader);
        }finally{gl.deleteShader(shader);}
      }
      gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)??'Thread shader link');
      return program;
    };
    try{
      this.program=link(vertex,fragment);this.resolve=link(resolveVertex,resolveFragment);
      this.buffer=made(gl.createBuffer(),v=>gl.deleteBuffer(v),'buffer');
      this.vao=made(gl.createVertexArray(),v=>gl.deleteVertexArray(v),'vertex array');this.plain=made(gl.createVertexArray(),v=>gl.deleteVertexArray(v),'vertex array');
      this.target=made(gl.createFramebuffer(),v=>gl.deleteFramebuffer(v),'framebuffer');this.fine=made(gl.createTexture(),v=>gl.deleteTexture(v),'texture');
      gl.bindTexture(gl.TEXTURE_2D,this.fine);
      for(const [name,value] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,name,value);
      const uniform=(program:WebGLProgram,name:string)=>{const location=gl.getUniformLocation(program,name);if(location===null)throw Error(`Thread uniform ${name}`);return location;};
      this.uniforms={resolution:uniform(this.program,'resolution'),transform:uniform(this.program,'transform'),width:uniform(this.program,'width'),footprint:uniform(this.resolve,'footprint')};
      const viewport=gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
      this.tileSize=Math.min(2048,gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),viewport[0],viewport[1]);
      gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
      this.canvas.addEventListener('webglcontextlost',event=>event.preventDefault());
      this.canvas.addEventListener('webglcontextrestored',()=>{this.dispose();gpu=undefined;});
    }catch(error){
      this.dispose();gl.getExtension('WEBGL_lose_context')?.loseContext();throw error;
    }
  }
  dispose(){for(const free of this.resources.splice(0))free();this.uploaded=null;this.fineSize=[0,0];this.composite.width=this.composite.height=0;}
  paint(c:CanvasRenderingContext2D,geometry:Geometry,from:number,to:number,px:number){
    const gl=this.gl;if(gl.isContextLost())return false;
    const m=c.getTransform(),start=geometry.prefix[from],count=geometry.prefix[to]-start;
    if(!count)return true;
    // Only the part of the canvas the design can reach is rendered.
    const [bx0,by0,bx1,by1]=geometry.bounds;
    const x0=Math.max(0,Math.floor(bx0*px+m.e)),y0=Math.max(0,Math.floor(by0*px+m.f)),x1=Math.min(c.canvas.width,Math.ceil(bx1*px+m.e)),y1=Math.min(c.canvas.height,Math.ceil(by1*px+m.f));
    if(x1<=x0||y1<=y0)return true;
    gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    if(this.uploaded!==geometry){gl.bufferData(gl.ARRAY_BUFFER,geometry.data,gl.STATIC_DRAW);this.uploaded=geometry;}
    if(gl.getError()!==gl.NO_ERROR){this.uploaded=null;return false;}
    for(const [index,size,offset] of [[0,4,0],[1,3,4],[2,2,7]]){
      gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,stride*4,(start*stride+offset)*4);gl.vertexAttribDivisor(index,1);
    }
    gl.uniform1f(this.uniforms.width,flattenedThreadWidth);
    // Below 20 px/mm a strand is under six pixels wide: its coverage is resolved on a
    // finer raster first (up to 8x) and averaged down. Blending fractional strand masks
    // at screen resolution loses coverage between neighbours and shifts a fill's colour.
    // The fine raster is anchored to design space, so the material does not crawl with
    // fractional pan; closer in, strands are drawn directly with analytic edges.
    const sampling=Math.max(1,Math.min(8,20/px)),fine=sampling>1,renderPx=px*sampling,gutter=2,tileSize=Math.max(1,Math.floor(this.tileSize/sampling)-2*gutter);
    // Oversized canvases render in tiles; strand coordinates stay in stitch-local mm, so
    // neither fibres nor shading acquire seams. Tiles are committed together: context
    // loss midway must not leave half a GPU render underneath the Canvas fallback.
    const tiled=x1-x0>tileSize||y1-y0>tileSize;
    let output:CanvasRenderingContext2D|null=null;
    if(tiled){this.composite.width=x1-x0;this.composite.height=y1-y0;output=this.composite.getContext('2d');if(!output)return false;}
    c.save();c.setTransform(1,0,0,1,0,0);
    try{
      for(let y=y0;y<y1;y+=tileSize)for(let x=x0;x<x1;x+=tileSize){
        const w=Math.min(tileSize,x1-x),h=Math.min(tileSize,y1-y);
        if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;
        gl.enable(gl.BLEND);
        if(fine){
          const rw=Math.ceil((w+2*gutter)*sampling),rh=Math.ceil((h+2*gutter)*sampling),tx=(m.e-x+gutter)*sampling,ty=(m.f-y+gutter)*sampling,ix=Math.floor(tx),iy=Math.floor(ty);
          gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.fine);gl.bindFramebuffer(gl.FRAMEBUFFER,this.target);
          if(this.fineSize[0]!==rw||this.fineSize[1]!==rh){
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,rw,rh,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.fine,0);this.fineSize=[rw,rh];
            if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){this.fineSize=[0,0];gl.bindFramebuffer(gl.FRAMEBUFFER,null);return false;}
          }
          gl.viewport(0,0,rw,rh);gl.clear(gl.COLOR_BUFFER_BIT);
          gl.uniform2f(this.uniforms.resolution,rw,rh);gl.uniform3f(this.uniforms.transform,renderPx,ix,iy);
          gl.drawArraysInstanced(gl.TRIANGLES,0,6,count);
          gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);gl.disable(gl.BLEND);
          gl.useProgram(this.resolve);gl.bindVertexArray(this.plain);
          gl.uniform4f(this.uniforms.footprint,sampling,gutter*sampling-(tx-ix),gutter*sampling-(ty-iy),h);
          gl.drawArrays(gl.TRIANGLES,0,3);
          gl.useProgram(this.program);gl.bindVertexArray(this.vao);
        }else{
          gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT);
          gl.uniform2f(this.uniforms.resolution,w,h);gl.uniform3f(this.uniforms.transform,px,m.e-x,m.f-y);
          gl.drawArraysInstanced(gl.TRIANGLES,0,6,count);
        }
        if(gl.isContextLost()||gl.getError()!==gl.NO_ERROR)return false;
        if(output)output.drawImage(this.canvas,x-x0,y-y0);else c.drawImage(this.canvas,x,y);
      }
      if(output)c.drawImage(this.composite,x0,y0);
    }finally{c.restore();if(tiled)this.composite.width=this.composite.height=0;}
    return true;
  }
}

let gpu:ThreadGPU|null|undefined;
/** Same renderer for the editor, thumbnails, agent previews and transparent/opaque PNGs. */
export function drawRealisticThreads(c:CanvasRenderingContext2D,commands:Command[],colours:string[],from:number,to:number,pxPerMm:number,view:[number,number,number,number]):ThreadBackend{
  // Callers use a uniform mm-to-device-pixel transform. The canvas keeps its matrix in
  // single precision, so the scale is compared relatively: an absolute tolerance rejects
  // the GPU at high zoom and the view flickers between the two renderers.
  const m=c.getTransform(),near=(v:number)=>Math.abs(v-pxPerMm)<=pxPerMm*1e-4,compatible=pxPerMm>0&&near(m.a)&&near(m.d)&&Math.abs(m.b)<1e-6&&Math.abs(m.c)<1e-6;
  if(compatible){
    if(gpu===undefined){try{gpu=new ThreadGPU();}catch{gpu=null;}}
    if(gpu){
      try{if(gpu.paint(c,threadInstances(commands,colours),from,to,pxPerMm))return 'webgl2';}
      catch{gpu.dispose();gpu=null;}
    }
  }
  drawThreads(c,commands,colours.map(threadShades),from,to,threadStyle(pxPerMm),view);return 'canvas2d';
}
