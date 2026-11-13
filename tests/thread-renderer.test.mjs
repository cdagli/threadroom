import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-lib.mjs';
const {threadInstances,drawRealisticThreads}=load('thread-renderer');
const stitch=(fromX,fromY,x,y,block=0)=>({type:'stitch',fromX,fromY,x,y,block});

test('GPU instances preserve sewing order and command prefixes through jumps, knots and invalid data',()=>{
  const commands=[stitch(0,0,4,0),{...stitch(4,0,9,9),type:'jump'},stitch(9,9,9,9),stitch(NaN,0,1,1),stitch(9,9,12,9,1),stitch(0,0,2,2,7)];
  const geometry=threadInstances(commands,['#ff0000','#0000ff']);
  assert.deepEqual([...geometry.prefix],[0,1,1,1,1,2,2]);
  assert.equal(geometry.data.length,18);
  assert.deepEqual([...geometry.data.slice(0,7)],[0,0,4,0,1,0,0]);
  assert.deepEqual([...geometry.data.slice(9,16)],[9,9,12,9,0,0,1]);
  assert.ok(geometry.data.every(Number.isFinite));
});

test('GPU dye uses linear light, caches geometry and invalidates on palette changes',()=>{
  const commands=[stitch(0,0,4,0)],a=threadInstances(commands,['#808080']);
  assert.ok(Math.abs(a.data[4]-.21586)<.0001);
  assert.equal(a,threadInstances(commands,['#808080']));
  const b=threadInstances(commands,['#ffffff']);
  assert.notEqual(a,b);assert.deepEqual([...b.data.slice(4,7)],[1,1,1]);
  assert.equal(a.data[8],b.data[8],'material seed does not depend on the palette');
});

const chain=(points,extra={})=>points.slice(1).map((p,i)=>({...stitch(points[i][0],points[i][1],p[0],p[1]),...extra}));
const ends=(g,i)=>[...g.data.slice(i*9,i*9+4)];

test('Threads sharing a needle hole lie side by side: satin sews as parallel threads',()=>{
  // Needle points zigzag 0.2 mm per penetration across a 3 mm column.
  const g=threadInstances(chain([[0,0],[3,.2],[0,.4],[3,.6],[0,.8],[3,1]]),['#000000']);
  for(const i of [1,2,3]){
    const [ax,ay,bx,by]=ends(g,i);
    assert.ok(Math.abs(by-ay)<.08,`stitch ${i} is nearly square to the column, not slanted by 0.2 mm`);
    assert.ok(Math.abs((ay+by)/2-(.1+.2*i))<.01,'and stays centred between its needle points');
    assert.ok(Math.abs(ax-(i%2?3:0))<.03&&Math.abs(bx-(i%2?0:3))<.03,'the column keeps its width');
  }
  const centres=[1,2,3].map(i=>(ends(g,i)[1]+ends(g,i)[3])/2);
  assert.ok(Math.abs(centres[1]-centres[0]-.2)<.01&&Math.abs(centres[2]-centres[1]-.2)<.01,'one thread every 0.2 mm');
});

test('Straight runs keep their needle points; a retraced bean pass lies beside the first',()=>{
  const straight=threadInstances(chain([[0,0],[2,0],[4,0],[4,2]]),['#000000']);
  assert.deepEqual(ends(straight,0),[0,0,2,0]);assert.deepEqual(ends(straight,1),[2,0,4,0]);assert.deepEqual(ends(straight,2),[4,0,4,2]);
  const bean=threadInstances(chain([[0,0],[4,0],[0,0],[4,0]]),['#000000']),back=ends(bean,1);
  assert.ok(Math.abs(back[1]-back[3])<1e-6&&Math.abs(back[1])>.1,'the return pass is shifted sideways as a whole');
  assert.ok(back[1]*ends(bean,0)[3]<0&&back[1]*ends(bean,2)[1]<0,'to the other side of the passes before and after it');
  assert.ok(bean.bounds[1]<-1&&bean.bounds[3]>1&&bean.bounds[0]<=-1&&bean.bounds[2]>=5,'bounds leave room for the strand and its shadow');
});

test('Lock stitches stack as one thread and keep playback prefixes',()=>{
  const tack=chain([[0,0],[1,0],[0,0],[1,0],[0,0]],{tie:'in'}),commands=[...tack,...chain([[0,0],[3,0]])];
  const g=threadInstances(commands,['#000000']);
  assert.deepEqual([...g.prefix],[0,1,1,1,1,2]);
  assert.deepEqual(ends(g,0),[0,0,1,0]);assert.deepEqual(ends(g,1),[0,0,3,0],'the run after a lock is not pushed aside by it');
});

test('Canvas fallback works without WebGL and retains playback ranges',()=>{
  const commands=[stitch(0,0,4,0),stitch(0,1,4,1)],paths=[];
  const c={getTransform:()=>({a:10,d:10,b:0,c:0,e:0,f:0}),beginPath(){},moveTo(x,y){paths.push([x,y]);},lineTo(){},stroke(){}};
  // Node has no document/WebGL. Initialization fails closed, then uses the
  // existing renderer rather than dropping the preview or failing an export.
  assert.equal(drawRealisticThreads(c,commands,['#000000'],1,2,10,[-1,-1,5,2]),'canvas2d');
  assert.ok(paths.length);assert.ok(paths.every(([,y])=>y>.5),'only command 1 was drawn');
});
