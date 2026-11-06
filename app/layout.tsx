import {createT} from '@/lib/i18n';
import {I18nProvider} from './i18n';
import type { Metadata } from 'next';
import '@/design-system/styles.css';
import './globals.css';
const t=createT('tr');
// The title is rendered by I18nProvider so it follows the language switch (Next re-applied a metadata
// title over document.title, leaving English pages with a Turkish tab title).
export const metadata: Metadata = {
  description: t("An experimental embroidery studio for Brother PR1X. Create, preview, and export PES designs."),
};
export default function RootLayout({children}: {children: React.ReactNode}) {
  return <html lang="tr"><body><I18nProvider>{children}</I18nProvider></body></html>;
}
