'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { FormularioProducto } from '../../../../componentes/productos/formulario-producto';
import { productosServicio } from '../../../../servicios/productos.servicio';
import type { Categoria } from '../../../../tipos/producto.tipos';

export default function NuevoProductoPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    productosServicio.listarCategorias()
      .then((cats) => setCategorias(Array.isArray(cats) ? cats : []))
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/productos"
          className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Nuevo producto</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Completa la información y agrega al menos una variante</p>
        </div>
      </div>

      <FormularioProducto categorias={categorias} />
    </div>
  );
}
