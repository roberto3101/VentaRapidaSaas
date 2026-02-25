'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useAuth } from '../hooks/use-auth';

const AuthContexto = createContext<ReturnType<typeof useAuth> | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  useEffect(() => {
    auth.cargarPerfil();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <AuthContexto.Provider value={auth}>{children}</AuthContexto.Provider>;
}

export function useAuthContexto() {
  const ctx = useContext(AuthContexto);
  if (!ctx) throw new Error('useAuthContexto debe usarse dentro de AuthProvider');
  return ctx;
}
