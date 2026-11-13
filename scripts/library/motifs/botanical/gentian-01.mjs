import {motif,drawLayers} from '../../kit.mjs';

// Soapwort gentian (Gentiana saponaria) from the album "Wild flowers of Georgetown, DC" (1856), Oak Spring Garden Foundation, CC0 — Biodiversity Heritage Library page 65519205.
// Traced from the plate (outlines in mm), then digitized by layer: see drawLayers in kit.mjs.
// Yaprak (undefined)
const L0=[
  [[49.3,35.9],[49,32.45],[46.9,28.3],[43.55,24.35],[40.2,21.4],[40.7,26.15],[42.5,31.05],[45.8,34.45]],
  [[48.15,37.9],[44.3,36.1],[39.15,35.95],[34.05,38.55],[30.2,42.2],[34.9,42.05],[40.45,41.4],[45.25,40]],
  [[49.55,39.6],[47.25,41.75],[45.45,45.55],[44.5,50.2],[44.2,54.2],[47.65,51.3],[50.35,47.35],[50.75,43.05]],
  [[51.15,39.9],[49.7,41.9],[49.25,44.8],[50.4,47.8],[52.2,50.2],[52.9,47.5],[53.2,44.35],[52.55,41.6]],
  [[52.35,39.3],[53.65,42.5],[56.95,46],[61.3,49.1],[65.2,51.4],[63.85,46.4],[60.95,41.75],[56.55,39.5]],
  [[50.05,35.35],[51.05,33.35],[51.05,30.75],[49.6,28.25],[47.6,26.4],[47.4,28.85],[47.6,31.7],[48.55,34.05]],
];
// Damar (undefined)
const L1=[

];
// Sap (undefined)
const L2=[
  [[35.4,80],[34.8,72],[35.2,64],[37.6,56],[41.4,48],[45.6,41.6],[47.6,40.4]],
];
// Çanak (undefined)
const L3=[
  [[55.6,36.5],[55.9,37.85],[55.4,39.2],[54.3,40.25],[52.85,40.7],[51.4,40.4],[50.4,39.5],[50.1,38.15],[50.6,36.8],[51.7,35.75],[53.15,35.3],[54.6,35.6]],
];
// Taç yaprak (undefined)
const L4=[
  [[52.6,38.4],[53,30.4],[55.2,25.4],[57,23.6],[59.2,22.4],[61.6,23],[63.4,22.8],[66.4,26],[68.6,27.8],[70.2,31.4],[71.6,34.2],[70.4,37],[66.4,39.6],[62.2,41.6],[58.2,42.2],[55,41.2]],
];

export default motif('botanical.gentian-01','botanical',{"tr":"Centiyane","en":"Gentian"},
  ["centiyane","mavi çiçek","çiçek","kır çiçeği","sonbahar","gentian","soapwort gentian","blue flower","wildflower","flower","autumn","botanical","vintage"],
  "Centiyane",b=>drawLayers(b,[
  {...{"name":"Yaprak","code":"463","kind":"leaf","smooth":true,"splitMin":4.9,"covers":[3]},parts:L0},
  {...{"name":"Damar","code":"446","kind":"veinnet","leafLayer":0,"stems":[[[35.4,80],[34.8,72],[35.2,64],[37.6,56],[41.4,48],[45.6,41.6],[47.6,40.4]]],"length":1.7,"veins":{"at":[0.35,0.6],"reach":0.6},"stalkMin":2.5},parts:L1},
  {...{"name":"Sap","code":"446","kind":"stem","width":[2,1.4]},parts:L2},
  {...{"name":"Çanak","code":"446","kind":"fill","covers":[4]},parts:L3},
  {...{"name":"Taç yaprak","code":"015","kind":"petals","smooth":true,"count":5,"notches":[[56.6,23.8],[61.6,23],[66.4,26],[70.2,31.4],[70.4,37]],"rim":{"code":"575","to":2.6,"length":1.7,"veins":1,"depth":0.55}},parts:L4,centre:[52.6,38.4]},
  ],{start:[40,22]}));
