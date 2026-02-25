import { cn } from '../../utils/cn';
import type { LucideIcon } from 'lucide-react';

interface Props {
  titulo: string;
  valor: string | number;
  subtitulo?: string;
  icono: LucideIcon;
  color?: 'amber' | 'blue' | 'green' | 'red' | 'purple';
  className?: string;
}

const COLORES = {
  amber: 'bg-amber-50 text-amber-600 border-amber-200',
  blue: 'bg-blue-50 text-blue-600 border-blue-200',
  green: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  red: 'bg-red-50 text-red-600 border-red-200',
  purple: 'bg-purple-50 text-purple-600 border-purple-200',
};

const ICON_BG = {
  amber: 'bg-amber-100 text-amber-600',
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-emerald-100 text-emerald-600',
  red: 'bg-red-100 text-red-600',
  purple: 'bg-purple-100 text-purple-600',
};

export function TarjetaEstadistica({ titulo, valor, subtitulo, icono: Icon, color = 'amber', className }: Props) {
  return (
    <div className={cn('bg-white border border-zinc-200 rounded-2xl p-5 hover:shadow-md transition-shadow', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-zinc-500 font-medium">{titulo}</p>
          <p className="text-3xl font-bold tracking-tight text-zinc-900">{valor}</p>
          {subtitulo && <p className="text-xs text-zinc-400">{subtitulo}</p>}
        </div>
        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', ICON_BG[color])}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}
