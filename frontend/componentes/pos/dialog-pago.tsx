'use client';

import { useState, useEffect, useRef } from 'react';
import { X, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';
import { METODOS_PAGO, type MetodoPago } from '../../tipos/venta.tipos';

interface DialogPagoProps {
  total: number;
  simboloMoneda: string;
  onConfirmar: (pagos: { method: MetodoPago; amount: number; receivedAmount?: number; reference?: string }[]) => Promise<void>;
  onCancelar: () => void;
}

export function DialogPago({ total, simboloMoneda, onConfirmar, onCancelar }: DialogPagoProps) {
  const [metodoPrincipal, setMetodoPrincipal] = useState<MetodoPago>('cash');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [referencia, setReferencia] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [ventaCompletada, setVentaCompletada] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fmt = (n: number) =>
    `${simboloMoneda} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const montoPagado = parseFloat(montoRecibido) || 0;
  const vuelto = metodoPrincipal === 'cash' ? Math.max(0, montoPagado - total) : 0;
  const faltante = montoPagado < total && metodoPrincipal === 'cash';

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelar();
      if (e.key === 'Enter' && !procesando) handleConfirmar();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [metodoPrincipal, montoRecibido, procesando]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConfirmar = async () => {
    const amount = metodoPrincipal === 'cash'
      ? Math.min(montoPagado, total) || total
      : total;

    if (metodoPrincipal === 'cash' && montoPagado < total) return;

    setProcesando(true);
    try {
      await onConfirmar([
        {
          method: metodoPrincipal,
          amount: total,
          ...(metodoPrincipal === 'cash' && montoPagado > 0 ? { receivedAmount: montoPagado } : {}),
          ...(referencia ? { reference: referencia } : {}),
        },
      ]);
      setVentaCompletada(true);
    } finally {
      setProcesando(false);
    }
  };

  if (ventaCompletada) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center animate-in zoom-in-95">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900 mb-2">¡Venta completada!</h2>
          {metodoPrincipal === 'cash' && vuelto > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-amber-700">Vuelto a entregar</p>
              <p className="text-3xl font-bold text-amber-600 font-mono mt-1">{fmt(vuelto)}</p>
            </div>
          )}
          <p className="text-sm text-zinc-500 mt-2">Cerrando en un momento…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <h2 className="text-lg font-bold text-zinc-900">Cobrar venta</h2>
          <button
            onClick={onCancelar}
            className="text-zinc-400 hover:text-zinc-600 transition-colors"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Total a cobrar */}
          <div className="bg-zinc-50 rounded-xl p-4 text-center">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total a cobrar</p>
            <p className="text-4xl font-bold text-zinc-900 font-mono">{fmt(total)}</p>
          </div>

          {/* Método de pago */}
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Método de pago</p>
            <div className="grid grid-cols-4 gap-2">
              {METODOS_PAGO.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMetodoPrincipal(m.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-medium transition-all',
                    metodoPrincipal === m.value
                      ? 'bg-amber-50 border-amber-400 text-amber-700 shadow-sm shadow-amber-100'
                      : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50',
                  )}
                >
                  <span className="text-base">{m.icono}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Monto recibido (solo cash) */}
          {metodoPrincipal === 'cash' && (
            <div>
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 block">
                Monto recibido
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-medium text-sm">
                  {simboloMoneda}
                </span>
                <input
                  ref={inputRef}
                  type="number"
                  step="0.01"
                  min={0}
                  value={montoRecibido}
                  onChange={(e) => setMontoRecibido(e.target.value)}
                  placeholder={total.toFixed(2)}
                  className="w-full pl-10 pr-4 py-3 border border-zinc-200 rounded-xl text-lg font-mono font-semibold text-right focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400"
                />
              </div>
              {/* Vuelto */}
              {montoPagado > 0 && (
                <div className={cn(
                  'mt-3 p-3 rounded-xl flex items-center justify-between',
                  vuelto > 0 ? 'bg-emerald-50 border border-emerald-200' : faltante ? 'bg-red-50 border border-red-200' : 'bg-zinc-50',
                )}>
                  <span className={cn(
                    'text-sm font-medium',
                    vuelto > 0 ? 'text-emerald-700' : faltante ? 'text-red-700' : 'text-zinc-600',
                  )}>
                    {vuelto > 0 ? 'Vuelto' : faltante ? 'Falta' : 'Exacto'}
                  </span>
                  <span className={cn(
                    'text-xl font-bold font-mono',
                    vuelto > 0 ? 'text-emerald-600' : faltante ? 'text-red-600' : 'text-zinc-800',
                  )}>
                    {fmt(faltante ? total - montoPagado : vuelto)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Referencia (tarjeta/transferencia) */}
          {(metodoPrincipal === 'card_debit' || metodoPrincipal === 'card_credit' || metodoPrincipal === 'bank_transfer') && (
            <div>
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 block">
                Referencia (últimos 4 dígitos, código, etc.)
              </label>
              <input
                ref={inputRef}
                type="text"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Opcional"
                maxLength={255}
                className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400"
              />
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onCancelar}
            disabled={procesando}
            className="flex-1 py-3 border border-zinc-200 text-zinc-600 rounded-xl font-medium text-sm hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            Cancelar (Esc)
          </button>
          <button
            onClick={handleConfirmar}
            disabled={procesando || (metodoPrincipal === 'cash' && !!montoRecibido && faltante)}
            className={cn(
              'flex-1 py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2',
              procesando || (metodoPrincipal === 'cash' && !!montoRecibido && faltante)
                ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                : 'bg-gradient-to-b from-amber-400 to-amber-500 text-white shadow-sm shadow-amber-200 hover:from-amber-500 hover:to-amber-600',
            )}
          >
            {procesando ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Procesando…
              </>
            ) : (
              'Confirmar cobro (Enter)'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
