export enum TipoMovimiento {
  COMPRA = 'purchase',
  VENTA = 'sale',
  TRANSFERENCIA_ENTRADA = 'transfer_in',
  TRANSFERENCIA_SALIDA = 'transfer_out',
  AJUSTE_ENTRADA = 'adjustment_in',
  AJUSTE_SALIDA = 'adjustment_out',
  CARGA_INICIAL = 'initial',
  DEVOLUCION_CLIENTE = 'return_in',
  DEVOLUCION_PROVEEDOR = 'return_out',
}

export const MOVIMIENTOS_ENTRADA: TipoMovimiento[] = [
  TipoMovimiento.COMPRA,
  TipoMovimiento.TRANSFERENCIA_ENTRADA,
  TipoMovimiento.AJUSTE_ENTRADA,
  TipoMovimiento.CARGA_INICIAL,
  TipoMovimiento.DEVOLUCION_CLIENTE,
];

export const MOVIMIENTOS_SALIDA: TipoMovimiento[] = [
  TipoMovimiento.VENTA,
  TipoMovimiento.TRANSFERENCIA_SALIDA,
  TipoMovimiento.AJUSTE_SALIDA,
  TipoMovimiento.DEVOLUCION_PROVEEDOR,
];

export const obtenerDireccion = (tipo: TipoMovimiento): 1 | -1 =>
  MOVIMIENTOS_ENTRADA.includes(tipo) ? 1 : -1;
