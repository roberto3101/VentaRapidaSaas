'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '../../utils/cn';
import { Logo } from './logo';
import { useUiStore } from '../../stores/ui.store';
import { useAuthStore } from '../../stores/auth.store';
import {
  LayoutDashboard,
  Package,
  Settings,
  FolderTree,
  ShoppingCart,
  Banknote,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { IndicadorTurno } from '../cajas/indicador-turno';
import type { RolUsuario } from '../../tipos/auth.tipos';

// ---------------------------------------------------------------------------
// Definición de secciones (Opción A: secciones visuales + role-based)
// ---------------------------------------------------------------------------
// Reglas:
//   - Operación y Catálogo siempre visibles (cajero las usa a diario).
//   - Administración solo para super_admin, tenant_admin, location_manager.
//   - Sólo listamos rutas que existen en frontend/app/(dashboard)/.
//     Cuando se construya /comprobantes, /contactos, /inventario, /reportes,
//     etc., se agregan aquí.
// ---------------------------------------------------------------------------

type SidebarItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  destacado?: boolean;
};

type SidebarSeccion = {
  titulo: string;
  rolesPermitidos?: RolUsuario[]; // si no se setea → visible para todos
  items: SidebarItem[];
};

const SIDEBAR_SECCIONES: SidebarSeccion[] = [
  {
    titulo: 'Operación',
    items: [
      { href: '/pos', label: 'Punto de Venta', icon: ShoppingCart, destacado: true },
      { href: '/cajas', label: 'Caja', icon: Banknote },
    ],
  },
  {
    titulo: 'Catálogo',
    items: [
      { href: '/productos', label: 'Productos', icon: Package },
      { href: '/categorias', label: 'Categorías', icon: FolderTree },
    ],
  },
  {
    titulo: 'Administración',
    rolesPermitidos: ['super_admin', 'tenant_admin', 'location_manager'],
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/configuraciones', label: 'Configuración', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarAbierto, toggleSidebar } = useUiStore();
  const usuario = useAuthStore((s) => s.usuario);
  const currencySymbol = usuario?.tenant?.currencySymbol ?? 'S/';
  const rol = usuario?.role;

  // Filtrar secciones visibles según rol
  const seccionesVisibles = SIDEBAR_SECCIONES.filter(
    (sec) => !sec.rolesPermitidos || (rol && sec.rolesPermitidos.includes(rol)),
  );

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-zinc-950 border-r border-zinc-800/60 z-40 flex flex-col transition-all duration-300',
        sidebarAbierto ? 'w-64' : 'w-[72px]',
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-zinc-800/60">
        <Logo collapsed={!sidebarAbierto} />
      </div>

      {/* Toggle */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-20 w-6 h-6 bg-zinc-800 border border-zinc-700 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors z-50"
        aria-label={sidebarAbierto ? 'Colapsar menú' : 'Expandir menú'}
      >
        {sidebarAbierto ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      {/* Nav con secciones */}
      <nav className="flex-1 py-4 px-3 space-y-4 overflow-y-auto">
        {seccionesVisibles.map((seccion) => (
          <div key={seccion.titulo} className="space-y-1">
            {sidebarAbierto && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {seccion.titulo}
              </p>
            )}
            {seccion.items.map((item) => {
              const activo =
                pathname === item.href || pathname.startsWith(item.href + '/');
              const destacado = item.destacado;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                    activo
                      ? 'bg-amber-500/10 text-amber-400 shadow-sm'
                      : destacado
                      ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/20'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60',
                    !sidebarAbierto && 'justify-center px-0',
                  )}
                  title={!sidebarAbierto ? item.label : undefined}
                >
                  <item.icon
                    size={20}
                    className={cn(
                      activo
                        ? 'text-amber-400'
                        : destacado
                        ? 'text-amber-400'
                        : 'text-zinc-500 group-hover:text-zinc-300',
                    )}
                  />
                  {sidebarAbierto && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Indicador turno + User footer */}
      <div className="p-3 border-t border-zinc-800/60 space-y-2">
        {usuario && (
          <div
            className={cn(
              'flex',
              sidebarAbierto ? 'justify-stretch' : 'justify-center',
            )}
          >
            <IndicadorTurno
              currencySymbol={currencySymbol}
              compacto={!sidebarAbierto}
              onClick={() => router.push('/cajas')}
            />
          </div>
        )}
        {sidebarAbierto && usuario && (
          <div className="px-3 py-2">
            <p className="text-sm text-zinc-200 font-medium truncate">
              {usuario.fullName}
            </p>
            <p className="text-xs text-zinc-500 truncate">
              {usuario.tenant?.name}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

