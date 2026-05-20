# ADR-005: Concurrencia en venta y consistencia de inventario

- **Status**: Accepted
- **Date**: 2026-05-20
- **Author**: Architect
- **Issue**: SIS-1

## Context

Caso de uso crítico: dos cajeros en la misma sucursal venden el último producto disponible al mismo tiempo.

Hoy:

- `InventarioService.crearMovimiento` (`inventario.service.ts:31`) verifica disponibilidad con un `findUnique` de `InventoryStock` y luego crea `InventoryMovement` **sin lock ni transacción atómica**. Race condition trivial: ambos cajeros leen `availableQuantity = 1`, ambos crean movimientos, stock final = -1 (y `allowNegativeStock` típicamente es `false`, lo cual genera estado inconsistente, no falla).
- La tabla `InventoryStock` es un cache materializado del agregado de `InventoryMovement`. No hay trigger PostgreSQL visible en el schema Prisma (puede existir en DB, no en código fuente — gap entre schema.prisma y BD real, ver [[008-prisma-schema-vs-db]] pendiente).
- No hay módulo `Sales` aún. Cuando se cree, hereda esta clase de bug si no se decide ahora.

## Decision

Adoptamos **transacción Serializable + lock pesimista en `InventoryStock` para sale paths críticos**, con **outbox pattern + idempotency key** para garantizar emisión fiscal exactly-once.

### Estrategia en 3 capas

#### Capa 1 — Transacción de venta atómica

```ts
async createSale(input: CreateSaleInput, idempotencyKey: string) {
  return this.prisma.$transaction(async (tx) => {
    // 1. Verificar idempotencia
    const existing = await tx.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
    if (existing) return existing.responseSnapshot;

    // 2. Lock pesimista sobre el stock de las variantes vendidas
    const variantIds = input.items.map(i => i.variantId);
    await tx.$queryRaw`
      SELECT 1 FROM inventory_stock
      WHERE variant_id = ANY(${variantIds}::uuid[]) AND location_id = ${input.locationId}::uuid
      FOR UPDATE
    `;

    // 3. Releer stock con el lock vigente y validar
    const stocks = await tx.inventoryStock.findMany({ where: { variantId: { in: variantIds }, locationId: input.locationId } });
    for (const item of input.items) {
      const stock = stocks.find(s => s.variantId === item.variantId);
      if (!stock || stock.availableQuantity < item.quantity) {
        throw new InsufficientStockError(item.variantId);
      }
    }

    // 4. Crear Sale + SaleItems + Payments
    const sale = await tx.sale.create({ ... });

    // 5. Crear InventoryMovements (uno por línea)
    await tx.inventoryMovement.createMany({ ... });

    // 6. Actualizar InventoryStock decrementando availableQuantity
    for (const item of input.items) {
      await tx.inventoryStock.update({
        where: { variantId_locationId: { variantId: item.variantId, locationId: input.locationId } },
        data: { quantity: { decrement: item.quantity }, availableQuantity: { decrement: item.quantity } },
      });
    }

    // 7. Outbox: enqueue evento SaleCompleted para emisión fiscal
    await tx.outboxEvent.create({ data: { type: 'SaleCompleted', payload: { saleId: sale.id }, ... } });

    // 8. Persistir idempotencyKey con snapshot de respuesta
    await tx.idempotencyKey.create({ data: { key: idempotencyKey, responseSnapshot: { saleId: sale.id }, ... } });

    return { saleId: sale.id };
  }, { isolationLevel: 'Serializable', timeout: 10_000 });
}
```

#### Capa 2 — Outbox pattern para emisión fiscal

La emisión SUNAT/SENIAT NO va dentro de la transacción de venta. Si SUNAT cae, no podemos vender:

1. Transacción de venta inserta `OutboxEvent { type: 'SaleCompleted', payload, status: 'pending' }`.
2. Worker pollea `OutboxEvent` cada 1s con `FOR UPDATE SKIP LOCKED`, publica al bus interno, marca `processed`.
3. Handler en `receipts/` recibe el evento, llama `IFiscalEmitter.emit(...)`, persiste `Receipt`.
4. Si emisión falla → reintentos exponenciales internos al handler. El estado de la venta no cambia.

Esto garantiza:

- Venta consistente con stock (transaction).
- Emisión fiscal eventually consistent (no bloquea venta).
- Idempotencia exactly-once para el ente fiscal.

#### Capa 3 — Idempotency-Key

`POST /api/v1/sales` requiere header `Idempotency-Key` (UUID generado por el frontend). Esto previene doble-clic del cajero, reintentos por timeout de red, y replays de proxy.

