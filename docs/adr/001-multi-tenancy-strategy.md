# ADR-001: Multi-tenancy strategy

- **Status**: Accepted
- **Date**: 2026-05-20
- **Author**: Architect
- **Issue**: SIS-1

## Context

SistemaVentaRapida Pro es un POS SaaS multi-tenant para LATAM. El alcance del producto exige:

- Aislar datos entre tenants de forma **garantizable** (un tenant nunca debe leer datos de otro).
- Soportar desde un puñado de tenants hoy hasta miles de tenants en 12–18 meses.
- Operar con presupuesto reducido ($100/mes inicial) — no podemos pagar 1 base de datos por tenant.
- Permitir reportes cross-tenant solo a `super_admin` (operativo de soporte) sin abrir agujeros.
- Permitir migraciones zero-downtime aplicables a todos los tenants a la vez.

El código actual implementa parcialmente el patrón **discriminator column** (`tenantId` en cada tabla de dominio) pero sin Row-Level Security en PostgreSQL y con varias queries vulnerables a omisión del filtro `where: { tenantId }` (ver `auth.service.ts:30`, login global sin tenant).

## Decision

Adoptamos **discriminator column + Row-Level Security (RLS) en PostgreSQL** como mecanismo de aislamiento, con **defense-in-depth** vía middleware de aplicación.

Detalle:

1. **Columna `tenant_id uuid NOT NULL`** en TODA tabla de dominio. Excepciones documentadas: `users` permite `tenant_id NULL` solo para `super_admin`; `audit_logs` permite `NULL` para eventos de plataforma.
2. **Políticas RLS** en PostgreSQL por tabla:

   ```sql
   ALTER TABLE products ENABLE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation ON products
     USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
   ```
3. **Middleware Nest** (`TenantContextMiddleware`) ejecuta `SET LOCAL app.current_tenant_id = $1` por transacción Prisma (no por conexión — evita estado sucio cuando el pool reusa la conexión).
4. **El JWT contiene `tenantId`**. El middleware lo lee del request y lo aplica antes de cualquier query.
5. **Guards** rechazan requests sin `tenantId` salvo endpoints marcados `@PublicEndpoint` o `@SuperAdminOnly`.
6. **Lint architectural rule**: ningún `prisma.<model>.findFirst({ where: ... })` sin `tenantId` en `where`. Implementado vía custom ESLint rule.
7. **Tests obligatorios**: cada repositorio incluye un test que crea 2 tenants y verifica que tenant A no vea registros de tenant B (E2E con dos JWTs).
8. **Super admin**: usuarios con `role = 'super_admin'` ejecutan queries con `SET LOCAL app.bypass_rls = on` que las políticas RLS reconocen (`USING (tenant_id = ... OR current_setting('app.bypass_rls', true) = 'on')`).

## Consequences

### Positivas

- **Defense in depth**: incluso si un dev olvida el `where: { tenantId }`, RLS bloquea la fuga.
- **Una sola base de datos**: barato, fácil de operar, migraciones únicas.
- **Reportes cross-tenant** posibles para super admin sin esquemas separados.
- **Backups y replicación** simples (sin coordinar N bases).

### Negativas

- **Overhead de RLS** medible (~5–15% en queries simples). Mitigamos con índice `(tenant_id, ...)` en cada tabla.
- **Queries raw** deben recordar el filter o ejecutarse vía `transaccionConTenant`. El código actual usa `$executeRawUnsafe` con string interpolation — debe migrarse a `$executeRaw` parametrizado en SIS-XX.
- **El pool de conexiones de Prisma** puede reusar conexiones con `SET` no limpio. Por eso usamos `SET LOCAL` dentro de transacción, no `SET` global.
- **Connection pooling externo** (PgBouncer en modo transaction) compatible solo con `SET LOCAL`. Documentado en `docs/db/`.

### Riesgos abiertos

- **Migración del código actual**: el middleware actual usa `$executeRawUnsafe` con string interpolation del UUID — SQL injection si el UUID viene de fuente no confiable. UUID validado en JWT pero patrón inseguro debe corregirse. Issue de seguridad de prioridad alta.
- **Tests faltantes**: actualmente no hay tests de aislamiento. Bloquea producción.

## Alternatives considered

### A. Schema-per-tenant (PostgreSQL schemas)

- **Pros**: aislamiento físico, fácil exportar un tenant.
- **Contras**: complica migraciones (N×schemas), Prisma no lo soporta nativamente, conteo de schemas tiene límite práctico (~5000). Descartado.

### B. Database-per-tenant

- **Pros**: máximo aislamiento, soporta SLAs distintos por cliente.
- **Contras**: prohibitivamente caro y operacionalmente complejo para nuestro punto de partida. Reservado para clientes enterprise futuros como modo "dedicated tier" — modela compatible (mismo schema, distinto connection string).

### C. Discriminator column SIN RLS

- **Pros**: simpleza, lo que tenemos hoy.
- **Contras**: una sola query mal escrita filtra datos entre tenants. Inaceptable para un producto que maneja datos fiscales. Descartado.

### D. App-side filtering en repositorio (Prisma middleware)

- **Pros**: portable entre BDs.
- **Contras**: Prisma middleware está deprecado en v6 (reemplazado por client extensions). No protege contra raw queries. Insuficiente como única defensa. Lo aplicaremos COMO COMPLEMENTO al RLS, no en su lugar.

## Implementation plan (resumen)

1. Migración Prisma que agrega RLS policies a cada tabla con `tenant_id` (issue SIS-XX, DBA).
2. Refactor middleware → `SET LOCAL` en transacción, parametrizado (issue SIS-XX, Backend Dev).
3. Refactor login y registro para resolver tenant ANTES de queries (issue SIS-XX).
4. Custom ESLint rule + test suite de aislamiento (issue SIS-XX, QA).
5. Documentar runbook de bypass para super admin (issue SIS-XX, DBA + Security).

## References

- PostgreSQL RLS docs: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Prisma + RLS pattern: https://www.prisma.io/docs/orm/prisma-client/queries/raw-database-access/raw-queries
- [[002-multi-country-strategy]]
- [[006-auth-and-rbac]]
