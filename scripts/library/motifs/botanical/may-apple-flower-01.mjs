import {motif,drawLayers} from '../../kit.mjs';

// May apple flower (Podophyllum peltatum) from the album "Wild flowers of Georgetown, DC" (1856), Oak Spring Garden Foundation, CC0 — Biodiversity Heritage Library page 65519121.
// Traced from the plate (outlines in mm), then digitized by layer: see drawLayers in kit.mjs.
// Sap (undefined)
const L0=[
  [[49.6,73.6],[50.2,69.4],[51.2,64.6]],
];
// Taç yaprak (undefined)
const L1=[
  [[47,40.4],[47.6,34],[49.6,30.8],[54.4,30],[59.4,31.8],[61.2,35.2],[60.4,39.4],[61,41.2],[63.6,37.2],[66.9,36.6],[68.8,40.2],[68.8,46.4],[66.4,49.4],[64.6,49.6],[68,51.8],[68,57.6],[64.2,60.4],[59.6,60.6],[59.8,62.8],[58.6,65],[55,66.4],[50.6,65.6],[49,61.6],[43.8,64.6],[37.6,63.2],[34,58.6],[34.2,54.8],[36.6,51.8],[34.2,49],[33.6,44.8],[35.8,41.6],[41.4,40.2]],
];
// Erkek organ (undefined)
const L2=[

];
// Göbek (undefined)
const L3=[
  [[59.15,46.7],[58.9,49.55],[57.1,52],[54.25,53.4],[51.05,53.3],[48.4,51.8],[47.05,49.3],[47.3,46.45],[49.1,44],[51.95,42.6],[55.15,42.7],[57.8,44.2]],
];
// Göbek çizgileri (undefined)
const L4=[
  [[49.2,45],[51,43.6],[53.6,43.4],[56.4,45.6],[53.4,45.6],[50.4,46.4],[48.8,48.6],[49.8,51.2],[52,49.4],[55.4,48.6],[58.2,49.6],[57.6,51.8],[54.4,51.6],[51.6,53]],
];

export default motif('botanical.may-apple-flower-01','botanical',{"tr":"Mayıs elması çiçeği","en":"May apple flower"},
  ["mayıs elması","beyaz çiçek","çiçek","bahar","may apple","mayapple","podophyllum","white flower","flower","spring","botanical","vintage"],
  "Mayıs elması çiçeği",b=>drawLayers(b,[
  {...{"name":"Sap","code":"446","kind":"stem","width":[2.4,1.8]},parts:L0},
  {...{"name":"Taç yaprak","code":"000","kind":"petals","smooth":true,"count":6,"covers":[3],"notches":[[47,40.4],[61,41.2],[64.6,49.6],[59.6,60.6],[49,61.6],[36.6,51.8]],"rim":{"code":"505","to":5.6,"length":1.8,"veins":2,"depth":0.5}},parts:L1,centre:[53.1,48]},
  {...{"name":"Erkek organ","code":"334","kind":"stamens","length":1.2,"centres":[[53.1,48,5.4,8.2,18,0,360]]},parts:L2},
  {...{"name":"Göbek","code":"354","kind":"fill","pattern":"circular","angle":0},parts:L3},
  {...{"name":"Göbek çizgileri","code":"255","kind":"outline","closed":false,"stitch":"bean","length":1.4},parts:L4},
  ],{start:[50,74]}));
