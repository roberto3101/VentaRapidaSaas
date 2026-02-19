export enum Rol {
  SUPER_ADMIN = 'super_admin',
  TENANT_ADMIN = 'tenant_admin',
  LOCATION_MANAGER = 'location_manager',
  OPERATOR = 'operator',
}

export const ROLES_JERARQUIA: Record<Rol, number> = {
  [Rol.SUPER_ADMIN]: 100,
  [Rol.TENANT_ADMIN]: 80,
  [Rol.LOCATION_MANAGER]: 50,
  [Rol.OPERATOR]: 10,
};

export const esRolSuperior = (rolActual: Rol, rolRequerido: Rol): boolean =>
  ROLES_JERARQUIA[rolActual] >= ROLES_JERARQUIA[rolRequerido];
