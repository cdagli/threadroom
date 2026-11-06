'use client';
import {LoadingState} from '@/design-system';
import {useT} from './i18n';

export default function StudioLoading() {
  const {t}=useT();
  return <div className="studio-loading"><LoadingState title="Threadroom" label={t('Opening your studio…')}/></div>;
}
