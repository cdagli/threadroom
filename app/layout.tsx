import {createT} from '@/lib/i18n';
import {I18nProvider} from './i18n';
import type { Metadata } from 'next';
import './globals.css';
const t=createT('tr');
export const metadata: Metadata = {
  title: t("Threadroom — embroidery, made approachable"),
  description: t("An experimental embroidery studio for Brother PR1X. Create, preview, and export PES designs."),
};
export default function RootLayout({children}: {children: React.ReactNode}) {
  return <html lang="tr"><body><I18nProvider>{children}</I18nProvider></body></html>;
}
