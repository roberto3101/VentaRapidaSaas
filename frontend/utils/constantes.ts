export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export const PAISES = [
  { codigo: 'PE', nombre: 'Perú', moneda: 'PEN', simbolo: 'S/', zona: 'America/Lima', impuesto: 'IGV', tasa: 18 },
  { codigo: 'VE', nombre: 'Venezuela', moneda: 'VES', simbolo: 'Bs.', zona: 'America/Caracas', impuesto: 'IVA', tasa: 16 },
  { codigo: 'CO', nombre: 'Colombia', moneda: 'COP', simbolo: '$', zona: 'America/Bogota', impuesto: 'IVA', tasa: 19 },
  { codigo: 'MX', nombre: 'México', moneda: 'MXN', simbolo: '$', zona: 'America/Mexico_City', impuesto: 'IVA', tasa: 16 },
  { codigo: 'CL', nombre: 'Chile', moneda: 'CLP', simbolo: '$', zona: 'America/Santiago', impuesto: 'IVA', tasa: 19 },
  { codigo: 'AR', nombre: 'Argentina', moneda: 'ARS', simbolo: '$', zona: 'America/Argentina/Buenos_Aires', impuesto: 'IVA', tasa: 21 },
  { codigo: 'EC', nombre: 'Ecuador', moneda: 'USD', simbolo: '$', zona: 'America/Guayaquil', impuesto: 'IVA', tasa: 15 },
  { codigo: 'BO', nombre: 'Bolivia', moneda: 'BOB', simbolo: 'Bs.', zona: 'America/La_Paz', impuesto: 'IVA', tasa: 13 },
] as const;

export const ROLES: Record<string, string> = {
  super_admin: 'Super Admin',
  tenant_admin: 'Administrador',
  location_manager: 'Jefe de Sede',
  operator: 'Operador',
};

export const TOKEN_KEY = 'svr_token';
export const REFRESH_KEY = 'svr_refresh';
