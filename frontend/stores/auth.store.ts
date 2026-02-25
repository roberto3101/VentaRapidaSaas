import { create } from 'zustand';
import type { Usuario } from '../tipos/auth.tipos';

interface AuthState {
  usuario: Usuario | null;
  cargando: boolean;
  autenticado: boolean;
  setUsuario: (usuario: Usuario | null) => void;
  setCargando: (cargando: boolean) => void;
  cerrarSesion: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  usuario: null,
  cargando: true,
  autenticado: false,
  setUsuario: (usuario) => set({ usuario, autenticado: !!usuario, cargando: false }),
  setCargando: (cargando) => set({ cargando }),
  cerrarSesion: () => set({ usuario: null, autenticado: false, cargando: false }),
}));
