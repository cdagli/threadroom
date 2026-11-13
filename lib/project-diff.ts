import type {Lang,Translator} from './i18n';
import type {Project} from './project';

// Language-neutral change records stored with each version; the UI renders them in the current language.
export type Change=
  |{op:'created'}
  |{op:'duplicated';name:string}
  |{op:'restored';number:number}
  |{op:'renamed';name:string}
  |{op:'added'|'removed'|'edited';name:string}
  |{op:'reordered'|'settings'|'images'}
  |{op:'more';count:number};

/** @test */ export const maxChanges=8;

// Structural equality that ignores key order (Postgres jsonb does not keep it).
/** @test */ export function same(a:unknown,b:unknown):boolean{
  if(a===b)return true;
  if(typeof a!=='object'||typeof b!=='object'||a===null||b===null)return false;
  if(Array.isArray(a)!==Array.isArray(b))return false;
  if(Array.isArray(a)){const list=b as unknown[];return a.length===list.length&&a.every((v,i)=>same(v,list[i]));}
  const x=a as Record<string,unknown>,y=b as Record<string,unknown>;
  const keys=Object.keys(x).filter(k=>x[k]!==undefined),other=Object.keys(y).filter(k=>y[k]!==undefined);
  return keys.length===other.length&&keys.every(k=>Object.hasOwn(y,k)&&same(x[k],y[k]));
}

export function diffProjects(before:Project,after:Project):Change[]{
  const changes:Change[]=[];
  if(before.name!==after.name)changes.push({op:'renamed',name:after.name});
  const old=new Map(before.objects.map(o=>[o.id,o])),next=new Set(after.objects.map(o=>o.id));
  for(const o of after.objects){
    const previous=old.get(o.id);
    if(!previous)changes.push({op:'added',name:o.name});
    else if(!same(previous,o))changes.push({op:'edited',name:o.name});
  }
  for(const o of before.objects)if(!next.has(o.id))changes.push({op:'removed',name:o.name});
  const objectChanges=changes.some(c=>c.op==='added'||c.op==='removed'||c.op==='edited');
  // Layer order and grouping only count on their own; object edits usually explain them.
  const arranged=!same(before.objects.map(o=>o.id),after.objects.map(o=>o.id))||!same(before.groups??[],after.groups??[]);
  if(!objectChanges&&arranged)changes.push({op:'reordered'});
  const settings=(p:Project)=>[p.hoop,p.fabric,p.locks,p.trimJump,p.sewingSpeed??null,p.machine,p.background??null];
  if(!same(settings(before),settings(after)))changes.push({op:'settings'});
  if(!same(before.images??[],after.images??[]))changes.push({op:'images'});
  return changes.length>maxChanges?[...changes.slice(0,maxChanges-1),{op:'more',count:changes.length-maxChanges+1}]:changes;
}

export function describeChange(c:Change,t:Translator):string{
  switch(c.op){
    case 'created':return t('Created the project');
    case 'duplicated':return t('Duplicated from {name}',{name:c.name});
    case 'restored':return t('Restored version {number}',{number:c.number});
    case 'renamed':return t('Renamed to {name}',{name:c.name});
    case 'added':return t('Added {name}',{name:c.name});
    case 'removed':return t('Removed {name}',{name:c.name});
    case 'edited':return t('Edited {name}',{name:c.name});
    case 'reordered':return t('Reordered layers');
    case 'settings':return t('Changed project settings');
    case 'images':return t('Changed reference images');
    case 'more':return t('+{count} more',{count:c.count});
  }
}

const units:[Intl.RelativeTimeFormatUnit,number][]=[['year',31536e6],['month',2592e6],['week',6048e5],['day',864e5],['hour',36e5],['minute',6e4]];
export function relativeTime(iso:string,lang:Lang,now=Date.now()):string{
  const diff=new Date(iso).getTime()-now,format=new Intl.RelativeTimeFormat(lang==='tr'?'tr-TR':'en-US',{numeric:'auto'});
  for(const [unit,ms] of units)if(Math.abs(diff)>=ms)return format.format(Math.round(diff/ms),unit);
  return format.format(0,'minute');
}