Backend persiste `(idempotency_key, response_snapshot, expires_at)`. TTL = 24h.

### Por qué Serializable

Postgres `Serializable` (SSI) detecta dependencias entre transacciones concurrentes y aborta una si hay riesgo de anomalía. Combinado con `SELECT ... FOR UPDATE` sobre `InventoryStock`, garantiza:

- Si dos transacciones leen el mismo stock concurrentemente, una bloquea y la otra espera.
- Si Postgres detecta deadlock improbable, aborta una con error 40001 → retry automático en aplicación (3 intentos con jitter).

Trade-off: Serializable es más lento que `Read Committed`. Aceptable porque la transacción de venta es corta (<100ms en caso ideal) y la presión transaccional en bodega/minimarket es baja (decenas/sec, no miles/sec).

### Stock por sucursal — InventoryStock como agregado

`InventoryStock(variantId, locationId)` es el único punto de lock. Compras, transferencias, ventas y ajustes lo modifican. La tabla `InventoryMovement` es el log inmutable (event sourcing-light).

Esto evita:

- Lockear toda la tabla `InventoryMovement` (que crece).
- Releer y sumar movimientos cada vez (caro).

Trigger PostgreSQL recomputa `InventoryStock` en cada `INSERT INTO inventory_movements` como consistency check (defense in depth). Si el agregado se desincroniza, `fn_recalculate_all_stock()` lo recalcula.

## Consequences

### Positivas

- Venta nunca produce stock negativo cuando `allowNegativeStock = false`.
- Doble click / reintentos no duplican ventas ni comprobantes.
- Emisión fiscal desacoplada — SUNAT caído no detiene la caja.
- Auditoría completa via `InventoryMovement` log.

### Negativas

- Transacción más lenta (decenas de ms). Aceptable.
- Implementación más compleja que un `UPDATE` directo — tests críticos.
- Worker de outbox debe correr siempre. Mitigación: monitoreo + alertas.

### Riesgos abiertos

- **Tenants con `allowNegativeStock = true`** (típico en mayoristas que aceptan presales): saltamos el chequeo de stock pero mantenemos el lock por consistencia del agregado.
- **Stock distribuido entre sucursales**: una venta vacía stock en sucursal A no afecta a B (cada `InventoryStock` row está aislado por `locationId`).
- **Cancelación de venta**: requiere transacción reversa (crear `InventoryMovement` opuesto + incrementar `availableQuantity` + emitir `NotaCredito`). Separado en ADR futuro si crece la complejidad.

## Alternatives considered

### A. Optimistic concurrency (version column)

- **Pros**: más rápido, sin locks.
- **Contras**: alta tasa de retry cuando hay concurrencia real. Mala UX cuando 2 cajeros venden el último item — uno falla "por carrera" sin causa intuitiva. Pesimista es más adecuado para POS.

### B. Read Committed + chequeo de stock en el UPDATE

```sql
UPDATE inventory_stock SET quantity = quantity - ?
WHERE variant_id = ? AND location_id = ? AND quantity >= ?
RETURNING ...
```

- **Pros**: sin lock explícito.
- **Contras**: no podemos emitir `Receipt` en la misma operación atómicamente. Mezcla peor de los dos mundos. Descartado.

### C. Saga pattern multi-paso (CQRS heavy)

- **Pros**: ideal para sistema distribuido grande.
- **Contras**: overkill para monolito modular. Reservado para cuando dominio se extraiga (decisión de [[001]]).

### D. Locks aplicativos (Redis SETNX)

- **Pros**: rápido.
- **Contras**: lock no atómico con la BD. Si app crashea entre lock y commit, lock huérfano. Frágil. Descartado.

## Implementation plan

1. Tablas `idempotency_keys` y `outbox_events` (DBA, SIS-XX).
2. Trigger PostgreSQL que mantiene `InventoryStock` consistente al insertar `InventoryMovement` (DBA, idealmente ya implementado en el schema actual basado en `fn_recalculate_all_stock` — verificar).
3. `CreateSaleUseCase` con la lógica anterior (Backend Dev, SIS-XX). Bloqueado por modelo `Sale/SaleItem/Payment` (siguiente ADR de schema).
4. Worker de outbox simple (setInterval polling). Migrar a BullMQ + Redis cuando justifique (fase 4).
5. Tests de carga: 50 cajeros vendiendo el mismo producto, verificar consistencia.

## References

- PostgreSQL SSI: https://www.postgresql.org/docs/current/transaction-iso.html
- Outbox pattern: https://microservices.io/patterns/data/transactional-outbox.html
- Stripe idempotency keys: https://stripe.com/docs/api/idempotent_requests
- [[003-fiscal-emission-hexagonal]]
