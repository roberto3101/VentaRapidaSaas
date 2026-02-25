import type { Metadata } from 'next';
import { Outfit, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'VentaRápida — Sistema de Inventario',
  description: 'Sistema multi-tenant de gestión de inventario para mercados LATAM',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${outfit.variable} ${jetbrains.variable}`}>
      <body className="font-sans antialiased bg-zinc-50 text-zinc-900">
        {children}
      </body>
    </html>
  );
}
