'use client';

import { Minus, Plus, Trash2 } from 'lucide-react';
import type { ItemCarrito } from '../../tipos/venta.tipos';

interface LineaCarritoProps {
  item: ItemCarrito;
  simboloMoneda: string;
  onIncrementar: () => void;
  onDecrementar: () => void;
  onEliminar: () => void;
  onCantidadDirecta: (qty: number) => void;
  seleccionado?: boolean;
  onClick?: () => void;
}

export function LineaCarrito({
  item,
  simboloMoneda,
  onIncrementar,
  onDecrementar,
  onEliminar,
  onCantidadDirecta,
  seleccionado,
  onClick,
}: LineaCarritoProps) {
  const lineTotal = (item.unitPrice - item.discountAmount) * item.quantity;

  const fmt = (n: number) =>
    `${simboloMoneda} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-100 last:border-0 cursor-pointer transition-colors ${
        seleccionado ? 'bg-amber-50' : 'hover:bg-zinc-50'
      }`}
      onClick={onClick}
    >
      {/* Info producto */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-800 truncate">{item.productName}</p>
        <p className="text-xs text-zinc-400 truncate">
          {item.variantName !== item.productName ? item.variantName : item.sku}
        </p>
        {item.discountAmount > 0 && (
          <p className="text-xs text-amber-600 font-medium">
            - {fmt(item.discountAmount)} dto.
          </p>
        )}
      </div>

      {/* Precio unitario */}
      <div className="text-right hidden sm:block min-w-[70px]">
        <p className="text-xs text-zinc-400">{fmt(item.unitPrice)}</p>
      </div>

      {/* Controles de cantidad */}
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onDecrementar}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 transition-colors"
          aria-label="Disminuir cantidad"
        >
          <Minus size={14} />
        </button>
        <input
          type="number"
          min={1}
          value={item.quantity}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) onCantidadDirecta(v);
          }}
          className="w-10 text-center text-sm font-medium bg-white border border-zinc-200 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400"
        />
        <button
          onClick={onIncrementar}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 transition-colors"
          aria-label="Aumentar cantidad"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Total línea */}
      <div className="text-right min-w-[80px]">
        <p className="text-sm font-semibold text-zinc-900">{fmt(lineTotal)}</p>
      </div>

      {/* Eliminar */}
      <button
        onClick={(e) => { e.stopPropagation(); onEliminar(); }}
        className="text-zinc-300 hover:text-red-500 transition-colors p-1"
        aria-label="Eliminar línea"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
