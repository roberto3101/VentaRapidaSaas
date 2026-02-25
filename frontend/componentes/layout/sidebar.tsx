'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../../utils/cn';
import { Logo } from './logo';
import { useUiStore } from '../../stores/ui.store';
import { useAuthStore } from '../../stores/auth.store';
import {
  LayoutDashboard, Package, ArrowLeftRight, BarChart3, Users, MapPin,
  Settings, LogOut, BookUser, Boxes, ChevronLeft, ChevronRight, ScanBarcode,
  FolderTree,
} from 'lucide-react';

const MENU_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/productos', label: 'Productos', icon: Package },
  { href: '/categorias', label: 'Categorías', icon: FolderTree },
  { href: '/inventario', label: 'Inventario', icon: Boxes },
  { href: '/inventario/escanear', label: 'Escáner', icon: ScanBarcode },
  { href: '/movimientos', label: 'Movimientos', icon: ArrowLeftRight },
  { href: '/transferencias', label: 'Transferencias', icon: ArrowLeftRight },
  { href: '/contactos', label: 'Contactos', icon: BookUser },
  { href: '/sedes', label: 'Sedes', icon: MapPin },
  { href: '/usuarios', label: 'Usuarios', icon: Users },
  { href: '/reportes', label: 'Reportes', icon: BarChart3 },
  { href: '/configuraciones', label: 'Configuración', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarAbierto, toggleSidebar } = useUiStore();
  const usuario = useAuthStore((s) => s.usuario);

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
      >
        {sidebarAbierto ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {MENU_ITEMS.map((item) => {
          const activo = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                activo
                  ? 'bg-amber-500/10 text-amber-400 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60',
                !sidebarAbierto && 'justify-center px-0',
              )}
              title={!sidebarAbierto ? item.label : undefined}
            >
              <item.icon size={20} className={cn(activo ? 'text-amber-400' : 'text-zinc-500 group-hover:text-zinc-300')} />
              {sidebarAbierto && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-zinc-800/60">
        {sidebarAbierto && usuario && (
          <div className="px-3 py-2 mb-2">
            <p className="text-sm text-zinc-200 font-medium truncate">{usuario.fullName}</p>
            <p className="text-xs text-zinc-500 truncate">{usuario.tenant?.name}</p>
          </div>
        )}
      </div>
    </aside>
  );
}