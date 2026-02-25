'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Package, MoreVertical, Eye, Pencil, Trash2, Tag, Barcode } from 'lucide-react';
import type { Producto } from '../../tipos/producto.tipos';

interface TablaProductosProps {
  productos: Producto[];
  monedaSimbolo?: string;
  onEliminar: (producto: Producto) => void;
}

export function TablaProductos({ productos, monedaSimbolo = 'S/', onEliminar }: TablaProductosProps) {
  if (!productos.length) {
    return (
      <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center">
        <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Package className="w-8 h-8 text-zinc-400" />
        </div>
        <h3 className="text-base font-semibold text-zinc-700 mb-1">Sin productos aún</h3>
        <p className="text-sm text-zinc-400 mb-6">Agrega tu primer producto para comenzar a gestionar tu inventario</p>
        <Link
          href="/productos/nuevo"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-b from-amber-400 to-amber-500 text-white text-sm font-medium rounded-xl shadow-sm shadow-amber-200 hover:from-amber-500 hover:to-amber-600 transition-all"
        >
          Crear primer producto
        </Link>
      </div>
    );
  }

  const formatearPrecio = (n: number) =>
    `${monedaSimbolo} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const rangoPrecio = (variantes: Producto['variants']) => {
    const precios = variantes.filter(v => v.isActive).map(v => v.salePrice).filter(p => p > 0);
    if (!precios.length) return '—';
    const min = Math.min(...precios);
    const max = Math.max(...precios);
    return min === max ? formatearPrecio(min) : `${formatearPrecio(min)} – ${formatearPrecio(max)}`;
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="text-left text-xs font-medium text-zinc-400 uppercase tracking-wider px-5 py-3">Producto</th>
              <th className="text-left text-xs font-medium text-zinc-400 uppercase tracking-wider px-5 py-3">SKU</th>
              <th className="text-left text-xs font-medium text-zinc-400 uppercase tracking-wider px-5 py-3">Categoría</th>
              <th className="text-center text-xs font-medium text-zinc-400 uppercase tracking-wider px-5 py-3">Variantes</th>
              <th className="text-right text-xs font-medium text-zinc-400 uppercase tracking-wider px-5 py-3">Precio venta</th>
              <th className="text-center text-xs font-medium text-zinc-400 uppercase tracking-wider px-5 py-3">Estado</th>
              <th className="text-right text-xs font-medium text-zinc-400 uppercase tracking-wider px-5 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {productos.map((p) => (
              <tr key={p.id} className="group hover:bg-amber-50/30 transition-colors">
                <td className="px-5 py-3.5">
                  <div>
                    <Link
                      href={`/productos/${p.id}`}
                      className="text-sm font-medium text-zinc-900 hover:text-amber-600 transition-colors"
                    >
                      {p.name}
                    </Link>
                    {p.brand && <p className="text-xs text-zinc-400 mt-0.5">{p.brand}</p>}
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <code className="text-xs font-mono bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded">
                    {p.variants[0]?.sku || '—'}
                  </code>
                </td>
                <td className="px-5 py-3.5">
                  {p.category ? (
                    <span className="inline-flex items-center gap-1 text-xs bg-zinc-100 text-zinc-600 px-2.5 py-1 rounded-full">
                      <Tag className="w-3 h-3" />
                      {p.category.name}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-300">Sin categoría</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-center">
                  <span className="text-sm text-zinc-600">{p.variants.length}</span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <span className="text-sm font-medium text-zinc-800 font-mono">
                    {rangoPrecio(p.variants)}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-center">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
                    p.isActive
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-zinc-100 text-zinc-500'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${p.isActive ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                    {p.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <MenuAcciones producto={p} onEliminar={onEliminar} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-zinc-100">
        {productos.map((p) => (
          <div key={p.id} className="p-4 flex items-center justify-between gap-3">
            <Link href={`/productos/${p.id}`} className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-900 truncate">{p.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-xs font-mono text-zinc-400">{p.variants[0]?.sku}</code>
                {p.category && (
                  <span className="text-xs text-zinc-400">· {p.category.name}</span>
                )}
              </div>
              <p className="text-sm font-medium text-zinc-800 font-mono mt-1">
                {rangoPrecio(p.variants)}
              </p>
            </Link>
            <MenuAcciones producto={p} onEliminar={onEliminar} />
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Menú de acciones dropdown ---
function MenuAcciones({ producto, onEliminar }: { producto: Producto; onEliminar: (p: Producto) => void }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    if (abierto) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [abierto]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAbierto(!abierto)}
        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {abierto && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-zinc-200 rounded-xl shadow-lg shadow-zinc-200/50 py-1 z-20 animate-in">
          <Link
            href={`/productos/${producto.id}`}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
            onClick={() => setAbierto(false)}
          >
            <Eye className="w-4 h-4 text-zinc-400" />
            Ver detalle
          </Link>
          <Link
            href={`/productos/${producto.id}?editar=1`}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
            onClick={() => setAbierto(false)}
          >
            <Pencil className="w-4 h-4 text-zinc-400" />
            Editar
          </Link>
          <div className="my-1 border-t border-zinc-100" />
          <button
            onClick={() => { onEliminar(producto); setAbierto(false); }}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}
