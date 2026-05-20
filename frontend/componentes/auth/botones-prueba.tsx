'use client';

import { Building2, User as UserIcon, Loader2 } from 'lucide-react';

/**
 * Credenciales de prueba — desarrollo / staging solamente.
 * Cada tenant tiene 2 cuentas (admin + cajero) para probar flujos por rol.
 *
 * IMPORTANTE: estas cuentas se crean con `pnpm prisma:seed:prueba` en el backend.
 * Si los botones fallan al loguear → corre el seed primero.
 */
const CREDENCIALES_PRUEBA = [
  {
    negocio: 'Bodega "La Esquina"',
    tipo: 'Esquina · 1 caja',
    color: 'amber',
    cuentas: [
      { rol: 'Admin', email: 'admin@bodega-esquina.test', contrasena: 'Test1234!' },
      { rol: 'Cajero', email: 'cajero@bodega-esquina.test', contrasena: 'Test1234!' },
    ],
  },
  {
    negocio: 'Minimarket "El Centro"',
    tipo: 'Multi-cajero',
    color: 'sky',
    cuentas: [
      { rol: 'Admin', email: 'admin@minimarket-centro.test', contrasena: 'Test1234!' },
      { rol: 'Cajero', email: 'cajero@minimarket-centro.test', contrasena: 'Test1234!' },
    ],
  },
  {
    negocio: 'Distribuidora "Sur"',
    tipo: 'Mayorista + créditos',
    color: 'emerald',
    cuentas: [
      { rol: 'Admin', email: 'admin@mayorista-sur.test', contrasena: 'Test1234!' },
      { rol: 'Cajero', email: 'cajero@mayorista-sur.test', contrasena: 'Test1234!' },
    ],
  },
] as const;

const COLORS = {
  amber: {
    border: 'border-amber-200 hover:border-amber-400',
    bg: 'bg-amber-50 hover:bg-amber-100',
    text: 'text-amber-700',
    icon: 'text-amber-600',
    dot: 'bg-amber-500',
  },
  sky: {
    border: 'border-sky-200 hover:border-sky-400',
    bg: 'bg-sky-50 hover:bg-sky-100',
    text: 'text-sky-700',
    icon: 'text-sky-600',
    dot: 'bg-sky-500',
  },
  emerald: {
    border: 'border-emerald-200 hover:border-emerald-400',
    bg: 'bg-emerald-50 hover:bg-emerald-100',
    text: 'text-emerald-700',
    icon: 'text-emerald-600',
    dot: 'bg-emerald-500',
  },
} as const;

interface BotonesPruebaProps {
  /**
   * Callback ejecutado al hacer click en un botón.
   * Recibe email + contrasena para autocompletar y disparar login.
   */
  onSeleccionar: (credenciales: { email: string; contrasena: string }) => void;
  /** Si está logueando, deshabilita todos los botones. */
  cargando?: boolean;
}

export function BotonesPrueba({ onSeleccionar, cargando = false }: BotonesPruebaProps) {
  // Solo mostrar en desarrollo. Production NO debe exponer cuentas de prueba.
  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div className="mt-6 pt-6 border-t border-zinc-200">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
          Acceso rápido · solo desarrollo
        </p>
        <span className="text-[10px] px-2 py-0.5 bg-zinc-100 text-zinc-500 rounded-full font-mono">
          DEV
        </span>
      </div>

      <div className="space-y-3">
        {CREDENCIALES_PRUEBA.map((negocio) => {
          const c = COLORS[negocio.color as keyof typeof COLORS];
          return (
            <div key={negocio.negocio} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                <p className="text-xs font-medium text-zinc-700">{negocio.negocio}</p>
                <span className="text-[10px] text-zinc-400">· {negocio.tipo}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {negocio.cuentas.map((cuenta) => (
                  <button
                    key={cuenta.email}
                    type="button"
                    disabled={cargando}
                    onClick={() => onSeleccionar({ email: cuenta.email, contrasena: cuenta.contrasena })}
                    className={`flex items-center gap-2 px-3 py-2 ${c.bg} border ${c.border} rounded-lg transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {cargando ? (
                      <Loader2 size={14} className={`${c.icon} animate-spin`} />
                    ) : (
                      <UserIcon size={14} className={c.icon} />
                    )}
                    <span className={`text-xs font-semibold ${c.text}`}>{cuenta.rol}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-zinc-400 text-center">
        Si los botones fallan: corre <code className="text-zinc-600">pnpm prisma:seed:prueba</code> en backend
      </p>
    </div>
  );
}
