export type Units='mm'|'cm'|'in';
export type ViewSettings={units:Units;gridSize:number;subdivisions:number;showGrid:boolean;snapGrid:boolean;snapObjects:boolean;rulers:boolean;showJumps:boolean};
export const defaultView:ViewSettings={units:'mm',gridSize:5,subdivisions:5,showGrid:true,snapGrid:false,snapObjects:false,rulers:false,showJumps:false};
export const unitValue=(mm:number,units:Units)=>mm/(units==='cm'?10:units==='in'?25.4:1);
export function readViewSettings(raw:string|null):ViewSettings{
  try{const v=JSON.parse(raw??'null');if(!v||typeof v!=='object')return {...defaultView};const next={...defaultView};
    if(['mm','cm','in'].includes(v.units))next.units=v.units;
    if(Number.isFinite(v.gridSize)&&v.gridSize>=.5&&v.gridSize<=50)next.gridSize=v.gridSize;
    if(Number.isInteger(v.subdivisions)&&v.subdivisions>=1&&v.subdivisions<=10)next.subdivisions=v.subdivisions;
    for(const k of ['showGrid','snapGrid','snapObjects','rulers','showJumps'] as const)if(typeof v[k]==='boolean')next[k]=v[k];return next;
  }catch{return {...defaultView};}
}
