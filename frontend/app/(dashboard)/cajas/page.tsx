'use client';

import { useEffect, useState } from 'react';
import { Banknote, CheckCircle2, Clock, AlertTriangle, ArrowDown, Plus } from 'lucide-react';
import { useAuthContexto } from '../../../contextos/auth.contexto';
import { useTurnoStore } from '../../../stores/turno.store';
import { cajasServicio } from '../../../servicios/cajas.servicio';
import { AbrirTurnoModal } from '../../../componentes/cajas/abrir-turno-modal';
import { CerrarTurnoModal } from '../../../componentes/cajas/cerrar-turno-modal';
import type { Turno, EstadoTurno } from '../../../tipos/turno.tipos';

const ESTADO_META: Record<EstadoTurno, { label: string; bg: string; text: string; icon: typeof Clock }> = {
  open:              { label: 'Abierto',           bg: 'bg-emerald-50',   text: 'text-emerald-700',   icon: Clock },
  reconciled:        { label: 'Conciliado',        bg: 'bg-zinc-100',     text: 'text-zinc-600',      icon: CheckCircle2 },
  pending_approval:  { label: 'Espera aprobación', bg: 'bg-amber-50',     text: 'text-amber-700',     icon: AlertTriangle },
  auto_closed:       { label: 'Auto-cerrado',      bg: 'bg-orange-50',    text: 'text-orange-700',    icon: AlertTriangle },
};

export default function CajasPage() {
  const { usuario } = useAuthContexto();
  const { turnoActivo, refrescar } = useTurnoStore();
  const [historial, setHistorial] = useState<Turno[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarAbrir, setMostrarAbrir] = useState(false);
  const [mostrarCerrar, setMostrarCerrar] = useState(false);

  const simboloMoneda = usuario?.tenant?.currencySymbol ?? 'S/';
  const currencyCode = usuario?.tenant?.currencyCode ?? 'PEN';
  const locationId =
    usuario?.preferredLocationId
    ?? usuario?.userLocations?.find((l) => l.isDefault)?.locationId
    ?? usuario?.userLocations?.[0]?.locationId
    ?? '';

  const cargarHistorial = async () => {
    setCargando(true);
    try {
      const data = await cajasServicio.listar({ limit: 30 });
      setHistorial(data.items);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void refrescar(locationId);
    void cargarHistorial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  const fmt = (n: number) =>
    `${simboloMoneda} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
            <Banknote size={24} className="text-amber-500" />
            Caja
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">Turnos, arqueo y movimientos</p>
        </div>
        {turnoActivo ? (
          <button
            onClick={() => setMostrarCerrar(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-900 text-white rounded-xl font-medium text-sm transition-colors"
          >
            <ArrowDown size={16} />
            Cerrar turno actual
          </button>
        ) : (
          <button
            onClick={() => setMostrarAbrir(true)}
            disabled={!locationId}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl font-medium text-sm transition-colors"
          >
            <Plus size={16} />
            Abrir turno
          </button>
        )}
      </header>

      {/* Turno activo destacado */}
      {turnoActivo && (
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">Turno actual</span>
            <span className="text-xs text-emerald-600 font-mono">
              {new Date(turnoActivo.openedAt).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {turnoActivo.balances.map((b) => (
              <div key={b.currencyCode}>
                <div className="text-xs text-emerald-700 font-medium">{b.currencyCode} apertura</div>
                <div className="text-xl font-mono font-bold text-emerald-900">{fmt(Number(b.openingAmount))}</div>
              </div>
            ))}
          </div>
          {turnoActivo.notes && (
            <p className="text-xs text-emerald-700 mt-3 italic">{turnoActivo.notes}</p>
          )}
        </div>
      )}

      {/* Historial */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">Historial reciente</h2>
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          {cargando ? (
            <div className="p-8 text-center text-zinc-400 text-sm">Cargando...</div>
          ) : historial.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 text-sm">No hay turnos aún</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Apertura</th>
                  <th className="text-left px-4 py-2.5 font-medium">Cajero</th>
                  <th className="text-left px-4 py-2.5 font-medium">Sede</th>
                  <th className="text-right px-4 py-2.5 font-medium">Inicial</th>
                  <th className="text-right px-4 py-2.5 font-medium">Diff</th>
                  <th className="text-left px-4 py-2.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((t) => {
                  const meta = ESTADO_META[t.status];
                  const Icon = meta.icon;
                  const base = t.balances[0];
                  const diff = base?.difference ? Number(base.difference) : null;
                  return (
                    <tr key={t.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                      <td className="px-4 py-2.5 text-zinc-700">
                        {new Date(t.openedAt).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-600">{t.user?.fullName ?? '—'}</td>
                      <td className="px-4 py-2.5 text-zinc-600">{t.location?.name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-zinc-700">
                        {base ? fmt(Number(base.openingAmount)) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono ${
                        diff == null ? 'text-zinc-300' :
                        Math.abs(diff) < 0.01 ? 'text-emerald-600' :
                        Math.abs(diff) <= 5 ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        {diff == null ? '—' : (diff > 0 ? '+' : '') + diff.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${meta.bg} ${meta.text}`}>
                          <Icon size={12} />
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Modales */}
      {mostrarAbrir && locationId && (
        <AbrirTurnoModal
          locationId={locationId}
          currencyCode={currencyCode}
          currencySymbol={simboloMoneda}
          onCerrar={() => setMostrarAbrir(false)}
          onAbierto={() => { void cargarHistorial(); }}
        />
      )}
      {mostrarCerrar && turnoActivo && (
        <CerrarTurnoModal
          turno={turnoActivo}
          currencySymbol={simboloMoneda}
          onCerrar={() => setMostrarCerrar(false)}
          onCerrado={() => { void cargarHistorial(); }}
        />
      )}
    </div>
  );
}
