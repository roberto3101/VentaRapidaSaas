# DB Performance Strategy — SistemaVentaRapida Pro

- **Status**: Baseline v1 — actualizable
- **Owner**: DBA agent
- **Date**: 2026-05-20
- **Referencias**: ADR-001 (multi-tenancy), ADR-004 (money), ADR-005 (sale concurrency)

> Estrategia operativa de performance, indexación y mantenimiento de la BD. Mientras esté `Status: Baseline v1` significa que es el punto de partida razonado por el DBA pero NO está validado con datos reales de producción.

## Principios

1. **Multi-tenancy primero**: cada índice compuesto empieza por `tenant_id`. Sin excepciones.
2. **Paginación obligatoria** en cualquier listado >50 filas potenciales. Cursor-based (no offset) en tablas >10K filas.
3. **Money es `Decimal(15,4)`** — nunca Float. Nunca operaciones aritméticas en SQL sin CAST explícito.
4. **Transacciones explícitas** (`prisma.$transaction`) cuando hay >1 escritura relacionada.
5. **Aislamiento `Serializable`** para operaciones financieras (venta+pago+comprobante). `ReadCommitted` para reportes.
6. **Locks explícitos** (`SELECT ... FOR UPDATE`) en operaciones críticas (último item de stock).

## Índices por tabla (esperados)

| Tabla | Índices obligatorios | Justificación |
|---|---|---|
| `users` | `(tenant_id, email)` UNIQUE, `(email)` para super_admin login | Login multi-tenant |
| `products` | `(tenant_id)`, `(tenant_id, sku)` UNIQUE, `(tenant_id, barcode)`, `(tenant_id, category_id, name)` | Búsqueda POS rápida |
| `stock` | `(tenant_id, product_id, branch_id)` UNIQUE | Lookup en venta |
| `sales` | `(tenant_id, branch_id, created_at desc)`, `(tenant_id, cashier_id, created_at desc)` | Reportes día/turno |
| `sale_items` | `(sale_id)`, `(tenant_id, product_id, created_at)` | Detalle + análisis producto |
| `receipts` | `(tenant_id, type, series, number)` UNIQUE, `(tenant_id, sale_id)` | Búsqueda por número de comprobante |
| `customers` | `(tenant_id, document_type, document_number)` UNIQUE, `(tenant_id, name)` para autocomplete | Lookup en venta a crédito |
| `audit_logs` | `(tenant_id, entity_type, entity_id, created_at desc)` | Auditoría por entidad |
| `cash_shifts` | `(tenant_id, cash_register_id, status)`, `(tenant_id, opened_at desc)` | Turno activo + historial |

**Anti-patrón a evitar**: índices que NO empiezan por `tenant_id`. Reducen efectividad bajo RLS y aumentan IO.

## Vacuum, ANALYZE y maintenance

- **autovacuum** activo por default en Postgres 17 — verificar `pg_stat_user_tables` mensualmente.
- **VACUUM FULL** solo en mantenimiento programado (bloquea tabla). Preferir `pg_repack` cuando llegue a producción.
- **REINDEX** trimestral para índices con `pg_stat_all_indexes.idx_scan` > 100M.
- **ANALYZE** automático tras migraciones que cambian distribución (ej. cargar 10K productos nuevos).

## Particionamiento (futuro)

A partir de **1M filas en `sales`** o **5M en `audit_logs`**, particionar por `created_at` (rango mensual o trimestral). Plan:

```sql
CREATE TABLE sales (
  -- columns
) PARTITION BY RANGE (created_at);

CREATE TABLE sales_2026_q1 PARTITION OF sales
  FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
```

Beneficio: queries con filtro por fecha solo escanean la(s) partición(es) relevantes.

## Connection pooling

- **Dev**: pool default Prisma (5 conexiones por instancia).
- **Producción**: **PgBouncer en modo `transaction`** delante de Postgres.
- Las políticas RLS usan `SET LOCAL app.current_tenant_id` dentro de transacción → compatible con `transaction` mode.
- **NO usar `SET` global** — el pool reusaría conexiones con `tenant_id` sucio.

## Backups

- **Dev**: snapshots cada 60 min, retención 7 días (config actual de Paperclip embedded).
- **Producción**: WAL archiving + base backup diario + PITR (Point-In-Time Recovery) a 30 días.
- **Recovery target**: RPO ≤ 5 min, RTO ≤ 30 min.

## Migraciones zero-downtime (regla absoluta)

Cuando una migración cambia schema:

1. **Add column nullable** (deploy A)
2. **Backfill** vía script con batches (no UPDATE masivo)
3. **Add NOT NULL constraint** (deploy B)
4. (Opcional) **Drop old column** (deploy C, después de N días)

NUNCA `DROP COLUMN` con datos en producción sin haber depreciado primero.

## Performance budget (objetivos)

| Operación | p50 | p95 | p99 |
|---|---|---|---|
| Login | <100 ms | <300 ms | <500 ms |
| Búsqueda producto por barcode | <30 ms | <80 ms | <150 ms |
| Crear venta (transacción) | <200 ms | <500 ms | <1 s |
| Reporte día (1 sucursal) | <500 ms | <1.5 s | <3 s |
| Reporte mes (todas sucursales) | <2 s | <5 s | <10 s |

Cuando p95 supere el objetivo: DBA crea issue de optimización.

## Hallazgos en código actual (auditoría cruzada con Architect)

| Hallazgo | Severidad | Issue propuesta |
|---|---|---|
| `$executeRawUnsafe` con interpolación string del UUID en middleware tenant | CRITICAL | SIS-CRITICAL-2 (ver initial-report) |
| `database.service.ts` ejecuta queries de dominio (`obtenerPrecioEfectivo`) — viola Clean Arch | HIGH | SIS-HIGH-4 |
| Sin índices verificados aún en tablas existentes | HIGH | Auditar con `\d+` en `psql` y comparar con tabla de arriba |
| Sin tests de aislamiento multi-tenant | HIGH | SIS-HIGH-7 |
| `Float` en lugar de `Decimal` para precios (asumido — verificar) | HIGH | SIS-MED-9 |
| Sin paginación cursor-based en listados de productos | MEDIUM | Crear cuando llegue Fase 3 |

## Cron jobs DBA (cuando se reactive)

- **Diario 04:00 Lima** (cuando esté): scan `pg_stat_statements` top 10 slow queries del día, generar report en `docs/db/performance-YYYY-MM-DD.md`, abrir issues si p95 fuera de budget.
- **Semanal lunes 03:30 Lima**: `EXPLAIN ANALYZE` sobre las 5 queries más críticas (venta, búsqueda producto, reporte día), comparar con baseline.
