'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuthContexto } from '../../contextos/auth.contexto';
import { Sidebar } from '../../componentes/layout/sidebar';
import { Header } from '../../componentes/layout/header';
import { PantallaCarga } from '../../componentes/compartidos/indicador-carga';
import { useUiStore } from '../../stores/ui.store';
import { cn } from '../../utils/cn';

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { autenticado, cargando } = useAuthContexto();
  const router = useRouter();
  const sidebarAbierto = useUiStore((s) => s.sidebarAbierto);

  useEffect(() => {
    if (!cargando && !autenticado) {
      router.push('/login');
    }
  }, [cargando, autenticado, router]);

  if (cargando) return <PantallaCarga />;
  if (!autenticado) return null;

  return (
    <div className="min-h-screen bg-zinc-50">
      <Sidebar />
      <Header />
      <main
        className={cn(
          'pt-16 min-h-screen transition-all duration-300',
          sidebarAbierto ? 'pl-64' : 'pl-[72px]',
        )}
      >
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardContent>{children}</DashboardContent>
    </AuthProvider>
  );
}
