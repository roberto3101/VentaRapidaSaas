import { create } from 'zustand';
import type { ItemCarrito } from '../tipos/venta.tipos';

interface CarritoState {
  items: ItemCarrito[];
  locationId: string | null;

  setLocationId: (id: string) => void;
  agregarItem: (item: Omit<ItemCarrito, 'quantity'> & { quantity?: number }) => void;
  incrementarCantidad: (variantId: string) => void;
  decrementarCantidad: (variantId: string) => void;
  setCantidad: (variantId: string, quantity: number) => void;
  setDescuento: (variantId: string, discount: number) => void;
  eliminarItem: (variantId: string) => void;
  vaciarCarrito: () => void;

  subtotal: () => number;
  totalItems: () => number;
}

export const useCarritoStore = create<CarritoState>((set, get) => ({
  items: [],
  locationId: null,

  setLocationId: (id) => set({ locationId: id }),

  agregarItem: (item) => {
    const qty = item.quantity ?? 1;
    set((s) => {
      const exists = s.items.find((i) => i.variantId === item.variantId);
      if (exists) {
        return {
          items: s.items.map((i) =>
            i.variantId === item.variantId
              ? { ...i, quantity: i.quantity + qty }
              : i,
          ),
        };
      }
      return { items: [...s.items, { ...item, quantity: qty }] };
    });
  },

  incrementarCantidad: (variantId) => {
    set((s) => ({
      items: s.items.map((i) =>
        i.variantId === variantId ? { ...i, quantity: i.quantity + 1 } : i,
      ),
    }));
  },

  decrementarCantidad: (variantId) => {
    set((s) => ({
      items: s.items
        .map((i) =>
          i.variantId === variantId ? { ...i, quantity: i.quantity - 1 } : i,
        )
        .filter((i) => i.quantity > 0),
    }));
  },

  setCantidad: (variantId, quantity) => {
    if (quantity <= 0) {
      set((s) => ({ items: s.items.filter((i) => i.variantId !== variantId) }));
    } else {
      set((s) => ({
        items: s.items.map((i) =>
          i.variantId === variantId ? { ...i, quantity } : i,
        ),
      }));
    }
  },

  setDescuento: (variantId, discount) => {
    set((s) => ({
      items: s.items.map((i) =>
        i.variantId === variantId ? { ...i, discountAmount: Math.max(0, discount) } : i,
      ),
    }));
  },

  eliminarItem: (variantId) => {
    set((s) => ({ items: s.items.filter((i) => i.variantId !== variantId) }));
  },

  vaciarCarrito: () => set({ items: [] }),

  subtotal: () => {
    return get().items.reduce(
      (sum, i) => sum + (i.unitPrice - i.discountAmount) * i.quantity,
      0,
    );
  },

  totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
}));
