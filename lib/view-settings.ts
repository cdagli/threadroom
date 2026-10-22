export type Units='mm'|'cm'|'in';
export type ViewSettings={units:Units;gridSize:number;subdivisions:number;showGrid:boolean;snapGrid:boolean;snapObjects:boolean;rulers:boolean;showJumps:boolean;playbackSpeed:number};
// Playback multiplies the base rate of 450 stitches per second.
export const playbackSpeeds=[.25,.5,1,2,4,8,16] as const;export const playbackRate=450;
export const defaultView:ViewSettings={units:'mm',gridSize:5,subdivisions:5,showGrid:true,snapGrid:false,snapObjects:false,rulers:false,showJumps:false,playbackSpeed:1};
export const unitValue=(mm:number,units:Units)=>mm/(units==='cm'?10:units==='in'?25.4:1);
export const lengthDigits:Record<Units,number>={mm:1,cm:1,in:3};
// A length in the display units, e.g. "2,5 cm"; format is the language's number formatter.
export const formatLength=(mm:number,units:Units,format:(n:number,digits:number)=>string)=>`${format(unitValue(mm,units),lengthDigits[units])} ${units}`;
export function readViewSettings(raw:string|null):ViewSettings{
  try{const v=JSON.parse(raw??'null');if(!v||typeof v!=='object')return {...defaultView};const next={...defaultView};
    if(['mm','cm','in'].includes(v.units))next.units=v.units;
    if(Number.isFinite(v.gridSize)&&v.gridSize>=.5&&v.gridSize<=50)next.gridSize=v.gridSize;
    if(Number.isInteger(v.subdivisions)&&v.subdivisions>=1&&v.subdivisions<=10)next.subdivisions=v.subdivisions;
    if(playbackSpeeds.includes(v.playbackSpeed))next.playbackSpeed=v.playbackSpeed;
    for(const k of ['showGrid','snapGrid','snapObjects','rulers','showJumps'] as const)if(typeof v[k]==='boolean')next[k]=v[k];return next;
  }catch{return {...defaultView};}
}
