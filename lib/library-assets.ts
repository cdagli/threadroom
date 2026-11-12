import {validLibraryAsset,type LibraryAsset} from './library';
import {boxShape,isBoxShape,radialShapes,shapeNames,type ShapeKind} from './shapes';
import {curveRing} from './curves';
import {en,tr} from './i18n';
import {defaultThread,defaultThreadColour} from './threads';
import leafSprig from './library-samples/leaf-sprig.json';
import tulip from './library-samples/tulip.json';
import daisy from './library-samples/daisy.json';
import heart from './library-samples/heart.json';

// Hand-digitised with the editor tools, with separate editable parts and Brother threads.
// Keep the source snapshots independent of inserted copies. See docs/library.md for additions.
const samples=[
  {version:1,id:'botanical.leaf-sprig-01',categoryId:'botanical',name:{tr:'Yaprak dalı',en:'Leaf sprig'},tags:['yaprak','dal','bitki','leaf','sprig','botanical'],design:leafSprig},
  {version:1,id:'botanical.tulip-01',categoryId:'botanical',name:{tr:'Lale',en:'Tulip'},tags:['lale','çiçek','bahar','tulip','flower','spring'],design:tulip},
  {version:1,id:'botanical.daisy-01',categoryId:'botanical',name:{tr:'Papatya',en:'Daisy'},tags:['papatya','çiçek','bahar','daisy','flower','spring'],design:daisy},
  {version:1,id:'symbols.heart-01',categoryId:'symbols',name:{tr:'Kalp',en:'Heart'},tags:['kalp','sevgi','heart','love'],design:heart},
] satisfies readonly (Omit<LibraryAsset,'design'>&{design:unknown})[];

// Reuse the drawing tools' editable anchors, including smooth corners, for catalog shapes.
const basicShapes:LibraryAsset[]=(Object.keys(shapeNames) as ShapeKind[]).map(kind=>{
  const name={en:en[shapeNames[kind]],tr:tr[shapeNames[kind]]};
  const shape=isBoxShape(kind)?boxShape(kind,[5,5],[35,kind==='oval'?25:35]):radialShapes[kind]([20,20],15);
  const curve={points:shape.points,corners:shape.corners,closed:true,spline:'levien' as const};
  return {version:1,id:`basic-shapes.${kind}`,categoryId:'basic-shapes',name,tags:[kind,'shape','şekil'],design:{objects:[{
    id:`basic-${kind}`,name:name.en,rings:[curveRing(curve)],curve,kind:'fill',fillPattern:'tatami',
    color:defaultThreadColour,thread:defaultThread,length:2.5,angle:35,satinWidth:2,
  }]}};
});

// JSON widens stitch kind strings. Validate that boundary instead of asserting the imported type.
export const libraryAssets:readonly LibraryAsset[]=[...basicShapes,...samples].map(asset=>{
  if(!validLibraryAsset(asset))throw new Error(`Invalid library asset: ${asset.id}`);
  return asset;
});
