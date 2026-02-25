// ═══════════════════════════════════════════════════════
// TIPOS - Módulo Productos  
// Alineados 1:1 con backend DTOs y respuestas Prisma
// ═══════════════════════════════════════════════════════

// --- Respuestas del backend (campos Prisma en inglés) ---

export interface Producto {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  brand?: string | null;
  categoryId?: string | null;
  imageUrl?: string | null;
  hasVariants: boolean;
  tags: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category?: Categoria | null;
  variants: Variante[];
  _count?: { variants: number };
}

export interface Variante {
  id: string;
  productId: string;
  sku: string;
  barcode?: string | null;
  variantName: string;
  purchasePrice: number;
  salePrice: number;
  minStock: number;
  maxStock?: number | null;
  unit: string;
  isActive: boolean;
  createdAt: string;
  inventoryStock?: StockInfo[];
  locationPrices?: PrecioSede[];
}

export interface StockInfo {
  locationId: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
}

export interface PrecioSede {
  id: string;
  locationId: string;
  salePrice?: number | null;
  purchasePrice?: number | null;
}

export interface Categoria {
  id: string;
  tenantId: string;
  parentId?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  children?: Categoria[];
  _count?: { products: number };
}

// --- Payloads para enviar al backend (campos DTO en español) ---

export interface CrearProductoPayload {
  nombre: string;
  descripcion?: string;
  marca?: string;
  categoriaId?: string;
  imagenUrl?: string;
  tieneVariantes?: boolean;
  etiquetas?: string[];
  variantes: CrearVariantePayload[];
}

export interface ActualizarProductoPayload {
  nombre?: string;
  descripcion?: string;
  marca?: string;
  categoriaId?: string | null;
  imagenUrl?: string;
  etiquetas?: string[];
}

export interface CrearVariantePayload {
  sku: string;
  codigoBarras?: string;
  nombreVariante: string;
  precioCompra?: number;
  precioVenta: number;
  stockMinimo?: number;
  stockMaximo?: number;
  unidad?: string;
}

export interface ActualizarVariantePayload {
  sku?: string;
  codigoBarras?: string;
  nombreVariante?: string;
  precioCompra?: number;
  precioVenta?: number;
  stockMinimo?: number;
  stockMaximo?: number;
  unidad?: string;
}

export interface CrearCategoriaPayload {
  nombre: string;
  descripcion?: string;
  categoriaPadreId?: string | null;
  orden?: number;
}

// --- Respuesta paginada ---

export interface RespuestaPaginada<T> {
  datos: T[];
  meta: {
    total: number;
    pagina: number;
    limite: number;
    totalPaginas: number;
  };
}

// --- Unidades disponibles ---
export const UNIDADES = [
  { valor: 'und', etiqueta: 'Unidad' },
  { valor: 'kg', etiqueta: 'Kilogramo' },
  { valor: 'g', etiqueta: 'Gramo' },
  { valor: 'l', etiqueta: 'Litro' },
  { valor: 'ml', etiqueta: 'Mililitro' },
  { valor: 'm', etiqueta: 'Metro' },
  { valor: 'cm', etiqueta: 'Centímetro' },
  { valor: 'caja', etiqueta: 'Caja' },
  { valor: 'paq', etiqueta: 'Paquete' },
  { valor: 'doc', etiqueta: 'Docena' },
  { valor: 'par', etiqueta: 'Par' },
  { valor: 'rollo', etiqueta: 'Rollo' },
] as const;
