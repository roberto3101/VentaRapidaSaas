'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, AlertCircle, Loader2, ArrowDown, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cajasServicio } from '../../servicios/cajas.servicio';
import { useTurnoStore } from '../../stores/turno.store';
import type { Turno } from '../../tipos/turno.tipos';

interface Props {
  turno: Turno;
  currencySymbol: string;
  onCerrar: () => void;
  onCerrado?: (turnoActualizado: Turno) => void;
}

/**
 * Modal de cierre con arqueo. Por cada currency del turno:
 *  - muestra opening + ventas/movimientos = expected
 *  - input grande del actual contado
 *  - calcula diff en vivo
 */
export function CerrarTurnoModal({ turno, currencySymbol, onCerrar, onCerrado }: Props) {
  const [actuales, setActuales] = useState<Record<string, string>>(
    () => Object.fromEntries(turno.balances.map((b) => [b.currencyCode, '0.00'])),
  );
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setTurno = useTurnoStore((s) => s.setTurno);

  // Esperado por currency = sum(opening + cash_in + sales) − sum(cash_out + refunds)
  // El backend lo recalcula al cerrar; aquí mostramos un estimado basado en balances.openingAmount
  // hasta que tengamos summary de movements (postergado).
  // MVP: si no hay info de movements en el turno, mostramos solo openingAmount.
  const estimadosPorCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of turno.balances) {
      map.set(b.currencyCode, Number(b.openingAmount));
    }
    if (turno.movements) {
      for (const m of turno.movements) {
        const prev = map.get(m.currencyCode) ?? 0;
        const delta = (m.type === 'in' ? 1 : -1) * Number(m.amount);
        map.set(m.currencyCode, prev + delta);
      }
    }
    return map;
  }, [turno]);

  const cerrar = async () => {
    if (enviando) return;
    // Validar todos los inputs
    const actualAmounts: { currencyCode: string; actualAmount: string }[] = [];
    for (const b of turno.balances) {
      const raw = (actuales[b.currencyCode] ?? '').replace(',', '.').trim();
      if (!/^\d+(\.\d{1,4})?$/.test(raw)) {
        setError(`Monto contado inválido para ${b.currencyCode}`);
        return;
      }
      actualAmounts.push({ currencyCode: b.currencyCode, actualAmount: raw });
    }
    setEnviando(true);
    setError(null);
    try {
      const actualizado = await cajasServicio.cerrar(turno.id, {
        actualAmounts,
        notes: notas.trim() || undefined,
      });
      setTurno(null);    // ya no hay activo
      onCerrado?.(actualizado);
      onCerrar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cerrar turno';
      setError(msg);
      setEnviando(false);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCerrar]);

  const fmt = (n: number) =>
    `${currencySymbol} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-zinc-50 to-zinc-100 border-b border-zinc-200">
          <div className="flex items-center gap-2">
            <ArrowDown size={20} className="text-zinc-600" />
            <h2 className="font-bold text-zinc-800">Cerrar turno + arqueo</h2>
          </div>
          <button onClick={onCerrar} className="text-zinc-400 hover:text-zinc-600">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {turno.balances.map((b) => {
            const estimado = estimadosPorCurrency.get(b.currencyCode) ?? 0;
            const actualNum = parseFloat((actuales[b.currencyCode] ?? '0').replace(',', '.'));
            const diff = isNaN(actualNum) ? 0 : actualNum - estimado;
            const diffColor =
              Math.abs(diff) < 0.01
                ? 'text-emerald-600'
                : Math.abs(diff) <= 5
                  ? 'text-amber-600'
                  : 'text-red-600';
            const DiffIcon =
              Math.abs(diff) < 0.01 ? CheckCircle2 : AlertTriangle;

            return (
              <div key={b.currencyCode} className="border-2 border-zinc-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-zinc-500">{b.currencyCode}</span>
                  <span className="text-xs text-zinc-400">Apertura: {fmt(Number(b.openingAmount))}</span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Esperado en caja:</span>
                    <span className="font-mono font-medium">{fmt(estimado)}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Contado físicamente
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-mono">
                      {currencySymbol}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={actuales[b.currencyCode] ?? '0.00'}
                      onChange={(e) =>
                        setActuales((s) => ({ ...s, [b.currencyCode]: e.target.value }))
                      }
                      onFocus={(e) => e.target.select()}
                      className="w-full pl-10 pr-3 py-3 text-xl font-mono font-bold text-right rounded-lg border-2 border-zinc-200 focus:border-zinc-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className={`flex items-center justify-between text-sm font-medium ${diffColor}`}>
                  <span className="flex items-center gap-1.5">
                    <DiffIcon size={14} />
                    Diferencia
                  </span>
                  <span className="font-mono">
                    {diff >= 0 ? '+' : ''}{fmt(diff).replace(currencySymbol, '').trim()}
                  </span>
                </div>
              </div>
            );
          })}

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              Notas del cierre
            </label>
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej. faltó cambio chico"
              className="w-full px-4 py-2.5 rounded-xl border-2 border-zinc-200 focus:border-zinc-400 focus:outline-none text-sm"
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
            onClick={cerrar}
            disabled={enviando}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-900 text-white rounded-xl font-bold text-sm transition-colors disabled:opacity-60"
          >
            {enviando ? <Loader2 size={16} className="animate-spin" /> : <ArrowDown size={16} />}
            Cerrar caja
          </button>
        </div>
      </div>
    </div>
  );
}
