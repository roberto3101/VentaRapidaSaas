'use client';

import { useEffect, useState, useCallback } from 'react';
import { ShoppingCart, Trash2, Receipt, AlertCircle, X, ShoppingBag } from 'lucide-react';
import { useCarritoStore } from '../../../stores/carrito.store';
import { useAuthContexto } from '../../../contextos/auth.contexto';
import { productosServicio } from '../../../servicios/productos.servicio';
import { ventasServicio } from '../../../servicios/ventas.servicio';
import { EscanerInput } from '../../../componentes/pos/escaner-input';
import { LineaCarrito } from '../../../componentes/pos/linea-carrito';
import { DialogPago } from '../../../componentes/pos/dialog-pago';
import type { MetodoPago, Venta } from '../../../tipos/venta.tipos';

export default function PosPage() {
  const { usuario } = useAuthContexto();
  const {
    items, locationId, setLocationId,
    agregarItem, incrementarCantidad, decrementarCantidad,
    setCantidad, eliminarItem, vaciarCarrito,
    subtotal,
  } = useCarritoStore();

  const [itemSeleccionado, setItemSeleccionado] = useState<string | null>(null);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const [mostrarPago, setMostrarPago] = useState(false);
  const [ventaActual, setVentaActual] = useState<Venta | null>(null);

  const simboloMoneda = usuario?.tenant?.currencySymbol ?? 'S/';

  // Set default location from user's preferred location
  useEffect(() => {
    const loc = usuario?.preferredLocationId
      ?? usuario?.userLocations?.find((l) => l.isDefault)?.locationId
      ?? usuario?.userLocations?.[0]?.locationId;
    if (loc) setLocationId(loc);
  }, [usuario, setLocationId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault();
        if (items.length > 0) setMostrarPago(true);
      }
      if (e.key === 'F4') {
        e.preventDefault();
        if (itemSeleccionado) eliminarItem(itemSeleccionado);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items, itemSeleccionado, eliminarItem]);

  const mostrarError = (msg: string) => {
    setErrorMensaje(msg);
    setTimeout(() => setErrorMensaje(null), 4000);
  };

  const handleProductoEncontrado = useCallback(
    (variante: {
      id: string;
      sku: string;
      barcode?: string | null;
      variantName: string;
      salePrice: number;
      product?: { name: string } | null;
    }) => {
      agregarItem({
        variantId: variante.id,
        sku: variante.sku,
        productName: variante.product?.name ?? variante.variantName,
        variantName: variante.variantName,
        unitPrice: variante.salePrice,
        discountAmount: 0,
      });
    },
    [agregarItem],
  );

  const handleConfirmarPago = async (
    pagos: { method: MetodoPago; amount: number; receivedAmount?: number; reference?: string }[],
  ) => {
    if (!locationId) throw new Error('Sin sede asignada');

    const venta = await ventasServicio.crear({
      locationId,
      items: items.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
        unitPriceHint: i.unitPrice,
        discountAmount: i.discountAmount > 0 ? i.discountAmount : undefined,
      })),
    });

    const completada = await ventasServicio.completar(venta.id, { payments: pagos });
    setVentaActual(completada);

    // Auto-clear after showing success screen
    setTimeout(() => {
      vaciarCarrito();
      setMostrarPago(false);
      setVentaActual(null);
    }, 2500);
  };

  const fmt = (n: number) =>
    `${simboloMoneda} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const totalVenta = subtotal();

  return (
    <div className="flex flex-col lg:flex-row gap-0 -m-6 h-[calc(100vh-4rem)]">
      {/* Panel izquierdo: Escáner + productos */}
      <div className="flex-1 flex flex-col bg-zinc-50 border-r border-zinc-200 min-w-0">
        {/* Barra de escáner */}
        <div className="p-4 bg-white border-b border-zinc-200 shadow-sm">
          <EscanerInput
            buscarPorCodigo={productosServicio.buscarPorCodigo}
            onProductoEncontrado={handleProductoEncontrado}
            onError={mostrarError}
          />
          {errorMensaje && (
            <div className="mt-2 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={15} />
              {errorMensaje}
              <button onClick={() => setErrorMensaje(null)} className="ml-auto text-red-400 hover:text-red-600">
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Área central — instrucciones cuando carrito vacío */}
        <div className="flex-1 flex items-center justify-center p-8">
          {items.length === 0 ? (
            <div className="text-center">
              <div className="w-20 h-20 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShoppingBag size={36} className="text-zinc-300" />
              </div>
              <p className="text-zinc-400 font-medium">Escanea un producto para comenzar</p>
              <p className="text-zinc-300 text-sm mt-1">o busca por nombre/código en la barra superior</p>
              <div className="mt-6 flex flex-wrap gap-2 justify-center text-xs text-zinc-400">
                <span className="bg-zinc-100 px-2.5 py-1 rounded-lg">F12 Cobrar</span>
                <span className="bg-zinc-100 px-2.5 py-1 rounded-lg">F4 Anular línea</span>
                <span className="bg-zinc-100 px-2.5 py-1 rounded-lg">Enter Agregar</span>
              </div>
            </div>
          ) : (
            <div className="text-center text-zinc-300">
              <ShoppingCart size={28} />
              <p className="text-sm mt-2">{items.length} producto{items.length !== 1 ? 's' : ''} en carrito</p>
            </div>
          )}
        </div>

        {/* Accesos rápidos teclado */}
        <div className="p-3 border-t border-zinc-200 bg-white flex gap-3 flex-wrap">
          {[
            { tecla: 'F12', desc: 'Cobrar' },
            { tecla: 'F4', desc: 'Anular línea' },
            { tecla: 'Enter', desc: 'Agregar' },
          ].map((s) => (
            <span key={s.tecla} className="flex items-center gap-1.5 text-xs text-zinc-400">
              <kbd className="bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded text-zinc-600 font-mono text-xs">{s.tecla}</kbd>
              {s.desc}
            </span>
          ))}
        </div>
      </div>

      {/* Panel derecho: Carrito */}
      <div className="w-full lg:w-[420px] flex flex-col bg-white">
        {/* Header carrito */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-zinc-500" />
            <span className="font-semibold text-zinc-800">
              Carrito {items.length > 0 && <span className="text-amber-500">({items.length})</span>}
            </span>
          </div>
          {items.length > 0 && (
            <button
              onClick={vaciarCarrito}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
            >
              <Trash2 size={13} />
              Vaciar
            </button>
          )}
        </div>

        {/* Líneas del carrito */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-300 text-sm">
              Sin productos aún
            </div>
          ) : (
            items.map((item) => (
              <LineaCarrito
                key={item.variantId}
                item={item}
                simboloMoneda={simboloMoneda}
                seleccionado={itemSeleccionado === item.variantId}
                onClick={() => setItemSeleccionado(
                  itemSeleccionado === item.variantId ? null : item.variantId,
                )}
                onIncrementar={() => incrementarCantidad(item.variantId)}
                onDecrementar={() => decrementarCantidad(item.variantId)}
                onCantidadDirecta={(qty) => setCantidad(item.variantId, qty)}
                onEliminar={() => {
                  eliminarItem(item.variantId);
                  if (itemSeleccionado === item.variantId) setItemSeleccionado(null);
                }}
              />
            ))
          )}
        </div>

        {/* Totales */}
        <div className="border-t border-zinc-100 p-5 space-y-3">
          <div className="flex justify-between text-sm text-zinc-500">
            <span>Subtotal</span>
            <span className="font-mono">{fmt(totalVenta)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-zinc-900">
            <span>Total</span>
            <span className="font-mono text-lg">{fmt(totalVenta)}</span>
          </div>

          {/* Botón cobrar */}
          <button
            onClick={() => setMostrarPago(true)}
            disabled={items.length === 0 || !locationId}
            className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-b from-amber-400 to-amber-500 text-white rounded-xl font-bold text-base shadow-sm shadow-amber-200 hover:from-amber-500 hover:to-amber-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99]"
          >
            <Receipt size={18} />
            Cobrar
            <kbd className="ml-1 text-xs opacity-70 bg-amber-600/30 px-1.5 py-0.5 rounded font-mono">F12</kbd>
          </button>

          {!locationId && (
            <p className="text-xs text-center text-red-500">Sin sede asignada — contacta al administrador</p>
          )}
        </div>
      </div>

      {/* Dialog de pago */}
      {mostrarPago && (
        <DialogPago
          total={totalVenta}
          simboloMoneda={simboloMoneda}
          onConfirmar={handleConfirmarPago}
          onCancelar={() => setMostrarPago(false)}
        />
      )}
    </div>
  );
}
