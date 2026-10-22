'use client';
import {useT} from './i18n';
import {Modal} from './io-modal';
export default function SVGImportChoice({file,onChoose,onClose}:{file:File;onChoose:(shapes:boolean)=>void;onClose:()=>void}){
  const {t}=useT();return <Modal title={t('Import SVG')} onClose={onClose}><p>{file.name}</p><p>{t('Import editable shapes, or add the SVG as a reference image to trace over.')}</p><div className="io-actions"><button onClick={()=>onChoose(true)}>{t('Import as shapes')}</button><button onClick={()=>onChoose(false)}>{t('Import as reference image')}</button><button onClick={onClose}>{t('Cancel')}</button></div></Modal>;
}
