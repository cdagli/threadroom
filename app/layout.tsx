import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Threadroom — embroidery, made approachable',
  description: 'An experimental embroidery studio for Brother PR1X. Create, preview, and export PES designs.',
};
export default function RootLayout({children}: {children: React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
