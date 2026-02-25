export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  countryCode: string;
  currencyCode: string;
  currencySymbol: string;
  timezone: string;
  locale?: string;
  dateFormat?: string;
  taxName?: string;
  taxRate?: number;
  taxIncluded?: boolean;
  lowStockThreshold?: number;
  allowNegativeStock?: boolean;
  requireReferenceOnSale?: boolean;
  requireReferenceOnPurchase?: boolean;
  plan?: string;
  maxLocations?: number;
  maxUsers?: number;
  maxProducts?: number;
  isActive?: boolean;
  createdAt: string;
}

export interface ActualizarTenantPayload {
  nombre?: string;
  logoUrl?: string;
  nombreImpuesto?: string;
  tasaImpuesto?: number;
  impuestoIncluido?: boolean;
  permitirStockNegativo?: boolean;
  umbralStockBajo?: number;
  requiereReferenciaVenta?: boolean;
  requiereReferenciaCompra?: boolean;
}
