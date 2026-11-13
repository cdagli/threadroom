import type {Key} from './i18n';
export const textiles={plain:'Solid colour',linen:'Linen',cotton:'Cotton',gauze:'Muslin / double gauze',rib:'Interlock / rib knit',denim:'Denim',jersey:'Jersey',felt:'Felt',terry:'Terry'} as const satisfies Record<string,Key>;
export type CanvasBackground={textile:keyof typeof textiles;color:string};
export const backgroundPresets:{name:Key;background:CanvasBackground}[]=[
  {name:'Natural linen',background:{textile:'linen',color:'#c9b99a'}},
  {name:'Ivory cotton',background:{textile:'cotton',color:'#f5f0e5'}},
  {name:'Indigo denim',background:{textile:'denim',color:'#334c70'}},
  {name:'Blush felt',background:{textile:'felt',color:'#d8adb0'}},
  {name:'Sage linen',background:{textile:'linen',color:'#a5ae96'}},
];
export function validBackground(value:unknown):value is CanvasBackground{
  if(!value||typeof value!=='object')return false;
  const b=value as CanvasBackground;
  return Object.hasOwn(textiles,b.textile)&&typeof b.color==='string'&&/^#[0-9a-f]{6}$/i.test(b.color);
}
