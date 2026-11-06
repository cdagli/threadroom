'use client';
import {Button} from '@/design-system';
import {useT} from './i18n';
import type {Project} from '@/lib/project';
import {canBreakApart,canConvertToRedwork} from '@/lib/redwork';
// Convert to redwork for lines and outlines, Break apart for a redwork object (shortcut W).
export function RedworkAction({project,selection,onRun}:{project:Project;selection:string[];onRun:()=>void}){
  const {t}=useT(),apart=canBreakApart(project,selection);
  if(!apart&&!canConvertToRedwork(project,selection))return null;
  return <Button variant="secondary" type="button" className="edit-points-button redwork-action" title={t(apart?'Restore the objects this redwork was made from (W)':'Merge the selected lines and outlines into one path sewn out and back with no trims (W)')} onClick={onRun}>{t(apart?'Break apart':'Convert to redwork')}</Button>;
}
