'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';

interface ModalConfirmarProps {
  abierto: boolean;
  titulo: string;
  mensaje: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  variante?: 'peligro' | 'advertencia';
  cargando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

export function ModalConfirmar({
  abierto, titulo, mensaje, textoConfirmar = 'Eliminar',
  textoCancelar = 'Cancelar', variante = 'peligro',
  cargando = false, onConfirmar, onCancelar,
}: ModalConfirmarProps) {
  const refBoton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (abierto) {
      refBoton.current?.focus();
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !cargando) onCancelar();
      };
      document.addEventListener('keydown', handler);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handler);
        document.body.style.overflow = '';
      };
    }
  }, [abierto, cargando, onCancelar]);

  if (!abierto) return null;

  const colores = variante === 'peligro'
    ? { bg: 'bg-red-50', icon: 'text-red-500', btn: 'bg-red-600 hover:bg-red-700 focus:ring-red-500' }
    : { bg: 'bg-amber-50', icon: 'text-amber-500', btn: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm" onClick={!cargando ? onCancelar : undefined} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full animate-in overflow-hidden">
        <button
          onClick={onCancelar}
          disabled={cargando}
          className="absolute top-4 right-4 p-1 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6">
          <div className={`w-12 h-12 ${colores.bg} rounded-xl flex items-center justify-center mb-4`}>
            <AlertTriangle className={`w-6 h-6 ${colores.icon}`} />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 mb-2">{titulo}</h3>
          <p className="text-sm text-zinc-500 leading-relaxed">{mensaje}</p>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onCancelar}
            disabled={cargando}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors disabled:opacity-50"
          >
            {textoCancelar}
          </button>
          <button
            ref={refBoton}
            onClick={onConfirmar}
            disabled={cargando}
            className={`flex-1 px-4 py-2.5 text-sm font-medium text-white ${colores.btn} rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2`}
          >
            {cargando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Procesando...</span>
              </>
            ) : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
