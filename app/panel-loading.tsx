'use client';
import {useT} from './i18n';
export function Loading(){const {t}=useT();return <span role="status">{t('Working…')}</span>;}
