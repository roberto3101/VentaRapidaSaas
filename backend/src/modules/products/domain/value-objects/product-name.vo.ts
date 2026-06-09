export class InvalidProductNameError extends Error {
  constructor(value: unknown) {
    super(`Invalid product name: ${String(value)} (2..255 characters required)`);
    this.name = 'InvalidProductNameError';
  }
}

export class ProductName {
  private constructor(public readonly value: string) {}

  static fromString(value: string): ProductName {
    if (typeof value !== 'string') throw new InvalidProductNameError(value);
    const trimmed = value.trim();
    if (trimmed.length < 2 || trimmed.length > 255) {
      throw new InvalidProductNameError(value);
    }
    return new ProductName(trimmed);
  }

  toString(): string {
    return this.value;
  }
}
