import { TenantId } from '../../../../shared-kernel/value-objects/tenant-id.vo';
import { ProductName } from '../value-objects/product-name.vo';
import { ProductVariant, ProductVariantSnapshot } from './product-variant.entity';

export interface ProductSnapshot {
  id?: string;
  tenantId: string;
  name: string;
  description: string | null;
  brand: string | null;
  categoryId: string | null;
  imageUrl: string | null;
  hasVariants: boolean;
  tags: string[];
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  variants: ProductVariantSnapshot[];
}

/**
 * Product aggregate root. Owns its variants. State changes happen through
 * intent methods, never via direct property mutation. Persistence is handled
 * via snapshot exchange with the repository port.
 */
export class Product {
  private constructor(
    public readonly tenantId: TenantId,
    private _name: ProductName,
    private _description: string | null,
    private _brand: string | null,
    private _categoryId: string | null,
    private _imageUrl: string | null,
    private _hasVariants: boolean,
    private _tags: ReadonlyArray<string>,
    private _isActive: boolean,
    private _variants: ProductVariant[],
    public readonly createdBy: string,
    private _updatedBy: string | null,
    public readonly id?: string,
  ) {}

  static create(input: {
    tenantId: string;
    name: string;
    description?: string;
    brand?: string;
    categoryId?: string;
    imageUrl?: string;
    hasVariants?: boolean;
    tags?: string[];
    variants: ProductVariant[];
    createdBy: string;
  }): Product {
    return new Product(
      TenantId.fromString(input.tenantId),
      ProductName.fromString(input.name),
      input.description ?? null,
      input.brand ?? null,
      input.categoryId ?? null,
      input.imageUrl ?? null,
      input.hasVariants ?? false,
      Object.freeze([...(input.tags ?? [])]),
      true,
      [...input.variants],
      input.createdBy,
      null,
    );
  }

  static rehydrate(snapshot: ProductSnapshot, variants: ProductVariant[]): Product {
    return new Product(
      TenantId.fromString(snapshot.tenantId),
      ProductName.fromString(snapshot.name),
      snapshot.description,
      snapshot.brand,
      snapshot.categoryId,
      snapshot.imageUrl,
      snapshot.hasVariants,
      Object.freeze([...snapshot.tags]),
      snapshot.isActive,
      [...variants],
      snapshot.createdBy ?? '',
      snapshot.updatedBy,
      snapshot.id,
    );
  }

  rename(name: string, updatedBy: string): void {
    this._name = ProductName.fromString(name);
    this._updatedBy = updatedBy;
  }

  updateDetails(
    input: {
      description?: string | null;
      brand?: string | null;
      categoryId?: string | null;
      imageUrl?: string | null;
      tags?: string[];
    },
    updatedBy: string,
  ): void {
    if (input.description !== undefined) this._description = input.description;
    if (input.brand !== undefined) this._brand = input.brand;
    if (input.categoryId !== undefined) this._categoryId = input.categoryId;
    if (input.imageUrl !== undefined) this._imageUrl = input.imageUrl;
    if (input.tags !== undefined) this._tags = Object.freeze([...input.tags]);
    this._updatedBy = updatedBy;
  }

  archive(updatedBy: string): void {
    this._isActive = false;
    this._updatedBy = updatedBy;
  }

  get name(): string {
    return this._name.value;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  get variants(): ReadonlyArray<ProductVariant> {
    return this._variants;
  }

  toSnapshot(): ProductSnapshot {
    return {
      id: this.id,
      tenantId: this.tenantId.value,
      name: this._name.value,
      description: this._description,
      brand: this._brand,
      categoryId: this._categoryId,
      imageUrl: this._imageUrl,
      hasVariants: this._hasVariants,
      tags: [...this._tags],
      isActive: this._isActive,
      createdBy: this.createdBy || null,
      updatedBy: this._updatedBy,
      variants: this._variants.map((v) => v.toSnapshot()),
    };
  }
}
