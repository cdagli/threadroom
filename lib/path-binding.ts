import type {StitchObject} from './project';
export type PathSettings={mode:'fill'|'count'|'spacing';count:number;spacing:number;rotate:boolean;reverse:boolean;hidePath:boolean;offset:number;align:'start'|'center'};
export type PathBinding={pathId:string;prototypes:StitchObject[];members:string[][];settings:PathSettings};
export const defaultPathSettings:PathSettings={mode:'fill',count:5,spacing:1,rotate:true,reverse:false,hidePath:true,offset:0,align:'center'};
export function validPathSettings(s:PathSettings):boolean{
  return !!s&&['fill','count','spacing'].includes(s.mode)&&Number.isInteger(s.count)&&s.count>=1&&s.count<=80&&Number.isFinite(s.spacing)&&s.spacing>=0&&s.spacing<=100&&Number.isFinite(s.offset)&&s.offset>=0&&s.offset<=1000&&['start','center'].includes(s.align)&&[s.rotate,s.reverse,s.hidePath].every(v=>typeof v==='boolean');
}
