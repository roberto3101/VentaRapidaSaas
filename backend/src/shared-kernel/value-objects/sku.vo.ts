const SKU_REGEX = /^[A-Z0-9][A-Z0-9._\-]{0,99}$/i;

export class InvalidSkuError extends Error {
  constructor(value: unknown) {
    super(`Invalid SKU: ${String(value)} (alphanumeric + . _ -, 1..100 chars, must start with alphanumeric)`);
    this.name = 'InvalidSkuError';
  }
}

export class Sku {
  private constructor(public readonly value: string) {}

  static fromString(value: string): Sku {
    if (typeof value !== 'string' || !SKU_REGEX.test(value)) {
      throw new InvalidSkuError(value);
    }
    return new Sku(value);
  }

  equals(other: Sku): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
