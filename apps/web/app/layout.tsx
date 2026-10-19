import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { PwaRegister } from '@/components/PwaRegister';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: { default: 'MaintainPredict AI', template: '%s · MaintainPredict AI' },
  description: 'Predicción inteligente de mantenimiento industrial',
  manifest: '/manifest.json',
  applicationName: 'MaintainPredict AI',
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  // Sin `maximumScale`: bloquear el zoom impide ampliar el texto (WCAG 1.4.4).
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        {children}
        <Toaster richColors position="top-right" />
        <PwaRegister />
      </body>
    </html>
  );
}
