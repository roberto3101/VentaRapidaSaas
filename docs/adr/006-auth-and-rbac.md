# ADR-006: Autenticación y autorización (JWT + RBAC por tenant)

- **Status**: Accepted
- **Date**: 2026-05-20
- **Author**: Architect
- **Issue**: SIS-1

## Context

El sistema requiere:

- Multi-tenant: cada usuario pertenece a un tenant (excepto `super_admin` global).
- Multi-sucursal: un usuario puede operar en varias sucursales del mismo tenant. Una sucursal por turno.
- Roles claros: super admin, admin del negocio, encargado de sucursal, cajero, contador, lector.
- Tokens cortos + refresh largo para SPA + futura app móvil/desktop.
- Bloqueo automático tras intentos fallidos.

El código actual:

- JWT access + refresh con bcrypt para hash de password y token de refresh — ✅ correcto.
- `User.email` NO es único en el schema — login con `findFirst({ email })` es ambiguo entre tenants. **Bug**.
- Roles actuales: `super_admin`, `tenant_admin`, `location_manager`, `operator`. Glosario sugiere granularidad mayor (`branch_manager`, `cashier`, `accountant`, `viewer`).
- Guards globales `JwtAuthGuard`, `RolesGuard`, `TenantGuard` aplicados — ✅.
- `TenantContextMiddleware` setea Postgres session var pero usa `$executeRawUnsafe` con string interpolation — **SQL-injection adjacent**, debe corregirse.
- Token de acceso almacenado en `localStorage` (frontend `servicios/api.ts:13`) — vulnerable a XSS.

## Decision

### JWT structure

```ts
interface AccessTokenPayload {
  sub: string;          // userId (uuid)
  tenantId: string | null; // null SOLO si role === 'super_admin'
  email: string;
  role: Role;
  branchIds: string[];  // sucursales asignadas
  activeBranchId?: string; // sucursal activa en este turno (puede cambiar en sesión)
  permissions: string[]; // capacidades expandidas — derivadas del role, embebidas para evitar lookup en cada request
  jti: string;          // jwt id para revocación
  iat: number; exp: number;
}
```

- **Expiración access**: 15 minutos.
- **Expiración refresh**: 7 días.
- **Rotación de refresh**: cada vez que se usa, se emite uno nuevo y el viejo se invalida. Si se reusa un refresh ya rotado → todas las sesiones del usuario se cierran (sospecha de robo).

### Roles canónicos (RBAC)

| Rol | Scope | Capacidades clave |
|---|---|---|
| `super_admin` | Plataforma | Operativo de soporte, ver todos los tenants, no opera ventas |
| `tenant_admin` | Tenant | Configurar tenant, sucursales, usuarios, planes, ver todo |
| `branch_manager` | Sucursal | Operar sucursal, abrir/cerrar turnos, autorizar anulaciones, ver reportes de su sucursal |
| `cashier` | Sucursal | Vender, cobrar, ver su turno; NO anulaciones sin aprobación |
| `accountant` | Tenant (read-only fiscal) | Ver comprobantes, exportar PLE/libros, generar reportes contables |
| `viewer` | Tenant (read-only) | Ver dashboards, sin acciones |

**Granularidad de permisos**: derivados del role pero **declarados explícitamente** en `common/auth/permissions.ts` para que se puedan auditar y extender. Ej.:

```ts
const RolePermissions = {
  cashier: ['sales:create', 'sales:view-own', 'shifts:close-own', 'products:search'],
  branch_manager: [...cashier, 'sales:void', 'shifts:open-any', 'reports:branch'],
  ...
};
```

Guard `@RequirePermissions('sales:void')` chequea contra `permissions[]` del JWT, no contra `role`. Esto permite asignación granular cuando llegue.

### Multi-tenant en autenticación

**Problema**: `email` se reusará entre tenants (ej. mismo dueño tiene dos negocios). Solución:

