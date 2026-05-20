# CLAUDE.md — Módulo Ventas (Sales)

> Contexto del módulo. Léelo antes de tocar este código.

## Qué hace

Gestiona el ciclo de vida completo de una venta en el POS:
- **draft** → cajero agrega items (CRUD libre)
- **completed** → cobro recibido, comprobante generado, **stock descontado atómicamente**
- **cancelled** → venta anulada (si estaba completed, **revierte el stock**)

## Bounded context

- **Sale** (header): número correlativo por tenant+sucursal+año, totales agregados, status
- **SaleItem** (líneas): precio congelado al momento de venta, cálculo de impuesto por línea
- **Payment** (cobros): múltiples métodos por venta (cash + card combinado), con vuelto

## Reglas inviolables

1. **Multi-tenant**: todo query filtra por `tenantId`. Incluso al leer una venta por id, validar que pertenezca al tenant del JWT
2. **Money con `Decimal`**: NUNCA Float. Cálculos van por `calculador-totales.ts` (domain service puro)
3. **Stock descontado en transacción atómica** al completar venta. Si falla cualquier item → rollback todo
4. **`SELECT FOR UPDATE`** sobre `inventory_stock` en operaciones de venta concurrente (último item del último producto)
5. **Precio congelado**: `SaleItem.unitPrice`, `taxRate`, `productName`, `productSku` son **snapshots** al momento de venta. Si el producto cambia después, la venta histórica NO se altera
6. **Validación de subtotales en backend**: el cliente PUEDE mandar totales calculados, pero backend RECALCULA y compara — si difiere, 400. Anti-tampering
7. **Sale.saleNumber**: correlativo único por `(tenantId, locationId)` usando upsert en `tenant_sequences` con lock
8. **Anulación con razón obligatoria** + auditoría inmutable

## Flujo end-to-end

```
[Cajero escanea producto]
  → POST /api/v1/ventas              { items: [{ variantId, quantity, unitPrice }] }
  → SaleStatus.draft creado
  → Sale.total calculado por backend (no se confía en input)

[Cajero recibe pago]
  → POST /api/v1/ventas/:id/completar { payments: [{ method, amount, receivedAmount? }] }
  → Backend valida sum(payments) >= total
  → Transacción: marca completed + descuenta inventory + crea InventoryMovement por item
  → SaleCompleted event (futuro: hook para Receipts module emite boleta SUNAT)

[Anulación opcional]
  → POST /api/v1/ventas/:id/cancelar { motivo }
  → Si estaba completed: crea InventoryMovement reversa para devolver stock
  → SaleCancelled event
```

## Endpoints

| Método | Ruta | Rol mínimo |
|---|---|---|
| `POST /api/v1/ventas` | crear borrador | `operator` |
| `PATCH /api/v1/ventas/:id` | editar borrador | `operator` (propio) |
| `POST /api/v1/ventas/:id/completar` | completar + cobrar | `operator` |
| `POST /api/v1/ventas/:id/cancelar` | anular | `location_manager` (si completed) |
| `GET /api/v1/ventas` | listar (filtros) | `operator` (ve solo lo propio) / `location_manager` (toda la sede) |
| `GET /api/v1/ventas/:id` | detalle | `operator` |

## Anti-patrones a evitar

- ❌ Recibir `total` del cliente y guardarlo sin validar
- ❌ Operar sobre `inventory_stock` sin lock en venta
- ❌ Float math con dinero (`unitPrice * quantity` con Number)
- ❌ Olvidar `tenantId` en cualquier query
- ❌ Anulación sin revertir InventoryMovement si la venta estaba completed
- ❌ Permitir múltiples ventas con el mismo `saleNumber` por sucursal (UNIQUE en BD lo bloquea, no confíes solo en código)

## Próximas integraciones

- **Receipts**: cuando venta pasa a `completed`, hook a emisión de boleta/factura (SUNAT/SENIAT)
- **Shifts**: cada venta debe estar asociada a un turno de caja activo (Fase 5)
- **Customers**: créditos de cliente para mayorista (Fase 6)
