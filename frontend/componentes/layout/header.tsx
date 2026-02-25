'use client';

import { LogOut, Bell, User } from 'lucide-react';
import { useAuthContexto } from '../../contextos/auth.contexto';
import { useUiStore } from '../../stores/ui.store';
import { cn } from '../../utils/cn';

export function Header() {
  const { usuario, logout } = useAuthContexto();
  const sidebarAbierto = useUiStore((s) => s.sidebarAbierto);

  return (
    <header
      className={cn(
        'fixed top-0 right-0 h-16 bg-white/80 backdrop-blur-md border-b border-zinc-200 flex items-center justify-between px-6 z-30 transition-all duration-300',
        sidebarAbierto ? 'left-64' : 'left-[72px]',
      )}
    >
      <div className="flex items-center gap-4">
        {usuario?.tenant && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 rounded-lg">
            <span className="text-xs font-bold text-zinc-500 uppercase">{usuario.tenant.currencyCode}</span>
            <span className="text-xs text-zinc-400">|</span>
            <span className="text-xs text-zinc-600">{usuario.tenant.name}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors relative">
          <Bell size={20} />
        </button>

        <div className="flex items-center gap-3 pl-3 ml-1 border-l border-zinc-200">
          <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center">
            <span className="text-xs font-bold text-white">
              {usuario?.fullName?.charAt(0)?.toUpperCase() || 'U'}
            </span>
          </div>
          <button
            onClick={logout}
            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Cerrar sesión"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
