import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './feed-layout.css';

export const metadata: Metadata = {
  title: 'KIPU | Demo de modulos',
  description: 'Estado local del prototipo académico de KIPU.',
};
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
