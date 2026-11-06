import type {Point} from './project';
export type Matrix=[number,number,number,number,number,number];
export const identity:Matrix=[1,0,0,1,0,0];
/** @test */ export const map=(m:Matrix,[x,y]:Point):Point=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
export const multiply=(a:Matrix,b:Matrix):Matrix=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const number='[+-]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][+-]?\\d+)?';
export function numbers(s:string):number[]{
  const matches=s.match(new RegExp(number,'g'))??[];
  if(s.replace(new RegExp(number,'g'),'').replace(/[\s,]/g,''))throw Error('SVG');
  const n=matches.map(Number);if(!n.every(Number.isFinite))throw Error('SVG');return n;
}
export function transform(s:string):Matrix{
  let m=identity;const re=/([a-z]+)\s*\(([^)]*)\)/gi;let end=0,match:RegExpExecArray|null;
  while((match=re.exec(s))){if(s.slice(end,match.index).replace(/[\s,]/g,''))throw Error('SVG');end=re.lastIndex;
    const n=numbers(match[2]),[a,b=0,c=0]=n,r=a*Math.PI/180;let t:Matrix;
    switch(match[1]){
      case 'matrix':if(n.length!==6)throw Error('SVG');t=n as Matrix;break;
      case 'translate':if(n.length<1||n.length>2)throw Error('SVG');t=[1,0,0,1,a,b];break;
      case 'scale':if(n.length<1||n.length>2)throw Error('SVG');t=[a,0,0,n[1]??a,0,0];break;
      case 'rotate':if(n.length!==1&&n.length!==3)throw Error('SVG');t=[Math.cos(r),Math.sin(r),-Math.sin(r),Math.cos(r),0,0];t=multiply(multiply([1,0,0,1,b,c],t),[1,0,0,1,-b,-c]);break;
      case 'skewX':case 'skewY':if(n.length!==1)throw Error('SVG');t=match[1]==='skewX'?[1,0,Math.tan(r),1,0,0]:[1,Math.tan(r),0,1,0,0];break;
      default:throw Error('SVG');
    }
    m=multiply(m,t);
  }
  if(s.slice(end).trim()||!m.every(Number.isFinite))throw Error('SVG');return m;
}
export type Subpath={points:Point[];closed:boolean;linear:boolean};
// Flatten in physical space to 0.04 mm. SVG Bézier controls cannot be represented exactly by
// Threadroom's interpolating splines; straight paths retain their exact editable corner anchors.
export function pathData(d:string,m:Matrix):Subpath[]{
  let i=0,cmd='',previous='',p:Point=[0,0],start:Point=[0,0],control:Point=[0,0],part:Subpath|null=null,total=0;
  const paths:Subpath[]=[],skip=()=>{while(/[\s,]/.test(d[i]??'')&&i<d.length)i++;};
  const num=(flag=false)=>{skip();const match=d.slice(i).match(flag?/^[01]/:new RegExp('^'+number));if(!match)throw Error('SVG');i+=match[0].length;const n=Number(match[0]);if(!Number.isFinite(n))throw Error('SVG');return n;};
  const push=(q:Point)=>{if(++total>12000||!q.every(Number.isFinite))throw Error('SVG');part!.points.push(q);};
  const line=(q:Point)=>{push(map(m,q));p=q;};
  const cubic=(a:Point,b:Point,c:Point,e:Point,depth=0)=>{
    const dist=(q:Point)=>{const dx=e[0]-a[0],dy=e[1]-a[1],len=Math.hypot(dx,dy);return len?Math.abs(dy*q[0]-dx*q[1]+e[0]*a[1]-e[1]*a[0])/len:Math.hypot(q[0]-a[0],q[1]-a[1]);};
    // Control-polygon length also catches collinear curves that double back.
    const poly=Math.hypot(b[0]-a[0],b[1]-a[1])+Math.hypot(c[0]-b[0],c[1]-b[1])+Math.hypot(e[0]-c[0],e[1]-c[1]);
    if(depth>=16||(Math.max(dist(b),dist(c))<=.04&&poly-Math.hypot(e[0]-a[0],e[1]-a[1])<=.04)){push(e);return;}
    const mid=(a:Point,b:Point):Point=>[(a[0]+b[0])/2,(a[1]+b[1])/2],ab=mid(a,b),bc=mid(b,c),ce=mid(c,e),abc=mid(ab,bc),bce=mid(bc,ce),q=mid(abc,bce);
    cubic(a,ab,abc,q,depth+1);cubic(q,bce,ce,e,depth+1);
  };
  while(i<d.length){skip();if(i===d.length)break;
    if(/[a-z]/i.test(d[i]))cmd=d[i++];else if(!cmd||cmd.toUpperCase()==='Z')throw Error('SVG');
    const op=cmd.toUpperCase(),relative=cmd!==op,origin=p;
    const point=():Point=>{const x=num(),y=num();return relative?[x+origin[0],y+origin[1]]:[x,y];};
    if(op==='M'){p=point();start=p;part={points:[],closed:false,linear:true};paths.push(part);push(map(m,p));cmd=relative?'l':'L';}
    else{
      if(!part)throw Error('SVG');
      if(part.closed&&op!=='Z'){start=p;part={points:[map(m,p)],closed:false,linear:true};paths.push(part);}
      if(op==='Z'){part.closed=true;p=start;cmd='';}
      else if(op==='L')line(point());
      else if(op==='H')line([num()+(relative?p[0]:0),p[1]]);
      else if(op==='V')line([p[0],num()+(relative?p[1]:0)]);
      else if(['C','S','Q','T'].includes(op)){
        part.linear=false;let b:Point,c:Point,e:Point;
        const reflection:Point=[2*p[0]-control[0],2*p[1]-control[1]];
        if(op==='C'||op==='S'){b=op==='C'?point():['C','S'].includes(previous)?reflection:p;c=point();e=point();control=c;}
        else{const q=op==='Q'?point():['Q','T'].includes(previous)?reflection:p;e=point();b=[p[0]+2/3*(q[0]-p[0]),p[1]+2/3*(q[1]-p[1])];c=[e[0]+2/3*(q[0]-e[0]),e[1]+2/3*(q[1]-e[1])];control=q;}
        cubic(map(m,p),map(m,b),map(m,c),map(m,e));p=e;
      }else if(op==='A'){
        part.linear=false;let rx=Math.abs(num()),ry=Math.abs(num());const phi=num()*Math.PI/180,large=num(true),sweep=num(true),e=point(),cos=Math.cos(phi),sin=Math.sin(phi);
        if(!rx||!ry)line(e);
        else if(e[0]!==p[0]||e[1]!==p[1]){
          const dx=(p[0]-e[0])/2,dy=(p[1]-e[1])/2,x=cos*dx+sin*dy,y=-sin*dx+cos*dy,ratio=x*x/(rx*rx)+y*y/(ry*ry);
          if(ratio>1){rx*=Math.sqrt(ratio);ry*=Math.sqrt(ratio);}
          const f=(large===sweep?-1:1)*Math.sqrt(Math.max(0,(rx*rx*ry*ry-rx*rx*y*y-ry*ry*x*x)/(rx*rx*y*y+ry*ry*x*x))),cx=f*rx*y/ry,cy=-f*ry*x/rx;
          const centre:Point=[cos*cx-sin*cy+(p[0]+e[0])/2,sin*cx+cos*cy+(p[1]+e[1])/2],a=Math.atan2((y-cy)/ry,(x-cx)/rx);
          let delta=Math.atan2((-y-cy)/ry,(-x-cx)/rx)-a;if(sweep&&delta<0)delta+=2*Math.PI;if(!sweep&&delta>0)delta-=2*Math.PI;
          const radius=Math.max(rx,ry)*Math.hypot(m[0],m[1],m[2],m[3]),step=Math.min(Math.PI/8,2*Math.acos(Math.max(-1,1-.04/Math.max(.04,radius)))),count=Math.ceil(Math.abs(delta)/step);
          if(count>12000)throw Error('SVG');
          for(let j=1;j<=count;j++){const t=a+delta*j/count;push(map(m,[centre[0]+cos*rx*Math.cos(t)-sin*ry*Math.sin(t),centre[1]+sin*rx*Math.cos(t)+cos*ry*Math.sin(t)]));}
          p=e;part.points[part.points.length-1]=map(m,e);
        }
      }else throw Error('SVG');
    }
    previous=op;
  }
  return paths.map(p=>p.closed&&p.points.length>1&&Math.hypot(p.points[0][0]-p.points.at(-1)![0],p.points[0][1]-p.points.at(-1)![1])<1e-8?{...p,points:p.points.slice(0,-1)}:p);
}
