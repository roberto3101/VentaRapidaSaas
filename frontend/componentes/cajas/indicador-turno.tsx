'use client';

import { useEffect } from 'react';
import { Banknote, AlertCircle, Loader2 } from 'lucide-react';
import { useTurnoStore } from '../../stores/turno.store';

interface Props {
  /** Locación a chequear. Si no se pasa, busca turno del usuario en cualquier sede. */
  locationId?: string;
  currencySymbol: string;
  /** Click sobre el chip: típicamente abre AbrirTurnoModal o navega al detalle. */
  onClick?: () => void;
  compacto?: boolean;
}

/**
 * Chip de estado de turno para topbar / sidebar.
 * - Sin turno → chip naranja "Sin turno abierto" (click → abrir)
 * - Con turno → chip verde con monto base y hora apertura
 * - Cargando → spinner
 */
export function IndicadorTurno({ locationId, currencySymbol, onClick, compacto }: Props) {
  const { turnoActivo, cargando, cargado, refrescar } = useTurnoStore();

  useEffect(() => {
    if (!cargado && !cargando) {
      void refrescar(locationId);
    }
  }, [cargado, cargando, locationId, refrescar]);

  if (cargando && !cargado) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 text-zinc-400 rounded-lg text-xs">
        <Loader2 size={12} className="animate-spin" />
        Turno...
      </div>
    );
  }

  if (!turnoActivo) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 border border-orange-200 text-orange-700 rounded-lg text-xs font-medium hover:bg-orange-100 transition-colors"
      >
        <AlertCircle size={13} />
        Sin turno abierto
      </button>
    );
  }

  // Sumar todos los openings (para multi-currency mostraremos sólo el principal cuando aplique)
  // balances? defensivo: si el turno llegara sin la relación cargada, mostramos 0.00 en vez de crashear
  const base = turnoActivo.balances?.[0];
  const monto = base ? Number(base.openingAmount).toFixed(2) : '0.00';
  const hora = new Date(turnoActivo.openedAt).toLocaleTimeString('es-PE', {
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-colors"
      title={`Turno abierto desde ${hora}`}
    >
      <Banknote size={13} />
      {compacto
        ? <span className="font-mono">{currencySymbol}{monto}</span>
        : <span>Caja abierta <span className="font-mono ml-1 opacity-70">· {currencySymbol}{monto} · {hora}</span></span>
      }
    </button>
  );
}
