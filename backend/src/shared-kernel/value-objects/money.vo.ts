import { Prisma } from '@prisma/client';

const DECIMAL_REGEX = /^-?\d+(\.\d+)?$/;

export class InvalidMoneyError extends Error {
  constructor(value: unknown) {
    super(`Invalid Money value: ${String(value)} (expected non-negative decimal string)`);
    this.name = 'InvalidMoneyError';
  }
}

/**
 * Monetary amount with up to 4 decimal places. Stored as Prisma.Decimal at
 * the persistence boundary; never as JS number. Use cases pass the VO around,
 * adapters convert to Prisma.Decimal when writing.
 */
export class Money {
  private constructor(public readonly amount: Prisma.Decimal) {}

  static fromString(value: string): Money {
    if (typeof value !== 'string' || !DECIMAL_REGEX.test(value)) {
      throw new InvalidMoneyError(value);
    }
    const decimal = new Prisma.Decimal(value);
    if (decimal.isNegative()) throw new InvalidMoneyError(value);
    return new Money(decimal);
  }

  static fromDecimal(value: Prisma.Decimal | string | number): Money {
    const decimal = new Prisma.Decimal(value);
    if (decimal.isNegative()) throw new InvalidMoneyError(value);
    return new Money(decimal);
  }

  static zero(): Money {
    return new Money(new Prisma.Decimal(0));
  }

  toDecimal(): Prisma.Decimal {
    return this.amount;
  }

  toString(): string {
    return this.amount.toFixed(2);
  }
}
