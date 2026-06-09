import { Money } from '../../../../shared-kernel/value-objects/money.vo';
import { Sku } from '../../../../shared-kernel/value-objects/sku.vo';

export interface ProductVariantSnapshot {
  id?: string;
  sku: string;
  barcode?: string | null;
  variantName?: string | null;
  purchasePrice: string;
  salePrice: string;
  minStock: number;
  maxStock?: number | null;
  unit: string;
}

/**
 * Product variant — value-object-ish entity. Mutable only through Product
 * aggregate. Persistence ID is assigned by infrastructure on insert.
 */
export class ProductVariant {
  private constructor(
    public readonly sku: Sku,
    public readonly barcode: string | null,
    public readonly variantName: string | null,
    public readonly purchasePrice: Money,
    public readonly salePrice: Money,
    public readonly minStock: number,
    public readonly maxStock: number | null,
    public readonly unit: string,
    public readonly id?: string,
  ) {}

  static create(input: {
    sku: string;
    barcode?: string | null;
    variantName?: string | null;
    purchasePrice?: string;
    salePrice?: string;
    minStock?: number;
    maxStock?: number | null;
    unit?: string;
  }): ProductVariant {
    return new ProductVariant(
      Sku.fromString(input.sku),
      input.barcode ?? null,
      input.variantName ?? null,
      Money.fromString(input.purchasePrice ?? '0'),
      Money.fromString(input.salePrice ?? '0'),
      Math.max(0, Math.trunc(input.minStock ?? 0)),
      input.maxStock == null ? null : Math.max(0, Math.trunc(input.maxStock)),
      input.unit ?? 'und',
    );
  }

  toSnapshot(): ProductVariantSnapshot {
    return {
      id: this.id,
      sku: this.sku.value,
      barcode: this.barcode,
      variantName: this.variantName,
      purchasePrice: this.purchasePrice.toString(),
      salePrice: this.salePrice.toString(),
      minStock: this.minStock,
      maxStock: this.maxStock,
      unit: this.unit,
    };
  }
}
