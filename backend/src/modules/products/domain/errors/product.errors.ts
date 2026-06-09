export class ProductNotFoundError extends Error {
  constructor(public readonly productId: string) {
    super(`Product ${productId} not found`);
    this.name = 'ProductNotFoundError';
  }
}

export class ProductQuotaExceededError extends Error {
  constructor(public readonly limit: number) {
    super(`Product quota exceeded: tenant limit is ${limit}`);
    this.name = 'ProductQuotaExceededError';
  }
}

export class ProductBarcodeNotFoundError extends Error {
  constructor(public readonly barcode: string) {
    super(`No product variant matches barcode ${barcode}`);
    this.name = 'ProductBarcodeNotFoundError';
  }
}
