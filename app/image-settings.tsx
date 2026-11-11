'use client';
import {Button,Icon,Input,Section,Select} from '@/design-system';
import type {RefImage} from '@/lib/project';
import {useT} from './i18n';

type Props={image:RefImage;disabled:boolean;busy:boolean;colours:number;ignoreBackground:boolean;onChange:(patch:Partial<RefImage>,merge?:string)=>void;onDelete:()=>void;onFit:()=>void;onTrace:()=>void;onStitch:()=>void;onColours:(value:number)=>void;onIgnoreBackground:(value:boolean)=>void};

export default function ImageSettings({image,disabled,busy,colours,ignoreBackground,onChange,onDelete,onFit,onTrace,onStitch,onColours,onIgnoreBackground}:Props){
  const {t,formatNumber}=useT();
  return <div className="image-inspector">
    <div className="image-actions">
      <Button variant="secondary" size="sm" disabled={disabled} aria-pressed={!!image.locked} onClick={()=>onChange({locked:image.locked?undefined:true})}>{t(image.locked?'Unlock image':'Lock')}</Button>
      <Button variant="danger" size="sm" disabled={disabled||image.locked||busy} onClick={onDelete}>{t('Delete image')}</Button>
    </div>
    <fieldset className="image-settings" disabled={disabled||image.locked}>
      <label>{t('Reference opacity')} <span className="field-value">{formatNumber(Math.round(image.opacity*100))}%</span><Input type="range" min=".05" max="1" step=".05" value={image.opacity} onChange={e=>onChange({opacity:Number(e.target.value)},'opacity')}/></label>
    </fieldset>
    <Button variant="link" disabled={disabled} onClick={onFit}>{t('Fit image')}</Button>
    <Section id="image-digitise" title={t('Auto trace')} defaultOpen>
      <div className="image-convert-actions">
        <Button variant="primary" loading={busy} disabled={disabled||image.hidden} onClick={onTrace}><Icon name="region"/>{t('Auto trace')}</Button>
        <Button variant="secondary" disabled={disabled||busy||image.hidden} title={t('Click to stitch (7): click a colour area to fill it')} onClick={onStitch}>{t('Click to stitch')}</Button>
      </div>
      <Section id="image-trace-options" title={t('Trace settings')}>
        <label>{t('Colours')}<Select disabled={disabled||busy} value={colours} onChange={e=>onColours(Number(e.target.value))}>{[2,3,4,5,6,8].map(n=><option key={n} value={n}>{formatNumber(n)}</option>)}</Select></label>
        <label className="check-label"><Input type="checkbox" disabled={disabled||busy} checked={ignoreBackground} onChange={e=>onIgnoreBackground(e.target.checked)}/>{t('Remove background')}</label>
      </Section>
    </Section>
  </div>;
}
