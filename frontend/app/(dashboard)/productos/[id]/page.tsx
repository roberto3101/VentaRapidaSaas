'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Pencil, Trash2, Loader2, Package, Tag,
  Barcode, Calendar, DollarSign, Layers, Scale,
} from 'lucide-react';
import { productosServicio } from '../../../../servicios/productos.servicio';
import { FormularioProducto } from '../../../../componentes/productos/formulario-producto';
import { ModalConfirmar } from '../../../../componentes/productos/modal-confirmar';
import type { Producto, Categoria } from '../../../../tipos/producto.tipos';

export default function DetalleProductoPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id as string;

  const [producto, setProducto] = useState<Producto | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modoEdicion, setModoEdicion] = useState(searchParams.get('editar') === '1');
  const [modalEliminar, setModalEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  useEffect(() => {
    Promise.all([
      productosServicio.obtener(id),
      productosServicio.listarCategorias(),
    ])
      .then(([prod, cats]) => {
        setProducto(prod);
        setCategorias(Array.isArray(cats) ? cats : []);
      })
      .catch(() => router.push('/productos'))
      .finally(() => setCargando(false));
  }, [id, router]);

  const eliminar = async () => {
    setEliminando(true);
    try {
      await productosServicio.eliminar(id);
      router.push('/productos');
    } catch (err) {
      console.error(err);
    } finally {
      setEliminando(false);
    }
  };

  if (cargando || !producto) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
      </div>
    );
  }

  const formatPrecio = (n: number) =>
    `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatFecha = (d: string) =>
    new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

  // ═══ MODO EDICIÓN ═══
  if (modoEdicion) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setModoEdicion(false)}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Editar producto</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{producto.name}</p>
          </div>
        </div>
        <FormularioProducto producto={producto} categorias={categorias} />
      </div>
    );
  }

  // ═══ MODO VISTA ═══
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/productos"
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-zinc-900">{producto.name}</h1>
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
                producto.isActive
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-zinc-100 text-zinc-500'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${producto.isActive ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                {producto.isActive ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            {producto.brand && <p className="text-sm text-zinc-500 mt-0.5">{producto.brand}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setModoEdicion(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors"
          >
            <Pencil className="w-4 h-4" />
            Editar
          </button>
          <button
            onClick={() => setModalEliminar(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Info general */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-zinc-800 mb-4 flex items-center gap-2">
          <Package className="w-4 h-4 text-amber-500" />
          Información general
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoItem
            icono={<Tag className="w-3.5 h-3.5" />}
            etiqueta="Categoría"
            valor={producto.category?.name || 'Sin categoría'}
          />
          <InfoItem
            icono={<Calendar className="w-3.5 h-3.5" />}
            etiqueta="Creado"
            valor={formatFecha(producto.createdAt)}
          />
          <InfoItem
            icono={<Layers className="w-3.5 h-3.5" />}
            etiqueta="Variantes"
            valor={`${producto.variants.length}`}
          />
          <InfoItem
            icono={<Barcode className="w-3.5 h-3.5" />}
            etiqueta="Tipo"
            valor={producto.hasVariants ? 'Multi-variante' : 'Simple'}
          />
        </div>
        {producto.description && (
          <div className="mt-4 pt-4 border-t border-zinc-100">
            <p className="text-sm text-zinc-600 leading-relaxed">{producto.description}</p>
          </div>
        )}
      </div>

      {/* Variantes */}
      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100">
          <h3 className="text-sm font-semibold text-zinc-800">Variantes del producto</h3>
        </div>
        <div className="divide-y divide-zinc-50">
          {producto.variants.map((v) => (
            <div key={v.id} className="px-6 py-4 hover:bg-amber-50/20 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{v.variantName}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <code className="text-xs font-mono bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded">
                      {v.sku}
                    </code>
                    {v.barcode && (
                      <span className="flex items-center gap-1 text-xs text-zinc-400">
                        <Barcode className="w-3 h-3" />
                        {v.barcode}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-zinc-400">
                      <Scale className="w-3 h-3" />
                      {v.unit}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-zinc-900 font-mono">
                    {formatPrecio(v.salePrice)}
                  </p>
                  {v.purchasePrice > 0 && (
                    <p className="text-xs text-zinc-400 font-mono mt-0.5">
                      Costo: {formatPrecio(v.purchasePrice)}
                    </p>
                  )}
                  {v.purchasePrice > 0 && v.salePrice > 0 && (
                    <p className="text-xs text-emerald-600 font-medium mt-0.5">
                      Margen: {((1 - v.purchasePrice / v.salePrice) * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal eliminar */}
      <ModalConfirmar
        abierto={modalEliminar}
        titulo="Eliminar producto"
        mensaje={`¿Eliminar "${producto.name}" y todas sus variantes? Los movimientos de inventario existentes no se verán afectados, pero no podrás crear nuevos.`}
        textoConfirmar="Sí, eliminar"
        cargando={eliminando}
        onConfirmar={eliminar}
        onCancelar={() => setModalEliminar(false)}
      />
    </div>
  );
}

function InfoItem({ icono, etiqueta, valor }: { icono: React.ReactNode; etiqueta: string; valor: string }) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs text-zinc-400">
        {icono}
        {etiqueta}
      </p>
      <p className="text-sm font-medium text-zinc-700">{valor}</p>
    </div>
  );
}
