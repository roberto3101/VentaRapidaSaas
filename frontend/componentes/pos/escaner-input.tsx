'use client';

import { useRef, useEffect, useState } from 'react';
import { ScanBarcode, Search, Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

interface EscanerInputProps {
  onProductoEncontrado: (variante: {
    id: string;
    sku: string;
    barcode?: string | null;
    variantName: string;
    salePrice: number;
    product?: { name: string } | null;
  }) => void;
  onError?: (msg: string) => void;
  buscarPorCodigo: (codigo: string) => Promise<{
    id: string;
    sku: string;
    barcode?: string | null;
    variantName: string;
    salePrice: number;
    product?: { name: string } | null;
  }>;
  disabled?: boolean;
}

export function EscanerInput({ onProductoEncontrado, onError, buscarPorCodigo, disabled }: EscanerInputProps) {
  const [valor, setValor] = useState('');
  const [cargando, setCargando] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [disabled]);

  const buscar = async (codigo: string) => {
    const trimmed = codigo.trim();
    if (!trimmed) return;
    setCargando(true);
    try {
      const variante = await buscarPorCodigo(trimmed);
      onProductoEncontrado(variante);
      setValor('');
    } catch {
      onError?.(`Producto no encontrado: "${trimmed}"`);
      setValor('');
    } finally {
      setCargando(false);
      ref.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      buscar(valor);
    }
  };

  return (
    <div className="relative flex items-center">
      <div className="absolute left-3 text-zinc-400">
        {cargando ? (
          <Loader2 size={18} className="animate-spin text-amber-500" />
        ) : (
          <ScanBarcode size={18} />
        )}
      </div>
      <input
        ref={ref}
        type="text"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || cargando}
        placeholder="Escanear código o buscar producto… (Enter)"
        className={cn(
          'w-full pl-10 pr-10 py-3 bg-white border border-zinc-200 rounded-xl text-sm',
          'placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400',
          'transition-all disabled:opacity-50',
        )}
      />
      {valor && (
        <button
          type="button"
          onClick={() => buscar(valor)}
          disabled={cargando}
          className="absolute right-3 text-zinc-400 hover:text-amber-500 transition-colors"
        >
          <Search size={16} />
        </button>
      )}
    </div>
  );
}
