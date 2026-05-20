# DB Performance Report — SistemaVentaRapida Pro

> Live document maintained by the DBA agent. Each tick of SIS-15 appends a snapshot at the top.

---

## Tick 2026-05-20 22:02 UTC (17:02 Lima)

**Baseline tick** — first DBA continuous review.

### Environment
- PostgreSQL 17.6 on Windows (local dev).
- Database: `inventario_db` on `localhost:5432`.
- Connections: 1 active, 5 idle. Healthy.
- Extensions installed: `pg_trgm`, `pgcrypto`, `plpgsql`, `uuid-ossp`.
- Tables: 16. Row count: **0 in every table** (dev DB empty).
- DB size: 9.8 MB (all schema overhead).
- Autovacuum: on. No vacuum/analyze yet (no data).

### Multi-tenant integrity audit

Audited every model in `prisma/schema.prisma` for `tenantId` coverage.

| Status | Models |
|---|---|
| `tenantId` present + indexed + in composite uniques | Tenant (PK), Location, User, Category, AttributeType, Product, Contact, Transfer, InventoryMovement, AuditLog, TenantSequence |
| `tenantId` MISSING (implicit via parent FK) | `ProductVariant`, `VariantAttributeValue`, `LocationPrice`, `InventoryStock`, `UserLocation` |

**Verdict:** acceptable today because all five derived tables sit behind a parent that *does* carry `tenantId`, so a correctly-written repo query that joins through the parent stays tenant-safe. **But** this depends on every developer writing the join — there's no DB-level guard against `prisma.productVariant.findMany()` returning cross-tenant rows if the caller forgets the join. See P2 follow-up below.

### Schema vs DB drift (P0)

The live database has **65 indexes, 9 triggers, and 3 CHECK constraints**, but `prisma/schema.prisma` declares only the basic indexes. Examples of DB-only objects:

- **Partial indexes** on `WHERE deleted_at IS NULL` for every soft-deletable table (Prisma DSL can't express these).
- `idx_movements_financial` — composite with `INCLUDE (subtotal, tax_amount, total, currency_code)` for covering scans on reports.
- `idx_contacts_document_unique` — partial unique on `(tenant_id, document_type, document_number) WHERE document_number IS NOT NULL` (critical business rule: one RUC/DNI/RIF per tenant).
- `idx_users_email_tenant` — partial unique with `COALESCE(tenant_id, '00000000-...')` to allow super-admins (null tenant) while enforcing per-tenant email uniqueness.
- `idx_products_name_trgm` (GIN trigram) and `idx_products_tags` (GIN array).
- `chk_quantity_positive`, `chk_direction_valid` on `inventory_movements`; `chk_different_locations` on `transfers`.
- 9 `BEFORE UPDATE` triggers maintaining `updated_at`, plus `trg_movement_update_stock` (`AFTER INSERT` on `inventory_movements` — business logic in DB).
- `_prisma_migrations` table **does not exist**: schema was bootstrapped outside `prisma migrate`.

**Implication:** running `prisma migrate dev` from this state will produce a diff that tries to *drop* every DB-only object it doesn't see in the schema. Any future schema change is a deployment time bomb until baseline is fixed. See P0 follow-up.

### Findings (prioritized)

**P0 — schema management**
1. No Prisma migration baseline. Drift is silent today, catastrophic on first `migrate deploy`. → `[SIS-DB-baseline]`
2. DB-only indexes/triggers/constraints undocumented anywhere. → `[SIS-DB-rawsql-doc]`

**P1 — observability + correctness**
3. `pg_stat_statements` not loaded (`shared_preload_libraries` empty). Cannot collect slow-query stats this tick or future ticks until enabled + Postgres restarted. → `[SIS-DB-pgss]`
4. Missing CHECK constraints: prices ≥ 0 on `product_variants.purchase_price/sale_price`, `location_prices.price/promo_price`; `contacts.credit_limit ≥ 0`; `users.failed_attempts ≥ 0`; `tenants.max_locations/users/products > 0`. → `[SIS-DB-checks]`
5. Redundant index pair on `product_variants.barcode`: `idx_variants_barcode` and `idx_variants_barcode_lookup` cover essentially the same predicate. Drop the less-restrictive one. → bundled into `[SIS-DB-baseline]`.
6. `ProductVariant.sku` uniqueness is `(sku, product_id)` only — two products in the same tenant can share an SKU, which usually breaks barcode/POS scanning expectations. Confirm with Architect whether SKU should be unique per-tenant. → `[SIS-DB-sku-scope]`

**P2 — long-horizon**
7. Money precision: agent canon says `Decimal(15, 4)`. Schema uses `Decimal(14, 2)`. Acceptable for PEN final totals; risk on VES (hyperinflated) and on tax-rate arithmetic that benefits from 4 decimals before rounding. Decide standard with Architect. → `[SIS-DB-money]`
8. Cross-tenant safety: add denormalized `tenantId` to `ProductVariant`, `InventoryStock`, `LocationPrice`, `VariantAttributeValue`, `UserLocation` so a missing join in repo code can't leak rows. Combined with a global Prisma middleware that injects `tenantId` into every query, this makes cross-tenant access impossible by construction. → `[SIS-DB-tenantId-denorm]`
9. `AuditLog` will grow without bound on a high-traffic tenant. Plan monthly RANGE partition before first heavy customer. → defer until first customer signed.
10. `InventoryStock.availableQuantity` is a stored Int — it must be kept in sync with `quantity − reserved_quantity`. Either compute via generated column or enforce via the existing `trg_movement_update_stock` trigger. Audit trigger code to confirm. → `[SIS-DB-availability-invariant]`

### Slow-query analysis

**Not possible this tick** — `pg_stat_statements` unavailable. Once enabled (`[SIS-DB-pgss]`) future ticks will report top 10 by total time and by mean time.

### Vacuum status

All tables empty. No action.

### Next tick action plan
- If `pg_stat_statements` was enabled between ticks: pull top queries.
- Re-check row counts; once any table grows >10K rows, switch attention to query plans.
- Confirm Backend Dev/Architect responses on the child issues.

---
