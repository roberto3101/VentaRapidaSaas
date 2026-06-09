const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InvalidTenantIdError extends Error {
  constructor(value: unknown) {
    super(`Invalid tenantId: ${String(value)} (expected UUID v4)`);
    this.name = 'InvalidTenantIdError';
  }
}

export class TenantId {
  private constructor(public readonly value: string) {}

  static fromString(value: string): TenantId {
    if (typeof value !== 'string' || !UUID_V4_REGEX.test(value)) {
      throw new InvalidTenantIdError(value);
    }
    return new TenantId(value);
  }

  equals(other: TenantId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
