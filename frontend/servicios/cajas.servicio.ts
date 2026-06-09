import { api } from './api';
import type {
  Turno,
  AbrirTurnoPayload,
  CerrarTurnoPayload,
  RegistrarMovimientoPayload,
  AprobarDiferenciaPayload,
  ListadoTurnos,
  MovimientoCaja,
} from '../tipos/turno.tipos';

export const cajasServicio = {
  async abrir(payload: AbrirTurnoPayload): Promise<Turno> {
    return api.post('/cajas/abrir', payload);
  },

  /** Turno activo del usuario logueado (opcional filtro por sede). */
  async obtenerActivo(locationId?: string): Promise<Turno | null> {
    const qs = locationId ? `?locationId=${locationId}` : '';
    return api.get<Turno | null>(`/cajas/activo${qs}`);
  },

  async cerrar(id: string, payload: CerrarTurnoPayload): Promise<Turno> {
    return api.post(`/cajas/${id}/cerrar`, payload);
  },

  async registrarMovimiento(id: string, payload: RegistrarMovimientoPayload): Promise<MovimientoCaja> {
    return api.post(`/cajas/${id}/movimiento`, payload);
  },

  async aprobarDiferencia(id: string, payload: AprobarDiferenciaPayload): Promise<Turno> {
    return api.post(`/cajas/${id}/aprobar`, payload);
  },

  async listar(params?: {
    status?: string; locationId?: string; userId?: string;
    fechaDesde?: string; fechaHasta?: string; limit?: number; offset?: number;
  }): Promise<ListadoTurnos> {
    const qs = new URLSearchParams();
    if (params) for (const [k, v] of Object.entries(params)) if (v != null) qs.set(k, String(v));
    return api.get(`/cajas${qs.toString() ? '?' + qs.toString() : ''}`);
  },

  async obtenerPorId(id: string): Promise<Turno> {
    return api.get(`/cajas/${id}`);
  },
};
