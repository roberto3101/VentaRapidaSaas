'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginacionProps {
  pagina: number;
  totalPaginas: number;
  onCambiar: (pagina: number) => void;
}

export function Paginacion({ pagina, totalPaginas, onCambiar }: PaginacionProps) {
  if (totalPaginas <= 1) return null;

  const rango = () => {
    const delta = 2;
    const izq = Math.max(2, pagina - delta);
    const der = Math.min(totalPaginas - 1, pagina + delta);
    const paginas: (number | '...')[] = [1];
    if (izq > 2) paginas.push('...');
    for (let i = izq; i <= der; i++) paginas.push(i);
    if (der < totalPaginas - 1) paginas.push('...');
    if (totalPaginas > 1) paginas.push(totalPaginas);
    return paginas;
  };

  return (
    <div className="flex items-center justify-center gap-1.5 pt-4">
      <button
        onClick={() => onCambiar(pagina - 1)}
        disabled={pagina <= 1}
        className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        aria-label="Página anterior"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {rango().map((p, i) =>
        p === '...' ? (
          <span key={`dots-${i}`} className="px-2 text-zinc-400 text-sm">···</span>
        ) : (
          <button
            key={p}
            onClick={() => onCambiar(p as number)}
            className={`min-w-[36px] h-9 px-2 text-sm font-medium rounded-lg transition-all ${
              p === pagina
                ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-white shadow-sm shadow-amber-200'
                : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onCambiar(pagina + 1)}
        disabled={pagina >= totalPaginas}
        className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        aria-label="Página siguiente"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
