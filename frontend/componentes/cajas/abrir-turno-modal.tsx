'use client';

import { useEffect, useState } from 'react';
import { Banknote, X, AlertCircle, Loader2 } from 'lucide-react';
import { cajasServicio } from '../../servicios/cajas.servicio';
import { useTurnoStore } from '../../stores/turno.store';

interface Props {
  locationId: string;
  /** Currency principal del tenant (PE → PEN, VE → VES). Para MVP usamos sólo esta. */
  currencyCode: string;
  currencySymbol: string;
  onCerrar: () => void;
  onAbierto?: () => void;
}

/**
 * Modal compacto para abrir turno con monto inicial en efectivo.
 * UX: 1 input grande, Enter para confirmar, Escape para cancelar.
 * MVP: sólo currency principal del tenant. Multi-currency (VE) entra cuando se active ADR-022.
 */
export function AbrirTurnoModal({
  locationId,
  currencyCode,
  currencySymbol,
  onCerrar,
  onAbierto,
}: Props) {
  const [monto, setMonto] = useState('0.00');
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setTurno = useTurnoStore((s) => s.setTurno);

  const abrir = async () => {
    if (enviando) return;
    const limpio = monto.replace(',', '.').trim();
    if (!/^\d+(\.\d{1,4})?$/.test(limpio)) {
      setError('Monto inválido (ej. 150 o 150.50)');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const turno = await cajasServicio.abrir({
        locationId,
        openingAmounts: [{ currencyCode, openingAmount: limpio }],
        notes: notas.trim() || undefined,
      });
      setTurno(turno);
      onAbierto?.();
      onCerrar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al abrir turno';
      setError(msg);
      setEnviando(false);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
      if (e.key === 'Enter' && !enviando) abrir();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monto, notas, enviando]);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-amber-50 to-amber-100 border-b border-amber-200">
          <div className="flex items-center gap-2">
            <Banknote size={20} className="text-amber-600" />
            <h2 className="font-bold text-zinc-800">Abrir turno de caja</h2>
          </div>
          <button onClick={onCerrar} className="text-zinc-400 hover:text-zinc-600">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              Monto inicial en efectivo
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-lg">
                {currencySymbol}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                autoFocus
                onFocus={(e) => e.target.select()}
                className="w-full pl-14 pr-4 py-4 text-2xl font-mono font-bold text-right rounded-xl border-2 border-zinc-200 focus:border-amber-400 focus:outline-none"
              />
            </div>
            <p className="text-xs text-zinc-500 mt-1.5">
              El monto que tienes físicamente en la caja al abrir.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              Notas (opcional)
            </label>
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej. cambio nuevo"
              className="w-full px-4 py-2.5 rounded-xl border-2 border-zinc-200 focus:border-amber-400 focus:outline-none text-sm"
              maxLength={500}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex gap-3">
          <button
            onClick={onCerrar}
            disabled={enviando}
            className="flex-1 px-4 py-2.5 rounded-xl text-zinc-600 hover:bg-zinc-100 font-medium text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={abrir}
            disabled={enviando}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white rounded-xl font-bold text-sm shadow-sm shadow-amber-200 transition-all disabled:opacity-60"
          >
            {enviando ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16} />}
            Abrir caja
            <kbd className="ml-1 text-xs opacity-70 bg-amber-600/30 px-1.5 py-0.5 rounded font-mono">Enter</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
