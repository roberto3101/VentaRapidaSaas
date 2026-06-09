import { create } from 'zustand';
import type { Turno } from '../tipos/turno.tipos';
import { cajasServicio } from '../servicios/cajas.servicio';

interface TurnoState {
  turnoActivo: Turno | null;
  cargando: boolean;
  cargado: boolean;          // true cuando ya se intentó cargar al menos una vez (evita flicker)
  ultimoError: string | null;

  /** Refresca turno activo desde el backend. Llamar al login + al cambiar de sede. */
  refrescar: (locationId?: string) => Promise<Turno | null>;
  setTurno: (t: Turno | null) => void;
  limpiar: () => void;
}

export const useTurnoStore = create<TurnoState>((set) => ({
  turnoActivo: null,
  cargando: false,
  cargado: false,
  ultimoError: null,

  refrescar: async (locationId) => {
    set({ cargando: true, ultimoError: null });
    try {
      const t = await cajasServicio.obtenerActivo(locationId);
      set({ turnoActivo: t, cargando: false, cargado: true });
      return t;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error consultando turno';
      set({ cargando: false, cargado: true, ultimoError: msg });
      return null;
    }
  },

  setTurno: (t) => set({ turnoActivo: t, cargado: true, ultimoError: null }),

  limpiar: () => set({ turnoActivo: null, cargado: false, ultimoError: null }),
}));
