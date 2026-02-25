'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Loader2, Package, ChevronDown, AlertCircle } from 'lucide-react';
import type {
  Producto, Categoria, CrearProductoPayload,
  CrearVariantePayload, ActualizarVariantePayload,
  UNIDADES,
} from '../../tipos/producto.tipos';
import { productosServicio } from '../../servicios/productos.servicio';



const generarSku = (nombre: string) => {
  const prefijo = nombre.trim().substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
  const codigo = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefijo || 'PRD'}-${codigo}`;
};

const UNIDADES_LISTA = [
  { valor: 'und', etiqueta: 'Unidad' },
  { valor: 'kg', etiqueta: 'Kilogramo' },
  { valor: 'g', etiqueta: 'Gramo' },
  { valor: 'l', etiqueta: 'Litro' },
  { valor: 'ml', etiqueta: 'Mililitro' },
  { valor: 'm', etiqueta: 'Metro' },
  { valor: 'cm', etiqueta: 'Centímetro' },
  { valor: 'caja', etiqueta: 'Caja' },
  { valor: 'paq', etiqueta: 'Paquete' },
  { valor: 'doc', etiqueta: 'Docena' },
];

interface FormVariante {
  id?: string;
  nombreVariante: string;
  sku: string;
  codigoBarras: string;
  precioVenta: string;
  precioCompra: string;
  stockMinimo: string;
  unidad: string;
}

interface FormularioProductoProps {
  producto?: Producto;
  categorias: Categoria[];
}

const varianteVacia = (): FormVariante => ({
  nombreVariante: 'Default',
  sku: '',
  codigoBarras: '',
  precioVenta: '',
  precioCompra: '',
  stockMinimo: '0',
  unidad: 'und',
});

export function FormularioProducto({ producto, categorias }: FormularioProductoProps) {
  const router = useRouter();
  const esEdicion = !!producto;

  const [nombre, setNombre] = useState(producto?.name || '');
  const [descripcion, setDescripcion] = useState(producto?.description || '');
  const [marca, setMarca] = useState(producto?.brand || '');
  const [categoriaId, setCategoriaId] = useState(producto?.categoryId || '');
  const [variantes, setVariantes] = useState<FormVariante[]>(() => {
    if (producto?.variants?.length) {
      return producto.variants.map((v) => ({
        id: v.id,
        nombreVariante: v.variantName || '',
        sku: v.sku || '',
        codigoBarras: v.barcode || '',
        precioVenta: String(v.salePrice || ''),
        precioCompra: String(v.purchasePrice || ''),
        stockMinimo: String(v.minStock || '0'),
        unidad: v.unit || 'und',
      }));
    }
    return [varianteVacia()];
  });

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const actualizarVariante = (i: number, campo: keyof FormVariante, valor: string) => {
    setVariantes((prev) => prev.map((v, idx) => (idx === i ? { ...v, [campo]: valor } : v)));
  };

  const agregarVariante = () => {
    setVariantes((prev) => [...prev, { ...varianteVacia(), nombreVariante: `Variante ${prev.length + 1}` }]);
  };

  const eliminarVariante = (i: number) => {
    if (variantes.length <= 1) return;
    setVariantes((prev) => prev.filter((_, idx) => idx !== i));
  };

// Auto-generar SKU cuando cambia el nombre del producto
  const autoGenerarSkus = (nombreProducto: string) => {
    setVariantes((prev) =>
      prev.map((v, i) => {
        const skuManual = v.sku && !v.sku.match(/^[A-Z]{1,3}-[A-Z0-9]{4}$/);
        if (skuManual) return v; // no tocar SKUs personalizados
        return { ...v, sku: generarSku(nombreProducto + (prev.length > 1 ? String(i + 1) : '')) };
      })
    );
  };


  const validar = (): boolean => {
    if (!nombre.trim()) { setError('El nombre del producto es obligatorio'); return false; }
    for (let i = 0; i < variantes.length; i++) {
      const v = variantes[i];
      if (!v.sku.trim()) { setError(`La variante ${i + 1} necesita un SKU`); return false; }
      if (!v.precioVenta || parseFloat(v.precioVenta) < 0) {
        setError(`La variante ${i + 1} necesita un precio de venta válido`); return false;
      }
    }
    return true;
  };

  const guardar = async () => {
    setError('');
    if (!validar()) return;
    setGuardando(true);

    try {
      if (esEdicion && producto) {
        // Actualizar producto base
        await productosServicio.actualizar(producto.id, {
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || undefined,
          marca: marca.trim() || undefined,
          categoriaId: categoriaId || null,
        });

        // Actualizar/crear variantes
        const idsExistentes = producto.variants.map(v => v.id);
        for (const v of variantes) {
          const payload: ActualizarVariantePayload = {
            nombreVariante: v.nombreVariante.trim(),
            sku: v.sku.trim(),
            codigoBarras: v.codigoBarras.trim() || undefined,
            precioVenta: parseFloat(v.precioVenta) || 0,
            precioCompra: parseFloat(v.precioCompra) || 0,
            stockMinimo: parseInt(v.stockMinimo) || 0,
            unidad: v.unidad,
          };
          if (v.id && idsExistentes.includes(v.id)) {
            await productosServicio.actualizarVariante(producto.id, v.id, payload);
          } else {
            await productosServicio.crearVariante(producto.id, payload as CrearVariantePayload);
          }
        }

        // Eliminar variantes removidas
        const idsActuales = variantes.filter(v => v.id).map(v => v.id!);
        for (const idOriginal of idsExistentes) {
          if (!idsActuales.includes(idOriginal)) {
            await productosServicio.eliminarVariante(producto.id, idOriginal);
          }
        }

        router.push(`/productos/${producto.id}`);
        router.refresh();
      } else {
        // Crear producto nuevo con variantes
        const payload: CrearProductoPayload = {
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || undefined,
          marca: marca.trim() || undefined,
          categoriaId: categoriaId || undefined,
          tieneVariantes: variantes.length > 1,
          variantes: variantes.map((v) => ({
            nombreVariante: v.nombreVariante.trim() || 'Default',
            sku: v.sku.trim(),
            codigoBarras: v.codigoBarras.trim() || undefined,
            precioVenta: parseFloat(v.precioVenta) || 0,
            precioCompra: parseFloat(v.precioCompra) || 0,
            stockMinimo: parseInt(v.stockMinimo) || 0,
            unidad: v.unidad,
          })),
        };

        const nuevo = await productosServicio.crear(payload);
        router.push(`/productos/${nuevo.id}`);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Error al guardar el producto';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setGuardando(false);
    }
  };

  const inputClasses = 'w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 transition-all';
  const labelClasses = 'block text-sm font-medium text-zinc-700 mb-1.5';

  return (
    <div className="space-y-6 max-w-4xl">
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl animate-in">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Error al guardar</p>
            <p className="text-sm text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ═══ DATOS DEL PRODUCTO ═══ */}
      <section className="bg-white border border-zinc-200 rounded-2xl p-6">
        <h3 className="text-base font-semibold text-zinc-800 mb-5 flex items-center gap-2">
          <Package className="w-4 h-4 text-amber-500" />
          Información general
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelClasses}>Nombre del producto *</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => { setNombre(e.target.value); autoGenerarSkus(e.target.value); }}
              placeholder="Ej: Aceite de oliva extra virgen"
              className={inputClasses}
              autoFocus
            />
          </div>

          <div>
            <label className={labelClasses}>Marca</label>
            <input
              type="text"
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
              placeholder="Ej: Del Valle"
              className={inputClasses}
            />
          </div>

          <div>
            <label className={labelClasses}>Categoría</label>
            <div className="relative">
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className={`${inputClasses} appearance-none pr-10`}
              >
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            </div>
          </div>

          <div className="md:col-span-2">
            <label className={labelClasses}>Descripción</label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripción opcional del producto..."
              rows={3}
              className={`${inputClasses} resize-none`}
            />
          </div>
        </div>
      </section>

      {/* ═══ VARIANTES ═══ */}
      <section className="bg-white border border-zinc-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-zinc-800">
            Variantes
            <span className="ml-2 text-xs font-normal text-zinc-400">
              ({variantes.length} {variantes.length === 1 ? 'variante' : 'variantes'})
            </span>
          </h3>
          <button
            type="button"
            onClick={agregarVariante}
            className="flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar
          </button>
        </div>

        <div className="space-y-4">
          {variantes.map((v, i) => (
            <div
              key={i}
              className="border border-zinc-100 rounded-xl p-4 bg-zinc-50/50 hover:border-zinc-200 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Variante {i + 1}
                </span>
                {variantes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => eliminarVariante(i)}
                    className="p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Eliminar variante"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Nombre variante</label>
                  <input
                    type="text"
                    value={v.nombreVariante}
                    onChange={(e) => actualizarVariante(i, 'nombreVariante', e.target.value)}
                    placeholder="Default"
                    className={inputClasses}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-zinc-500 mb-1">📦 Código de barras</label>
                  <input
                    type="text"
                    value={v.codigoBarras}
                    onChange={(e) => actualizarVariante(i, 'codigoBarras', e.target.value)}
                    placeholder="Escanea el producto o escribe el código"
                    className={`${inputClasses} font-mono text-base`}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Precio venta *</label>
                  <input
                    type="number"
                    value={v.precioVenta}
                    onChange={(e) => actualizarVariante(i, 'precioVenta', e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className={`${inputClasses} font-mono`}
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Precio compra</label>
                  <input
                    type="number"
                    value={v.precioCompra}
                    onChange={(e) => actualizarVariante(i, 'precioCompra', e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className={`${inputClasses} font-mono`}
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Stock mínimo</label>
                  <input
                    type="number"
                    value={v.stockMinimo}
                    onChange={(e) => actualizarVariante(i, 'stockMinimo', e.target.value)}
                    min="0"
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Unidad</label>
                  <select
                    value={v.unidad}
                    onChange={(e) => actualizarVariante(i, 'unidad', e.target.value)}
                    className={`${inputClasses} appearance-none`}
                  >
                    {UNIDADES_LISTA.map((u) => (
                      <option key={u.valor} value={u.valor}>{u.etiqueta}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">SKU (auto)</label>
                  <input
                    type="text"
                    value={v.sku}
                    onChange={(e) => actualizarVariante(i, 'sku', e.target.value.toUpperCase())}
                    placeholder="Auto-generado"
                    className={`${inputClasses} font-mono text-xs text-zinc-400`}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ ACCIONES ═══ */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2.5 text-sm font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={guardando}
          className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 rounded-xl shadow-sm shadow-amber-200 transition-all disabled:opacity-50"
        >
          {guardando ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Guardando...
            </>
          ) : esEdicion ? 'Guardar cambios' : 'Crear producto'}
        </button>
      </div>
    </div>
  );
}