- `User.email` **no es único globalmente**. Es único POR TENANT: `@@unique([tenantId, email])`.
- Para login, el usuario provee `email + tenantSlug` (o subdomain en el futuro: `<slug>.sistemaventarapida.com`). Backend resuelve `tenant_id = findBySlug(slug)` antes del lookup de usuario.
- Para `super_admin`, el flujo es separado en `/auth/admin/login` y el email SÍ es único globalmente con `tenant_id = NULL`.

### Almacenamiento del token en frontend

**Decisión**: cambiar de `localStorage` a **httpOnly secure cookie** para refresh token, mantener access token en memoria (Zustand store no persistido).

- Refresh token (httpOnly, secure, SameSite=Strict): inmune a XSS.
- Access token en memoria: si se pierde por refresh de página, el SPA llama silenciosamente `/auth/refresh` con la cookie.
- CSRF: usamos `SameSite=Strict` + double-submit cookie en endpoints mutables. Solo si hostnames distintos backend/frontend.

### Bloqueo de cuenta

Ya implementado: 5 intentos fallidos → bloqueo 15 minutos. **Mantener** y agregar:

- Bloqueo permanente tras 10 lockouts en 24h (sospecha de bot).
- Auditoría en `AuditLog` de cada intento fallido (ya parcial).
- Rate limit por IP en `/auth/login`: 10 req/min con `@nestjs/throttler` (paquete ya instalado).

### Recuperación de contraseña

- Token de recuperación: opaque token de 32 bytes, hasheado en BD, TTL 1 hora.
- Email con link único. Endpoint `/auth/password/reset` valida y permite cambio.
- Cualquier reset cierra todas las sesiones activas (`refreshTokenHash = null`).

## Consequences

### Positivas

- Sesiones cortas + rotación de refresh = ventana de robo pequeña.
- Permisos granulares preparan terreno para customización por cliente enterprise.
- httpOnly cookie elimina toda una clase de XSS.

### Negativas

- Migrar a httpOnly cookie requiere cambios coordinados frontend + backend.
- CSRF debe gestionarse explícitamente (no era issue con bearer token).
- Si frontend y backend están en hosts/dominios distintos, cookies cross-site requieren config cuidadosa.

### Riesgos abiertos

- **Bot ataques credential stuffing**: agregar captcha en login tras 2 fallos consecutivos. Fase 2.
- **Migración del email no único actual**: hay que rellenar `tenantId` en `User.email` único compuesto. Migración aditiva con backfill.

## Alternatives considered

### A. Mantener bearer token en localStorage

- **Contras**: XSS = robo de sesión. No queremos enviar esto a producción real con datos fiscales.

### B. Session cookies stateful (Redis store)

- **Pros**: revocación inmediata.
- **Contras**: requiere Redis ya en MVP. JWT + jti + revocation list pequeña en BD es suficiente para nuestra escala.

### C. OAuth2 / OIDC con provider externo

- **Pros**: ahorra implementación.
- **Contras**: agrega dependencia y costo. Útil cuando tengamos SSO empresarial (fase 3+). Modelado como `IExternalIdentityProvider` port para sumar después.

### D. Permission strings sin role intermedio

- **Pros**: máximo control.
- **Contras**: UX pésima para crear cuentas (asignar 30 checkboxes). Roles + permission overrides es el balance.

## Implementation plan

1. Migración Prisma: `@@unique([tenantId, email])` en `User`, hacer `email` no único standalone (DBA, SIS-XX).
2. Modificar `AuthService.iniciarSesion` para aceptar `tenantSlug` y resolver tenant primero (Backend Dev).
3. Endpoint separado `/auth/admin/login` para super admins.
4. `permissions.ts` con catálogo + decorator `@RequirePermissions(...)` (Backend Dev).
5. Migrar refresh token a httpOnly cookie (Backend Dev + Frontend Dev coordinados).
6. Auditar y corregir `TenantContextMiddleware` para usar `$executeRaw` parametrizado (Backend Dev, **Security urgent**).
7. Tests de aislamiento y abuse (QA, Security).

## References

- OWASP ASVS 4.0 — autenticación: https://owasp.org/www-project-application-security-verification-standard/
- RFC 8725 JWT best practices: https://datatracker.ietf.org/doc/html/rfc8725
- [[001-multi-tenancy-strategy]]
