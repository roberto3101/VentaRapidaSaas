'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../stores/auth.store';
import { authServicio } from '../servicios/auth.servicio';
import type { LoginPayload, RegistroTenantPayload } from '../tipos/auth.tipos';

export function useAuth() {
  const router = useRouter();
  const { usuario, cargando, autenticado, setUsuario, setCargando, cerrarSesion: limpiarStore } = useAuthStore();

  const cargarPerfil = useCallback(async () => {
    if (!authServicio.tieneToken()) {
      setUsuario(null);
      return;
    }
    try {
      setCargando(true);
      const perfil = await authServicio.obtenerPerfil();
      setUsuario(perfil);
    } catch {
      authServicio.limpiarTokens();
      setUsuario(null);
    }
  }, [setUsuario, setCargando]);

  const login = async (payload: LoginPayload) => {
    await authServicio.login(payload);
    await cargarPerfil();
    router.push('/dashboard');
  };

  const registrarTenant = async (payload: RegistroTenantPayload) => {
    await authServicio.registrarTenant(payload);
    await cargarPerfil();
    router.push('/dashboard');
  };

  const logout = async () => {
    await authServicio.logout();
    limpiarStore();
    router.push('/login');
  };

  return { usuario, cargando, autenticado, login, registrarTenant, logout, cargarPerfil };
}
