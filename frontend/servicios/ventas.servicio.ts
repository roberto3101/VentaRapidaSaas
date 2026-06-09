import { api } from './api';
import type { Venta, CrearVentaPayload, CompletarVentaPayload } from '../tipos/venta.tipos';

export const ventasServicio = {
  async crear(payload: CrearVentaPayload): Promise<Venta> {
    return api.post('/ventas', payload);
  },

  async completar(id: string, payload: CompletarVentaPayload): Promise<Venta> {
    return api.post(`/ventas/${id}/completar`, payload);
  },

  async cancelar(id: string, motivo: string): Promise<Venta> {
    return api.post(`/ventas/${id}/cancelar`, { motivo });
  },

  async obtener(id: string): Promise<Venta> {
    return api.get(`/ventas/${id}`);
  },
};
