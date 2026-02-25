import { api } from './api';
import type {
  Producto, Variante, Categoria, RespuestaPaginada,
  CrearProductoPayload, ActualizarProductoPayload,
  CrearVariantePayload, ActualizarVariantePayload,
  CrearCategoriaPayload,
} from '../tipos/producto.tipos';

export const productosServicio = {
  // ═══ PRODUCTOS ═══
  async listar(params?: {
    pagina?: number; limite?: number; buscar?: string; categoriaId?: string;
  }): Promise<RespuestaPaginada<Producto>> {
    const query = new URLSearchParams();
    if (params?.pagina) query.set('pagina', String(params.pagina));
    if (params?.limite) query.set('limite', String(params.limite));
    if (params?.buscar) query.set('busqueda', params.buscar);
    if (params?.categoriaId) query.set('categoriaId', params.categoriaId);
    const qs = query.toString();
    return api.get(`/productos${qs ? '?' + qs : ''}`);
  },

  async obtener(id: string): Promise<Producto> {
    return api.get(`/productos/${id}`);
  },

  async crear(payload: CrearProductoPayload): Promise<Producto> {
    return api.post('/productos', payload);
  },

  async actualizar(id: string, payload: ActualizarProductoPayload): Promise<Producto> {
    return api.patch(`/productos/${id}`, payload);
  },

  async eliminar(id: string): Promise<void> {
    return api.delete(`/productos/${id}`);
  },

  async buscarPorCodigo(codigo: string): Promise<Variante> {
    return api.get(`/productos/buscar-codigo/${encodeURIComponent(codigo)}`);
  },

  // ═══ VARIANTES ═══
  async crearVariante(productoId: string, payload: CrearVariantePayload): Promise<Variante> {
    return api.post(`/productos/${productoId}/variantes`, payload);
  },

  async actualizarVariante(productoId: string, varianteId: string, payload: ActualizarVariantePayload): Promise<Variante> {
    return api.patch(`/productos/${productoId}/variantes/${varianteId}`, payload);
  },

  async eliminarVariante(productoId: string, varianteId: string): Promise<void> {
    return api.delete(`/productos/${productoId}/variantes/${varianteId}`);
  },

  // ═══ CATEGORÍAS ═══
  async listarCategorias(): Promise<Categoria[]> {
    return api.get('/categorias');
  },

  async arbolCategorias(): Promise<Categoria[]> {
    return api.get('/categorias/arbol');
  },

  async crearCategoria(payload: CrearCategoriaPayload): Promise<Categoria> {
    return api.post('/categorias', payload);
  },

  async actualizarCategoria(id: string, payload: Partial<CrearCategoriaPayload>): Promise<Categoria> {
    return api.patch(`/categorias/${id}`, payload);
  },

  async eliminarCategoria(id: string): Promise<void> {
    return api.delete(`/categorias/${id}`);
  },
};
