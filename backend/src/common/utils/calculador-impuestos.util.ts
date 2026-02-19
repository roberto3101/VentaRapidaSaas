export interface CalculoFiscal {
  subtotal: number;
  montoImpuesto: number;
  total: number;
  tasaImpuesto: number;
}

export const calcularImpuestos = (
  cantidad: number,
  precioUnitario: number,
  tasaImpuesto: number,
  impuestoIncluido: boolean = true,
): CalculoFiscal => {
  const tasaDecimal = tasaImpuesto / 100;

  if (impuestoIncluido) {
    // El precio YA incluye impuesto → extraer
    const total = redondear(cantidad * precioUnitario);
    const subtotal = redondear(total / (1 + tasaDecimal));
    const montoImpuesto = redondear(total - subtotal);
    return { subtotal, montoImpuesto, total, tasaImpuesto };
  }

  // El precio NO incluye impuesto → agregar
  const subtotal = redondear(cantidad * precioUnitario);
  const montoImpuesto = redondear(subtotal * tasaDecimal);
  const total = redondear(subtotal + montoImpuesto);
  return { subtotal, montoImpuesto, total, tasaImpuesto };
};

const redondear = (valor: number, decimales: number = 2): number =>
  Math.round(valor * Math.pow(10, decimales)) / Math.pow(10, decimales);
