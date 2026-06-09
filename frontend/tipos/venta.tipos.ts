export type MetodoPago =
  | 'cash'
  | 'card_debit'
  | 'card_credit'
  | 'yape'
  | 'plin'
  | 'bank_transfer'
  | 'credit'
  | 'other';

export const METODOS_PAGO: { value: MetodoPago; label: string; icono: string }[] = [
  { value: 'cash', label: 'Efectivo', icono: '💵' },
  { value: 'card_debit', label: 'Débito', icono: '💳' },
  { value: 'card_credit', label: 'Crédito', icono: '💳' },
  { value: 'yape', label: 'Yape', icono: '📱' },
  { value: 'plin', label: 'Plin', icono: '📱' },
  { value: 'bank_transfer', label: 'Transferencia', icono: '🏦' },
  { value: 'other', label: 'Otro', icono: '🔖' },
];

export interface ItemCarrito {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
  unitPrice: number;
  discountAmount: number;
  quantity: number;
}

export interface VentaItem {
  id: string;
  saleId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxRate: number;
  subtotal: number;
}

export interface VentaPago {
  id: string;
  method: MetodoPago;
  amount: number;
  receivedAmount?: number;
  changeAmount?: number;
  reference?: string;
}

export interface Venta {
  id: string;
  saleNumber: string;
  locationId: string;
  customerId?: string | null;
  status: 'draft' | 'completed' | 'cancelled';
  subtotal: number;
  taxAmount: number;
  discountTotal: number;
  total: number;
  notes?: string | null;
  items: VentaItem[];
  payments?: VentaPago[];
  createdAt: string;
  completedAt?: string | null;
}

export interface CrearVentaPayload {
  locationId: string;
  customerId?: string;
  items: {
    variantId: string;
    quantity: number;
    unitPriceHint?: number;
    discountAmount?: number;
  }[];
  notes?: string;
}

export interface CompletarVentaPayload {
  payments: {
    method: MetodoPago;
    amount: number;
    receivedAmount?: number;
    reference?: string;
  }[];
}
