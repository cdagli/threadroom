'use client';
import {Button,Modal} from '@/design-system';
import {useT} from './i18n';
export default function SVGImportChoice({file,onChoose,onClose}:{file:File;onChoose:(shapes:boolean)=>void;onClose:()=>void}){
  const {t}=useT();return <Modal title={t('Import SVG')} onClose={onClose}><p>{file.name}</p><p>{t('Import editable shapes, or add the SVG as a reference image to trace over.')}</p><div className="io-actions"><Button variant="secondary" onClick={()=>onChoose(true)}>{t('Import as shapes')}</Button><Button variant="secondary" onClick={()=>onChoose(false)}>{t('Import as reference image')}</Button><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button></div></Modal>;
}
