import table from '../embroidery/fill-patterns.json';
export type FillPattern=(typeof table)[number]['id'];
export type PatternParams={steps?:number;amplitude?:number};
export const fillPatterns=table as {id:FillPattern;name:string;mode:string;offsets?:number[];absolute?:boolean;steps?:number;amplitude?:number;usesStitchSpacing:boolean}[];
export function patternOffset(id:FillPattern,row:number,length:number,params?:PatternParams):number {
  const p=fillPatterns.find(p=>p.id===id)!;
  if(p.mode==='even')return 0;
  if(p.mode==='waves'){const steps=params?.steps??p.steps!;return (Math.sin(2*Math.PI*((row%steps+steps)%steps)/steps)+1)/2*(params?.amplitude??p.amplitude!);}
  return p.offsets![((row%p.offsets!.length)+p.offsets!.length)%p.offsets!.length]*(p.absolute?1:length);
}
// Preview penetrations use the same row table and mm units as the compiler.
export function patternPreview(id:FillPattern,params?:PatternParams):[number,number][][] {
  return Array.from({length:12},(_,row)=>{const offset=patternOffset(id,row,4,params);return Array.from({length:7},(_,i)=>offset+(i-3)*4).filter(x=>x> -6&&x<6).map(x=>[21+x*3,3+row*2] as [number,number]);});
}
