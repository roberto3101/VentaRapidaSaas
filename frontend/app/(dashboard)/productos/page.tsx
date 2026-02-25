'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Package, Plus, Search, Filter, Loader2, ChevronDown } from 'lucide-react';
import { productosServicio } from '../../../servicios/productos.servicio';
import { TablaProductos } from '../../../componentes/productos/tabla-productos';
import { Paginacion } from '../../../componentes/productos/paginacion';
import { ModalConfirmar } from '../../../componentes/productos/modal-confirmar';
import type { Producto, Categoria, RespuestaPaginada } from '../../../tipos/producto.tipos';

const LIMITE = 15;

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [meta, setMeta] = useState({ total: 0, pagina: 1, totalPaginas: 0 });
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [productoEliminar, setProductoEliminar] = useState<Producto | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const cargar = useCallback(async (pag: number, buscar: string, catId: string) => {
    setCargando(true);
    try {
      const res: any = await productosServicio.listar({
        pagina: pag, limite: LIMITE,
        buscar: buscar || undefined,
        categoriaId: catId || undefined,
      });
      if (res?.datos) {
        setProductos(res.datos);
        setMeta(res.meta || { total: 0, pagina: pag, totalPaginas: 0 });
      } else if (Array.isArray(res)) {
        setProductos(res);
        setMeta({ total: res.length, pagina: 1, totalPaginas: 1 });
      }
    } catch (err) {
      console.error('Error cargando productos:', err);
      setProductos([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    productosServicio.listarCategorias()
      .then((cats) => setCategorias(Array.isArray(cats) ? cats : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPagina(1);
      cargar(1, busqueda, categoriaFiltro);
    }, 400);
    return () => clearTimeout(timeout);
  }, [busqueda, categoriaFiltro, cargar]);

  useEffect(() => {
    cargar(pagina, busqueda, categoriaFiltro);
  }, [pagina]); // eslint-disable-line

  const eliminar = async () => {
    if (!productoEliminar) return;
    setEliminando(true);
    try {
      await productosServicio.eliminar(productoEliminar.id);
      setProductoEliminar(null);
      cargar(pagina, busqueda, categoriaFiltro);
    } catch (err) {
      console.error('Error eliminando:', err);
    } finally {
      setEliminando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Productos</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {meta.total} {meta.total === 1 ? 'producto' : 'productos'} en tu catálogo
          </p>
        </div>
        <Link
          href="/productos/nuevo"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-b from-amber-400 to-amber-500 text-white text-sm font-medium rounded-xl shadow-sm shadow-amber-200 hover:from-amber-500 hover:to-amber-600 transition-all self-start"
        >
          <Plus className="w-4 h-4" />
          Nuevo producto
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, SKU o código de barras..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 transition-all"
          />
        </div>
        <div className="relative w-full sm:w-52">
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <select
            value={categoriaFiltro}
            onChange={(e) => setCategoriaFiltro(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-700 appearance-none focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 transition-all"
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
        </div>
      </div>

      {/* Contenido */}
      {cargando ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
        </div>
      ) : (
        <>
          <TablaProductos
            productos={productos}
            onEliminar={setProductoEliminar}
          />
          <Paginacion
            pagina={meta.pagina || pagina}
            totalPaginas={meta.totalPaginas}
            onCambiar={setPagina}
          />
        </>
      )}

      {/* Modal eliminar */}
      <ModalConfirmar
        abierto={!!productoEliminar}
        titulo="Eliminar producto"
        mensaje={`¿Estás seguro de eliminar "${productoEliminar?.name}"? Esta acción no se puede deshacer. Las variantes y precios asociados también serán eliminados.`}
        textoConfirmar="Sí, eliminar"
        cargando={eliminando}
        onConfirmar={eliminar}
        onCancelar={() => setProductoEliminar(null)}
      />
    </div>
  );
}
