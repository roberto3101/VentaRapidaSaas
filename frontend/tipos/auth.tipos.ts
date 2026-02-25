export interface Tokens {
  tokenAcceso: string;
  tokenRefresh: string;
  tipoToken: string;
  expiraEn: number;
}

export interface Usuario {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: RolUsuario;
  avatarUrl?: string;
  tenantId?: string;
  preferredLocationId?: string;
  lastLoginAt?: string;
  mustChangePassword?: boolean;
  userLocations: SedeAsignada[];
  tenant?: TenantResumen;
}

export interface SedeAsignada {
  locationId: string;
  isDefault: boolean;
  location: { id: string; name: string; code: string };
}

export interface TenantResumen {
  id: string;
  name: string;
  slug: string;
  currencyCode: string;
  currencySymbol: string;
  timezone: string;
  taxName?: string;
  taxRate?: number;
}

export type RolUsuario = 'super_admin' | 'tenant_admin' | 'location_manager' | 'operator';

export interface LoginPayload {
  email: string;
  contrasena: string;
}

export interface RegistroTenantPayload {
  nombreNegocio: string;
  codigoPais: string;
  codigoMoneda: string;
  simboloMoneda: string;
  zonaHoraria?: string;
  nombreImpuesto?: string;
  tasaImpuesto?: number;
  impuestoIncluido?: boolean;
  nombreCompleto: string;
  email: string;
  contrasena: string;
}
