import { cn } from '../../utils/cn';

export function IndicadorCarga({ texto, className }: { texto?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <div className="relative">
        <div className="w-10 h-10 border-3 border-zinc-200 rounded-full" />
        <div className="absolute inset-0 w-10 h-10 border-3 border-t-amber-500 rounded-full animate-spin" />
      </div>
      {texto && <p className="text-sm text-zinc-500 animate-pulse">{texto}</p>}
    </div>
  );
}

export function PantallaCarga() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <IndicadorCarga texto="Cargando..." />
    </div>
  );
}
