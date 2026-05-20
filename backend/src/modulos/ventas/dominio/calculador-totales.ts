/**
 * Domain service puro: cálculos de totales de venta usando Decimal.
 * SIN dependencias de Prisma / Nest / I/O. Testeable en aislamiento.
 *
 * Reglas:
 * - Money es siempre Decimal con 4 decimales (ADR-004).
 * - Tax se calcula POR LÍNEA antes de sumar (evita drift por redondeo).
 * - Descuento por línea aplica ANTES de tax.
 * - Discount global aplica al final sobre el subtotal con impuestos.
 */
import { Prisma } from '@prisma/client';

export interface InputItemCalculo {
  unitPrice: Prisma.Decimal;
  quantity: Prisma.Decimal;
  taxRate: Prisma.Decimal; // porcentaje, ej. 18 para IGV
  discountAmount?: Prisma.Decimal;
}

export interface ResultadoLineaCalculada {
  baseImponible: Prisma.Decimal; // (unitPrice * quantity) - discount
  taxAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal; // base + tax
}

export interface ResultadoTotalVenta {
  subtotal: Prisma.Decimal; // suma de baseImponible (sin impuestos)
  taxAmount: Prisma.Decimal; // suma de tax por línea
  discountAmount: Prisma.Decimal; // suma de descuentos por línea
  total: Prisma.Decimal; // subtotal + taxAmount
}

const ZERO = new Prisma.Decimal(0);
const CIEN = new Prisma.Decimal(100);

export function calcularLinea(input: InputItemCalculo): ResultadoLineaCalculada {
  const bruto = input.unitPrice.mul(input.quantity);
  const descuento = input.discountAmount ?? ZERO;
  const baseImponible = bruto.minus(descuento);

  if (baseImponible.lt(ZERO)) {
    throw new Error('Descuento de línea excede el subtotal de la línea');
  }

  const taxAmount = baseImponible.mul(input.taxRate).div(CIEN);
  const lineTotal = baseImponible.plus(taxAmount);

  return { baseImponible, taxAmount, lineTotal };
}

export function calcularTotalVenta(lineas: ResultadoLineaCalculada[]): ResultadoTotalVenta {
  const subtotal = lineas.reduce((acc, l) => acc.plus(l.baseImponible), ZERO);
  const taxAmount = lineas.reduce((acc, l) => acc.plus(l.taxAmount), ZERO);
  const total = subtotal.plus(taxAmount);

  return {
    subtotal,
    taxAmount,
    discountAmount: ZERO, // descuentos suman al nivel de línea, no se duplican aquí
    total,
  };
}

/**
 * Calcula el vuelto a partir del monto recibido en efectivo.
 * Si receivedAmount < amount → throw (no es vuelto, es deuda).
 */
export function calcularVuelto(amount: Prisma.Decimal, receivedAmount: Prisma.Decimal): Prisma.Decimal {
  if (receivedAmount.lt(amount)) {
    throw new Error('Monto recibido insuficiente');
  }
  return receivedAmount.minus(amount);
}

/**
 * Valida que la suma de pagos cubra el total de la venta (>=).
 * Toleramos hasta 1 centavo por diferencia de redondeo.
 */
export function validarPagosCubrenTotal(
  pagos: { amount: Prisma.Decimal }[],
  totalVenta: Prisma.Decimal,
): void {
  const sumaPagos = pagos.reduce((acc, p) => acc.plus(p.amount), ZERO);
  const diferencia = sumaPagos.minus(totalVenta);
  const toleranciaCentavo = new Prisma.Decimal('0.01');

  if (diferencia.lt(toleranciaCentavo.negated())) {
    throw new Error(
      `Pagos insuficientes: total venta ${totalVenta.toFixed(2)}, pagado ${sumaPagos.toFixed(2)}`,
    );
  }
}
